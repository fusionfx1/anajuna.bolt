import type {
  Tick, OHLCVBar, ConnectionStats, DataFeedConfig, AuthFailureReason
} from '../types/dataFeed';
import { connectionLogger } from './connectionLogger';

type TickHandler = (tick: Tick) => void;
type StatusHandler = (stats: ConnectionStats) => void;
type AuthState = 'idle' | 'pending' | 'authenticated' | 'failed';

const POLYGON_WS_URL = 'wss://socket.polygon.io/forex';
const ALPACA_WS_URL_PAPER = 'wss://stream.data.alpaca.markets/v2/iex';
const ALPACA_WS_URL_LIVE = 'wss://stream.data.alpaca.markets/v2/iex';
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const HEARTBEAT_CHECK_INTERVAL = 10000;
const HEARTBEAT_SILENCE_THRESHOLD = 30000;
const AUTH_TIMEOUT_MS = 8000;

/**
 * WebSocket close codes that unambiguously indicate authentication or
 * authorization rejection. The 4xxx range is application-level (used by
 * Polygon / Alpaca), 1008 is the WebSocket "policy violation" code that
 * brokers commonly emit when an auth token is rejected.
 */
const AUTH_REJECT_CLOSE_CODES = new Set<number>([1008, 4001, 4003, 4401, 4403]);

const FX_SYMBOL_MAP: Record<string, string> = {
  'EURUSD': 'C:EURUSD',
  'GBPUSD': 'C:GBPUSD',
  'USDJPY': 'C:USDJPY',
  'AUDUSD': 'C:AUDUSD',
  'USDCAD': 'C:USDCAD',
  'NZDUSD': 'C:NZDUSD',
  'USDCHF': 'C:USDCHF',
  'EURGBP': 'C:EURGBP',
};

/**
 * Returns true if the message text from a provider's `error` payload
 * indicates a credential / authorization problem rather than a transient
 * network issue. Matches common phrasing across Polygon and Alpaca.
 */
function looksLikeAuthErrorMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('auth') ||
    m.includes('unauthor') ||
    m.includes('forbidden') ||
    m.includes('invalid key') ||
    m.includes('invalid api') ||
    m.includes('invalid credentials') ||
    m.includes('not authorized') ||
    m.includes('permission')
  );
}

/**
 * Stable fingerprint of the credentials used by a config. Two configs that
 * share this fingerprint are considered equivalent for the purposes of the
 * auth lock — re-attempting them would just hit the same server-side
 * rejection.
 */
function credentialFingerprint(config: DataFeedConfig): string {
  return [
    config.provider,
    config.apiKey ?? '',
    config.apiSecret ?? '',
    config.alpacaKeyId ?? '',
    config.alpacaSecretKey ?? '',
    config.oandaApiToken ?? '',
    config.oandaAccountId ?? '',
  ].join('|');
}

class DataFeedService {
  private ws: WebSocket | null = null;
  private config: DataFeedConfig | null = null;
  private tickHandlers: Set<TickHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private simulationInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTickUnsub: (() => void) | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private authTimeout: ReturnType<typeof setTimeout> | null = null;
  private oandaAbortController: AbortController | null = null;
  private connectGeneration = 0;
  private authState: AuthState = 'idle';

  /**
   * When set, the service is permanently locked out of reconnecting until
   * `disconnect()` is called or `connect()` is invoked with different
   * credentials. Stored as a credential fingerprint so a config swap clears
   * the lock automatically.
   */
  private authLockFingerprint: string | null = null;

  private stats: ConnectionStats = {
    provider: 'simulation',
    status: 'disconnected',
    ticksReceived: 0,
    reconnectCount: 0,
  };
  private barBuffers: Map<string, { open: number; high: number; low: number; close: number; volume: number; startTs: number }> = new Map();

  connect(config: DataFeedConfig): void {
    const fingerprint = credentialFingerprint(config);

    // If the same credentials previously failed authentication, refuse to
    // attempt the connection again — server will just reject us a second
    // time and we'll be back in the same loop the bug created.
    if (this.authLockFingerprint && this.authLockFingerprint === fingerprint) {
      this.stats = {
        ...this.stats,
        provider: config.provider,
        status: 'error',
        authFailed: true,
        authFailureReason: this.stats.authFailureReason ?? 'invalid_credentials',
        errorMessage: this.stats.errorMessage ?? 'Authentication previously failed — update API keys to retry.',
        maxRetriesReached: true,
      };
      this.emitStatus();
      return;
    }

    // Different credentials → clear the auth lock so a re-keyed config can
    // attempt a fresh connection.
    if (this.authLockFingerprint && this.authLockFingerprint !== fingerprint) {
      this.authLockFingerprint = null;
    }

    this.config = config;
    const prevReconnectCount = this.stats.reconnectCount;
    this.connectGeneration++;
    this.authState = 'idle';
    this.teardown();
    this.stats = {
      provider: config.provider,
      status: 'connecting',
      ticksReceived: 0,
      reconnectCount: prevReconnectCount,
      authFailed: false,
      authFailureReason: undefined,
      errorMessage: undefined,
    };
    this.emitStatus();

    if (config.provider === 'simulation' || !config.apiKey) {
      this.startSimulation(config.symbols);
      return;
    }

    if (config.provider === 'polygon') {
      this.connectPolygon(config);
    } else if (config.provider === 'alpaca') {
      this.connectAlpaca(config);
    }
  }

  disconnect(): void {
    this.connectGeneration++;
    this.authLockFingerprint = null;
    this.authState = 'idle';
    this.teardown();
    this.stats = {
      ...this.stats,
      status: 'disconnected',
      authFailed: false,
      authFailureReason: undefined,
    };
    this.emitStatus();
  }

  /**
   * Manually clear an auth lock without dropping subscriptions. Intended for
   * a "Reconfigure / Retry with new credentials" button in the UI.
   */
  clearAuthLock(): void {
    this.authLockFingerprint = null;
    this.stats = {
      ...this.stats,
      authFailed: false,
      authFailureReason: undefined,
      errorMessage: undefined,
      maxRetriesReached: false,
    };
    this.emitStatus();
  }

  private teardown(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.clearAuthTimeout();
    if (this.oandaAbortController) {
      this.oandaAbortController.abort();
      this.oandaAbortController = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTickUnsub) {
      this.heartbeatTickUnsub();
      this.heartbeatTickUnsub = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private clearAuthTimeout(): void {
    if (this.authTimeout) {
      clearTimeout(this.authTimeout);
      this.authTimeout = null;
    }
  }

  /**
   * Start a hard deadline by which the server must have confirmed our
   * credentials. If it doesn't, we treat the silence as an auth failure —
   * many brokers simply hang the socket on a bad key instead of replying.
   */
  private armAuthTimeout(provider: 'polygon' | 'alpaca'): void {
    this.clearAuthTimeout();
    this.authTimeout = setTimeout(() => {
      if (this.authState === 'authenticated') return;
      this.handleAuthFailure(
        provider,
        'auth_timeout',
        `Authentication timed out after ${AUTH_TIMEOUT_MS / 1000}s — check API keys and network access.`,
      );
    }, AUTH_TIMEOUT_MS);
  }

  onTick(handler: TickHandler): () => void {
    this.tickHandlers.add(handler);
    return () => this.tickHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler({ ...this.stats });
    return () => this.statusHandlers.delete(handler);
  }

  getStats(): ConnectionStats {
    const s = { ...this.stats };
    if (s.connectedAt && s.status === 'connected') {
      s.uptimeMs = Date.now() - s.connectedAt;
    }
    return s;
  }

  aggregateTick(tick: Tick): OHLCVBar | null {
    const key = tick.symbol;
    const minuteTs = Math.floor(tick.timestamp / 60000) * 60000;
    const buf = this.barBuffers.get(key);

    if (!buf || buf.startTs !== minuteTs) {
      if (buf && buf.startTs !== minuteTs) {
        const closedBar: OHLCVBar = {
          symbol: key,
          open: buf.open,
          high: buf.high,
          low: buf.low,
          close: buf.close,
          volume: buf.volume,
          timestamp: buf.startTs,
          timeframe: '1m',
        };
        this.barBuffers.set(key, {
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: tick.size,
          startTs: minuteTs,
        });
        return closedBar;
      }
      this.barBuffers.set(key, {
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.size,
        startTs: minuteTs,
      });
      return null;
    }

    buf.high = Math.max(buf.high, tick.price);
    buf.low = Math.min(buf.low, tick.price);
    buf.close = tick.price;
    buf.volume += tick.size;
    return null;
  }

  private connectPolygon(config: DataFeedConfig): void {
    const gen = this.connectGeneration;
    this.authState = 'pending';
    try {
      this.ws = new WebSocket(POLYGON_WS_URL);

      this.ws.onopen = () => {
        if (gen !== this.connectGeneration) return;
        // Polygon emits {ev:'connected'} before accepting auth; we still arm
        // the auth-timeout so a silent socket can't park us in 'pending'.
        this.armAuthTimeout('polygon');
      };

      this.ws.onmessage = (event) => {
        if (gen !== this.connectGeneration) return;
        let messages: unknown;
        try {
          messages = JSON.parse(event.data);
        } catch (err) {
          const preview = typeof event.data === 'string' ? event.data.slice(0, 240) : '<binary>';
          console.warn('[dataFeed:polygon] failed to parse WS message', err, preview);
          return;
        }
        if (!Array.isArray(messages)) {
          console.warn('[dataFeed:polygon] expected array WS payload, got', typeof messages);
          return;
        }
        try {
          for (const msg of messages) {
            if (msg.ev === 'connected') {
              this.ws?.send(JSON.stringify({
                action: 'auth',
                params: config.apiKey,
              }));
            } else if (msg.ev === 'auth_success') {
              this.authState = 'authenticated';
              this.clearAuthTimeout();
              const subs = config.symbols
                .map(s => `C.${FX_SYMBOL_MAP[s] ?? s}`)
                .join(',');
              this.ws?.send(JSON.stringify({ action: 'subscribe', params: subs }));
              this.markConnected();
            } else if (msg.ev === 'C') {
              // Defensive: ignore data frames that arrive before auth_success.
              if (this.authState !== 'authenticated') continue;
              const tick: Tick = {
                symbol: msg.pair?.replace('C:', '').replace('/', '') ?? msg.sym,
                price: (msg.bp + msg.ap) / 2,
                bid: msg.bp,
                ask: msg.ap,
                size: msg.bs ?? 1,
                timestamp: msg.t ?? Date.now(),
                source: 'polygon',
              };
              this.receiveTick(tick);
            } else if (msg.ev === 'auth_failed' || msg.status === 'auth_failed') {
              this.handleAuthFailure(
                'polygon',
                'invalid_credentials',
                msg.message ?? 'Polygon rejected the API key.',
              );
              return;
            } else if (msg.ev === 'status' && typeof msg.message === 'string' && looksLikeAuthErrorMessage(msg.message)) {
              this.handleAuthFailure('polygon', 'auth_rejected', msg.message);
              return;
            }
          }
        } catch (err) {
          console.warn('[dataFeed:polygon] error processing WS message', err);
        }
      };

      this.ws.onerror = () => {
        if (gen !== this.connectGeneration) return;
        // Browsers expose almost no detail on WS errors. We let onclose make
        // the auth-vs-network call based on the close code.
        this.stats = { ...this.stats, status: 'error', errorMessage: 'WebSocket error' };
        this.emitStatus();
      };

      this.ws.onclose = (event) => {
        if (gen !== this.connectGeneration) return;
        this.stopHeartbeat();
        this.clearAuthTimeout();

        // Close codes are the only signal a browser exposes for auth-level
        // rejections. Treat the documented codes as fatal; everything else
        // that closes mid-handshake is also fatal because a healthy server
        // wouldn't drop us before auth completes.
        if (AUTH_REJECT_CLOSE_CODES.has(event.code)) {
          this.handleAuthFailure(
            'polygon',
            'auth_rejected',
            `Polygon closed the socket with code ${event.code}: ${event.reason || 'authorization rejected'}`,
          );
          return;
        }
        if (this.authState === 'pending') {
          this.handleAuthFailure(
            'polygon',
            'auth_rejected',
            `Polygon dropped the connection before authentication completed (code ${event.code}).`,
          );
          return;
        }

        this.stats = { ...this.stats, status: 'reconnecting' };
        this.emitStatus();
        this.scheduleReconnect(config);
      };
    } catch (err) {
      this.handleAuthFailure(
        'polygon',
        'auth_rejected',
        `Polygon WebSocket constructor threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private connectAlpaca(config: DataFeedConfig): void {
    const gen = this.connectGeneration;
    this.authState = 'pending';
    const wsUrl = config.paperTrading ? ALPACA_WS_URL_PAPER : ALPACA_WS_URL_LIVE;
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        if (gen !== this.connectGeneration) return;
        this.ws?.send(JSON.stringify({
          action: 'auth',
          key: config.alpacaKeyId ?? config.apiKey,
          secret: config.alpacaSecretKey ?? config.apiSecret ?? '',
        }));
        // Crucially, we do NOT call markConnected() here. Status remains
        // 'connecting' until the server emits {T:'success', msg:'authenticated'}.
        this.armAuthTimeout('alpaca');
      };

      this.ws.onmessage = (event) => {
        if (gen !== this.connectGeneration) return;
        let messages: unknown;
        try {
          messages = JSON.parse(event.data);
        } catch (err) {
          const preview = typeof event.data === 'string' ? event.data.slice(0, 240) : '<binary>';
          console.warn('[dataFeed:alpaca] failed to parse WS message', err, preview);
          return;
        }
        if (!Array.isArray(messages)) {
          console.warn('[dataFeed:alpaca] expected array WS payload, got', typeof messages);
          return;
        }
        try {
          for (const msg of messages) {
            if (msg.T === 'success' && msg.msg === 'authenticated') {
              this.authState = 'authenticated';
              this.clearAuthTimeout();
              const subs = config.symbols.filter(s => !s.includes('USD') || s === 'BTCUSD' || s === 'ETHUSD');
              this.ws?.send(JSON.stringify({
                action: 'subscribe',
                trades: subs,
                quotes: subs,
              }));
              this.markConnected();
            } else if (msg.T === 't') {
              if (this.authState !== 'authenticated') continue;
              const tick: Tick = {
                symbol: msg.S,
                price: msg.p,
                bid: msg.p,
                ask: msg.p,
                size: msg.s,
                timestamp: new Date(msg.t).getTime(),
                source: 'alpaca',
              };
              this.receiveTick(tick);
            } else if (msg.T === 'q') {
              if (this.authState !== 'authenticated') continue;
              const mid = (msg.bp + msg.ap) / 2;
              const tick: Tick = {
                symbol: msg.S,
                price: mid,
                bid: msg.bp,
                ask: msg.ap,
                size: msg.bs,
                timestamp: new Date(msg.t).getTime(),
                source: 'alpaca',
              };
              this.receiveTick(tick);
            } else if (msg.T === 'error') {
              const code = typeof msg.code === 'number' ? msg.code : 0;
              const text = typeof msg.msg === 'string' ? msg.msg : 'Alpaca error';
              // Alpaca documents auth-related codes: 401 unauthorized,
              // 402 plan/permission, 404 invalid creds, 406 too many conns
              // for plan, 409 already authenticated. Treat the credential
              // codes — and any text that smells like an auth error — as
              // fatal so we don't reconnect into the same rejection.
              const isAuthCode = code === 401 || code === 402 || code === 404 || code === 406;
              if (isAuthCode || looksLikeAuthErrorMessage(text)) {
                const reason: AuthFailureReason = code === 402 ? 'forbidden' : 'invalid_credentials';
                this.handleAuthFailure('alpaca', reason, `${text} (code ${code})`);
                return;
              }
              // Otherwise, transient error: log and let onclose drive the
              // normal reconnect logic.
              this.stats = { ...this.stats, status: 'error', errorMessage: text };
              this.emitStatus();
              connectionLogger.warn('data_feed', `Alpaca transient error: ${text}`, undefined, { code });
            }
          }
        } catch (err) {
          console.warn('[dataFeed:alpaca] error processing WS message', err);
        }
      };

      this.ws.onerror = () => {
        if (gen !== this.connectGeneration) return;
        // Don't fall back to simulation here — that masked the auth bug.
        // Let onclose decide whether this is an auth or a network problem.
        this.stats = { ...this.stats, status: 'error', errorMessage: 'WebSocket connection failed' };
        this.emitStatus();
      };

      this.ws.onclose = (event) => {
        if (gen !== this.connectGeneration) return;
        this.stopHeartbeat();
        this.clearAuthTimeout();

        if (AUTH_REJECT_CLOSE_CODES.has(event.code)) {
          this.handleAuthFailure(
            'alpaca',
            'auth_rejected',
            `Alpaca closed the socket with code ${event.code}: ${event.reason || 'authorization rejected'}`,
          );
          return;
        }
        if (this.authState === 'pending') {
          this.handleAuthFailure(
            'alpaca',
            'auth_rejected',
            `Alpaca dropped the connection before authentication completed (code ${event.code}).`,
          );
          return;
        }
        if (this.authState === 'authenticated') {
          this.stats = { ...this.stats, status: 'reconnecting' };
          this.emitStatus();
          this.scheduleReconnect(config);
        }
      };
    } catch (err) {
      this.handleAuthFailure(
        'alpaca',
        'auth_rejected',
        `Alpaca WebSocket constructor threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Centralized authentication-failure handler. Cancels every reconnection
   * timer, tears the socket down, sets a permanent auth lock keyed to the
   * current credentials, and emits a fatal-credential log entry. The system
   * stays disconnected until disconnect() / clearAuthLock() / a config swap.
   */
  private handleAuthFailure(
    provider: 'polygon' | 'alpaca',
    reason: AuthFailureReason,
    detail: string,
  ): void {
    // Bumping the generation invalidates any in-flight reconnect timer
    // closures so a late-firing setTimeout cannot re-enter connect().
    this.connectGeneration++;
    this.authState = 'failed';
    this.teardown();

    if (this.config) {
      this.authLockFingerprint = credentialFingerprint(this.config);
    }

    const message =
      `[${provider}] Authentication failed (${reason}): ${detail}. ` +
      `Update API keys in Data Feed settings and click Reconnect to retry.`;

    this.stats = {
      ...this.stats,
      provider,
      status: 'error',
      authFailed: true,
      authFailureReason: reason,
      errorMessage: message,
      maxRetriesReached: true,
      reconnectCount: 0,
      connectedAt: undefined,
      uptimeMs: undefined,
    };
    this.emitStatus();

    // Persist a fatal credential-error log row. The category is chosen so
    // the SystemHealth UI can filter and surface a permanent banner.
    void connectionLogger.error('data_feed_auth', message, new Error(detail), {
      provider,
      reason,
      fatal: true,
      is_credential_error: true,
      suggested_action: 'verify_api_keys',
    });
  }

  private markConnected(): void {
    // Defensive: never report 'connected' unless we actually completed the
    // authentication handshake.
    if (this.authState !== 'authenticated') return;
    this.stats = {
      ...this.stats,
      status: 'connected',
      connectedAt: Date.now(),
      latencyMs: 0,
      reconnectCount: 0,
      maxRetriesReached: false,
      authFailed: false,
      authFailureReason: undefined,
      errorMessage: undefined,
    };
    this.emitStatus();
    void connectionLogger.info('data_feed', `Data feed connected: ${this.stats.provider}`, {
      provider: this.stats.provider,
    });
    this.startHeartbeat();
  }

  private startSimulation(symbols: string[]): void {
    if (this.simulationInterval) return;
    this.stats = {
      ...this.stats,
      provider: 'simulation',
      status: 'connected',
      connectedAt: Date.now(),
      latencyMs: 0,
      authFailed: false,
      authFailureReason: undefined,
    };
    this.emitStatus();

    const DEFAULT_PRICES: Record<string, { bid: number; ask: number }> = {
      EURUSD: { bid: 1.08500, ask: 1.08502 },
      GBPUSD: { bid: 1.26300, ask: 1.26304 },
      USDJPY: { bid: 153.600, ask: 153.604 },
      AUDUSD: { bid: 0.64100, ask: 0.64104 },
      USDCAD: { bid: 1.38400, ask: 1.38407 },
      NZDUSD: { bid: 0.58800, ask: 0.58807 },
      USDCHF: { bid: 0.90300, ask: 0.90308 },
      EURGBP: { bid: 0.85900, ask: 0.85908 },
    };
    const quoteMap = new Map<string, { bid: number; ask: number }>(
      Object.entries(DEFAULT_PRICES)
    );

    this.simulationInterval = setInterval(() => {
      const activeSymbols = symbols.length > 0 ? symbols : Object.keys(DEFAULT_PRICES);
      for (const sym of activeSymbols) {
        if (Math.random() > 0.4) {
          const base = quoteMap.get(sym) ?? { bid: 1.1000, ask: 1.1002 };
          const isJpy = sym.includes('JPY');
          const pipSize = isJpy ? 0.001 : 0.00001;
          const delta = (Math.random() - 0.5) * pipSize * 4;
          const newBid = parseFloat((base.bid + delta).toFixed(isJpy ? 3 : 5));
          const newAsk = parseFloat((newBid + pipSize * 2).toFixed(isJpy ? 3 : 5));
          quoteMap.set(sym, { bid: newBid, ask: newAsk });

          const tick: Tick = {
            symbol: sym,
            price: (newBid + newAsk) / 2,
            bid: newBid,
            ask: newAsk,
            size: Math.floor(Math.random() * 100000) + 10000,
            timestamp: Date.now(),
            source: 'simulation',
          };
          this.receiveTick(tick);
        }
      }
    }, 500);
  }

  private receiveTick(tick: Tick): void {
    this.stats = {
      ...this.stats,
      ticksReceived: this.stats.ticksReceived + 1,
      lastTickAt: Date.now(),
    };
    this.tickHandlers.forEach(h => h(tick));
  }

  private emitStatus(): void {
    const snapshot = { ...this.stats };
    this.statusHandlers.forEach(h => h(snapshot));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    let lastTick = Date.now();

    this.heartbeatTickUnsub = this.onTick(() => { lastTick = Date.now(); });

    this.heartbeatInterval = setInterval(() => {
      const silence = Date.now() - lastTick;
      if (silence > HEARTBEAT_SILENCE_THRESHOLD && this.stats.status === 'connected') {
        this.stopHeartbeat();
        this.stats = { ...this.stats, status: 'reconnecting', errorMessage: `Feed silent >${HEARTBEAT_SILENCE_THRESHOLD / 1000}s` };
        this.emitStatus();
        if (this.config) this.scheduleReconnect(this.config);
      }
    }, HEARTBEAT_CHECK_INTERVAL);
  }

  private scheduleReconnect(config: DataFeedConfig): void {
    // Hard guard: a fatal auth failure must never schedule another attempt.
    if (this.authLockFingerprint) return;
    if (this.authState === 'failed') return;
    if (this.reconnectTimeout) return;

    if (this.stats.reconnectCount >= MAX_RECONNECT_ATTEMPTS) {
      this.stats = {
        ...this.stats,
        status: 'error',
        errorMessage: `Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts.`,
        maxRetriesReached: true,
      };
      this.emitStatus();
      void connectionLogger.error('data_feed', this.stats.errorMessage ?? 'Max reconnects reached', undefined, {
        provider: config.provider,
        reconnectCount: this.stats.reconnectCount,
      });
      return;
    }

    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.stats.reconnectCount),
      MAX_RECONNECT_DELAY,
    );
    const gen = this.connectGeneration;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (gen !== this.connectGeneration) return;
      // Re-check the auth lock at fire-time too, in case the failure landed
      // between scheduling and firing.
      if (this.authLockFingerprint) return;
      this.stats = { ...this.stats, reconnectCount: this.stats.reconnectCount + 1 };
      this.connect(config);
    }, delay);
  }
}

export const dataFeedService = new DataFeedService();

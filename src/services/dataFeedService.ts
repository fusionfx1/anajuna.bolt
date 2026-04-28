import type {
  Tick, OHLCVBar, ConnectionStats, DataFeedConfig
} from '../types/dataFeed';

type TickHandler = (tick: Tick) => void;
type StatusHandler = (stats: ConnectionStats) => void;

const POLYGON_WS_URL = 'wss://socket.polygon.io/forex';
const ALPACA_WS_URL_PAPER = 'wss://stream.data.alpaca.markets/v2/iex';
const ALPACA_WS_URL_LIVE = 'wss://stream.data.alpaca.markets/v2/iex';
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const HEARTBEAT_CHECK_INTERVAL = 10000;
const HEARTBEAT_SILENCE_THRESHOLD = 30000;

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

class DataFeedService {
  private ws: WebSocket | null = null;
  private config: DataFeedConfig | null = null;
  private tickHandlers: Set<TickHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private simulationInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTickUnsub: (() => void) | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private oandaAbortController: AbortController | null = null;
  private connectGeneration = 0;
  private stats: ConnectionStats = {
    provider: 'simulation',
    status: 'disconnected',
    ticksReceived: 0,
    reconnectCount: 0,
  };
  private barBuffers: Map<string, { open: number; high: number; low: number; close: number; volume: number; startTs: number }> = new Map();

  connect(config: DataFeedConfig): void {
    this.config = config;
    const prevReconnectCount = this.stats.reconnectCount;
    this.connectGeneration++;
    this.teardown();
    this.stats = {
      provider: config.provider,
      status: 'connecting',
      ticksReceived: 0,
      reconnectCount: prevReconnectCount,
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
    this.teardown();
    this.stats = { ...this.stats, status: 'disconnected' };
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
    try {
      this.ws = new WebSocket(POLYGON_WS_URL);

      this.ws.onopen = () => {
        // Wait for the 'connected' event from Polygon before sending auth
      };

      this.ws.onmessage = (event) => {
        if (gen !== this.connectGeneration) return;
        try {
          const messages = JSON.parse(event.data);
          for (const msg of messages) {
            if (msg.ev === 'connected') {
              this.ws?.send(JSON.stringify({
                action: 'auth',
                params: config.apiKey,
              }));
            } else if (msg.ev === 'auth_success') {
              const subs = config.symbols
                .map(s => `C.${FX_SYMBOL_MAP[s] ?? s}`)
                .join(',');
              this.ws?.send(JSON.stringify({ action: 'subscribe', params: subs }));
              this.markConnected();
            } else if (msg.ev === 'C') {
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
            } else if (msg.ev === 'auth_failed') {
              this.stats = { ...this.stats, status: 'error', errorMessage: 'Polygon auth failed -- check API key' };
              this.emitStatus();
              this.fallbackToSimulation(config.symbols, 'auth_failed');
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onerror = () => {
        if (gen !== this.connectGeneration) return;
        this.stats = { ...this.stats, status: 'error', errorMessage: 'WebSocket error' };
        this.emitStatus();
      };

      this.ws.onclose = () => {
        if (gen !== this.connectGeneration) return;
        this.stopHeartbeat();
        this.stats = { ...this.stats, status: 'reconnecting' };
        this.emitStatus();
        this.scheduleReconnect(config);
      };
    } catch {
      this.fallbackToSimulation(config.symbols, 'websocket_error');
    }
  }

  private connectAlpaca(config: DataFeedConfig): void {
    const gen = this.connectGeneration;
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
      };

      this.ws.onmessage = (event) => {
        if (gen !== this.connectGeneration) return;
        try {
          const messages = JSON.parse(event.data);
          for (const msg of messages) {
            if (msg.T === 'success' && msg.msg === 'authenticated') {
              const subs = config.symbols.filter(s => !s.includes('USD') || s === 'BTCUSD' || s === 'ETHUSD');
              this.ws?.send(JSON.stringify({
                action: 'subscribe',
                trades: subs,
                quotes: subs,
              }));
              this.markConnected();
            } else if (msg.T === 't') {
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
              this.stats = { ...this.stats, status: 'error', errorMessage: msg.msg };
              this.emitStatus();
              this.fallbackToSimulation(config.symbols, 'auth_failed');
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onerror = () => {
        if (gen !== this.connectGeneration) return;
        this.stats = { ...this.stats, status: 'error', errorMessage: 'WebSocket connection failed' };
        this.emitStatus();
        this.fallbackToSimulation(config.symbols, 'websocket_error');
      };

      this.ws.onclose = () => {
        if (gen !== this.connectGeneration) return;
        if (this.stats.status === 'connected') {
          this.stopHeartbeat();
          this.stats = { ...this.stats, status: 'reconnecting' };
          this.emitStatus();
          this.scheduleReconnect(config);
        }
      };
    } catch {
      this.fallbackToSimulation(config.symbols, 'websocket_error');
    }
  }

  private markConnected(): void {
    this.stats = {
      ...this.stats,
      status: 'connected',
      connectedAt: Date.now(),
      latencyMs: 0,
      reconnectCount: 0,
      maxRetriesReached: false,
    };
    this.emitStatus();
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

  private fallbackToSimulation(
    symbols: string[],
    reason: 'auth_failed' | 'max_retries' | 'websocket_error' | 'connection_lost' | 'heartbeat_timeout' | 'unknown' = 'unknown',
  ): void {
    if (this.simulationInterval) return;
    const fallbackTime = Date.now();
    this.stats = {
      ...this.stats,
      status: 'connected',
      provider: 'simulation',
      isFallback: true,
      fallbackReason: reason,
      fallbackTime,
    };
    this.emitStatus();
    this.startSimulation(symbols);
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
    if (this.reconnectTimeout) return;

    if (this.stats.reconnectCount >= MAX_RECONNECT_ATTEMPTS) {
      this.stats = {
        ...this.stats,
        status: 'error',
        errorMessage: `Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts. Falling back to simulation.`,
        maxRetriesReached: true,
      };
      this.emitStatus();
      this.fallbackToSimulation(config.symbols, 'max_retries');
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
      this.stats = { ...this.stats, reconnectCount: this.stats.reconnectCount + 1 };
      this.connect(config);
    }, delay);
  }
}

export const dataFeedService = new DataFeedService();

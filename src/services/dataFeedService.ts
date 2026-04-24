import type {
  DataProvider, FeedStatus, Tick, OHLCVBar, ConnectionStats, DataFeedConfig
} from '../types/dataFeed';
import { oandaService } from './oandaService';
import type { OandaPricingTick } from '../types/oanda';

type TickHandler = (tick: Tick) => void;
type StatusHandler = (stats: ConnectionStats) => void;

const POLYGON_WS_URL = 'wss://socket.polygon.io/forex';
const ALPACA_WS_URL_PAPER = 'wss://stream.data.alpaca.markets/v2/iex';
const ALPACA_WS_URL_LIVE = 'wss://stream.data.alpaca.markets/v2/iex';

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
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private oandaUnsubscribe: (() => void) | null = null;
  private stats: ConnectionStats = {
    provider: 'simulation',
    status: 'disconnected',
    ticksReceived: 0,
    reconnectCount: 0,
  };
  private barBuffers: Map<string, { open: number; high: number; low: number; close: number; volume: number; startTs: number }> = new Map();

  connect(config: DataFeedConfig): void {
    this.config = config;
    this.disconnect();
    this.stats = {
      provider: config.provider,
      status: 'connecting',
      ticksReceived: 0,
      reconnectCount: this.stats.reconnectCount,
    };
    this.emitStatus();

    // When OANDA is the broker, subscribe to its pricing stream as the data source
    if (config.brokerProvider === 'oanda' && oandaService.isConfigured()) {
      this.connectOandaStream(config.symbols);
      return;
    }

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
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    if (this.oandaUnsubscribe) {
      this.oandaUnsubscribe();
      this.oandaUnsubscribe = null;
      oandaService.disconnectStream();
    }
    this.stats = { ...this.stats, status: 'disconnected' };
    this.emitStatus();
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
    return { ...this.stats };
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

  private connectOandaStream(symbols: string[]): void {
    // Register handler that converts OANDA pricing ticks into the standard Tick format
    this.oandaUnsubscribe = oandaService.onPricingTick((oandaTick: OandaPricingTick) => {
      if (!oandaTick.tradeable) return;

      const bid = parseFloat(oandaTick.bids[0]?.price ?? oandaTick.closeoutBid);
      const ask = parseFloat(oandaTick.asks[0]?.price ?? oandaTick.closeoutAsk);
      if (isNaN(bid) || isNaN(ask)) return;

      // OANDA instruments use underscore (EUR_USD) — normalise to no-separator (EURUSD)
      const symbol = oandaTick.instrument.replace('_', '');

      const tick: Tick = {
        symbol,
        price: (bid + ask) / 2,
        bid,
        ask,
        size: 1,
        timestamp: new Date(oandaTick.time).getTime(),
        source: 'simulation', // re-uses existing DataProvider union; treated as live by UI
      };
      this.receiveTick(tick);
    });

    // Start the HTTP streaming connection
    oandaService.connectPricingStream(symbols).then(() => {
      this.stats = {
        ...this.stats,
        provider: 'simulation',
        status: 'connected',
        connectedAt: Date.now(),
        latencyMs: 0,
      };
      this.emitStatus();
      this.startHeartbeat();
    }).catch(() => {
      // OANDA stream failed — fall back to simulation so UI is never blank
      this.fallbackToSimulation(symbols);
    });

    // Optimistically mark as connecting; first tick will confirm connected
    this.stats = { ...this.stats, status: 'connecting' };
    this.emitStatus();
  }

  private connectPolygon(config: DataFeedConfig): void {
    try {
      this.ws = new WebSocket(POLYGON_WS_URL);

      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({ action: 'auth', params: config.apiKey }));
      };

      this.ws.onmessage = (event) => {
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
              this.stats = {
                ...this.stats,
                status: 'connected',
                connectedAt: Date.now(),
                latencyMs: 0,
              };
              this.emitStatus();
              this.startHeartbeat();
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
              this.stats = { ...this.stats, status: 'error', errorMessage: 'Polygon auth failed — check API key' };
              this.emitStatus();
              this.fallbackToSimulation(config.symbols);
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onerror = () => {
        this.stats = { ...this.stats, status: 'error', errorMessage: 'WebSocket error' };
        this.emitStatus();
      };

      this.ws.onclose = () => {
        this.stats = { ...this.stats, status: 'reconnecting' };
        this.emitStatus();
        this.scheduleReconnect(config);
      };
    } catch {
      this.fallbackToSimulation(config.symbols);
    }
  }

  private connectAlpaca(config: DataFeedConfig): void {
    const wsUrl = config.paperTrading ? ALPACA_WS_URL_PAPER : ALPACA_WS_URL_LIVE;
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({
          action: 'auth',
          key: config.alpacaKeyId ?? config.apiKey,
          secret: config.alpacaSecretKey ?? config.apiSecret ?? '',
        }));
      };

      this.ws.onmessage = (event) => {
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
              this.stats = { ...this.stats, status: 'connected', connectedAt: Date.now() };
              this.emitStatus();
              this.startHeartbeat();
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
              this.fallbackToSimulation(config.symbols);
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onerror = () => {
        this.stats = { ...this.stats, status: 'error', errorMessage: 'WebSocket connection failed' };
        this.emitStatus();
        this.fallbackToSimulation(config.symbols);
      };

      this.ws.onclose = () => {
        if (this.stats.status === 'connected') {
          this.stats = { ...this.stats, status: 'reconnecting' };
          this.emitStatus();
          this.scheduleReconnect(config);
        }
      };
    } catch {
      this.fallbackToSimulation(config.symbols);
    }
  }

  private startSimulation(symbols: string[]): void {
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

  private fallbackToSimulation(symbols: string[]): void {
    if (this.simulationInterval) return;
    this.stats = { ...this.stats, status: 'connected', provider: 'simulation' };
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
    if (this.heartbeatInterval) return;
    let lastTick = Date.now();

    this.onTick(() => { lastTick = Date.now(); });

    this.heartbeatInterval = setInterval(() => {
      const silence = Date.now() - lastTick;
      if (silence > 30000 && this.stats.status === 'connected') {
        this.stats = { ...this.stats, status: 'reconnecting', errorMessage: 'Feed silent >30s' };
        this.emitStatus();
        if (this.config) this.scheduleReconnect(this.config);
      }
    }, 10000);
  }

  private scheduleReconnect(config: DataFeedConfig): void {
    if (this.reconnectTimeout) return;
    const delay = Math.min(5000 * Math.pow(2, this.stats.reconnectCount), 60000);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.stats = { ...this.stats, reconnectCount: this.stats.reconnectCount + 1 };
      this.connect(config);
    }, delay);
  }
}

export const dataFeedService = new DataFeedService();

export type DataProvider = 'eodhd' | 'tiingo' | 'synthetic' | 'polygon' | 'alpaca' | 'simulation';
export type FeedStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';
export type OrderStatus = 'pending' | 'submitted' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'expired';
export type BrokerProvider = 'alpaca' | 'oanda' | 'paper';

export interface DataFeedConfig {
  provider: DataProvider;
  apiKey: string;
  apiSecret?: string;
  symbols: string[];
  paperTrading: boolean;
  brokerProvider: BrokerProvider;
  alpacaKeyId?: string;
  alpacaSecretKey?: string;
  oandaAccountId?: string;
  oandaApiToken?: string;
  oandaAccountType?: 'practice' | 'live';
}

export interface Tick {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  size: number;
  timestamp: number;
  source: DataProvider;
}

export interface OHLCVBar {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  timestamp: number;
  timeframe: '1m' | '5m' | '15m' | '1h' | '1d';
}

export interface OrderBookLevel {
  price: number;
  size: number;
  count?: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface ManagedOrder {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  status: OrderStatus;
  filledQty: number;
  filledAvgPrice?: number;
  strategyId?: string;
  strategyName?: string;
  riskApproved: boolean;
  rejectionReason?: string;
  brokerOrderId?: string;
  submittedAt: string;
  filledAt?: string;
  cancelledAt?: string;
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
}

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
  checks: {
    name: string;
    passed: boolean;
    detail: string;
  }[];
}

export interface SystemHealthMetric {
  name: string;
  status: 'ok' | 'warn' | 'error';
  value: string;
  detail?: string;
  lastUpdated: number;
}

export interface ConnectionStats {
  provider: DataProvider;
  status: FeedStatus;
  connectedAt?: number;
  lastTickAt?: number;
  ticksReceived: number;
  reconnectCount: number;
  latencyMs?: number;
  errorMessage?: string;
  maxRetriesReached?: boolean;
  uptimeMs?: number;
  isFallback?: boolean;
  fallbackReason?: 'auth_failed' | 'max_retries' | 'websocket_error' | 'connection_lost' | 'heartbeat_timeout' | 'unknown';
  fallbackTime?: number;
}

export interface PositionSizeResult {
  quantity: number;
  dollarRisk: number;
  priceRiskPerUnit: number;
  accountEquity: number;
  riskPct: number;
}

export type NavPage =
  | 'dashboard'
  | 'market_watch'
  | 'strategies'
  | 'trades'
  | 'risk'
  | 'backtesting'
  | 'order_management'
  | 'system_health'
  | 'settings';

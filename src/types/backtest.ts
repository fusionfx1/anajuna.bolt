import type { StrategyType } from './trading';

export type BacktestStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export type BacktestGranularity = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1';
export type BacktestInstrument = 'EUR_USD' | 'GBP_USD' | 'USD_JPY' | 'XAU_USD' | 'AUD_USD' | 'USD_CAD' | 'NZD_USD';

export const BACKTEST_GRANULARITIES: { value: BacktestGranularity; label: string; seconds: number }[] = [
  { value: 'M1',  label: '1 Min',   seconds: 60 },
  { value: 'M5',  label: '5 Min',   seconds: 300 },
  { value: 'M15', label: '15 Min',  seconds: 900 },
  { value: 'H1',  label: '1 Hour',  seconds: 3600 },
  { value: 'H4',  label: '4 Hours', seconds: 14400 },
  { value: 'D1',  label: '1 Day',   seconds: 86400 },
];

export const BACKTEST_INSTRUMENTS: { value: BacktestInstrument; label: string }[] = [
  { value: 'EUR_USD', label: 'EUR/USD' },
  { value: 'GBP_USD', label: 'GBP/USD' },
  { value: 'USD_JPY', label: 'USD/JPY' },
  { value: 'XAU_USD', label: 'XAU/USD' },
  { value: 'AUD_USD', label: 'AUD/USD' },
  { value: 'USD_CAD', label: 'USD/CAD' },
  { value: 'NZD_USD', label: 'NZD/USD' },
];

export interface BacktestConfig {
  strategyId: string | null;
  strategyName: string;
  strategyType: StrategyType;
  instrument: BacktestInstrument;
  granularity: BacktestGranularity;
  startDate: string;
  endDate: string;
  initialBalance: number;
  commissionPips: number;
  slippage: 'none' | 'fixed' | 'random';
  slippagePips: number;
  positionSizing: 'fixed' | 'risk_pct';
  lotSize: number;
  riskPct: number;
  strategyConfig: Record<string, unknown>;
}

export interface SimulatedTrade {
  id: number;
  side: 'BUY' | 'SELL';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  units: number;
  pnl: number;
  pnlPct: number;
  reason: 'signal' | 'tp' | 'sl' | 'trailing' | 'end_of_data';
  commission: number;
}

export interface EquityCurvePoint {
  time: number;
  balance: number;
  equity: number;
  drawdownPct: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  netPnlPct: number;
  grossProfit: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  expectancy: number;
  avgDurationBars: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  monthlyPnl: { month: string; pnl: number; trades: number }[];
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  trades: SimulatedTrade[];
  equityCurve: EquityCurvePoint[];
  candleCount: number;
}

export interface BacktestProgress {
  currentBar: number;
  totalBars: number;
  pct: number;
  openTrades: number;
  closedTrades: number;
  currentBalance: number;
}

// Worker message types
export type WorkerInMessage =
  | { type: 'run'; config: BacktestConfig; candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[] }
  | { type: 'cancel' };

export type WorkerOutMessage =
  | { type: 'progress'; data: BacktestProgress }
  | { type: 'complete'; data: BacktestResult }
  | { type: 'error'; message: string };

// Saved run from Supabase
export interface BacktestRun {
  id: string;
  user_id: string;
  strategy_id: string | null;
  strategy_name: string;
  strategy_type: string;
  instrument: string;
  granularity: string;
  start_date: string;
  end_date: string;
  initial_balance: number;
  config: Record<string, unknown>;
  results: BacktestMetrics;
  trade_log: SimulatedTrade[];
  equity_curve: EquityCurvePoint[];
  status: string;
  candle_count: number;
  created_at: string;
}

// Historical candle coverage info
export interface CandleCoverage {
  instrument: string;
  granularity: string;
  minTime: string;
  maxTime: string;
  count: number;
}

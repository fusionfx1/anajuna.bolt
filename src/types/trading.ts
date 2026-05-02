export type StrategyType = 'scalping' | 'swing' | 'trend_following' | 'mean_reversion' | 'arbitrage' | 'agent_fused';
export type StrategyStatus = 'active' | 'paused' | 'stopped' | 'backtesting' | 'error';
export type PositionDirection = 'BUY' | 'SELL';
export type PositionStatus = 'open' | 'closed' | 'cancelled';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
export type RiskSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type RiskAction = 'NONE' | 'PAUSED_BOT' | 'CLOSED_POSITIONS' | 'HALTED_ALL';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  strategy_type: StrategyType;
  status: StrategyStatus;
  symbols: string[];
  config: Record<string, unknown>;
  max_drawdown_pct: number;
  lot_size: number;
  max_concurrent_trades: number;
  total_trades: number;
  win_rate: number;
  total_pnl_usd: number;
  sharpe_ratio: number | null;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  strategy_id: string | null;
  strategy_name?: string;
  symbol: string;
  direction: PositionDirection;
  lot_size: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  pnl_usd: number | null;
  pnl_pips: number | null;
  current_price?: number;
  unrealized_pnl?: number;
  status: PositionStatus;
  opened_at: string;
  closed_at: string | null;
  broker_ticket_id: string | null;
}

export interface Trade {
  id: string;
  position_id: string | null;
  strategy_id: string | null;
  strategy_name?: string;
  symbol: string;
  order_type: OrderType;
  side: PositionDirection;
  quantity: number;
  requested_price: number;
  fill_price: number;
  slippage_pips: number;
  commission_usd: number;
  swap_usd: number;
  pnl_usd: number | null;
  broker_order_id: string | null;
  execution_latency_ms: number | null;
  executed_at: string;
}

export interface EquitySnapshot {
  id: string;
  balance: number;
  equity: number;
  margin_used: number;
  free_margin: number;
  drawdown_pct: number;
  open_positions_count: number;
  snapshot_at: string;
}

export interface RiskEvent {
  id: string;
  strategy_id: string | null;
  strategy_name?: string;
  severity: RiskSeverity;
  event_type: string;
  message: string;
  action_taken: RiskAction;
  occurred_at: string;
}

export interface MarketQuote {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  change_pct: number;
  high_24h: number;
  low_24h: number;
  volume: number;
  timestamp: number;
}

export interface AccountSummary {
  balance: number;
  equity: number;
  margin_used: number;
  free_margin: number;
  margin_level_pct: number;
  open_pnl: number;
  daily_pnl: number;
  daily_pnl_pct: number;
  drawdown_pct: number;
  peak_balance: number;
}

export interface PerformanceMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win_usd: number;
  avg_loss_usd: number;
  profit_factor: number;
  expected_value: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  total_pnl: number;
  avg_trade_duration_mins: number;
}

export type NavPage = 'dashboard' | 'market_watch' | 'strategies' | 'ai_engine' | 'trades' | 'risk' | 'backtesting' | 'order_management' | 'system_health' | 'settings' | 'broker_demo' | 'chart' | 'paper_positions' | 'paper_history' | 'news';

import type { StrategyType } from '../../types/trading';

export interface StrategyTemplate {
  id: string;
  label: string;
  description: string;
  strategy_type: StrategyType;
  symbols: string[];
  config: Record<string, unknown>;
  max_drawdown_pct: number;
  lot_size: number;
  max_concurrent_trades: number;
  badge: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'ema_crossover',
    label: 'EMA Crossover',
    description: 'Fast/slow EMA crossover with ATR-based stop loss and take profit. Best on M5–M15 charts.',
    strategy_type: 'scalping',
    symbols: ['EURUSD', 'GBPUSD'],
    config: { fast_ema: 8, slow_ema: 21, atr_period: 14, atr_sl_mult: 1.5, atr_tp_mult: 2.0, session: 'london_ny' },
    max_drawdown_pct: 3.0,
    lot_size: 0.01,
    max_concurrent_trades: 3,
    badge: 'Popular',
    difficulty: 'Beginner',
  },
  {
    id: 'rsi_mean_reversion',
    label: 'RSI Mean Reversion',
    description: 'Oversold/overbought RSI entries with Bollinger Band confirmation. Works on H1.',
    strategy_type: 'mean_reversion',
    symbols: ['EURUSD', 'AUDUSD'],
    config: { rsi_period: 14, rsi_oversold: 30, rsi_overbought: 70, bb_period: 20, bb_std: 2.0 },
    max_drawdown_pct: 4.5,
    lot_size: 0.02,
    max_concurrent_trades: 2,
    badge: 'Steady',
    difficulty: 'Beginner',
  },
  {
    id: 'bollinger_bands',
    label: 'Bollinger Band Squeeze',
    description: 'Detects low-volatility squeeze then trades the breakout with volume confirmation.',
    strategy_type: 'trend_following',
    symbols: ['EURUSD', 'USDJPY', 'GBPJPY'],
    config: { bb_period: 20, bb_std: 2.0, squeeze_threshold: 0.0008, volume_mult: 1.3, atr_period: 14 },
    max_drawdown_pct: 5.0,
    lot_size: 0.02,
    max_concurrent_trades: 2,
    badge: 'Breakout',
    difficulty: 'Intermediate',
  },
  {
    id: 'macd_swing',
    label: 'MACD Swing Trader',
    description: 'MACD histogram divergence with weekly EMA trend filter. Designed for H4 charts.',
    strategy_type: 'swing',
    symbols: ['EURUSD', 'USDJPY', 'USDCAD'],
    config: { macd_fast: 12, macd_slow: 26, macd_signal: 9, trend_ema: 200 },
    max_drawdown_pct: 6.0,
    lot_size: 0.03,
    max_concurrent_trades: 4,
    badge: 'Long Hold',
    difficulty: 'Intermediate',
  },
  {
    id: 'london_breakout',
    label: 'London Session Breakout',
    description: 'Trades the breakout of the Asian range at London open with momentum filters.',
    strategy_type: 'trend_following',
    symbols: ['GBPUSD', 'EURGBP'],
    config: { breakout_period_mins: 120, momentum_threshold: 0.0015, max_spread_pips: 2.5 },
    max_drawdown_pct: 5.0,
    lot_size: 0.05,
    max_concurrent_trades: 1,
    badge: 'Session',
    difficulty: 'Intermediate',
  },
  {
    id: 'stoch_rsi_scalper',
    label: 'Stoch RSI Scalper',
    description: 'Stochastic RSI with VWAP confirmation for high-frequency entries on M1–M5.',
    strategy_type: 'scalping',
    symbols: ['EURUSD', 'GBPUSD', 'USDJPY'],
    config: { stoch_rsi_period: 14, stoch_k: 3, stoch_d: 3, vwap_deviation: 0.5, max_spread_pips: 1.5 },
    max_drawdown_pct: 2.5,
    lot_size: 0.01,
    max_concurrent_trades: 5,
    badge: 'Fast',
    difficulty: 'Advanced',
  },
  {
    id: 'stat_arb',
    label: 'Statistical Arbitrage',
    description: 'Cointegrated pair trading using z-score mean reversion across correlated instruments.',
    strategy_type: 'arbitrage',
    symbols: ['EURUSD', 'GBPUSD'],
    config: { lookback_period: 60, entry_zscore: 2.0, exit_zscore: 0.5, half_life: 15 },
    max_drawdown_pct: 3.5,
    lot_size: 0.02,
    max_concurrent_trades: 2,
    badge: 'Quant',
    difficulty: 'Advanced',
  },
  {
    id: 'ai_council',
    label: 'AI Council (Agent Fused)',
    description: 'Trades only when ≥3 agents (news / FRED / sentiment / technical) agree with confidence ≥0.7. Reads from agent_decisions feed.',
    strategy_type: 'agent_fused',
    symbols: ['EURUSD'],
    config: { min_confidence: 0.7, min_agreement: 3, tp_pips: 50, sl_pips: 30, max_decision_age_sec: 300 },
    max_drawdown_pct: 3.0,
    lot_size: 0.01,
    max_concurrent_trades: 1,
    badge: 'AI',
    difficulty: 'Advanced',
  },
  {
    id: 'custom',
    label: 'Custom Strategy',
    description: 'Start from a blank slate and configure every parameter manually.',
    strategy_type: 'trend_following',
    symbols: [],
    config: {},
    max_drawdown_pct: 5.0,
    lot_size: 0.01,
    max_concurrent_trades: 3,
    badge: 'Custom',
    difficulty: 'Advanced',
  },
];

export const FOREX_SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD',
  'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CHFJPY', 'EURCHF', 'EURCAD',
  'GBPCAD', 'CADJPY', 'AUDCAD', 'NZDJPY', 'EURNZD', 'GBPNZD'
];

export const STRATEGY_TYPE_LABELS: Record<string, string> = {
  scalping: 'Scalping',
  swing: 'Swing',
  trend_following: 'Trend Following',
  mean_reversion: 'Mean Reversion',
  arbitrage: 'Arbitrage',
  agent_fused: 'Agent Fused',
};

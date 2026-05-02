import type { Strategy, StrategyType } from '../types/trading';

/**
 * The 5 curated strategies for experimentation.
 *
 * Each row covers a distinct market regime so an operator can compare
 * performance across regimes on the same date range:
 *
 *   1. Momentum Scalp   — active session scalping (M5)
 *   2. Trend Hunter     — directional trend on majors (H1)
 *   3. Range Snapper    — sideways mean reversion (M15)
 *   4. Pattern Sniper   — candlestick reversals (H4)
 *   5. AI Council       — agent-fused signals from agent_decisions feed
 *
 * Used by:
 *   - supabase/migrations/20260501_seed_strategies.sql (server-side seed, user_id NULL)
 *   - Strategies page "Restore seeds" button (client-side restore for the current user)
 */

export interface StrategySeed {
  name: string;
  description: string;
  strategy_type: StrategyType;
  symbols: string[];
  config: Record<string, unknown>;
  max_drawdown_pct: number;
  lot_size: number;
  max_concurrent_trades: number;
}

export const STRATEGY_SEEDS: StrategySeed[] = [
  {
    name: 'Momentum Scalp',
    description:
      'EMA 9/21 crossover with RSI filter. Tuned for active session (London/NY) on EURUSD M5. Tight stops, fast exits.',
    strategy_type: 'scalping',
    symbols: ['EURUSD'],
    config: {
      ema_fast: 9,
      ema_slow: 21,
      rsi_period: 14,
      rsi_overbought: 70,
      rsi_oversold: 30,
      tp_pips: 12,
      sl_pips: 8,
    },
    max_drawdown_pct: 3.0,
    lot_size: 0.5,
    max_concurrent_trades: 2,
  },
  {
    name: 'Trend Hunter',
    description:
      'EMA 50/200 cross with MACD histogram confirmation. Targets multi-day trends on H1 majors. Wide stops, big runners.',
    strategy_type: 'trend_following',
    symbols: ['EURUSD', 'GBPUSD'],
    config: {
      ema_fast: 50,
      ema_slow: 200,
      tp_pips: 80,
      sl_pips: 40,
    },
    max_drawdown_pct: 5.0,
    lot_size: 1.0,
    max_concurrent_trades: 2,
  },
  {
    name: 'Range Snapper',
    description:
      'Bollinger Band touch + RSI confirmation. Trades reversion in sideways markets on JPY/AUD pairs M15.',
    strategy_type: 'mean_reversion',
    symbols: ['USDJPY', 'AUDUSD'],
    config: {
      bb_period: 20,
      bb_std: 2.0,
      rsi_period: 14,
      tp_pips: 20,
      sl_pips: 15,
    },
    max_drawdown_pct: 4.0,
    lot_size: 0.7,
    max_concurrent_trades: 2,
  },
  {
    name: 'Pattern Sniper',
    description:
      'Pure price action: bullish/bearish engulfing + hammer/shooting star with ATR-filtered body. H4, multi-pair.',
    strategy_type: 'swing',
    symbols: ['XAUUSD', 'EURUSD'],
    config: {
      atr_period: 14,
      tp_pips: 40,
      sl_pips: 25,
    },
    max_drawdown_pct: 4.0,
    lot_size: 0.5,
    max_concurrent_trades: 1,
  },
  {
    name: 'AI Council',
    description:
      'Agent-fused signals: trades only when ≥3 agents (news / FRED / sentiment / technical) agree with confidence ≥0.7. Reads from agent_decisions feed.',
    strategy_type: 'agent_fused',
    symbols: ['EURUSD'],
    config: {
      min_confidence: 0.7,
      min_agreement: 3,
      tp_pips: 50,
      sl_pips: 30,
      max_decision_age_sec: 300,
    },
    max_drawdown_pct: 3.0,
    lot_size: 0.3,
    max_concurrent_trades: 1,
  },
];

export const SEED_NAMES = STRATEGY_SEEDS.map((s) => s.name);

/**
 * Build a Strategy row payload (excluding id/timestamps) from a seed.
 * Used when restoring seeds for an authenticated user.
 */
export function seedToStrategyRow(seed: StrategySeed): Omit<
  Strategy,
  'id' | 'created_at' | 'updated_at' | 'total_trades' | 'win_rate' | 'total_pnl_usd' | 'sharpe_ratio'
> & {
  total_trades: number;
  win_rate: number;
  total_pnl_usd: number;
  sharpe_ratio: number | null;
  status: Strategy['status'];
} {
  return {
    ...seed,
    status: 'stopped',
    total_trades: 0,
    win_rate: 0,
    total_pnl_usd: 0,
    sharpe_ratio: null,
  };
}

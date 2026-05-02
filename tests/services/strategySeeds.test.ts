import { describe, it, expect } from 'vitest';
import { STRATEGY_SEEDS, SEED_NAMES } from '../../src/services/strategySeeds';
import {
  getStrategyFn,
  getDefaultStrategyConfig,
  agentFusedStrategy,
} from '../../src/services/backtestStrategies';
import type { Candle } from '../../src/services/backtestEngine';

describe('strategy seeds (5 starter strategies)', () => {
  it('exports exactly 5 seeds', () => {
    expect(STRATEGY_SEEDS).toHaveLength(5);
    expect(SEED_NAMES).toEqual([
      'Momentum Scalp',
      'Trend Hunter',
      'Range Snapper',
      'Pattern Sniper',
      'AI Council',
    ]);
  });

  it('every seed has resolvable strategy_type via getStrategyFn', () => {
    for (const seed of STRATEGY_SEEDS) {
      const fn = getStrategyFn(seed.strategy_type);
      expect(typeof fn).toBe('function');
    }
  });

  it('every seed has a non-empty default config from getDefaultStrategyConfig', () => {
    for (const seed of STRATEGY_SEEDS) {
      const cfg = getDefaultStrategyConfig(seed.strategy_type);
      expect(typeof cfg).toBe('object');
      expect(Object.keys(cfg).length).toBeGreaterThan(0);
    }
  });

  it('seeds cover 5 distinct strategy types (or 4 types + agent_fused)', () => {
    const types = new Set(STRATEGY_SEEDS.map((s) => s.strategy_type));
    expect(types.size).toBe(5);
    expect(types.has('agent_fused')).toBe(true);
  });

  it('every seed has at least one symbol and risk numbers in plausible range', () => {
    for (const seed of STRATEGY_SEEDS) {
      expect(seed.symbols.length).toBeGreaterThan(0);
      expect(seed.max_drawdown_pct).toBeGreaterThan(0);
      expect(seed.max_drawdown_pct).toBeLessThanOrEqual(20);
      expect(seed.lot_size).toBeGreaterThan(0);
      expect(seed.max_concurrent_trades).toBeGreaterThanOrEqual(1);
    }
  });
});

function makeCandles(n: number, seed: number): Candle[] {
  const candles: Candle[] = [];
  let price = 1.1;
  for (let i = 0; i < n; i++) {
    const drift = Math.sin((i + seed) / 20) * 0.0015 + (i * 0.00002);
    price = Math.max(0.5, price + drift);
    const high = price + 0.0003;
    const low = price - 0.0003;
    candles.push({
      time: 1700000000 + i * 3600,
      open: price,
      high,
      low,
      close: price,
      volume: 1000,
    });
  }
  return candles;
}

describe('agentFusedStrategy (council vote)', () => {
  it('returns null during warmup (insufficient bars)', () => {
    const candles = makeCandles(50, 1);
    const result = agentFusedStrategy(
      candles,
      10,
      { min_agreement: 3, tp_pips: 50, sl_pips: 30 },
      {},
    );
    expect(result.side).toBeNull();
  });

  it('produces BUY/SELL/null without throwing on a full-length series', () => {
    const candles = makeCandles(400, 7);
    const state: Record<string, unknown> = {};
    const sides = new Set<string | null>();
    for (let i = 0; i < candles.length; i++) {
      const r = agentFusedStrategy(
        candles,
        i,
        { min_agreement: 3, tp_pips: 50, sl_pips: 30 },
        state,
      );
      sides.add(r.side);
      if (r.side !== null) {
        expect(r.tp).toBeDefined();
        expect(r.sl).toBeDefined();
      }
    }
    expect(sides.has(null)).toBe(true);
  });

  it('with min_agreement=1 produces more trades than min_agreement=4 (sanity)', () => {
    const candles = makeCandles(400, 13);
    const count = (agreement: number) => {
      const state: Record<string, unknown> = {};
      let n = 0;
      for (let i = 0; i < candles.length; i++) {
        const r = agentFusedStrategy(
          candles,
          i,
          { min_agreement: agreement, tp_pips: 50, sl_pips: 30 },
          state,
        );
        if (r.side !== null) n++;
      }
      return n;
    };
    expect(count(1)).toBeGreaterThanOrEqual(count(4));
  });
});

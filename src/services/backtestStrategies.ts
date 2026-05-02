import type { Candle, StrategyFn } from './backtestEngine';

// --- Incremental EMA helper ---

function emaStep(prev: number, price: number, period: number): number {
  const k = 2 / (period + 1);
  return price * k + prev * (1 - k);
}

function smaInit(candles: Candle[], end: number, period: number): number {
  let sum = 0;
  for (let i = end - period + 1; i <= end; i++) sum += candles[i].close;
  return sum / period;
}

// --- Scalping: EMA crossover + RSI filter ---

export const scalpingStrategy: StrategyFn = (candles, index, config, state) => {
  const fastPeriod = (config.ema_fast as number) || 9;
  const slowPeriod = (config.ema_slow as number) || 21;
  const rsiPeriod  = (config.rsi_period as number) || 14;
  const rsiOB      = (config.rsi_overbought as number) || 70;
  const rsiOS      = (config.rsi_oversold as number) || 30;
  const tpPips     = (config.tp_pips as number) || 15;
  const slPips     = (config.sl_pips as number) || 10;

  const pip = candles[0] && (candles[0].close > 50 ? 0.1 : candles[0].close > 10 ? 0.01 : 0.0001);
  const warmup = Math.max(fastPeriod, slowPeriod, rsiPeriod + 1);
  if (index < warmup) return { side: null };

  // Init EMAs
  if (!state.emaFast) {
    state.emaFast = smaInit(candles, warmup - 1, fastPeriod);
    state.emaSlow = smaInit(candles, warmup - 1, slowPeriod);
    state.rsiAvgGain = 0;
    state.rsiAvgLoss = 0;
    for (let i = 1; i <= rsiPeriod; i++) {
      const d = candles[i].close - candles[i - 1].close;
      if (d > 0) (state.rsiAvgGain as number) += d;
      else (state.rsiAvgLoss as number) -= d;
    }
    state.rsiAvgGain = (state.rsiAvgGain as number) / rsiPeriod;
    state.rsiAvgLoss = (state.rsiAvgLoss as number) / rsiPeriod;
    state.prevFast = state.emaFast;
    state.prevSlow = state.emaSlow;
    state.lastRsiIdx = rsiPeriod;
  }

  // Update EMA
  const prevFast = state.emaFast as number;
  const prevSlow = state.emaSlow as number;
  state.emaFast = emaStep(prevFast, candles[index].close, fastPeriod);
  state.emaSlow = emaStep(prevSlow, candles[index].close, slowPeriod);

  // Update RSI incrementally
  const lastIdx = state.lastRsiIdx as number;
  let avgGain = state.rsiAvgGain as number;
  let avgLoss = state.rsiAvgLoss as number;
  for (let j = lastIdx + 1; j <= index; j++) {
    const d = candles[j].close - candles[j - 1].close;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (rsiPeriod - 1) + g) / rsiPeriod;
    avgLoss = (avgLoss * (rsiPeriod - 1) + l) / rsiPeriod;
  }
  state.rsiAvgGain = avgGain;
  state.rsiAvgLoss = avgLoss;
  state.lastRsiIdx = index;

  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // Crossover detection
  const fastNow = state.emaFast as number;
  const slowNow = state.emaSlow as number;
  const crossUp = prevFast <= prevSlow && fastNow > slowNow;
  const crossDown = prevFast >= prevSlow && fastNow < slowNow;

  state.prevFast = fastNow;
  state.prevSlow = slowNow;

  const price = candles[index].close;

  if (crossUp && rsi < rsiOB) {
    return {
      side: 'BUY',
      tp: price + tpPips * pip,
      sl: price - slPips * pip,
    };
  }
  if (crossDown && rsi > rsiOS) {
    return {
      side: 'SELL',
      tp: price - tpPips * pip,
      sl: price + slPips * pip,
    };
  }

  return { side: null };
};

// --- Trend Following: EMA 50/200 cross + MACD confirmation ---

export const trendFollowingStrategy: StrategyFn = (candles, index, config, state) => {
  const fastPeriod = (config.ema_fast as number) || 50;
  const slowPeriod = (config.ema_slow as number) || 200;
  const tpPips     = (config.tp_pips as number) || 50;
  const slPips     = (config.sl_pips as number) || 30;

  const pip = candles[0] && (candles[0].close > 50 ? 0.1 : candles[0].close > 10 ? 0.01 : 0.0001);
  const warmup = slowPeriod + 26;
  if (index < warmup) return { side: null };

  if (!state.emaFast) {
    state.emaFast = smaInit(candles, warmup - 1, fastPeriod);
    state.emaSlow = smaInit(candles, warmup - 1, slowPeriod);
    state.prevFast = state.emaFast;
    state.prevSlow = state.emaSlow;
    // Simple MACD state
    state.emaMACD12 = smaInit(candles, warmup - 1, 12);
    state.emaMACD26 = smaInit(candles, warmup - 1, 26);
    state.emaSignal = 0;
    state.macdReady = false;
    state.macdCount = 0;
  }

  const prevFast = state.emaFast as number;
  const prevSlow = state.emaSlow as number;
  state.emaFast = emaStep(prevFast, candles[index].close, fastPeriod);
  state.emaSlow = emaStep(prevSlow, candles[index].close, slowPeriod);

  // MACD
  state.emaMACD12 = emaStep(state.emaMACD12 as number, candles[index].close, 12);
  state.emaMACD26 = emaStep(state.emaMACD26 as number, candles[index].close, 26);
  const macdLine = (state.emaMACD12 as number) - (state.emaMACD26 as number);

  if (!(state.macdReady as boolean)) {
    state.macdCount = (state.macdCount as number) + 1;
    if ((state.macdCount as number) >= 9) {
      state.emaSignal = macdLine;
      state.macdReady = true;
    }
  } else {
    state.emaSignal = emaStep(state.emaSignal as number, macdLine, 9);
  }

  const macdHist = macdLine - (state.emaSignal as number);
  const crossUp = prevFast <= prevSlow && (state.emaFast as number) > (state.emaSlow as number);
  const crossDown = prevFast >= prevSlow && (state.emaFast as number) < (state.emaSlow as number);

  state.prevFast = state.emaFast;
  state.prevSlow = state.emaSlow;

  const price = candles[index].close;

  if (crossUp && macdHist > 0) {
    return { side: 'BUY', tp: price + tpPips * pip, sl: price - slPips * pip };
  }
  if (crossDown && macdHist < 0) {
    return { side: 'SELL', tp: price - tpPips * pip, sl: price + slPips * pip };
  }

  return { side: null };
};

// --- Mean Reversion: Bollinger Band bounce + RSI ---

export const meanReversionStrategy: StrategyFn = (candles, index, config, state) => {
  const bbPeriod = (config.bb_period as number) || 20;
  const bbStd    = (config.bb_std as number) || 2;
  const rsiPeriod = (config.rsi_period as number) || 14;
  const tpPips   = (config.tp_pips as number) || 20;
  const slPips   = (config.sl_pips as number) || 15;

  const pip = candles[0] && (candles[0].close > 50 ? 0.1 : candles[0].close > 10 ? 0.01 : 0.0001);
  const warmup = Math.max(bbPeriod, rsiPeriod + 1);
  if (index < warmup) return { side: null };

  // Bollinger Bands
  let sum = 0;
  for (let j = index - bbPeriod + 1; j <= index; j++) sum += candles[j].close;
  const mean = sum / bbPeriod;
  let variance = 0;
  for (let j = index - bbPeriod + 1; j <= index; j++) {
    const d = candles[j].close - mean;
    variance += d * d;
  }
  const sd = Math.sqrt(variance / bbPeriod);
  const upper = mean + bbStd * sd;
  const lower = mean - bbStd * sd;

  // RSI
  if (!state.rsiAvgGain) {
    let g = 0, l = 0;
    for (let i = 1; i <= rsiPeriod; i++) {
      const d = candles[i].close - candles[i - 1].close;
      if (d > 0) g += d; else l -= d;
    }
    state.rsiAvgGain = g / rsiPeriod;
    state.rsiAvgLoss = l / rsiPeriod;
    state.lastRsiIdx = rsiPeriod;
  }

  let avgGain = state.rsiAvgGain as number;
  let avgLoss = state.rsiAvgLoss as number;
  for (let j = (state.lastRsiIdx as number) + 1; j <= index; j++) {
    const d = candles[j].close - candles[j - 1].close;
    avgGain = (avgGain * (rsiPeriod - 1) + (d > 0 ? d : 0)) / rsiPeriod;
    avgLoss = (avgLoss * (rsiPeriod - 1) + (d < 0 ? -d : 0)) / rsiPeriod;
  }
  state.rsiAvgGain = avgGain;
  state.rsiAvgLoss = avgLoss;
  state.lastRsiIdx = index;

  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  const price = candles[index].close;

  // Buy when price touches lower band and RSI oversold
  if (price <= lower && rsi < 35) {
    return { side: 'BUY', tp: price + tpPips * pip, sl: price - slPips * pip };
  }
  // Sell when price touches upper band and RSI overbought
  if (price >= upper && rsi > 65) {
    return { side: 'SELL', tp: price - tpPips * pip, sl: price + slPips * pip };
  }

  return { side: null };
};

// --- Swing: Pattern-based entry ---

export const swingStrategy: StrategyFn = (candles, index, config, state) => {
  const tpPips = (config.tp_pips as number) || 30;
  const slPips = (config.sl_pips as number) || 20;
  const atrPeriod = (config.atr_period as number) || 14;

  const pip = candles[0] && (candles[0].close > 50 ? 0.1 : candles[0].close > 10 ? 0.01 : 0.0001);
  if (index < atrPeriod + 1) return { side: null };

  // ATR
  if (!state.atr) {
    let sum = 0;
    for (let i = 1; i <= atrPeriod; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close),
      );
      sum += tr;
    }
    state.atr = sum / atrPeriod;
    state.lastAtrIdx = atrPeriod;
  }

  let atr = state.atr as number;
  for (let j = (state.lastAtrIdx as number) + 1; j <= index; j++) {
    const tr = Math.max(
      candles[j].high - candles[j].low,
      Math.abs(candles[j].high - candles[j - 1].close),
      Math.abs(candles[j].low - candles[j - 1].close),
    );
    atr = (atr * (atrPeriod - 1) + tr) / atrPeriod;
  }
  state.atr = atr;
  state.lastAtrIdx = index;

  const curr = candles[index];
  const prev = candles[index - 1];
  const threshold = 0.3 * atr;

  const body = Math.abs(curr.close - curr.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const price = curr.close;

  // Bullish Engulfing
  if (prev.close < prev.open && curr.close > curr.open &&
      curr.open < prev.close && curr.close > prev.open &&
      body - prevBody >= threshold) {
    return { side: 'BUY', tp: price + tpPips * pip, sl: price - slPips * pip };
  }

  // Bearish Engulfing
  if (prev.close > prev.open && curr.close < curr.open &&
      curr.open > prev.close && curr.close < prev.open &&
      body - prevBody >= threshold) {
    return { side: 'SELL', tp: price - tpPips * pip, sl: price + slPips * pip };
  }

  // Hammer
  const lowerWick = Math.min(curr.open, curr.close) - curr.low;
  const upperWick = curr.high - Math.max(curr.open, curr.close);
  if (body > 0 && lowerWick >= 2 * body && upperWick <= 0.5 * body && lowerWick - 2 * body >= threshold) {
    return { side: 'BUY', tp: price + tpPips * pip, sl: price - slPips * pip };
  }

  // Shooting Star
  if (body > 0 && upperWick >= 2 * body && lowerWick <= 0.5 * body && upperWick - 2 * body >= threshold) {
    return { side: 'SELL', tp: price - tpPips * pip, sl: price + slPips * pip };
  }

  return { side: null };
};

// --- Agent Fused: Multi-indicator council vote (backtest proxy) ---
//
// In LIVE paper trading the AI Council strategy reads the real `agent_decisions`
// feed (news_agent + fred_agent + sentiment_agent + technical_agent fusion).
//
// In BACKTEST we have no historical agent decisions, so we simulate the council
// with four deterministic technical proxies and trade only when ≥ min_agreement
// of them vote the same direction. This keeps the council semantics intact:
// a fused signal that requires concurrence, not a single noisy indicator.

export const agentFusedStrategy: StrategyFn = (candles, index, config, state) => {
  const minAgreement = (config.min_agreement as number) || 3;
  const tpPips       = (config.tp_pips as number) || 50;
  const slPips       = (config.sl_pips as number) || 30;
  const rsiPeriod    = 14;
  const bbPeriod     = 20;
  const emaFastP     = 50;
  const emaSlowP     = 200;

  const pip = candles[0] && (candles[0].close > 50 ? 0.1 : candles[0].close > 10 ? 0.01 : 0.0001);
  const warmup = Math.max(emaSlowP, bbPeriod, rsiPeriod + 1, 26 + 9);
  if (index < warmup) return { side: null };

  if (!state.emaFast) {
    state.emaFast    = smaInit(candles, warmup - 1, emaFastP);
    state.emaSlow    = smaInit(candles, warmup - 1, emaSlowP);
    state.emaMACD12  = smaInit(candles, warmup - 1, 12);
    state.emaMACD26  = smaInit(candles, warmup - 1, 26);
    state.emaSignal  = 0;
    state.macdReady  = false;
    state.macdCount  = 0;
    state.rsiAvgGain = 0;
    state.rsiAvgLoss = 0;
    for (let i = 1; i <= rsiPeriod; i++) {
      const d = candles[i].close - candles[i - 1].close;
      if (d > 0) (state.rsiAvgGain as number) += d;
      else (state.rsiAvgLoss as number) -= d;
    }
    state.rsiAvgGain = (state.rsiAvgGain as number) / rsiPeriod;
    state.rsiAvgLoss = (state.rsiAvgLoss as number) / rsiPeriod;
    state.lastRsiIdx = rsiPeriod;
  }

  // Update EMAs
  state.emaFast   = emaStep(state.emaFast as number, candles[index].close, emaFastP);
  state.emaSlow   = emaStep(state.emaSlow as number, candles[index].close, emaSlowP);
  state.emaMACD12 = emaStep(state.emaMACD12 as number, candles[index].close, 12);
  state.emaMACD26 = emaStep(state.emaMACD26 as number, candles[index].close, 26);
  const macdLine = (state.emaMACD12 as number) - (state.emaMACD26 as number);

  if (!(state.macdReady as boolean)) {
    state.macdCount = (state.macdCount as number) + 1;
    if ((state.macdCount as number) >= 9) {
      state.emaSignal = macdLine;
      state.macdReady = true;
    }
  } else {
    state.emaSignal = emaStep(state.emaSignal as number, macdLine, 9);
  }
  const macdHist = macdLine - (state.emaSignal as number);

  // RSI incremental
  let avgGain = state.rsiAvgGain as number;
  let avgLoss = state.rsiAvgLoss as number;
  for (let j = (state.lastRsiIdx as number) + 1; j <= index; j++) {
    const d = candles[j].close - candles[j - 1].close;
    avgGain = (avgGain * (rsiPeriod - 1) + (d > 0 ? d : 0)) / rsiPeriod;
    avgLoss = (avgLoss * (rsiPeriod - 1) + (d < 0 ? -d : 0)) / rsiPeriod;
  }
  state.rsiAvgGain = avgGain;
  state.rsiAvgLoss = avgLoss;
  state.lastRsiIdx = index;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // Bollinger position (z-score against 20-bar mean)
  let sum = 0;
  for (let j = index - bbPeriod + 1; j <= index; j++) sum += candles[j].close;
  const mean = sum / bbPeriod;
  let variance = 0;
  for (let j = index - bbPeriod + 1; j <= index; j++) {
    const d = candles[j].close - mean;
    variance += d * d;
  }
  const sd = Math.sqrt(variance / bbPeriod) || 1e-9;
  const z = (candles[index].close - mean) / sd;

  // Council votes: each ∈ {+1 BUY, -1 SELL, 0 abstain}
  const trendVote = (state.emaFast as number) > (state.emaSlow as number) ? 1
                  : (state.emaFast as number) < (state.emaSlow as number) ? -1 : 0;
  const macdVote  = macdHist > 0 ? 1 : macdHist < 0 ? -1 : 0;
  // Mean-reversion vote: oversold → BUY, overbought → SELL
  const rsiVote   = rsi < 35 ? 1 : rsi > 65 ? -1 : 0;
  // Volatility vote: deeply below band → BUY, deeply above → SELL
  const bbVote    = z < -1.5 ? 1 : z > 1.5 ? -1 : 0;

  const buyVotes  = [trendVote, macdVote, rsiVote, bbVote].filter((v) => v === 1).length;
  const sellVotes = [trendVote, macdVote, rsiVote, bbVote].filter((v) => v === -1).length;

  const price = candles[index].close;

  if (buyVotes >= minAgreement) {
    return { side: 'BUY', tp: price + tpPips * pip, sl: price - slPips * pip };
  }
  if (sellVotes >= minAgreement) {
    return { side: 'SELL', tp: price - tpPips * pip, sl: price + slPips * pip };
  }

  return { side: null };
};

// --- Strategy resolver ---

export function getStrategyFn(strategyType: string): StrategyFn {
  switch (strategyType) {
    case 'scalping':        return scalpingStrategy;
    case 'trend_following': return trendFollowingStrategy;
    case 'mean_reversion':  return meanReversionStrategy;
    case 'swing':           return swingStrategy;
    case 'agent_fused':     return agentFusedStrategy;
    default:                return scalpingStrategy;
  }
}

// Default config per strategy type
export function getDefaultStrategyConfig(strategyType: string): Record<string, unknown> {
  switch (strategyType) {
    case 'scalping':
      return { ema_fast: 9, ema_slow: 21, rsi_period: 14, rsi_overbought: 70, rsi_oversold: 30, tp_pips: 15, sl_pips: 10 };
    case 'trend_following':
      return { ema_fast: 50, ema_slow: 200, tp_pips: 50, sl_pips: 30 };
    case 'mean_reversion':
      return { bb_period: 20, bb_std: 2, rsi_period: 14, tp_pips: 20, sl_pips: 15 };
    case 'swing':
      return { atr_period: 14, tp_pips: 30, sl_pips: 20 };
    case 'arbitrage':
      return {};
    case 'agent_fused':
      return { min_confidence: 0.7, min_agreement: 3, tp_pips: 50, sl_pips: 30, max_decision_age_sec: 300 };
    default:
      return { ema_fast: 9, ema_slow: 21, tp_pips: 15, sl_pips: 10 };
  }
}

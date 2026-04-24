import type { OHLCVCandle } from './candleService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PatternName =
  | 'Bullish Engulfing'
  | 'Bearish Engulfing'
  | 'Hammer'
  | 'Shooting Star'
  | 'Doji';

export type PatternBias = 'bullish' | 'bearish' | 'neutral';

export interface CandlePattern {
  time: number;
  name: PatternName;
  bias: PatternBias;
  /** ATR-normalised confidence (0–1) */
  confidence: number;
  /** Price level used for marker placement */
  price: number;
}

export interface SRLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number; // touch count
}

// ── ATR ───────────────────────────────────────────────────────────────────────

/** Calculates ATR array aligned to `candles` (index i → candle i). */
export function calcATR(candles: OHLCVCandle[], period = 14): number[] {
  const atr = new Array(candles.length).fill(0);
  if (candles.length < 2) return atr;

  // True ranges
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low  - prevClose),
    ));
  }

  // Seed with simple average
  let sum = 0;
  for (let i = 0; i < Math.min(period, tr.length); i++) sum += tr[i];
  let avg = sum / Math.min(period, tr.length);
  atr[Math.min(period - 1, tr.length - 1)] = avg;

  for (let i = period; i < candles.length; i++) {
    avg = (avg * (period - 1) + tr[i]) / period;
    atr[i] = avg;
  }

  return atr;
}

// ── Pattern helpers ───────────────────────────────────────────────────────────

function body(c: OHLCVCandle)   { return Math.abs(c.close - c.open); }
function range(c: OHLCVCandle)  { return c.high - c.low; }
function upperWick(c: OHLCVCandle) { return c.high - Math.max(c.open, c.close); }
function lowerWick(c: OHLCVCandle) { return Math.min(c.open, c.close) - c.low; }

// ── Individual detectors ──────────────────────────────────────────────────────

/** Bullish Engulfing: bearish candle followed by a larger bullish candle. */
function detectBullishEngulfing(
  prev: OHLCVCandle, curr: OHLCVCandle, atr: number
): number | null {
  if (prev.close >= prev.open) return null;          // prev must be bearish
  if (curr.close <= curr.open) return null;          // curr must be bullish
  if (curr.open  >= prev.close) return null;         // curr opens below prev close
  if (curr.close <= prev.open)  return null;         // curr closes above prev open
  const engulf = body(curr) - body(prev);
  return engulf >= 0.3 * atr ? Math.min(1, engulf / atr) : null;
}

/** Bearish Engulfing: bullish candle followed by a larger bearish candle. */
function detectBearishEngulfing(
  prev: OHLCVCandle, curr: OHLCVCandle, atr: number
): number | null {
  if (prev.close <= prev.open) return null;
  if (curr.close >= curr.open) return null;
  if (curr.open  <= prev.close) return null;
  if (curr.close >= prev.open)  return null;
  const engulf = body(curr) - body(prev);
  return engulf >= 0.3 * atr ? Math.min(1, engulf / atr) : null;
}

/**
 * Hammer: small body near top, long lower wick ≥ 2× body, small upper wick.
 * Bullish signal in a downtrend context (we don't require trend — just shape).
 */
function detectHammer(c: OHLCVCandle, atr: number): number | null {
  const b = body(c);
  const lw = lowerWick(c);
  const uw = upperWick(c);
  if (b === 0) return null;
  if (lw < 2 * b) return null;
  if (uw > 0.5 * b) return null;
  const signal = lw - 2 * b; // excess lower wick
  return signal >= 0.3 * atr ? Math.min(1, signal / atr) : null;
}

/**
 * Shooting Star: small body near bottom, long upper wick ≥ 2× body, small lower wick.
 */
function detectShootingStar(c: OHLCVCandle, atr: number): number | null {
  const b = body(c);
  const uw = upperWick(c);
  const lw = lowerWick(c);
  if (b === 0) return null;
  if (uw < 2 * b) return null;
  if (lw > 0.5 * b) return null;
  const signal = uw - 2 * b;
  return signal >= 0.3 * atr ? Math.min(1, signal / atr) : null;
}

/**
 * Doji: body ≤ 10% of range, and range is meaningful (≥ 0.3 ATR).
 */
function detectDoji(c: OHLCVCandle, atr: number): number | null {
  const r = range(c);
  if (r < 0.3 * atr) return null;
  const b = body(c);
  if (b > 0.1 * r) return null;
  return Math.min(1, (r - b) / atr);
}

// ── Main detector ─────────────────────────────────────────────────────────────

export function detectPatterns(candles: OHLCVCandle[]): CandlePattern[] {
  if (candles.length < 2) return [];
  const atrArr = calcATR(candles, 14);
  const patterns: CandlePattern[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const atr  = atrArr[i] || atrArr[i - 1] || 0.0001;

    // Two-candle patterns
    let conf: number | null;

    conf = detectBullishEngulfing(prev, curr, atr);
    if (conf !== null) {
      patterns.push({
        time: curr.time, name: 'Bullish Engulfing', bias: 'bullish',
        confidence: conf, price: curr.low,
      });
      continue; // one pattern per candle
    }

    conf = detectBearishEngulfing(prev, curr, atr);
    if (conf !== null) {
      patterns.push({
        time: curr.time, name: 'Bearish Engulfing', bias: 'bearish',
        confidence: conf, price: curr.high,
      });
      continue;
    }

    // Single-candle patterns (check doji first — it takes priority over hammer/star)
    conf = detectDoji(curr, atr);
    if (conf !== null) {
      patterns.push({
        time: curr.time, name: 'Doji', bias: 'neutral',
        confidence: conf, price: (curr.high + curr.low) / 2,
      });
      continue;
    }

    conf = detectHammer(curr, atr);
    if (conf !== null) {
      patterns.push({
        time: curr.time, name: 'Hammer', bias: 'bullish',
        confidence: conf, price: curr.low,
      });
      continue;
    }

    conf = detectShootingStar(curr, atr);
    if (conf !== null) {
      patterns.push({
        time: curr.time, name: 'Shooting Star', bias: 'bearish',
        confidence: conf, price: curr.high,
      });
    }
  }

  return patterns;
}

// ── Support / Resistance ──────────────────────────────────────────────────────

/**
 * Swing-high/low S/R detection.
 * - Lookback: last 100 candles
 * - Window: 5 candles each side for a swing pivot
 * - Returns up to 5 levels closest to current price
 */
export function detectSRLevels(candles: OHLCVCandle[], maxLevels = 5): SRLevel[] {
  if (candles.length < 11) return [];

  const LOOKBACK = 100;
  const WIN      = 5;

  const slice = candles.slice(-LOOKBACK);
  const currentPrice = slice[slice.length - 1].close;

  // Cluster tolerance: 0.2% of price
  const TOL = currentPrice * 0.002;

  const rawLevels: { price: number; type: 'support' | 'resistance' }[] = [];

  for (let i = WIN; i < slice.length - WIN; i++) {
    const c = slice[i];

    // Swing high
    let isSwingHigh = true;
    for (let j = i - WIN; j <= i + WIN; j++) {
      if (j !== i && slice[j].high >= c.high) { isSwingHigh = false; break; }
    }
    if (isSwingHigh) rawLevels.push({ price: c.high, type: 'resistance' });

    // Swing low
    let isSwingLow = true;
    for (let j = i - WIN; j <= i + WIN; j++) {
      if (j !== i && slice[j].low <= c.low) { isSwingLow = false; break; }
    }
    if (isSwingLow) rawLevels.push({ price: c.low, type: 'support' });
  }

  // Cluster nearby levels
  const clustered: SRLevel[] = [];
  for (const raw of rawLevels) {
    const existing = clustered.find(c => Math.abs(c.price - raw.price) < TOL);
    if (existing) {
      existing.strength++;
      existing.price = (existing.price * (existing.strength - 1) + raw.price) / existing.strength;
    } else {
      clustered.push({ price: raw.price, type: raw.type, strength: 1 });
    }
  }

  // Sort by distance to current price, return top N
  return clustered
    .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))
    .slice(0, maxLevels);
}

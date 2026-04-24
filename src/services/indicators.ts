import type { OHLCVCandle } from './candleService';

export interface TimeValue {
  time: number;
  value: number;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerPoint {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

// --- EMA ---
export function calcEMA(candles: OHLCVCandle[], period: number): TimeValue[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const result: TimeValue[] = [];
  let ema = 0;

  // Seed with SMA of first `period` closes
  for (let i = 0; i < period; i++) ema += candles[i].close;
  ema /= period;
  result.push({ time: candles[period - 1].time, value: ema });

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    result.push({ time: candles[i].time, value: ema });
  }
  return result;
}

// --- RSI ---
export function calcRSI(candles: OHLCVCandle[], period = 14): TimeValue[] {
  if (candles.length <= period) return [];
  const result: TimeValue[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const delta = candles[i].close - candles[i - 1].close;
    if (delta > 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;

  const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: candles[period].time, value: rsi0 });

  for (let i = period + 1; i < candles.length; i++) {
    const delta = candles[i].close - candles[i - 1].close;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: candles[i].time, value: rsi });
  }
  return result;
}

// --- MACD ---
export function calcMACD(
  candles: OHLCVCandle[],
  fast = 12,
  slow = 26,
  signal = 9
): MACDPoint[] {
  const fastEMA = calcEMA(candles, fast);
  const slowEMA = calcEMA(candles, slow);

  // Align by time
  const slowMap = new Map(slowEMA.map(p => [p.time, p.value]));
  const macdLine: TimeValue[] = fastEMA
    .filter(p => slowMap.has(p.time))
    .map(p => ({ time: p.time, value: p.value - slowMap.get(p.time)! }));

  if (macdLine.length < signal) return [];

  // Signal = EMA(signal) of macdLine
  const k = 2 / (signal + 1);
  let sig = 0;
  for (let i = 0; i < signal; i++) sig += macdLine[i].value;
  sig /= signal;

  const result: MACDPoint[] = [];
  result.push({
    time: macdLine[signal - 1].time,
    macd: macdLine[signal - 1].value,
    signal: sig,
    histogram: macdLine[signal - 1].value - sig,
  });

  for (let i = signal; i < macdLine.length; i++) {
    sig = macdLine[i].value * k + sig * (1 - k);
    result.push({
      time: macdLine[i].time,
      macd: macdLine[i].value,
      signal: sig,
      histogram: macdLine[i].value - sig,
    });
  }
  return result;
}

// --- Bollinger Bands ---
export function calcBollinger(
  candles: OHLCVCandle[],
  period = 20,
  stdDev = 2
): BollingerPoint[] {
  if (candles.length < period) return [];
  const result: BollingerPoint[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const mean = sum / period;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = candles[j].close - mean;
      variance += diff * diff;
    }
    const sd = Math.sqrt(variance / period);

    result.push({
      time: candles[i].time,
      upper: mean + stdDev * sd,
      middle: mean,
      lower: mean - stdDev * sd,
    });
  }
  return result;
}

export interface IndicatorData {
  ema21: TimeValue[];
  ema50: TimeValue[];
  ema200: TimeValue[];
  rsi: TimeValue[];
  macd: MACDPoint[];
  bollinger: BollingerPoint[];
}

export function computeAllIndicators(candles: OHLCVCandle[]): IndicatorData {
  return {
    ema21:     calcEMA(candles, 21),
    ema50:     calcEMA(candles, 50),
    ema200:    calcEMA(candles, 200),
    rsi:       calcRSI(candles, 14),
    macd:      calcMACD(candles, 12, 26, 9),
    bollinger: calcBollinger(candles, 20, 2),
  };
}

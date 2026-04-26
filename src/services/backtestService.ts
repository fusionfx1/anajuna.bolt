import { supabase } from '../lib/supabase';
import type {
  BacktestRun, BacktestMetrics, SimulatedTrade,
  EquityCurvePoint, CandleCoverage, BacktestInstrument, BacktestGranularity,
} from '../types/backtest';
import type { Candle } from './backtestEngine';

// --- Historical candle operations ---

export async function fetchHistoricalCandles(
  instrument: BacktestInstrument,
  granularity: BacktestGranularity,
  startDate: string,
  endDate: string,
): Promise<Candle[]> {
  const { data, error } = await supabase
    .from('historical_candles')
    .select('time, open, high, low, close, volume')
    .eq('instrument', instrument)
    .eq('granularity', granularity)
    .gte('time', startDate)
    .lte('time', endDate)
    .order('time', { ascending: true })
    .limit(100000);

  if (error) throw new Error(error.message);

  return (data ?? []).map(row => ({
    time: Math.floor(new Date(row.time).getTime() / 1000),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }));
}

export async function fetchCandleCoverage(): Promise<CandleCoverage[]> {
  const { data, error } = await supabase
    .rpc('get_candle_coverage');

  if (error) {
    // RPC may not exist yet -- fallback to manual query
    const { data: fallback, error: fbErr } = await supabase
      .from('historical_candles')
      .select('instrument, granularity, time')
      .order('time', { ascending: true })
      .limit(1);

    if (fbErr || !fallback) return [];
    return [];
  }

  return (data ?? []) as CandleCoverage[];
}

export async function upsertCandles(
  instrument: string,
  granularity: string,
  candles: Candle[],
): Promise<number> {
  if (candles.length === 0) return 0;

  const rows = candles.map(c => ({
    instrument,
    granularity,
    time: new Date(c.time * 1000).toISOString(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));

  // Batch upsert in chunks of 500
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('historical_candles')
      .upsert(chunk, { onConflict: 'instrument,granularity,time' });
    if (error) throw new Error(error.message);
    inserted += chunk.length;
  }
  return inserted;
}

// --- Backtest run operations ---

export async function saveBacktestRun(
  userId: string,
  run: {
    strategyId: string | null;
    strategyName: string;
    strategyType: string;
    instrument: string;
    granularity: string;
    startDate: string;
    endDate: string;
    initialBalance: number;
    config: Record<string, unknown>;
    results: BacktestMetrics;
    tradeLog: SimulatedTrade[];
    equityCurve: EquityCurvePoint[];
    candleCount: number;
  },
): Promise<BacktestRun> {
  const { data, error } = await supabase
    .from('backtest_runs')
    .insert({
      user_id: userId,
      strategy_id: run.strategyId,
      strategy_name: run.strategyName,
      strategy_type: run.strategyType,
      instrument: run.instrument,
      granularity: run.granularity,
      start_date: run.startDate,
      end_date: run.endDate,
      initial_balance: run.initialBalance,
      config: run.config,
      results: run.results,
      trade_log: run.tradeLog,
      equity_curve: run.equityCurve,
      status: 'completed',
      candle_count: run.candleCount,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as BacktestRun;
}

export async function fetchBacktestRuns(userId: string): Promise<BacktestRun[]> {
  const { data, error } = await supabase
    .from('backtest_runs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return (data ?? []).map(row => ({
    id: row.id,
    user_id: row.user_id,
    strategy_id: row.strategy_id,
    strategy_name: row.strategy_name,
    strategy_type: row.strategy_type,
    instrument: row.instrument,
    granularity: row.granularity,
    start_date: row.start_date,
    end_date: row.end_date,
    initial_balance: Number(row.initial_balance),
    config: row.config,
    results: row.results as BacktestMetrics,
    trade_log: row.trade_log as SimulatedTrade[],
    equity_curve: row.equity_curve as EquityCurvePoint[],
    status: row.status,
    candle_count: row.candle_count,
    created_at: row.created_at,
  }));
}

export async function deleteBacktestRun(id: string): Promise<void> {
  const { error } = await supabase
    .from('backtest_runs')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Simulated candle generation (when no OANDA credentials) ---

export function generateHistoricalCandles(
  instrument: string,
  granularity: string,
  startDate: string,
  endDate: string,
): Candle[] {
  const BASE_PRICES: Record<string, number> = {
    EUR_USD: 1.08542, GBP_USD: 1.26415, USD_JPY: 153.24, XAU_USD: 2324.50,
    AUD_USD: 0.65318, USD_CAD: 1.36241, NZD_USD: 0.60812,
  };

  const GRANULARITY_SECONDS: Record<string, number> = {
    M1: 60, M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400,
  };

  const stepSec = GRANULARITY_SECONDS[granularity] ?? 3600;
  const isJpy = instrument.includes('JPY');
  const isGold = instrument.includes('XAU');
  const pipSize = isJpy ? 0.01 : isGold ? 0.1 : 0.0001;
  const dp = isJpy ? 3 : isGold ? 2 : 5;

  const startSec = Math.floor(new Date(startDate).getTime() / 1000);
  const endSec = Math.floor(new Date(endDate).getTime() / 1000);

  const candles: Candle[] = [];
  let price = BASE_PRICES[instrument] ?? 1.0;

  // Seeded random for reproducibility
  let seed = instrument.charCodeAt(0) * 1000 + granularity.charCodeAt(0);
  function rand() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let t = startSec; t < endSec; t += stepSec) {
    const bodyPips = (rand() * 8 + 2) * pipSize;
    const wickPips = (rand() * 6 + 1) * pipSize;
    const bullish = rand() > 0.48;
    // Add slight trend bias
    const trendBias = Math.sin(t / 86400 / 30) * 2 * pipSize;

    const open = price;
    const close = parseFloat((open + (bullish ? 1 : -1) * bodyPips + trendBias).toFixed(dp));
    const high = parseFloat((Math.max(open, close) + wickPips).toFixed(dp));
    const low = parseFloat((Math.min(open, close) - wickPips).toFixed(dp));

    candles.push({
      time: t,
      open, high, low, close,
      volume: Math.floor(rand() * 500 + 100),
    });
    price = close;
  }

  return candles;
}

import { supabase } from '../lib/supabase';
import type {
  Strategy, Position, Trade, EquitySnapshot, RiskEvent, AccountSummary, PerformanceMetrics
} from '../types/trading';

export async function fetchStrategies(userId: string): Promise<Strategy[]> {
  const { data, error } = await supabase
    .from('strategies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    strategy_type: row.strategy_type,
    status: row.status,
    symbols: row.symbols,
    config: row.config,
    max_drawdown_pct: parseFloat(row.max_drawdown_pct),
    lot_size: parseFloat(row.lot_size),
    max_concurrent_trades: row.max_concurrent_trades,
    total_trades: row.total_trades,
    win_rate: parseFloat(row.win_rate),
    total_pnl_usd: parseFloat(row.total_pnl_usd),
    sharpe_ratio: row.sharpe_ratio != null ? parseFloat(row.sharpe_ratio) : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

export async function updateStrategyStatus(id: string, status: Strategy['status']) {
  const { error } = await supabase
    .from('strategies')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function createStrategy(userId: string, payload: {
  name: string;
  description: string;
  strategy_type: Strategy['strategy_type'];
  symbols: string[];
  config: Record<string, unknown>;
  max_drawdown_pct: number;
  lot_size: number;
  max_concurrent_trades: number;
}): Promise<Strategy> {
  const { data, error } = await supabase
    .from('strategies')
    .insert({ user_id: userId, status: 'stopped', total_trades: 0, win_rate: 0, total_pnl_usd: 0, sharpe_ratio: null, ...payload })
    .select('*')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    strategy_type: data.strategy_type,
    status: data.status,
    symbols: data.symbols,
    config: data.config,
    max_drawdown_pct: parseFloat(data.max_drawdown_pct),
    lot_size: parseFloat(data.lot_size),
    max_concurrent_trades: data.max_concurrent_trades,
    total_trades: data.total_trades,
    win_rate: parseFloat(data.win_rate),
    total_pnl_usd: parseFloat(data.total_pnl_usd),
    sharpe_ratio: data.sharpe_ratio != null ? parseFloat(data.sharpe_ratio) : null,
    created_at: data.created_at,
    updated_at: data.updated_at
  };
}

export async function updateStrategyConfig(id: string, updates: {
  name?: string;
  description?: string;
  symbols?: string[];
  config?: Record<string, unknown>;
  max_drawdown_pct?: number;
  lot_size?: number;
  max_concurrent_trades?: number;
}) {
  const { error } = await supabase
    .from('strategies')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

const DEMO = 'demo-user';

// ─── Demo mock data ───────────────────────────────────────────────────────────
function demoTrades(): Trade[] {
  const now = Date.now();
  const pairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];
  const sides: Trade['side'][] = ['BUY', 'SELL'];
  return Array.from({ length: 20 }, (_, i) => {
    const side = sides[i % 2];
    const fill = 1.08 + (i * 0.0031);
    const pnl = parseFloat(((Math.random() - 0.38) * 120).toFixed(2));
    return {
      id: `demo-trade-${i}`,
      position_id: `demo-pos-${i}`,
      strategy_id: 'demo-strat-1',
      strategy_name: 'RSI Scalper',
      symbol: pairs[i % pairs.length],
      order_type: 'MARKET',
      side,
      quantity: 0.1,
      requested_price: fill,
      fill_price: fill + 0.0001,
      slippage_pips: 0.1,
      commission_usd: 0.07,
      swap_usd: 0,
      pnl_usd: pnl,
      broker_order_id: `ORD-${1000 + i}`,
      execution_latency_ms: 12 + i,
      executed_at: new Date(now - (i + 1) * 3_600_000).toISOString(),
    };
  });
}

function demoPositions(): Position[] {
  return [
    {
      id: 'demo-pos-open-1',
      strategy_id: 'demo-strat-1',
      strategy_name: 'RSI Scalper',
      symbol: 'EURUSD',
      direction: 'BUY',
      lot_size: 0.1,
      entry_price: 1.0842,
      exit_price: null,
      stop_loss: 1.0812,
      take_profit: 1.0902,
      pnl_usd: 14.5,
      pnl_pips: 14.5,
      current_price: 1.0856,
      unrealized_pnl: 14.5,
      status: 'open',
      opened_at: new Date(Date.now() - 7_200_000).toISOString(),
      closed_at: null,
      broker_ticket_id: 'TKT-8801',
    },
    {
      id: 'demo-pos-open-2',
      strategy_id: 'demo-strat-1',
      strategy_name: 'RSI Scalper',
      symbol: 'GBPUSD',
      direction: 'SELL',
      lot_size: 0.05,
      entry_price: 1.2715,
      exit_price: null,
      stop_loss: 1.2755,
      take_profit: 1.2635,
      pnl_usd: -8.2,
      pnl_pips: -8.2,
      current_price: 1.2731,
      unrealized_pnl: -8.2,
      status: 'open',
      opened_at: new Date(Date.now() - 3_600_000).toISOString(),
      closed_at: null,
      broker_ticket_id: 'TKT-8802',
    },
  ];
}

function demoEquity(): EquitySnapshot[] {
  const base = Date.now() - 72 * 3_600_000;
  let bal = 10_000;
  return Array.from({ length: 72 }, (_, i) => {
    bal += (Math.random() - 0.46) * 45;
    return {
      id: `demo-eq-${i}`,
      balance: parseFloat(bal.toFixed(2)),
      equity: parseFloat((bal + (Math.random() - 0.5) * 20).toFixed(2)),
      margin_used: 120,
      free_margin: parseFloat((bal - 120).toFixed(2)),
      drawdown_pct: parseFloat((Math.random() * 2.5).toFixed(3)),
      open_positions_count: i % 7 === 0 ? 0 : 2,
      snapshot_at: new Date(base + i * 3_600_000).toISOString(),
    };
  });
}

function demoRiskEvents(): RiskEvent[] {
  return [
    {
      id: 'demo-risk-1',
      severity: 'INFO',
      event_type: 'DAILY_SUMMARY',
      message: 'Daily PnL: +$142.30 | Trades: 8 | Win rate: 62.5%',
      strategy_id: 'demo-strat-1',
      action_taken: 'NONE',
      occurred_at: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      id: 'demo-risk-2',
      severity: 'WARNING',
      event_type: 'DRAWDOWN_ALERT',
      message: 'Drawdown reached 2.1% — approaching daily limit of 3%',
      strategy_id: 'demo-strat-1',
      action_taken: 'NONE',
      occurred_at: new Date(Date.now() - 43_200_000).toISOString(),
    },
  ];
}

function demoAccount(): AccountSummary {
  return {
    balance: 10_284.50,
    equity: 10_290.80,
    margin_used: 240,
    free_margin: 10_050.80,
    margin_level_pct: 4287.0,
    open_pnl: 6.30,
    daily_pnl: 142.30,
    daily_pnl_pct: 1.40,
    drawdown_pct: 0.72,
    peak_balance: 10_380.00,
  };
}
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchPositions(userId: string): Promise<Position[]> {
  if (userId === DEMO) return demoPositions();
  const { data, error } = await supabase
    .from('positions')
    .select('*, strategies(name)')
    .eq('user_id', userId)
    .order('opened_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    strategy_id: row.strategy_id,
    strategy_name: row.strategies?.name,
    symbol: row.symbol,
    direction: row.direction,
    lot_size: parseFloat(row.lot_size),
    entry_price: parseFloat(row.entry_price),
    exit_price: row.exit_price != null ? parseFloat(row.exit_price) : null,
    stop_loss: row.stop_loss != null ? parseFloat(row.stop_loss) : null,
    take_profit: row.take_profit != null ? parseFloat(row.take_profit) : null,
    pnl_usd: row.pnl_usd != null ? parseFloat(row.pnl_usd) : null,
    pnl_pips: row.pnl_pips != null ? parseFloat(row.pnl_pips) : null,
    status: row.status,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    broker_ticket_id: row.broker_ticket_id
  }));
}

export async function fetchTrades(userId: string): Promise<Trade[]> {
  if (userId === DEMO) return demoTrades();
  const { data, error } = await supabase
    .from('trades')
    .select('*, strategies(name)')
    .eq('user_id', userId)
    .order('executed_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    position_id: row.position_id,
    strategy_id: row.strategy_id,
    strategy_name: row.strategies?.name,
    symbol: row.symbol,
    order_type: row.order_type,
    side: row.side,
    quantity: parseFloat(row.quantity),
    requested_price: parseFloat(row.requested_price),
    fill_price: parseFloat(row.fill_price),
    slippage_pips: parseFloat(row.slippage_pips),
    commission_usd: parseFloat(row.commission_usd),
    swap_usd: parseFloat(row.swap_usd),
    pnl_usd: row.pnl_usd != null ? parseFloat(row.pnl_usd) : null,
    broker_order_id: row.broker_order_id,
    execution_latency_ms: row.execution_latency_ms,
    executed_at: row.executed_at
  }));
}

export async function fetchEquitySnapshots(userId: string, limit = 720): Promise<EquitySnapshot[]> {
  if (userId === DEMO) return demoEquity();
  const { data, error } = await supabase
    .from('equity_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('snapshot_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    balance: parseFloat(row.balance),
    equity: parseFloat(row.equity),
    margin_used: parseFloat(row.margin_used),
    free_margin: parseFloat(row.free_margin),
    drawdown_pct: parseFloat(row.drawdown_pct),
    open_positions_count: row.open_positions_count,
    snapshot_at: row.snapshot_at
  }));
}

export async function fetchRiskEvents(userId: string): Promise<RiskEvent[]> {
  if (userId === DEMO) return demoRiskEvents();
  const { data, error } = await supabase
    .from('risk_events')
    .select('*, strategies(name)')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    strategy_id: row.strategy_id,
    strategy_name: row.strategies?.name,
    severity: row.severity,
    event_type: row.event_type,
    message: row.message,
    action_taken: row.action_taken,
    occurred_at: row.occurred_at
  }));
}

export async function fetchAccountSnapshot(userId: string): Promise<AccountSummary | null> {
  if (userId === DEMO) return demoAccount();
  const { data, error } = await supabase
    .from('account_snapshots')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    balance: parseFloat(data.balance),
    equity: parseFloat(data.equity),
    margin_used: parseFloat(data.margin_used),
    free_margin: parseFloat(data.free_margin),
    margin_level_pct: parseFloat(data.margin_level_pct),
    open_pnl: parseFloat(data.open_pnl),
    daily_pnl: parseFloat(data.daily_pnl),
    daily_pnl_pct: parseFloat(data.daily_pnl_pct),
    drawdown_pct: parseFloat(data.drawdown_pct),
    peak_balance: parseFloat(data.peak_balance)
  };
}

const USER_SETTINGS_LS_PREFIX = 'anjuna_user_settings:';

/** Demo session uses id "demo-user" — not a valid UUID for auth.users FK; persist locally instead. */
function isLocalStoredUserSettings(userId: string): boolean {
  return userId === 'demo-user';
}

function readUserSettingsLocal(userId: string): Record<string, unknown> | null {
  try {
    if (typeof globalThis.localStorage === 'undefined') return null;
    const raw = globalThis.localStorage.getItem(USER_SETTINGS_LS_PREFIX + userId);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    return typeof o === 'object' && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function upsertUserSettingsLocal(userId: string, settings: Record<string, unknown>): void {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new Error('Cannot persist settings in this environment');
  }
  const prev = readUserSettingsLocal(userId) ?? {};
  const merged = {
    ...prev,
    ...settings,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  globalThis.localStorage.setItem(USER_SETTINGS_LS_PREFIX + userId, JSON.stringify(merged));
}

export async function fetchUserSettings(userId: string) {
  if (isLocalStoredUserSettings(userId)) {
    return readUserSettingsLocal(userId);
  }
  if (!supabase) {
    return readUserSettingsLocal(userId);
  }

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertUserSettings(userId: string, settings: Record<string, unknown>) {
  const row = {
    ...settings,
    updated_at: new Date().toISOString(),
  };
  if (isLocalStoredUserSettings(userId)) {
    upsertUserSettingsLocal(userId, row);
    return;
  }
  if (!supabase) {
    upsertUserSettingsLocal(userId, row);
    return;
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, ...row }, { onConflict: 'user_id' });
  if (error) throw error;
}

export function computePerformanceMetrics(trades: Trade[]): PerformanceMetrics {
  const closed = trades.filter(t => t.pnl_usd !== null);
  const wins = closed.filter(t => (t.pnl_usd ?? 0) > 0);
  const losses = closed.filter(t => (t.pnl_usd ?? 0) <= 0);
  const total = closed.length;
  const win_rate = total > 0 ? (wins.length / total) * 100 : 0;
  const avg_win = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl_usd ?? 0), 0) / wins.length : 0;
  const avg_loss = losses.length > 0 ? losses.reduce((s, t) => s + (t.pnl_usd ?? 0), 0) / losses.length : 0;
  const total_pnl = closed.reduce((s, t) => s + (t.pnl_usd ?? 0), 0);
  const gross_profit = wins.reduce((s, t) => s + (t.pnl_usd ?? 0), 0);
  const gross_loss = Math.abs(losses.reduce((s, t) => s + (t.pnl_usd ?? 0), 0));
  const profit_factor = gross_loss > 0 ? gross_profit / gross_loss : 0;
  const expected_value = total > 0 ? total_pnl / total : 0;

  const pnlSeries = closed.map(t => t.pnl_usd ?? 0);

  let peak = 0;
  let cumulative = 0;
  let max_drawdown_pct = 0;
  for (const pnl of pnlSeries) {
    cumulative += pnl;
    if (cumulative > peak) peak = cumulative;
    if (peak > 0) {
      const dd = ((peak - cumulative) / peak) * 100;
      if (dd > max_drawdown_pct) max_drawdown_pct = dd;
    }
  }

  const avgReturn = total > 0 ? total_pnl / total : 0;
  const variance = total > 1
    ? pnlSeries.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / (total - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpe_ratio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  const downsidePnl = pnlSeries.filter(r => r < 0);
  const downsideVariance = downsidePnl.length > 0
    ? downsidePnl.reduce((acc, r) => acc + Math.pow(r, 2), 0) / downsidePnl.length
    : 0;
  const downsideStd = Math.sqrt(downsideVariance);
  const sortino_ratio = downsideStd > 0 ? (avgReturn / downsideStd) * Math.sqrt(252) : 0;

  const annualizedReturn = avgReturn * 252;
  const calmar_ratio = max_drawdown_pct > 0 ? annualizedReturn / max_drawdown_pct : 0;

  const durationsMinutes = closed
    .filter(t => t.execution_latency_ms !== null && (t.execution_latency_ms ?? 0) > 0)
    .map(t => (t.execution_latency_ms ?? 0) / 60000);
  const avg_trade_duration_mins = durationsMinutes.length > 0
    ? durationsMinutes.reduce((a, b) => a + b, 0) / durationsMinutes.length
    : 0;

  return {
    total_trades: total,
    winning_trades: wins.length,
    losing_trades: losses.length,
    win_rate: parseFloat(win_rate.toFixed(1)),
    avg_win_usd: parseFloat(avg_win.toFixed(2)),
    avg_loss_usd: parseFloat(avg_loss.toFixed(2)),
    profit_factor: parseFloat(profit_factor.toFixed(2)),
    expected_value: parseFloat(expected_value.toFixed(2)),
    max_drawdown_pct: parseFloat(max_drawdown_pct.toFixed(2)),
    sharpe_ratio: parseFloat(sharpe_ratio.toFixed(3)),
    sortino_ratio: parseFloat(sortino_ratio.toFixed(3)),
    calmar_ratio: parseFloat(calmar_ratio.toFixed(3)),
    total_pnl: parseFloat(total_pnl.toFixed(2)),
    avg_trade_duration_mins: parseFloat(avg_trade_duration_mins.toFixed(1)),
  };
}

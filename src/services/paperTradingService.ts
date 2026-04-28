import { supabase } from '../lib/supabase';
import {
  calcPnl,
  PAPER_ACCOUNT_ID,
  type PaperTrade,
  type PaperAccount,
  type TradeSide,
  type TradeHistoryFilters,
} from '../types/paper';

// ── Account ───────────────────────────────────────────────────────────────────

export async function fetchAccount(): Promise<PaperAccount> {
  const { data, error } = await supabase
    .from('paper_account')
    .select('*')
    .eq('id', PAPER_ACCOUNT_ID)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    // Should not happen — seeded in migration, but guard anyway
    const { data: created, error: createErr } = await supabase
      .from('paper_account')
      .insert({ id: PAPER_ACCOUNT_ID, balance: 10000, currency: 'USD' })
      .select()
      .single();
    if (createErr) throw new Error(createErr.message);
    return created as PaperAccount;
  }

  return data as PaperAccount;
}

async function updateBalance(delta: number): Promise<void> {
  const { data: current, error: fetchErr } = await supabase
    .from('paper_account')
    .select('balance')
    .eq('id', PAPER_ACCOUNT_ID)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const newBalance = parseFloat((Number(current.balance) + delta).toFixed(2));

  const { error } = await supabase
    .from('paper_account')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', PAPER_ACCOUNT_ID);

  if (error) throw new Error(error.message);
}

export async function resetAccount(): Promise<void> {
  const { error } = await supabase
    .from('paper_account')
    .update({ balance: 10000.00, updated_at: new Date().toISOString() })
    .eq('id', PAPER_ACCOUNT_ID);
  if (error) throw new Error(error.message);
}

// ── Open positions ────────────────────────────────────────────────────────────

export async function fetchOpenTrades(): Promise<PaperTrade[]> {
  const { data, error } = await supabase
    .from('paper_trades')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PaperTrade[];
}

// ── Trade history ─────────────────────────────────────────────────────────────

export async function fetchClosedTrades(
  filters: TradeHistoryFilters,
  page: number,
  pageSize: number
): Promise<{ trades: PaperTrade[]; total: number }> {
  let query = supabase
    .from('paper_trades')
    .select('*', { count: 'exact' })
    .eq('status', 'closed')
    .order('closed_at', { ascending: false });

  if (filters.instrument) query = query.eq('instrument', filters.instrument);
  if (filters.dateFrom)   query = query.gte('closed_at', filters.dateFrom);
  if (filters.dateTo) {
    // Include the entire end day
    const endOfDay = filters.dateTo + 'T23:59:59.999Z';
    query = query.lte('closed_at', endOfDay);
  }

  const from = page * pageSize;
  const to   = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { trades: (data ?? []) as PaperTrade[], total: count ?? 0 };
}

// ── Open a trade ──────────────────────────────────────────────────────────────

export interface OpenTradeParams {
  instrument: string;
  side: TradeSide;
  units: number;
  entryPrice: number;
  tp?: number | null;
  sl?: number | null;
}

export async function openTrade(params: OpenTradeParams): Promise<PaperTrade> {
  const { instrument, side, units, entryPrice, tp, sl } = params;

  const { data, error } = await supabase
    .from('paper_trades')
    .insert({
      instrument,
      side,
      units,
      entry_price: entryPrice,
      tp:          tp   ?? null,
      sl:          sl   ?? null,
      status:      'open',
      opened_at:   new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as PaperTrade;
}

// ── Close a trade ─────────────────────────────────────────────────────────────

export async function closeTrade(trade: PaperTrade, exitPrice: number): Promise<PaperTrade> {
  const pnl = calcPnl(trade.side, trade.entry_price, exitPrice, trade.units);

  const { data, error } = await supabase
    .from('paper_trades')
    .update({
      status:     'closed',
      exit_price: exitPrice,
      closed_at:  new Date().toISOString(),
      pnl,
    })
    .eq('id', trade.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Credit P&L back to balance
  await updateBalance(pnl);

  return data as PaperTrade;
}

// ── All-time history summary ──────────────────────────────────────────────────

export interface HistorySummaryData {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
}

export async function fetchHistorySummary(instrument: string): Promise<HistorySummaryData> {
  let query = supabase
    .from('paper_trades')
    .select('pnl')
    .eq('status', 'closed');

  if (instrument) query = query.eq('instrument', instrument);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const winners = rows.filter(r => Number(r.pnl ?? 0) > 0).length;
  const losers  = rows.filter(r => Number(r.pnl ?? 0) <= 0).length;
  const total   = rows.length;
  const totalPnl = rows.reduce((s, r) => s + Number(r.pnl ?? 0), 0);

  return {
    totalTrades:   total,
    winningTrades: winners,
    losingTrades:  losers,
    winRate:       total > 0 ? (winners / total) * 100 : 0,
    totalPnl,
  };
}

// ── TP/SL auto-close helper ───────────────────────────────────────────────────

/**
 * Given the current bid and ask prices, check if any open trade should be
 * auto-closed due to TP or SL being hit. Returns the list of trades closed.
 */
export async function checkAndAutoClose(
  openTrades: PaperTrade[],
  getBidAsk: (instrument: string) => { bid: number; ask: number } | undefined
): Promise<PaperTrade[]> {
  const closed: PaperTrade[] = [];

  for (const trade of openTrades) {
    const quote = getBidAsk(trade.instrument);
    if (!quote) continue;

    const { bid, ask } = quote;
    // For a long (buy), we close at bid; for a short (sell), we close at ask.
    const closePrice = trade.side === 'buy' ? bid : ask;

    let shouldClose = false;

    if (trade.tp !== null) {
      if (trade.side === 'buy'  && bid >= trade.tp) shouldClose = true;
      if (trade.side === 'sell' && ask <= trade.tp) shouldClose = true;
    }
    if (trade.sl !== null) {
      if (trade.side === 'buy'  && bid <= trade.sl) shouldClose = true;
      if (trade.side === 'sell' && ask >= trade.sl) shouldClose = true;
    }

    if (shouldClose) {
      const result = await closeTrade(trade, closePrice);
      closed.push(result);
    }
  }

  return closed;
}

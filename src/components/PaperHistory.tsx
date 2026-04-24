import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Filter, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { fetchClosedTrades } from '../services/paperTradingService';
import { usePaperAccount } from '../hooks/usePaperTrading';
import {
  priceDp, PAPER_INSTRUMENTS,
  type PaperTrade, type TradeHistoryFilters, type HistorySummary,
} from '../types/paper';
import { resetAccount } from '../services/paperTradingService';

const PAGE_SIZE = 20;

const ALL_INSTRUMENTS = ['', 'EUR_USD', 'GBP_USD', 'USD_JPY', 'XAU_USD'];

function durationLabel(openedAt: string, closedAt: string | null): string {
  if (!closedAt) return '—';
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  const s  = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ── Trade row ─────────────────────────────────────────────────────────────────

function HistoryRow({ trade }: { trade: PaperTrade }) {
  const dp     = priceDp(trade.instrument);
  const isBuy  = trade.side === 'buy';
  const pnl    = Number(trade.pnl ?? 0);
  const pnlColor = pnl >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <tr className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-slate-200">
        {PAPER_INSTRUMENTS[trade.instrument] ?? trade.instrument}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
          isBuy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
        }`}>
          {isBuy ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {isBuy ? 'Long' : 'Short'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-mono text-slate-400">
        {Number(trade.entry_price).toFixed(dp)}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-slate-400">
        {trade.exit_price !== null ? Number(trade.exit_price).toFixed(dp) : '—'}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-slate-400">
        {trade.units.toLocaleString()}
      </td>
      <td className="px-4 py-3">
        <span className={`font-mono text-sm font-semibold ${pnlColor}`}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 font-mono hidden md:table-cell">
        {durationLabel(trade.opened_at, trade.closed_at)}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell">
        {trade.closed_at
          ? new Date(trade.closed_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
          : '—'}
      </td>
    </tr>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summary, accountBalance }: { summary: HistorySummary; accountBalance: number }) {
  const pnlColor = summary.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {[
        { label: 'Total Trades',  value: summary.totalTrades.toString(),                       color: 'text-slate-200' },
        { label: 'Win Rate',      value: `${summary.winRate.toFixed(1)}%`,                     color: summary.winRate >= 50 ? 'text-emerald-400' : 'text-red-400' },
        { label: 'Total P&L',     value: `${summary.totalPnl >= 0 ? '+' : ''}$${summary.totalPnl.toFixed(2)}`, color: pnlColor },
        { label: 'Winners',       value: summary.winningTrades.toString(),                     color: 'text-emerald-400' },
        { label: 'Losers',        value: summary.losingTrades.toString(),                      color: 'text-red-400' },
      ].map(card => (
        <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">{card.label}</p>
          <p className={`text-lg font-bold font-mono ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Filters bar ───────────────────────────────────────────────────────────────

function FiltersBar({
  filters, onChange,
}: {
  filters: TradeHistoryFilters;
  onChange: (f: TradeHistoryFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Filter size={12} />
        <span>Filter:</span>
      </div>

      <select
        value={filters.instrument}
        onChange={e => onChange({ ...filters, instrument: e.target.value })}
        className="appearance-none bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
      >
        <option value="">All pairs</option>
        {ALL_INSTRUMENTS.filter(Boolean).map(i => (
          <option key={i} value={i}>{PAPER_INSTRUMENTS[i] ?? i}</option>
        ))}
      </select>

      <input
        type="date"
        value={filters.dateFrom}
        onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
        className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
      />
      <span className="text-slate-600 text-xs">to</span>
      <input
        type="date"
        value={filters.dateTo}
        onChange={e => onChange({ ...filters, dateTo: e.target.value })}
        className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
      />

      {(filters.instrument || filters.dateFrom || filters.dateTo) && (
        <button
          onClick={() => onChange({ instrument: '', dateFrom: '', dateTo: '' })}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PaperHistory() {
  const [trades,   setTrades]   = useState<PaperTrade[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filters,  setFilters]  = useState<TradeHistoryFilters>({ instrument: '', dateFrom: '', dateTo: '' });
  const [resetting, setResetting] = useState(false);

  const { account, refresh: refreshAccount } = usePaperAccount();

  const load = useCallback(async (f: TradeHistoryFilters, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchClosedTrades(f, p, PAGE_SIZE);
      setTrades(result.trades);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filters, page); }, [filters, page, load]);

  const handleFiltersChange = useCallback((f: TradeHistoryFilters) => {
    setFilters(f);
    setPage(0);
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Summary computed from ALL closed trades matching filters (not just current page)
  const summary = useMemo<HistorySummary>(() => {
    const winners = trades.filter(t => Number(t.pnl ?? 0) > 0).length;
    const losers  = trades.filter(t => Number(t.pnl ?? 0) <= 0).length;
    const totalPnl = trades.reduce((s, t) => s + Number(t.pnl ?? 0), 0);
    return {
      totalTrades:    total,
      winningTrades:  winners,
      losingTrades:   losers,
      winRate:        total > 0 ? (winners / trades.length) * 100 : 0,
      totalPnl,
    };
  }, [trades, total]);

  const handleReset = async () => {
    if (!confirm('Reset paper account to $10,000? This cannot be undone.')) return;
    setResetting(true);
    try {
      await resetAccount();
      await refreshAccount();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-200">Trade History</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Paper balance: <span className="font-mono text-slate-300">${account?.balance.toFixed(2) ?? '—'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(filters, page)}
            className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="text-xs text-slate-500 hover:text-red-400 border border-slate-700 hover:border-red-500/50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            {resetting ? 'Resetting…' : 'Reset Account'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <SummaryCards summary={summary} accountBalance={account?.balance ?? 10000} />

      {/* Filters */}
      <FiltersBar filters={filters} onChange={handleFiltersChange} />

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-sm text-red-400 gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-slate-500">No closed trades yet</p>
            <p className="text-xs text-slate-600">Closed trades will appear here</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <th className="px-4 py-2.5">Pair</th>
                    <th className="px-4 py-2.5">Side</th>
                    <th className="px-4 py-2.5">Entry</th>
                    <th className="px-4 py-2.5">Exit</th>
                    <th className="px-4 py-2.5">Units</th>
                    <th className="px-4 py-2.5">P&amp;L</th>
                    <th className="px-4 py-2.5 hidden md:table-cell">Duration</th>
                    <th className="px-4 py-2.5 hidden lg:table-cell">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(trade => (
                    <HistoryRow key={trade.id} trade={trade} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800">
                <p className="text-xs text-slate-500">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-30"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-slate-400 font-mono">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-30"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import React, { useState, useCallback } from 'react';
import { RefreshCw, X, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { usePaperPositions, usePaperAccount } from '../hooks/usePaperTrading';
import { useMarketData } from '../hooks/useMarketData';
import {
  instrumentToSymbol, priceDp, calcUnrealizedPnl,
  PAPER_INSTRUMENTS, type PaperTrade,
} from '../types/paper';

// ── Close confirmation dialog ─────────────────────────────────────────────────

function CloseDialog({
  trade, bid, ask,
  onConfirm, onCancel,
}: {
  trade: PaperTrade;
  bid: number;
  ask: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dp         = priceDp(trade.instrument);
  const closePrice = trade.side === 'buy' ? bid : ask;
  const pnl        = calcUnrealizedPnl(trade.side, trade.entry_price, bid, ask, trade.units);
  const pnlColor   = pnl >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-xs bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-sm font-semibold text-slate-200">Close Position?</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {trade.side === 'buy' ? 'Long' : 'Short'} {PAPER_INSTRUMENTS[trade.instrument] ?? trade.instrument}
          </p>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Entry</span>
            <span className="font-mono text-slate-300">{Number(trade.entry_price).toFixed(dp)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Close at</span>
            <span className="font-mono text-slate-300">{closePrice.toFixed(dp)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Estimated P&amp;L</span>
            <span className={`font-mono font-semibold ${pnlColor}`}>
              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 hover:bg-red-400 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Position row ──────────────────────────────────────────────────────────────

function PositionRow({
  trade, bid, ask, onClose,
}: {
  trade: PaperTrade;
  bid: number;
  ask: number;
  onClose: () => void;
}) {
  const dp         = priceDp(trade.instrument);
  const isBuy      = trade.side === 'buy';
  const currentPx  = isBuy ? bid : ask;
  const pnl        = calcUnrealizedPnl(trade.side, trade.entry_price, bid, ask, trade.units);
  const pnlColor   = pnl >= 0 ? 'text-emerald-400' : 'text-red-400';
  const pnlBg      = pnl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10';

  return (
    <tr className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
            isBuy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {isBuy ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {isBuy ? 'Long' : 'Short'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-slate-200">
        {PAPER_INSTRUMENTS[trade.instrument] ?? trade.instrument}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-slate-300">
        {trade.units.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-slate-400">
        {Number(trade.entry_price).toFixed(dp)}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-slate-300">
        {currentPx.toFixed(dp)}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block font-mono text-sm font-semibold px-2 py-0.5 rounded ${pnlBg} ${pnlColor}`}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 font-mono hidden md:table-cell">
        {Number(trade.tp ?? 0) > 0 ? Number(trade.tp).toFixed(dp) : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 font-mono hidden md:table-cell">
        {Number(trade.sl ?? 0) > 0 ? Number(trade.sl).toFixed(dp) : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell">
        {new Date(trade.opened_at).toLocaleTimeString()}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <X size={11} />
          Close
        </button>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PaperPositions() {
  const { quotes, getQuote } = useMarketData(2000);
  const { account, refresh: refreshAccount } = usePaperAccount();

  const getBidAsk = useCallback((instrument: string) => {
    const sym = instrumentToSymbol(instrument);
    const q   = getQuote(sym);
    return q ? { bid: q.bid, ask: q.ask } : undefined;
  }, [getQuote]);

  const { trades, loading, error, refresh, executeClose } = usePaperPositions({ getBidAsk });

  const [closingTrade, setClosingTrade] = useState<PaperTrade | null>(null);
  const [closeError,   setCloseError]   = useState<string | null>(null);

  // Aggregate unrealized P&L
  const totalUnrealizedPnl = trades.reduce((sum, t) => {
    const q = getBidAsk(t.instrument);
    if (!q) return sum;
    return sum + calcUnrealizedPnl(t.side, t.entry_price, q.bid, q.ask, t.units);
  }, 0);

  const handleCloseConfirm = useCallback(async () => {
    if (!closingTrade) return;
    const q = getBidAsk(closingTrade.instrument);
    if (!q) { setCloseError('No price available'); return; }
    try {
      const exitPrice = closingTrade.side === 'buy' ? q.bid : q.ask;
      await executeClose(closingTrade, exitPrice);
      await refreshAccount();
      setClosingTrade(null);
      setCloseError(null);
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Failed to close position');
    }
  }, [closingTrade, getBidAsk, executeClose, refreshAccount]);

  const closingQuote = closingTrade ? getBidAsk(closingTrade.instrument) : null;

  return (
    <div className="p-6 space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Open Positions',
            value: trades.length.toString(),
            sub: 'active trades',
            color: 'text-slate-200',
          },
          {
            label: 'Paper Balance',
            value: account ? `$${account.balance.toFixed(2)}` : '—',
            sub: account?.currency ?? 'USD',
            color: 'text-slate-200',
          },
          {
            label: 'Unrealized P&L',
            value: `${totalUnrealizedPnl >= 0 ? '+' : ''}$${totalUnrealizedPnl.toFixed(2)}`,
            sub: 'across open trades',
            color: totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
          },
          {
            label: 'Equity',
            value: account
              ? `$${(account.balance + totalUnrealizedPnl).toFixed(2)}`
              : '—',
            sub: 'balance + unrealized',
            color: 'text-slate-200',
          },
        ].map(card => (
          <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p className={`text-lg font-bold font-mono ${card.color}`}>{card.value}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">Open Positions</h2>
          <button
            onClick={refresh}
            className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {closeError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-5 py-2 border-b border-slate-800">
            <AlertCircle size={13} />
            {closeError}
          </div>
        )}

        {loading && trades.length === 0 ? (
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
            <p className="text-sm text-slate-500">No open positions</p>
            <p className="text-xs text-slate-600">Open a trade from the Chart page</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="px-4 py-2.5">Side</th>
                  <th className="px-4 py-2.5">Pair</th>
                  <th className="px-4 py-2.5">Units</th>
                  <th className="px-4 py-2.5">Entry</th>
                  <th className="px-4 py-2.5">Current</th>
                  <th className="px-4 py-2.5">P&amp;L</th>
                  <th className="px-4 py-2.5 hidden md:table-cell">TP</th>
                  <th className="px-4 py-2.5 hidden md:table-cell">SL</th>
                  <th className="px-4 py-2.5 hidden lg:table-cell">Opened</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {trades.map(trade => {
                  const q = getBidAsk(trade.instrument);
                  return (
                    <PositionRow
                      key={trade.id}
                      trade={trade}
                      bid={q?.bid ?? trade.entry_price}
                      ask={q?.ask ?? trade.entry_price}
                      onClose={() => { setCloseError(null); setClosingTrade(trade); }}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Close confirmation */}
      {closingTrade && closingQuote && (
        <CloseDialog
          trade={closingTrade}
          bid={closingQuote.bid}
          ask={closingQuote.ask}
          onConfirm={handleCloseConfirm}
          onCancel={() => setClosingTrade(null)}
        />
      )}
    </div>
  );
}

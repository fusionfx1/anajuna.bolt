import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';
import type { SimulatedTrade } from '../../types/backtest';

const PAGE_SIZE = 20;

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  signal: { label: 'Signal', color: 'text-sky-400 bg-sky-500/10' },
  tp: { label: 'TP Hit', color: 'text-emerald-400 bg-emerald-500/10' },
  sl: { label: 'SL Hit', color: 'text-red-400 bg-red-500/10' },
  trailing: { label: 'Trail', color: 'text-amber-400 bg-amber-500/10' },
  end_of_data: { label: 'EOD', color: 'text-slate-400 bg-slate-700/50' },
};

type SortField = 'entryTime' | 'pnl' | 'units';
type SortDir = 'asc' | 'desc';

interface Props {
  trades: SimulatedTrade[];
  onSelectTrade?: (trade: SimulatedTrade) => void;
}

export function BacktestTradeLog({ trades, onSelectTrade }: Props) {
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('entryTime');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const arr = [...trades];
    arr.sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [trades, sortField, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(0);
  };

  function fmtTime(unix: number): string {
    return new Date(unix * 1000).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  }

  function fmtDuration(entry: number, exit: number): string {
    const s = exit - entry;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">
          Trade Log <span className="text-slate-500 font-normal ml-1.5">{trades.length} trades</span>
        </h3>
      </div>

      {trades.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-600">No trades generated</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Side</th>
                  <th className="px-4 py-2.5 cursor-pointer hover:text-slate-300" onClick={() => toggleSort('entryTime')}>
                    <span className="flex items-center gap-1">Entry Time <ArrowUpDown size={10} /></span>
                  </th>
                  <th className="px-4 py-2.5">Entry</th>
                  <th className="px-4 py-2.5">Exit</th>
                  <th className="px-4 py-2.5 cursor-pointer hover:text-slate-300" onClick={() => toggleSort('units')}>
                    <span className="flex items-center gap-1">Units <ArrowUpDown size={10} /></span>
                  </th>
                  <th className="px-4 py-2.5 cursor-pointer hover:text-slate-300" onClick={() => toggleSort('pnl')}>
                    <span className="flex items-center gap-1">P&amp;L <ArrowUpDown size={10} /></span>
                  </th>
                  <th className="px-4 py-2.5 hidden md:table-cell">Duration</th>
                  <th className="px-4 py-2.5">Reason</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((trade, idx) => {
                  const isBuy = trade.side === 'BUY';
                  const pnlColor = trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400';
                  const reasonInfo = REASON_LABELS[trade.reason] ?? REASON_LABELS.signal;

                  return (
                    <tr
                      key={trade.id}
                      onClick={() => onSelectTrade?.(trade)}
                      className={`border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors ${onSelectTrade ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">
                        {page * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          isBuy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                          {isBuy ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {isBuy ? 'Long' : 'Short'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{fmtTime(trade.entryTime)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{trade.entryPrice.toFixed(5)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{trade.exitPrice.toFixed(5)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{trade.units.toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-mono text-xs font-semibold ${pnlColor}`}>
                          {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 font-mono hidden md:table-cell">
                        {fmtDuration(trade.entryTime, trade.exitTime)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${reasonInfo.color}`}>
                          {reasonInfo.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800">
              <p className="text-xs text-slate-500">
                {page * PAGE_SIZE + 1}--{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-slate-400 font-mono">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

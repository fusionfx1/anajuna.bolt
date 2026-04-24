import React, { useState, useMemo } from 'react';
import { Search, Download, TrendingUp, TrendingDown } from 'lucide-react';
import { usePositions, useTrades } from '../hooks/useSupabaseData';

type Tab = 'trades' | 'positions';

function formatDuration(openedAt: string, closedAt: string | null): string {
  if (!closedAt) return 'Open';
  const diff = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function TradeHistory() {
  const [tab, setTab] = useState<Tab>('positions');
  const [search, setSearch] = useState('');
  const [sideFilter, setSideFilter] = useState<'all' | 'BUY' | 'SELL'>('all');

  const { positions, loading: posLoading } = usePositions();
  const { trades, loading: tradeLoading } = useTrades();

  const filteredPositions = useMemo(() => {
    return positions.filter(p => {
      const matchSymbol = p.symbol.includes(search.toUpperCase());
      const matchSide = sideFilter === 'all' || p.direction === sideFilter;
      return matchSymbol && matchSide;
    });
  }, [positions, search, sideFilter]);

  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      const matchSymbol = t.symbol.includes(search.toUpperCase());
      const matchSide = sideFilter === 'all' || t.side === sideFilter;
      return matchSymbol && matchSide;
    });
  }, [trades, search, sideFilter]);

  const closedPositions = filteredPositions.filter(p => p.status === 'closed');
  const openPositions = filteredPositions.filter(p => p.status === 'open');
  const totalClosedPnl = closedPositions.reduce((a, p) => a + (p.pnl_usd ?? 0), 0);
  const winners = closedPositions.filter(p => (p.pnl_usd ?? 0) > 0).length;
  const avgLatency = trades.length > 0
    ? trades.reduce((a, t) => a + (t.execution_latency_ms ?? 0), 0) / trades.length
    : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Realized P&L</p>
          <p className={`text-xl font-bold tabular-nums ${totalClosedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalClosedPnl >= 0 ? '+' : ''}${totalClosedPnl.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{closedPositions.length} closed trades</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Win / Loss</p>
          <p className="text-xl font-bold text-white">{winners} / {closedPositions.length - winners}</p>
          <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: closedPositions.length ? `${(winners / closedPositions.length) * 100}%` : '0%' }} />
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Open Positions</p>
          <p className="text-xl font-bold text-sky-400">{openPositions.length}</p>
          <p className="text-xs text-slate-500 mt-1">{openPositions.length} active</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Avg Latency</p>
          <p className="text-xl font-bold text-white">{avgLatency.toFixed(0)}ms</p>
          <p className="text-xs text-emerald-400 mt-1">
            {avgLatency < 20 ? 'Excellent execution' : avgLatency < 50 ? 'Good execution' : 'Needs attention'}
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex gap-1">
            {(['positions', 'trades'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter symbol..."
                className="bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-slate-600 w-36"
              />
            </div>
            <div className="flex border border-slate-700 rounded-lg overflow-hidden text-xs">
              {(['all', 'BUY', 'SELL'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSideFilter(s)}
                  className={`px-3 py-1.5 transition-colors font-medium ${
                    sideFilter === s
                      ? s === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : s === 'SELL' ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-white'
                      : 'text-slate-500 hover:text-slate-300 bg-slate-800'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                if (tab === 'positions') {
                  const rows = [
                    ['Symbol', 'Direction', 'Strategy', 'Lot Size', 'Entry', 'Exit', 'SL', 'TP', 'P&L', 'Pips', 'Status', 'Opened', 'Closed', 'Duration'],
                    ...filteredPositions.map(p => [
                      p.symbol, p.direction, p.strategy_name ?? '', p.lot_size,
                      p.entry_price, p.exit_price ?? '', p.stop_loss ?? '', p.take_profit ?? '',
                      p.pnl_usd ?? '', p.pnl_pips ?? '', p.status,
                      p.opened_at, p.closed_at ?? '',
                      formatDuration(p.opened_at, p.closed_at)
                    ])
                  ];
                  const csv = rows.map(r => r.join(',')).join('\n');
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                  a.download = `positions_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                } else {
                  const rows = [
                    ['Symbol', 'Strategy', 'Side', 'Type', 'Qty', 'Fill Price', 'Slippage (pips)', 'Commission', 'P&L', 'Latency (ms)', 'Executed At'],
                    ...filteredTrades.map(t => [
                      t.symbol, t.strategy_name ?? '', t.side, t.order_type,
                      t.quantity, t.fill_price, t.slippage_pips, t.commission_usd,
                      t.pnl_usd ?? '', t.execution_latency_ms ?? '', t.executed_at
                    ])
                  ];
                  const csv = rows.map(r => r.join(',')).join('\n');
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                  a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                }
              }}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs transition-colors"
            >
              <Download size={12} /> Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {(tab === 'positions' ? posLoading : tradeLoading) ? (
            <div className="text-center py-12 text-slate-600 text-sm">Loading...</div>
          ) : tab === 'positions' ? (
            <table className="w-full min-w-[750px]">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-3 px-4 font-medium">Symbol / Dir</th>
                  <th className="text-left py-3 px-4 font-medium">Strategy</th>
                  <th className="text-left py-3 px-4 font-medium">Lot Size</th>
                  <th className="text-left py-3 px-4 font-medium">Entry</th>
                  <th className="text-left py-3 px-4 font-medium">Exit</th>
                  <th className="text-left py-3 px-4 font-medium">SL / TP</th>
                  <th className="text-left py-3 px-4 font-medium">P&L</th>
                  <th className="text-left py-3 px-4 font-medium">Duration</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-600 text-sm">No positions found</td></tr>
                ) : filteredPositions.map(p => {
                  const pnl = p.pnl_usd ?? 0;
                  const pnlPos = pnl >= 0;
                  const dp = p.symbol.includes('JPY') ? 3 : 5;
                  return (
                    <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${p.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {p.direction}
                          </span>
                          <span className="text-sm font-semibold text-white">{p.symbol}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400">{p.strategy_name ?? '—'}</td>
                      <td className="py-3 px-4 text-sm text-slate-300 tabular-nums">{p.lot_size}</td>
                      <td className="py-3 px-4 text-sm font-mono text-slate-300 tabular-nums">{p.entry_price.toFixed(dp)}</td>
                      <td className="py-3 px-4 text-sm font-mono tabular-nums">
                        {p.status === 'open'
                          ? <span className="text-sky-400">Open</span>
                          : <span className="text-slate-300">{p.exit_price?.toFixed(dp) ?? '—'}</span>
                        }
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                        <span className="text-red-400">{p.stop_loss?.toFixed(dp) ?? '—'}</span>
                        {' / '}
                        <span className="text-emerald-400">{p.take_profit?.toFixed(dp) ?? '—'}</span>
                      </td>
                      <td className="py-3 px-4">
                        {p.status === 'open' ? (
                          <span className="text-xs text-slate-500">Open</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            {pnlPos ? <TrendingUp size={12} className="text-emerald-400" /> : <TrendingDown size={12} className="text-red-400" />}
                            <span className={`text-sm font-semibold tabular-nums ${pnlPos ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnlPos ? '+' : ''}${pnl.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">{formatDuration(p.opened_at, p.closed_at)}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          p.status === 'open' ? 'bg-sky-500/15 text-sky-400' :
                          p.status === 'closed' ? 'bg-slate-700 text-slate-400' :
                          'bg-amber-500/15 text-amber-400'
                        }`}>{p.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[750px]">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-3 px-4 font-medium">Symbol</th>
                  <th className="text-left py-3 px-4 font-medium">Strategy</th>
                  <th className="text-left py-3 px-4 font-medium">Side / Type</th>
                  <th className="text-left py-3 px-4 font-medium">Qty</th>
                  <th className="text-left py-3 px-4 font-medium">Fill Price</th>
                  <th className="text-left py-3 px-4 font-medium">Slippage</th>
                  <th className="text-left py-3 px-4 font-medium">Commission</th>
                  <th className="text-left py-3 px-4 font-medium">P&L</th>
                  <th className="text-left py-3 px-4 font-medium">Latency</th>
                  <th className="text-left py-3 px-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10 text-slate-600 text-sm">No trades found</td></tr>
                ) : filteredTrades.map(t => {
                  const pnlPos = (t.pnl_usd ?? 0) >= 0;
                  const dp = t.symbol.includes('JPY') ? 3 : 5;
                  return (
                    <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                      <td className="py-3 px-4 text-sm font-semibold text-white">{t.symbol}</td>
                      <td className="py-3 px-4 text-xs text-slate-400">{t.strategy_name ?? '—'}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${t.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {t.side}
                          </span>
                          <span className="text-xs text-slate-500">{t.order_type}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-300 tabular-nums">{t.quantity}</td>
                      <td className="py-3 px-4 text-sm font-mono text-slate-300 tabular-nums">{t.fill_price.toFixed(dp)}</td>
                      <td className="py-3 px-4 text-xs text-slate-400 tabular-nums">{t.slippage_pips.toFixed(1)} pips</td>
                      <td className="py-3 px-4 text-xs text-slate-400 tabular-nums">${t.commission_usd.toFixed(2)}</td>
                      <td className="py-3 px-4">
                        {t.pnl_usd !== null ? (
                          <span className={`text-sm font-semibold tabular-nums ${pnlPos ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pnlPos ? '+' : ''}${t.pnl_usd.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">Pending</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-mono ${(t.execution_latency_ms ?? 999) < 20 ? 'text-emerald-400' : (t.execution_latency_ms ?? 999) < 50 ? 'text-amber-400' : 'text-red-400'}`}>
                          {t.execution_latency_ms ?? '—'}ms
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">{formatTime(t.executed_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

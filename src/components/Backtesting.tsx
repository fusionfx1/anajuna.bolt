import React, { useState, useMemo } from 'react';
import { FlaskConical, Play, BarChart3, TrendingUp, Target, Cpu, Clock, Info } from 'lucide-react';
import { useStrategies, useTrades } from '../hooks/useSupabaseData';
import { BACKTEST_SYMBOLS, TIMEFRAMES } from '../lib/constants';
import type { Trade } from '../types/trading';

function BacktestChart({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 600;
  const h = 120;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h * 0.85 - h * 0.05;
    return `${x},${y}`;
  }).join(' ');
  const fillPts = `0,${h} ${pts} ${w},${h}`;
  const isUp = data[data.length - 1] >= data[0];

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="bt-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity="0.25" />
          <stop offset="100%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon fill="url(#bt-grad)" points={fillPts} />
      <polyline fill="none" stroke={isUp ? '#10b981' : '#ef4444'} strokeWidth="2" points={pts} />
    </svg>
  );
}

interface BacktestResults {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  netPnlPct: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  expectancy: number;
  avgDuration: number;
  curve: number[];
}

function analyzeFromRealTrades(
  trades: Trade[],
  symbol: string,
  startDate: string,
  endDate: string,
  initialBalance: number
): BacktestResults {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  const filtered = trades.filter(t => {
    if (t.pnl_usd === null) return false;
    const ts = new Date(t.executed_at).getTime();
    if (ts < start || ts > end) return false;
    if (symbol && t.symbol !== symbol) return false;
    return true;
  });

  if (filtered.length === 0) {
    return {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      netPnl: 0, netPnlPct: 0, avgWin: 0, avgLoss: 0,
      profitFactor: 0, maxDrawdown: 0, sharpeRatio: 0,
      sortinoRatio: 0, expectancy: 0, avgDuration: 0, curve: [initialBalance],
    };
  }

  const winTrades = filtered.filter(t => (t.pnl_usd ?? 0) > 0);
  const lossTrades = filtered.filter(t => (t.pnl_usd ?? 0) <= 0);
  const totalPnl = filtered.reduce((a, t) => a + (t.pnl_usd ?? 0), 0);
  const grossProfit = winTrades.reduce((a, t) => a + (t.pnl_usd ?? 0), 0);
  const grossLoss = Math.abs(lossTrades.reduce((a, t) => a + (t.pnl_usd ?? 0), 0));
  const avgWin = winTrades.length > 0 ? grossProfit / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? -grossLoss / lossTrades.length : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;
  const expectancy = filtered.length > 0 ? totalPnl / filtered.length : 0;
  const winRate = (winTrades.length / filtered.length) * 100;

  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  const curve: number[] = [initialBalance];
  const pnlSeries: number[] = [];

  for (const t of filtered) {
    const pnl = t.pnl_usd ?? 0;
    balance += pnl;
    pnlSeries.push(pnl);
    if (balance > peak) peak = balance;
    const dd = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    curve.push(balance);
  }

  const avgReturn = pnlSeries.reduce((a, b) => a + b, 0) / (pnlSeries.length || 1);
  const variance = pnlSeries.length > 1
    ? pnlSeries.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / (pnlSeries.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  const downReturns = pnlSeries.filter(r => r < 0);
  const downStd = downReturns.length > 0
    ? Math.sqrt(downReturns.reduce((a, r) => a + r * r, 0) / downReturns.length)
    : 0;
  const sortinoRatio = downStd > 0 ? (avgReturn / downStd) * Math.sqrt(252) : 0;

  const durations = filtered
    .filter(t => t.execution_latency_ms !== null && (t.execution_latency_ms ?? 0) > 0)
    .map(t => (t.execution_latency_ms ?? 0) / 60000);
  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  return {
    totalTrades: filtered.length,
    wins: winTrades.length,
    losses: lossTrades.length,
    winRate: parseFloat(winRate.toFixed(1)),
    netPnl: parseFloat(totalPnl.toFixed(2)),
    netPnlPct: parseFloat(((totalPnl / initialBalance) * 100).toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
    expectancy: parseFloat(expectancy.toFixed(2)),
    avgDuration: parseFloat(avgDuration.toFixed(1)),
    curve,
  };
}

export function Backtesting() {
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { trades, loading: tradesLoading } = useTrades();

  const today = new Date();
  const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const defaultStart = oneYearAgo.toISOString().split('T')[0];
  const defaultEnd = today.toISOString().split('T')[0];

  const [strategyId, setStrategyId] = useState('');
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('H1');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [initialBalance, setInitialBalance] = useState('10000');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BacktestResults | null>(null);

  const selectedStrategy = strategies.find(s => s.id === strategyId) ?? strategies[0];

  const strategyTrades = useMemo(() => {
    const sid = strategyId || selectedStrategy?.id;
    if (!sid) return trades;
    return trades.filter(t => t.strategy_id === sid);
  }, [trades, strategyId, selectedStrategy]);

  const realMetrics = useMemo(() => {
    if (!selectedStrategy || strategyTrades.length === 0) return null;
    const closed = strategyTrades.filter(t => t.pnl_usd !== null);
    if (closed.length === 0) return null;
    const wins = closed.filter(t => (t.pnl_usd ?? 0) > 0);
    const totalPnl = closed.reduce((a, t) => a + (t.pnl_usd ?? 0), 0);
    const grossProfit = wins.reduce((a, t) => a + (t.pnl_usd ?? 0), 0);
    const grossLoss = Math.abs(closed.filter(t => (t.pnl_usd ?? 0) <= 0).reduce((a, t) => a + (t.pnl_usd ?? 0), 0));
    return {
      trades: closed.length,
      winRate: (wins.length / closed.length) * 100,
      totalPnl,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
    };
  }, [selectedStrategy, strategyTrades]);

  function handleRun() {
    setRunning(true);
    const result = analyzeFromRealTrades(
      strategyTrades,
      symbol,
      startDate,
      endDate,
      parseFloat(initialBalance) || 10000
    );
    setResults(result);
    setRunning(false);
  }

  const noTradesInRange = results?.totalTrades === 0;

  return (
    <div className="p-6 space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <FlaskConical size={18} className="text-sky-400" />
          <h2 className="text-sm font-semibold text-slate-200">Backtest Configuration</h2>
        </div>

        {strategiesLoading ? (
          <div className="text-sm text-slate-600 text-center py-4">Loading strategies...</div>
        ) : strategies.length === 0 ? (
          <div className="text-sm text-slate-600 text-center py-4">No strategies found. Create a strategy first.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-5">
              <div className="lg:col-span-2">
                <label className="text-xs text-slate-500 mb-1.5 block">Strategy</label>
                <select
                  value={strategyId || selectedStrategy?.id || ''}
                  onChange={e => setStrategyId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                >
                  {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Symbol (optional)</label>
                <select
                  value={symbol} onChange={e => setSymbol(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                >
                  <option value="">All symbols</option>
                  {(selectedStrategy?.symbols?.length ? selectedStrategy.symbols : BACKTEST_SYMBOLS).map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Timeframe</label>
                <select
                  value={timeframe} onChange={e => setTimeframe(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                >
                  {TIMEFRAMES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Start Date</label>
                <input
                  type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">End Date</label>
                <input
                  type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                />
              </div>
            </div>

            {selectedStrategy && (
              <div className="flex flex-wrap gap-3 mb-4 p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
                <span className="text-xs text-slate-500">Strategy preview:</span>
                <span className="text-xs text-slate-300 font-medium">{selectedStrategy.name}</span>
                <span className="text-xs text-slate-600">·</span>
                <span className="text-xs text-slate-400">{selectedStrategy.strategy_type.replace('_', ' ')}</span>
                <span className="text-xs text-slate-600">·</span>
                <span className="text-xs text-slate-400">Max DD {selectedStrategy.max_drawdown_pct}%</span>
                <span className="text-xs text-slate-600">·</span>
                <span className="text-xs text-slate-400">Lot {selectedStrategy.lot_size}</span>
                {realMetrics && (
                  <>
                    <span className="text-xs text-slate-600">·</span>
                    <span className="text-xs text-emerald-400">
                      Live: {realMetrics.trades} trades, {realMetrics.winRate.toFixed(1)}% WR, ${realMetrics.totalPnl.toFixed(2)} P&L
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex-1 max-w-xs">
                <label className="text-xs text-slate-500 mb-1.5 block">Initial Balance ($)</label>
                <input
                  type="number" value={initialBalance} onChange={e => setInitialBalance(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                />
              </div>
              <button
                onClick={handleRun}
                disabled={running || tradesLoading}
                className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {running ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Running...
                  </>
                ) : (
                  <><Play size={16} /> Analyze Trades</>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {results && noTradesInRange && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <Info size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-400 mb-1">No trades found in this date range</p>
          <p className="text-xs text-slate-600">
            Try expanding the date range or selecting a different strategy / symbol combination.
            Backtest analysis is based on your actual recorded trades.
          </p>
        </div>
      )}

      {results && !noTradesInRange && (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-200">
                Equity Curve — {selectedStrategy?.name}{symbol ? ` / ${symbol}` : ''} / {timeframe}
              </h2>
              <span className={`text-xs font-semibold ${results.netPnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {results.netPnlPct >= 0 ? '+' : ''}{results.netPnlPct.toFixed(2)}% return
              </span>
            </div>
            <div className="h-32">
              <BacktestChart data={results.curve} />
            </div>
            <div className="flex justify-between text-xs text-slate-600 mt-2">
              <span>{startDate}</span>
              <span>{endDate}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: 'Net P&L', icon: TrendingUp, color: results.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
                value: `${results.netPnl >= 0 ? '+' : ''}$${results.netPnl.toFixed(2)}`,
                sub: `${results.netPnlPct >= 0 ? '+' : ''}${results.netPnlPct.toFixed(2)}%`
              },
              {
                label: 'Win Rate', icon: Target, color: 'text-sky-400',
                value: `${results.winRate.toFixed(1)}%`,
                sub: `${results.wins}W / ${results.losses}L`
              },
              {
                label: 'Profit Factor', icon: BarChart3, color: results.profitFactor >= 1.5 ? 'text-emerald-400' : results.profitFactor >= 1 ? 'text-amber-400' : 'text-red-400',
                value: results.profitFactor.toFixed(2),
                sub: 'Gross profit / loss'
              },
              {
                label: 'Max Drawdown', icon: Cpu, color: results.maxDrawdown < 3 ? 'text-emerald-400' : results.maxDrawdown < 6 ? 'text-amber-400' : 'text-red-400',
                value: `${results.maxDrawdown.toFixed(2)}%`,
                sub: 'Peak-to-trough'
              },
            ].map(m => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-xs text-slate-500">{m.label}</p>
                    <Icon size={14} className={m.color} />
                  </div>
                  <p className={`text-2xl font-bold tabular-nums ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{m.sub}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-200 mb-4">Trade Statistics</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total Trades', value: results.totalTrades.toLocaleString() },
                  { label: 'Avg Win', value: `+$${results.avgWin.toFixed(2)}`, color: 'text-emerald-400' },
                  { label: 'Avg Loss', value: `$${results.avgLoss.toFixed(2)}`, color: 'text-red-400' },
                  { label: 'Expectancy', value: `${results.expectancy >= 0 ? '+' : ''}$${results.expectancy.toFixed(2)}`, color: results.expectancy >= 0 ? 'text-sky-400' : 'text-red-400' },
                  { label: 'Avg Duration', value: results.avgDuration > 0 ? `${results.avgDuration.toFixed(1)}m` : '—' },
                  { label: 'Sharpe Ratio', value: results.sharpeRatio.toFixed(2), color: results.sharpeRatio >= 1.5 ? 'text-emerald-400' : results.sharpeRatio >= 1 ? 'text-amber-400' : 'text-red-400' },
                  { label: 'Sortino Ratio', value: results.sortinoRatio.toFixed(2), color: results.sortinoRatio >= 2 ? 'text-emerald-400' : results.sortinoRatio >= 1 ? 'text-amber-400' : 'text-red-400' },
                ].map(item => (
                  <div key={item.label} className="bg-slate-800/60 rounded-lg px-3 py-2.5">
                    <p className="text-xs text-slate-500 mb-0.5">{item.label}</p>
                    <p className={`text-sm font-bold tabular-nums ${item.color ?? 'text-white'}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-200 mb-4">Win / Loss Distribution</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Winning Trades</span>
                    <span className="text-emerald-400 font-medium">{results.wins} ({results.winRate.toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${results.winRate}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Losing Trades</span>
                    <span className="text-red-400 font-medium">{results.losses} ({(100 - results.winRate).toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500/70 rounded-full transition-all duration-700" style={{ width: `${100 - results.winRate}%` }} />
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-800 text-xs text-slate-500 space-y-1.5">
                  <div className="flex justify-between">
                    <span>Risk-Reward Ratio</span>
                    <span className="text-white font-medium">
                      {results.avgLoss !== 0 ? (results.avgWin / Math.abs(results.avgLoss)).toFixed(2) : 'N/A'} : 1
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Required Win Rate (BE)</span>
                    <span className="text-white font-medium">
                      {results.avgLoss !== 0 ? ((Math.abs(results.avgLoss) / (results.avgWin + Math.abs(results.avgLoss))) * 100).toFixed(1) : 'N/A'}%
                    </span>
                  </div>
                  {results.avgLoss !== 0 && (
                    <div className="flex justify-between">
                      <span>Actual vs Required</span>
                      <span className={`font-medium ${results.winRate - (Math.abs(results.avgLoss) / (results.avgWin + Math.abs(results.avgLoss))) * 100 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(results.winRate - (Math.abs(results.avgLoss) / (results.avgWin + Math.abs(results.avgLoss))) * 100) >= 0 ? '+' : ''}
                        {(results.winRate - (Math.abs(results.avgLoss) / (results.avgWin + Math.abs(results.avgLoss))) * 100).toFixed(1)}% edge
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {realMetrics && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={12} className="text-slate-500" />
                    <p className="text-xs text-slate-400 font-medium">All-Time Live Comparison</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-800/40 rounded-lg px-2.5 py-2">
                      <p className="text-xs text-slate-500">Live Win Rate</p>
                      <p className="text-sm font-bold text-sky-400">{realMetrics.winRate.toFixed(1)}%</p>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg px-2.5 py-2">
                      <p className="text-xs text-slate-500">Live P&L</p>
                      <p className={`text-sm font-bold ${realMetrics.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {realMetrics.totalPnl >= 0 ? '+' : ''}${realMetrics.totalPnl.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

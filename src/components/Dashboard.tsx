import React, { useMemo } from 'react';
import { DollarSign, TrendingUp, Activity, AlertTriangle, Radio, Zap, BookOpen, Shield } from 'lucide-react';
import { StatCard } from './ui/StatCard';
import { useAccountData, useStrategies, usePositions, useEquitySnapshots, useUserSettings } from '../hooks/useSupabaseData';
import type { EquitySnapshot, Strategy, Position } from '../types/trading';
import { useFeedStatus } from '../hooks/useDataFeed';
import { useOrderManager } from '../hooks/useOrderManager';

function EquityChart({ snapshots }: { snapshots: EquitySnapshot[] }) {
  if (snapshots.length < 2) {
    return <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">No data yet</div>;
  }
  const data = snapshots.map(s => s.balance);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 800;
  const h = 120;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h * 0.85 - h * 0.05;
    return `${x},${y}`;
  }).join(' ');
  const isUp = data[data.length - 1] >= data[0];
  const fillPts = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon fill="url(#eq-grad)" points={fillPts} />
      <polyline fill="none" stroke={isUp ? '#10b981' : '#ef4444'} strokeWidth="2" points={pts} />
    </svg>
  );
}

function DrawdownBar({ pct, limit }: { pct: number; limit: number }) {
  const fillPct = Math.min((pct / limit) * 100, 100);
  const color = fillPct > 80 ? '#ef4444' : fillPct > 50 ? '#f59e0b' : '#10b981';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">Current: {pct.toFixed(2)}%</span>
        <span className="text-slate-500">Limit: {limit}%</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${fillPct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ActiveBotRow({ strategy }: { strategy: Strategy }) {
  const pnlPositive = strategy.total_pnl_usd >= 0;
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-800 last:border-0">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
        strategy.status === 'active' ? 'bg-emerald-400 animate-pulse' :
        strategy.status === 'paused' ? 'bg-amber-400' : 'bg-slate-600'
      }`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{strategy.name}</p>
        <p className="text-xs text-slate-500 truncate">{strategy.symbols.join(' · ')}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-semibold tabular-nums ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {pnlPositive ? '+' : ''}${strategy.total_pnl_usd.toFixed(0)}
        </p>
        <p className="text-xs text-slate-500">{strategy.win_rate.toFixed(1)}% WR</p>
      </div>
      <div className={`text-xs px-2 py-1 rounded-md font-medium flex-shrink-0 ${
        strategy.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' :
        strategy.status === 'paused' ? 'bg-amber-500/15 text-amber-400' :
        'bg-slate-800 text-slate-500'
      }`}>
        {strategy.status}
      </div>
    </div>
  );
}

function OpenPositionRow({ pos }: { pos: Position }) {
  const dp = pos.symbol.includes('JPY') ? 3 : 5;
  return (
    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
            pos.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>{pos.direction}</span>
          <span className="text-sm font-semibold text-white">{pos.symbol}</span>
          <span className="text-xs text-slate-500">{pos.lot_size} lot</span>
        </div>
        <span className="text-xs text-slate-500">{pos.strategy_name ?? '—'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
        <span>Entry: <span className="text-slate-300">{pos.entry_price.toFixed(dp)}</span></span>
        <span>SL: <span className="text-red-400">{pos.stop_loss?.toFixed(dp) ?? '—'}</span></span>
        <span>TP: <span className="text-emerald-400">{pos.take_profit?.toFixed(dp) ?? '—'}</span></span>
      </div>
    </div>
  );
}

function FeedStatusBar() {
  const stats = useFeedStatus();
  const { stats: orderStats, pendingCount } = useOrderManager();

  const feedOk = stats.status === 'connected';
  const feedWarn = stats.status === 'reconnecting' || stats.status === 'connecting';

  return (
    <div className="grid grid-cols-4 gap-3">
      <div className={`flex items-center gap-3 rounded-xl border p-3.5 ${feedOk ? 'border-emerald-500/20 bg-emerald-500/5' : feedWarn ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-700 bg-slate-800/30'}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${feedOk ? 'bg-emerald-500/15' : 'bg-slate-700'}`}>
          <Radio size={14} className={feedOk ? 'text-emerald-400' : 'text-slate-400'} />
        </div>
        <div>
          <p className="text-xs text-slate-500">Data Feed</p>
          <p className={`text-sm font-semibold capitalize ${feedOk ? 'text-emerald-400' : feedWarn ? 'text-amber-400' : 'text-slate-400'}`}>
            {stats.status}
          </p>
        </div>
        {feedOk && <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/30 p-3.5">
        <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
          <Zap size={14} className="text-slate-400" />
        </div>
        <div>
          <p className="text-xs text-slate-500">Tick Rate</p>
          <p className="text-sm font-semibold text-white">
            {stats.ticksReceived.toLocaleString()} <span className="text-xs text-slate-500 font-normal">total</span>
          </p>
        </div>
      </div>

      <div className={`flex items-center gap-3 rounded-xl border p-3.5 ${pendingCount > 0 ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-700 bg-slate-800/30'}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${pendingCount > 0 ? 'bg-amber-500/15' : 'bg-slate-700'}`}>
          <BookOpen size={14} className={pendingCount > 0 ? 'text-amber-400' : 'text-slate-400'} />
        </div>
        <div>
          <p className="text-xs text-slate-500">Open Orders</p>
          <p className={`text-sm font-semibold ${pendingCount > 0 ? 'text-amber-400' : 'text-white'}`}>{pendingCount}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/30 p-3.5">
        <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
          <Shield size={14} className="text-slate-400" />
        </div>
        <div>
          <p className="text-xs text-slate-500">Fill Rate</p>
          <p className="text-sm font-semibold text-emerald-400">
            {orderStats.total > 0 ? `${orderStats.fillRate}%` : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { account, loading: accountLoading } = useAccountData();
  const { strategies } = useStrategies();
  const { positions } = usePositions();
  const { snapshots } = useEquitySnapshots();
  const { settings } = useUserSettings();

  const recentSnapshots = useMemo(() => snapshots.slice(-168), [snapshots]);
  const openPositions = useMemo(() => positions.filter(p => p.status === 'open'), [positions]);

  const totalPnl = useMemo(() => strategies.reduce((a, s) => a + s.total_pnl_usd, 0), [strategies]);
  const totalTrades = useMemo(() => strategies.reduce((a, s) => a + s.total_trades, 0), [strategies]);
  const avgWinRate = useMemo(() => strategies.length > 0
    ? strategies.reduce((a, s) => a + s.win_rate, 0) / strategies.length : 0, [strategies]);

  const bal = account?.balance ?? 0;
  const dailyPnl = account?.daily_pnl ?? 0;
  const openPnl = account?.open_pnl ?? 0;
  const drawdown = account?.drawdown_pct ?? 0;
  const maxDrawdownLimit = parseFloat(String(settings?.max_drawdown_pct ?? 5));

  return (
    <div className="p-6 space-y-6">
      <FeedStatusBar />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Account Balance"
          value={accountLoading ? '—' : `$${bal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          subValue="IC Markets Demo" icon={DollarSign} accent="slate"
          trendValue={`+$${dailyPnl.toFixed(2)} today`} trend="up"
        />
        <StatCard
          label="Daily P&L"
          value={`${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`}
          subValue={`Target: +$${(bal * 0.01).toFixed(2)}`} icon={TrendingUp} accent="green"
          trendValue={`${account?.daily_pnl_pct?.toFixed(2) ?? '0.00'}%`} trend="up"
        />
        <StatCard
          label="Open P&L"
          value={`${openPnl >= 0 ? '+' : ''}$${openPnl.toFixed(2)}`}
          subValue={`${openPositions.length} positions open`} icon={Activity}
          accent={openPnl >= 0 ? 'green' : 'red'}
        />
        <StatCard
          label="Drawdown"
          value={`${drawdown.toFixed(2)}%`}
          subValue={`Max allowed: ${maxDrawdownLimit.toFixed(2)}%`} icon={AlertTriangle}
          accent={drawdown > maxDrawdownLimit * 0.8 ? 'red' : drawdown > maxDrawdownLimit * 0.5 ? 'amber' : 'slate'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Equity Curve</h2>
              <p className="text-xs text-slate-500">30-day balance history</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Start: <span className="text-slate-300">${recentSnapshots[0]?.balance.toLocaleString() ?? '—'}</span></span>
              <span>Now: <span className="text-emerald-400 font-semibold">${bal.toLocaleString()}</span></span>
            </div>
          </div>
          <div className="h-32">
            <EquityChart snapshots={recentSnapshots} />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3 pt-3 border-t border-slate-800">
            <div className="text-center">
              <p className="text-xs text-slate-500">Total P&L</p>
              <p className={`text-sm font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">Strategies</p>
              <p className="text-sm font-bold text-white">{strategies.length}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">Avg Win Rate</p>
              <p className="text-sm font-bold text-emerald-400">{avgWinRate.toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">Total Trades</p>
              <p className="text-sm font-bold text-white">{totalTrades.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Strategy Bots</h2>
          <div>
            {strategies.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-4">No strategies found</p>
            ) : (
              strategies.map(s => <ActiveBotRow key={s.id} strategy={s} />)
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Open Positions</h2>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-lg">{openPositions.length} active</span>
          </div>
          <div className="space-y-3">
            {openPositions.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-4">No open positions</p>
            ) : (
              openPositions.map(p => <OpenPositionRow key={p.id} pos={p} />)
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Account Overview</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: 'Equity', value: `$${(account?.equity ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: 'text-white' },
              { label: 'Margin Used', value: `$${(account?.margin_used ?? 0).toFixed(2)}`, color: 'text-sky-400' },
              { label: 'Free Margin', value: `$${(account?.free_margin ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: 'text-emerald-400' },
              { label: 'Peak Balance', value: `$${(account?.peak_balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: 'text-amber-400' },
              { label: 'Active Bots', value: String(strategies.filter(s => s.status === 'active').length), color: 'text-emerald-400' },
              { label: 'Paused Bots', value: String(strategies.filter(s => s.status === 'paused').length), color: 'text-amber-400' },
            ].map(m => (
              <div key={m.label} className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">{m.label}</p>
                <p className={`text-base font-bold tabular-nums ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400 mb-2">Account Drawdown Gauge</p>
            <DrawdownBar pct={drawdown} limit={5.0} />
          </div>
        </div>
      </div>
    </div>
  );
}

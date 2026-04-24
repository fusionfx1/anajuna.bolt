import React, { useState } from 'react';
import {
  Play, Pause, Square, Settings2, Plus,
  TrendingUp, BarChart3, Target, Zap, ChevronDown, ChevronUp
} from 'lucide-react';
import { useStrategies } from '../hooks/useSupabaseData';
import { useAuth } from '../context/AuthContext';
import { NewStrategyModal } from './strategies/NewStrategyModal';
import { ConfigEditorModal } from './strategies/ConfigEditorModal';
import type { Strategy } from '../types/trading';

function StatusBadge({ status }: { status: Strategy['status'] }) {
  const map: Record<Strategy['status'], string> = {
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    paused: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    stopped: 'bg-slate-700 text-slate-500 border-slate-700',
    backtesting: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
    error: 'bg-red-500/15 text-red-400 border-red-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${map[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'active' ? 'bg-emerald-400 animate-pulse' :
        status === 'paused' ? 'bg-amber-400' :
        status === 'error' ? 'bg-red-400' : 'bg-slate-600'
      }`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function MiniWinBar({ winRate }: { winRate: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${winRate}%` }} />
      </div>
      <span className="text-xs text-slate-400 tabular-nums w-10 text-right">{winRate.toFixed(1)}%</span>
    </div>
  );
}

function StrategyCard({
  strategy,
  onToggle,
  onConfig,
}: {
  strategy: Strategy;
  onToggle: (id: string, status: Strategy['status']) => Promise<void>;
  onConfig: (strategy: Strategy) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const pnlPos = strategy.total_pnl_usd >= 0;
  const typeMap: Record<string, string> = {
    scalping: 'bg-sky-500/10 text-sky-400',
    swing: 'bg-amber-500/10 text-amber-400',
    trend_following: 'bg-emerald-500/10 text-emerald-400',
    mean_reversion: 'bg-rose-500/10 text-rose-400',
    arbitrage: 'bg-teal-500/10 text-teal-400',
  };

  async function handleToggle(newStatus: Strategy['status']) {
    setBusy(true);
    await onToggle(strategy.id, newStatus);
    setBusy(false);
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-base font-semibold text-white">{strategy.name}</h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeMap[strategy.strategy_type] ?? 'bg-slate-800 text-slate-400'}`}>
                {strategy.strategy_type.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-500 line-clamp-1">{strategy.description}</p>
          </div>
          <StatusBadge status={strategy.status} />
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {strategy.symbols.map(s => (
            <span key={s} className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-mono">{s}</span>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">Total P&L</p>
            <p className={`text-sm font-bold tabular-nums ${pnlPos ? 'text-emerald-400' : 'text-red-400'}`}>
              {pnlPos ? '+' : ''}${strategy.total_pnl_usd.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Trades</p>
            <p className="text-sm font-bold text-white">{strategy.total_trades}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Sharpe</p>
            <p className={`text-sm font-bold ${strategy.sharpe_ratio && strategy.sharpe_ratio > 1.5 ? 'text-emerald-400' : strategy.sharpe_ratio && strategy.sharpe_ratio > 1 ? 'text-amber-400' : 'text-red-400'}`}>
              {strategy.sharpe_ratio?.toFixed(2) ?? 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Max DD</p>
            <p className="text-sm font-bold text-slate-300">{strategy.max_drawdown_pct.toFixed(1)}%</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Win Rate</span>
          </div>
          <MiniWinBar winRate={strategy.win_rate} />
        </div>

        <div className="flex items-center gap-2">
          {strategy.status === 'active' ? (
            <button
              disabled={busy}
              onClick={() => handleToggle('paused')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/20 text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              <Pause size={12} /> Pause
            </button>
          ) : strategy.status === 'paused' ? (
            <button
              disabled={busy}
              onClick={() => handleToggle('active')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              <Play size={12} /> Resume
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => handleToggle('active')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              <Play size={12} /> Start
            </button>
          )}
          {strategy.status !== 'stopped' && (
            <button
              disabled={busy}
              onClick={() => handleToggle('stopped')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <Square size={12} /> Stop
            </button>
          )}
          <button
            onClick={() => onConfig(strategy)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-400 rounded-lg text-xs font-medium hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Settings2 size={12} /> Config
          </button>
          <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors px-2 py-1.5">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-800 bg-slate-950/50 p-5">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Configuration</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(strategy.config).map(([k, v]) => (
              <div key={k} className="bg-slate-800/60 rounded-lg px-3 py-2">
                <p className="text-xs text-slate-500 mb-0.5">{k.replace(/_/g, ' ')}</p>
                <p className="text-sm font-mono text-slate-200">{String(v)}</p>
              </div>
            ))}
            <div className="bg-slate-800/60 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-500 mb-0.5">Lot Size</p>
              <p className="text-sm font-mono text-slate-200">{strategy.lot_size}</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-500 mb-0.5">Max Concurrent</p>
              <p className="text-sm font-mono text-slate-200">{strategy.max_concurrent_trades}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Strategies() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'stopped'>('all');
  const { strategies, loading, toggleStatus, addStrategy, saveConfig } = useStrategies();
  const [showNew, setShowNew] = useState(false);
  const [editTarget, setEditTarget] = useState<Strategy | null>(null);

  const filtered = filter === 'all' ? strategies : strategies.filter(s => s.status === filter);
  const counts = {
    all: strategies.length,
    active: strategies.filter(s => s.status === 'active').length,
    paused: strategies.filter(s => s.status === 'paused').length,
    stopped: strategies.filter(s => s.status === 'stopped').length,
  };

  const totalPnl = strategies.reduce((a, s) => a + s.total_pnl_usd, 0);
  const totalTrades = strategies.reduce((a, s) => a + s.total_trades, 0);
  const avgWinRate = strategies.length > 0 ? strategies.reduce((a, s) => a + s.win_rate, 0) / strategies.length : 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(['all', 'active', 'paused', 'stopped'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-slate-700 text-white border border-slate-600'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> New Strategy
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-600 text-sm">Loading strategies...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map(s => (
            <StrategyCard
              key={s.id}
              strategy={s}
              onToggle={toggleStatus}
              onConfig={strat => setEditTarget(strat)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="xl:col-span-2 text-center py-12 text-slate-600 text-sm">
              No strategies found.{' '}
              <button onClick={() => setShowNew(true)} className="text-emerald-500 hover:text-emerald-400 transition-colors">
                Create your first strategy
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Portfolio Performance Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, icon: TrendingUp, color: totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Total Trades', value: totalTrades.toLocaleString(), icon: BarChart3, color: 'text-sky-400' },
            { label: 'Avg Win Rate', value: `${avgWinRate.toFixed(1)}%`, icon: Target, color: 'text-amber-400' },
            { label: 'Active Bots', value: String(counts.active), icon: Zap, color: 'text-emerald-400' },
          ].map(m => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="bg-slate-800/50 rounded-xl p-4 text-center">
                <Icon size={20} className={`${m.color} mx-auto mb-2`} />
                <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {showNew && user && (
        <NewStrategyModal
          onClose={() => setShowNew(false)}
          onCreate={payload => addStrategy(user.id, payload)}
        />
      )}

      {editTarget && (
        <ConfigEditorModal
          strategy={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={saveConfig}
        />
      )}
    </div>
  );
}

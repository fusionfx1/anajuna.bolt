import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Trash2, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchBacktestRuns, deleteBacktestRun } from '../../services/backtestService';
import type { BacktestRun } from '../../types/backtest';

interface Props {
  onSelectRun: (run: BacktestRun) => void;
  refreshKey: number;
}

export function BacktestRunHistory({ onSelectRun, refreshKey }: Props) {
  const { user } = useAuth();
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchBacktestRuns(user.id);
      setRuns(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this backtest run?')) return;
    try {
      await deleteBacktestRun(id);
      setRuns(prev => prev.filter(r => r.id !== id));
    } catch {
      // ignore
    }
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" />
          Loading run history...
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
        <Clock size={24} className="text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No saved backtest runs yet</p>
        <p className="text-xs text-slate-600 mt-1">Completed backtests will appear here</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">Run History</h3>
        <button onClick={load} className="text-slate-500 hover:text-slate-300 p-1 rounded transition-colors">
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="divide-y divide-slate-800/60 max-h-[320px] overflow-y-auto">
        {runs.map(run => {
          const pnl = run.results?.netPnl ?? 0;
          const winRate = run.results?.winRate ?? 0;
          const totalTrades = run.results?.totalTrades ?? 0;
          const isPositive = pnl >= 0;

          return (
            <button
              key={run.id}
              onClick={() => onSelectRun(run)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left group"
            >
              <div className={`w-1.5 h-8 rounded-full shrink-0 ${isPositive ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-slate-300 truncate">{run.strategy_name}</span>
                  <span className="text-[10px] text-slate-600 shrink-0">{run.instrument} / {run.granularity}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span className={`font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : ''}${pnl.toFixed(2)}
                  </span>
                  <span>WR {winRate.toFixed(0)}%</span>
                  <span>{totalTrades} trades</span>
                </div>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {new Date(run.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => handleDelete(run.id, e)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={12} />
                </button>
                <ChevronRight size={14} className="text-slate-700 group-hover:text-slate-500" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

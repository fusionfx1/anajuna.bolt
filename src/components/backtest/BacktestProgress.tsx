import React from 'react';
import { Loader2 } from 'lucide-react';
import type { BacktestProgress as ProgressData } from '../../types/backtest';

interface Props {
  progress: ProgressData | null;
}

export function BacktestProgressBar({ progress }: Props) {
  if (!progress) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Loader2 size={16} className="text-sky-400 animate-spin" />
          <span className="text-sm text-slate-400">Preparing backtest engine...</span>
        </div>
      </div>
    );
  }

  const { currentBar, totalBars, pct, closedTrades, currentBalance } = progress;

  return (
    <div className="bg-slate-900 border border-sky-500/20 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Loader2 size={16} className="text-sky-400 animate-spin" />
          <span className="text-sm font-medium text-slate-200">Running Backtest</span>
        </div>
        <span className="text-sm font-bold text-sky-400 tabular-nums">{pct}%</span>
      </div>

      <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center gap-6 text-xs text-slate-500">
        <span>
          Bar <span className="text-slate-300 font-mono">{currentBar.toLocaleString()}</span>
          {' / '}
          <span className="text-slate-400 font-mono">{totalBars.toLocaleString()}</span>
        </span>
        <span>
          Trades: <span className="text-slate-300 font-mono">{closedTrades}</span>
        </span>
        <span>
          Balance: <span className="text-slate-300 font-mono">${currentBalance.toLocaleString()}</span>
        </span>
      </div>
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp, Target, BarChart3, Activity, Award, Flame,
  Clock, ArrowUpDown, Gauge,
} from 'lucide-react';
import type { BacktestMetrics } from '../../types/backtest';

interface Props {
  metrics: BacktestMetrics;
  initialBalance: number;
}

function MetricCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string; sub?: string; color: string;
  icon: LucideIcon;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs text-slate-500">{label}</p>
        <Icon size={14} className={color} />
      </div>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export function BacktestResultsPanel({ metrics, initialBalance }: Props) {
  const finalBalance = initialBalance + metrics.netPnl;

  return (
    <div className="space-y-4">
      {/* Primary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Net P&L"
          value={`${metrics.netPnl >= 0 ? '+' : ''}$${metrics.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={`${metrics.netPnlPct >= 0 ? '+' : ''}${metrics.netPnlPct}% | Final: $${finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color={metrics.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
          icon={TrendingUp}
        />
        <MetricCard
          label="Win Rate"
          value={`${metrics.winRate}%`}
          sub={`${metrics.wins}W / ${metrics.losses}L`}
          color="text-sky-400"
          icon={Target}
        />
        <MetricCard
          label="Profit Factor"
          value={metrics.profitFactor.toFixed(2)}
          sub={`Gross: +$${metrics.grossProfit.toFixed(0)} / -$${metrics.grossLoss.toFixed(0)}`}
          color={metrics.profitFactor >= 1.5 ? 'text-emerald-400' : metrics.profitFactor >= 1 ? 'text-amber-400' : 'text-red-400'}
          icon={BarChart3}
        />
        <MetricCard
          label="Max Drawdown"
          value={`${metrics.maxDrawdown.toFixed(2)}%`}
          sub="Peak-to-trough"
          color={metrics.maxDrawdown < 5 ? 'text-emerald-400' : metrics.maxDrawdown < 15 ? 'text-amber-400' : 'text-red-400'}
          icon={Activity}
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
        {/* Trade Statistics */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Trade Statistics</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Total Trades', value: metrics.totalTrades.toLocaleString(), icon: BarChart3 },
              { label: 'Avg Win', value: `+$${metrics.avgWin.toFixed(2)}`, color: 'text-emerald-400', icon: TrendingUp },
              { label: 'Avg Loss', value: `$${metrics.avgLoss.toFixed(2)}`, color: 'text-red-400', icon: TrendingUp },
              { label: 'Expectancy', value: `${metrics.expectancy >= 0 ? '+' : ''}$${metrics.expectancy.toFixed(2)}`, color: metrics.expectancy >= 0 ? 'text-sky-400' : 'text-red-400', icon: Gauge },
              { label: 'Avg Duration', value: `${metrics.avgDurationBars.toFixed(0)} bars`, icon: Clock },
              { label: 'Max Consec. Wins', value: metrics.maxConsecutiveWins.toString(), color: 'text-emerald-400', icon: Award },
              { label: 'Max Consec. Losses', value: metrics.maxConsecutiveLosses.toString(), color: 'text-red-400', icon: Flame },
              { label: 'Risk-Reward', value: metrics.avgLoss !== 0 ? `${(metrics.avgWin / Math.abs(metrics.avgLoss)).toFixed(2)}:1` : 'N/A', icon: ArrowUpDown },
            ].map(item => (
              <div key={item.label} className="bg-slate-800/60 rounded-lg px-3 py-2.5">
                <p className="text-[10px] text-slate-500 mb-0.5">{item.label}</p>
                <p className={`text-sm font-bold tabular-nums ${item.color ?? 'text-white'}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Metrics + Distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Risk Analysis</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: 'Sharpe Ratio', value: metrics.sharpeRatio.toFixed(2), color: metrics.sharpeRatio >= 1.5 ? 'text-emerald-400' : metrics.sharpeRatio >= 1 ? 'text-amber-400' : 'text-red-400' },
              { label: 'Sortino Ratio', value: metrics.sortinoRatio.toFixed(2), color: metrics.sortinoRatio >= 2 ? 'text-emerald-400' : metrics.sortinoRatio >= 1 ? 'text-amber-400' : 'text-red-400' },
              { label: 'Calmar Ratio', value: metrics.calmarRatio.toFixed(3), color: metrics.calmarRatio > 1 ? 'text-emerald-400' : 'text-amber-400' },
            ].map(item => (
              <div key={item.label} className="bg-slate-800/60 rounded-lg px-3 py-2.5">
                <p className="text-[10px] text-slate-500 mb-0.5">{item.label}</p>
                <p className={`text-sm font-bold tabular-nums ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Win/Loss bar */}
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Winners</span>
                <span className="text-emerald-400 font-medium">{metrics.wins} ({metrics.winRate.toFixed(1)}%)</span>
              </div>
              <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${metrics.winRate}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Losers</span>
                <span className="text-red-400 font-medium">{metrics.losses} ({(100 - metrics.winRate).toFixed(1)}%)</span>
              </div>
              <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-500/70 rounded-full transition-all duration-700" style={{ width: `${100 - metrics.winRate}%` }} />
              </div>
            </div>
          </div>

          {/* Breakeven analysis */}
          {metrics.avgLoss !== 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Required WR (breakeven)</span>
                <span className="text-white font-medium">
                  {((Math.abs(metrics.avgLoss) / (metrics.avgWin + Math.abs(metrics.avgLoss))) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Edge over breakeven</span>
                <span className={`font-medium ${metrics.winRate - (Math.abs(metrics.avgLoss) / (metrics.avgWin + Math.abs(metrics.avgLoss))) * 100 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {(metrics.winRate - (Math.abs(metrics.avgLoss) / (metrics.avgWin + Math.abs(metrics.avgLoss))) * 100) >= 0 ? '+' : ''}
                  {(metrics.winRate - (Math.abs(metrics.avgLoss) / (metrics.avgWin + Math.abs(metrics.avgLoss))) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Monthly P&L */}
      {metrics.monthlyPnl.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Monthly Performance</h3>
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {metrics.monthlyPnl.map(m => (
              <div
                key={m.month}
                className={`rounded-lg px-2.5 py-2 border ${
                  m.pnl >= 0
                    ? 'bg-emerald-500/8 border-emerald-500/20'
                    : 'bg-red-500/8 border-red-500/20'
                }`}
              >
                <p className="text-[10px] text-slate-500 mb-0.5">{m.month}</p>
                <p className={`text-xs font-bold tabular-nums ${m.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {m.pnl >= 0 ? '+' : ''}${m.pnl.toFixed(0)}
                </p>
                <p className="text-[10px] text-slate-600">{m.trades} trades</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

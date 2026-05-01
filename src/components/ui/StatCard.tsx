import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  accent?: 'green' | 'red' | 'blue' | 'amber' | 'slate';
}

const accentMap = {
  green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  red: 'text-red-400 bg-red-500/10 border-red-500/20',
  blue: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  slate: 'text-slate-400 bg-slate-700/50 border-slate-700',
};

const iconBgMap = {
  green: 'bg-emerald-500/15 text-emerald-400',
  red: 'bg-red-500/15 text-red-400',
  blue: 'bg-sky-500/15 text-sky-400',
  amber: 'bg-amber-500/15 text-amber-400',
  slate: 'bg-slate-700 text-slate-400',
};

export function StatCard({ label, value, subValue, icon: Icon, trend, trendValue, accent = 'slate' }: StatCardProps) {
  return (
    <div className={`bg-slate-900 border rounded-xl p-4 ${accentMap[accent]}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBgMap[accent]}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {(subValue || trendValue) && (
        <div className="flex items-center gap-2 mt-1">
          {subValue && <p className="text-xs text-slate-500">{subValue}</p>}
          {trendValue && (
            <span className={`text-xs font-medium ${
              trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-slate-400'
            }`}>
              {trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''} {trendValue}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

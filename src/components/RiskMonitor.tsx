import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle,
  TrendingDown, Lock, Unlock, CircleDot, Info
} from 'lucide-react';
import { useRiskEvents, useStrategies, useAccountData, useUserSettings } from '../hooks/useSupabaseData';
import { upsertUserSettings } from '../services/tradingService';
import { useAuth } from '../context/AuthContext';
import { useToast } from './ui/Toast';
import type { RiskEvent } from '../types/trading';

function GaugeArc({ pct, color }: { pct: number; color: string }) {
  const clamp = Math.min(Math.max(pct, 0), 100);
  const r = 44;
  const circumference = Math.PI * r;
  const strokeLen = (clamp / 100) * circumference;
  return (
    <svg width="120" height="70" viewBox="0 0 120 70">
      <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />
      <path
        d="M 10 60 A 50 50 0 0 1 110 60"
        fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${strokeLen} ${circumference}`}
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
    </svg>
  );
}

function RiskGauge({ label, value, max, unit, color, icon: Icon }: {
  label: string; value: number; max: number; unit: string;
  color: string; icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const pct = (value / max) * 100;
  const statusColor = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : color;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
      <div className="flex justify-center mb-1">
        <div className="relative">
          <GaugeArc pct={pct} color={statusColor} />
          <div className="absolute inset-0 flex items-end justify-center pb-2">
            <span className="text-lg font-bold tabular-nums" style={{ color: statusColor }}>
              {value.toFixed(2)}{unit}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5">
        <Icon size={14} className="text-slate-500" />
        <p className="text-xs font-medium text-slate-400">{label}</p>
      </div>
      <p className="text-xs text-slate-600 mt-0.5">Limit: {max}{unit}</p>
    </div>
  );
}

function RiskEventRow({ event }: { event: RiskEvent }) {
  const severityMap: Record<RiskEvent['severity'], { icon: React.ComponentType<{ size?: number; className?: string }>; color: string; bg: string }> = {
    INFO: { icon: Info, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    WARNING: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    CRITICAL: { icon: ShieldX, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  };
  const s = severityMap[event.severity];
  const Icon = s.icon;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${s.bg}`}>
      <div className="flex-shrink-0 mt-0.5">
        <Icon size={14} className={s.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={`text-xs font-semibold ${s.color}`}>{event.severity}</span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-500">{event.event_type.replace(/_/g, ' ')}</span>
          {event.strategy_name && (
            <>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-400">{event.strategy_name}</span>
            </>
          )}
        </div>
        <p className="text-xs text-slate-300">{event.message}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-slate-600">{new Date(event.occurred_at).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          {event.action_taken !== 'NONE' && (
            <span className="text-xs font-medium text-amber-400">Action: {event.action_taken.replace(/_/g, ' ')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CircuitBreakerToggle({ label, desc, locked, onToggle }: {
  label: string; desc: string; locked: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
      <div className="flex items-center gap-3">
        {locked ? <Lock size={16} className="text-red-400" /> : <Unlock size={16} className="text-slate-500" />}
        <div>
          <p className="text-sm font-medium text-slate-200">{label}</p>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${locked ? 'bg-red-500' : 'bg-slate-700'}`}
      >
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${locked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

export function RiskMonitor() {
  const { user } = useAuth();
  const { account } = useAccountData();
  const { events, loading: eventsLoading } = useRiskEvents();
  const { strategies } = useStrategies();
  const { settings, loading: settingsLoading } = useUserSettings();
  const { toast } = useToast();

  const [breakers, setBreakers] = useState({
    dailyLossLimit: true,
    maxDrawdown: true,
    spreadFilter: true,
    newsFilter: false,
    overnightHold: false,
  });

  useEffect(() => {
    if (!settings || settingsLoading) return;
    setBreakers({
      dailyLossLimit: (settings.cb_daily_loss_limit as boolean) ?? true,
      maxDrawdown: (settings.cb_max_drawdown as boolean) ?? true,
      spreadFilter: (settings.cb_spread_filter as boolean) ?? true,
      newsFilter: (settings.cb_news_filter as boolean) ?? false,
      overnightHold: (settings.cb_overnight_hold as boolean) ?? false,
    });
  }, [settings, settingsLoading]);

  const toggle = (key: keyof typeof breakers) => {
    const newVal = !breakers[key];
    setBreakers(prev => ({ ...prev, [key]: newVal }));
    if (user) {
      const colMap: Record<keyof typeof breakers, string> = {
        dailyLossLimit: 'cb_daily_loss_limit',
        maxDrawdown: 'cb_max_drawdown',
        spreadFilter: 'cb_spread_filter',
        newsFilter: 'cb_news_filter',
        overnightHold: 'cb_overnight_hold',
      };
      upsertUserSettings(user.id, { [colMap[key]]: newVal }).catch(err => {
        setBreakers(prev => ({ ...prev, [key]: !newVal }));
        toast({
          variant: 'destructive',
          title: 'Could not save circuit breaker',
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      });
    }
  };

  const criticalEvents = events.filter(e => e.severity === 'CRITICAL').length;
  const warningEvents = events.filter(e => e.severity === 'WARNING').length;
  const drawdown = account?.drawdown_pct ?? 0;
  const balance = account?.balance ?? 0;
  const marginUsed = account?.margin_used ?? 0;
  const openPnl = account?.open_pnl ?? 0;
  const dailyPnl = account?.daily_pnl ?? 0;

  const maxDrawdownLimit = parseFloat(String(settings?.max_drawdown_pct ?? 5));
  const maxDailyLossLimit = parseFloat(String(settings?.max_daily_loss_pct ?? 3));
  const spreadFilterPips = parseFloat(String(settings?.spread_filter_pips ?? 2.5));
  const newsFilterMins = parseInt(String(settings?.news_filter_minutes ?? 5));

  const dailyLossUsed = balance > 0 ? Math.max(0, (-dailyPnl / balance) * 100) : 0;
  const marginUsedPct = balance > 0 ? (marginUsed / balance) * 100 : 0;

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RiskGauge label="Drawdown" value={drawdown} max={maxDrawdownLimit} unit="%" color="#10b981" icon={TrendingDown} />
        <RiskGauge label="Margin Used" value={marginUsedPct} max={100} unit="%" color="#0ea5e9" icon={CircleDot} />
        <RiskGauge label="Daily Loss" value={dailyLossUsed} max={maxDailyLossLimit} unit="%" color="#f59e0b" icon={ShieldAlert} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Account Balance', value: `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, sub: 'Available capital', color: 'text-white' },
          { label: 'Margin Used', value: `$${marginUsed.toFixed(2)}`, sub: `${balance > 0 ? ((marginUsed / balance) * 100).toFixed(2) : '0.00'}% of balance`, color: 'text-sky-400' },
          { label: 'Open Risk', value: `$${Math.abs(openPnl).toFixed(2)}`, sub: 'Unrealized exposure', color: openPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Daily P&L Target', value: `$${(balance * 0.01).toFixed(2)}`, sub: `1% of $${balance.toFixed(0)}`, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-600 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200">Circuit Breakers</h2>
          </div>
          <div className="space-y-3">
            <CircuitBreakerToggle
              label={`Daily Loss Limit (-${maxDailyLossLimit}%)`}
              desc={`Halt all trading if daily loss exceeds ${maxDailyLossLimit}%`}
              locked={breakers.dailyLossLimit}
              onToggle={() => toggle('dailyLossLimit')}
            />
            <CircuitBreakerToggle
              label={`Max Drawdown (${maxDrawdownLimit}%)`}
              desc={`Emergency stop if account drawdown hits ${maxDrawdownLimit}%`}
              locked={breakers.maxDrawdown}
              onToggle={() => toggle('maxDrawdown')}
            />
            <CircuitBreakerToggle
              label={`Spread Filter (>${spreadFilterPips} pips)`}
              desc={`Skip entries when spread exceeds ${spreadFilterPips} pips`}
              locked={breakers.spreadFilter}
              onToggle={() => toggle('spreadFilter')}
            />
            <CircuitBreakerToggle
              label="News Event Filter"
              desc={`Pause trading ${newsFilterMins} min before high-impact news`}
              locked={breakers.newsFilter}
              onToggle={() => toggle('newsFilter')}
            />
            <CircuitBreakerToggle
              label="Overnight Hold Block"
              desc="Auto-close all positions before session end"
              locked={breakers.overnightHold}
              onToggle={() => toggle('overnightHold')}
            />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-200">Risk Event Log</h2>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {criticalEvents > 0 && (
                <span className="bg-red-500/15 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-medium">
                  {criticalEvents} Critical
                </span>
              )}
              {warningEvents > 0 && (
                <span className="bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
                  {warningEvents} Warning
                </span>
              )}
            </div>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {eventsLoading ? (
              <p className="text-xs text-slate-600 text-center py-4">Loading events...</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-4">No risk events recorded</p>
            ) : (
              events.map(e => <RiskEventRow key={e.id} event={e} />)
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-4">Strategy Risk Limits</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="text-left py-2 px-3 font-medium">Strategy</th>
                <th className="text-left py-2 px-3 font-medium">Status</th>
                <th className="text-left py-2 px-3 font-medium">Max DD</th>
                <th className="text-left py-2 px-3 font-medium">Lot Size</th>
                <th className="text-left py-2 px-3 font-medium">Max Positions</th>
                <th className="text-left py-2 px-3 font-medium">Total P&L</th>
                <th className="text-left py-2 px-3 font-medium">Risk Score</th>
              </tr>
            </thead>
            <tbody>
              {strategies.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-600 text-sm">No strategies</td></tr>
              ) : strategies.map(s => {
                const riskScore = s.max_drawdown_pct * s.lot_size * 10;
                const riskColor = riskScore > 3 ? 'text-amber-400' : 'text-emerald-400';
                return (
                  <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="py-3 px-3 text-sm font-medium text-slate-200">{s.name}</td>
                    <td className="py-3 px-3">
                      <span className={`text-xs font-medium ${
                        s.status === 'active' ? 'text-emerald-400' :
                        s.status === 'paused' ? 'text-amber-400' : 'text-slate-500'
                      }`}>{s.status}</span>
                    </td>
                    <td className="py-3 px-3 text-sm text-slate-300 tabular-nums">{s.max_drawdown_pct}%</td>
                    <td className="py-3 px-3 text-sm text-slate-300 tabular-nums">{s.lot_size}</td>
                    <td className="py-3 px-3 text-sm text-slate-300 tabular-nums">{s.max_concurrent_trades}</td>
                    <td className={`py-3 px-3 text-sm font-semibold tabular-nums ${s.total_pnl_usd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {s.total_pnl_usd >= 0 ? '+' : ''}${s.total_pnl_usd.toFixed(2)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${riskScore > 3 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(riskScore * 20, 100)}%` }} />
                        </div>
                        <span className={`text-xs font-medium tabular-nums ${riskColor}`}>{riskScore.toFixed(1)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

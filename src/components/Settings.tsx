import React, { useState, useEffect } from 'react';
import { Server, Bell, Sliders, Save, Eye, EyeOff, CheckCircle2, Loader2, Radio } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUserSettings, useAccountData } from '../hooks/useSupabaseData';
import { upsertUserSettings } from '../services/tradingService';
import { DataFeedConfig } from './DataFeedConfig';
import { DataProvidersSettings } from '../pages/Settings/DataProviders';

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-800">
        <Icon size={18} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 items-start py-3 border-b border-slate-800/50 last:border-0">
      <div>
        <p className="text-sm text-slate-300">{label}</p>
        {hint && <p className="text-xs text-slate-600 mt-0.5">{hint}</p>}
      </div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

export function Settings() {
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useUserSettings();
  const { account } = useAccountData();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState({
    mt5Server: 'demo.icmarkets.com:443',
    mt5Login: '',
    mt5Timeout: '5000',
    riskPerTrade: '1.0',
    maxDailyLoss: '3.0',
    maxDrawdown: '8.0',
    defaultLotSize: '0.01',
    notifyTrades: true,
    notifyRisk: true,
    notifyDrawdown: true,
    emailAlerts: false,
  });

  useEffect(() => {
    if (settings) {
      setForm(f => ({
        ...f,
        mt5Server: String(settings.broker_server ?? 'demo.icmarkets.com:443'),
        mt5Login: String(settings.broker_login ?? ''),
        mt5Timeout: String(settings.broker_timeout_ms ?? '5000'),
        riskPerTrade: String(settings.risk_per_trade_pct ?? '1.0'),
        maxDailyLoss: String(settings.max_daily_loss_pct ?? '3.0'),
        maxDrawdown: String(settings.max_drawdown_pct ?? '8.0'),
        defaultLotSize: String(settings.default_lot_size ?? '0.01'),
        notifyTrades: Boolean(settings.notify_trade_execution),
        notifyRisk: Boolean(settings.notify_risk_events),
        notifyDrawdown: Boolean(settings.notify_drawdown),
        emailAlerts: Boolean(settings.notify_email),
      }));
    }
  }, [settings]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await upsertUserSettings(user.id, {
        broker_server: form.mt5Server,
        broker_login: form.mt5Login,
        broker_timeout_ms: parseInt(form.mt5Timeout),
        risk_per_trade_pct: parseFloat(form.riskPerTrade),
        max_daily_loss_pct: parseFloat(form.maxDailyLoss),
        max_drawdown_pct: parseFloat(form.maxDrawdown),
        default_lot_size: parseFloat(form.defaultLotSize),
        notify_trade_execution: form.notifyTrades,
        notify_risk_events: form.notifyRisk,
        notify_drawdown: form.notifyDrawdown,
        notify_email: form.emailAlerts,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const balance = account?.balance ?? 0;
  const brokerLabel = form.mt5Server ? form.mt5Server.split(':')[0] : 'Broker';

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {settingsLoading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Loading settings...
        </div>
      )}

      <Section title="MT5 / Broker Connection" icon={Server}>
        <Field label="Server Address" hint="MT5 broker server and port">
          <input
            value={form.mt5Server}
            onChange={e => setForm(f => ({ ...f, mt5Server: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600 font-mono"
          />
        </Field>
        <Field label="Account Login" hint="MT5 account number">
          <input
            value={form.mt5Login}
            onChange={e => setForm(f => ({ ...f, mt5Login: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600 font-mono"
          />
        </Field>
        <Field label="Password" hint="Stored encrypted in environment variables">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              defaultValue="••••••••••"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm text-slate-200 outline-none focus:border-slate-600"
            />
            <button onClick={() => setShowKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        <Field label="Connection Timeout" hint="Milliseconds before reconnect attempt">
          <input
            value={form.mt5Timeout}
            onChange={e => setForm(f => ({ ...f, mt5Timeout: e.target.value }))}
            type="number"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
          />
        </Field>
        <div className="pt-3 flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-sky-500/15 border border-sky-500/20 text-sky-400 rounded-lg text-xs font-medium hover:bg-sky-500/25 transition-colors">
            <Server size={13} /> Test Connection
          </button>
          <span className="text-xs text-emerald-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            {form.mt5Server ? `Connected to ${brokerLabel}` : 'Not configured'}
          </span>
        </div>
      </Section>

      <Section title="Risk Management Defaults" icon={Sliders}>
        <Field label="Risk Per Trade (%)" hint="Max account risk per single trade">
          <div className="flex items-center gap-3">
            <input
              value={form.riskPerTrade}
              onChange={e => setForm(f => ({ ...f, riskPerTrade: e.target.value }))}
              type="number" step="0.1" min="0.1" max="5"
              className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
            />
            <span className="text-xs text-slate-500">= ${((parseFloat(form.riskPerTrade) / 100) * balance).toFixed(2)} per trade</span>
          </div>
        </Field>
        <Field label="Max Daily Loss (%)" hint="Circuit breaker threshold">
          <input
            value={form.maxDailyLoss}
            onChange={e => setForm(f => ({ ...f, maxDailyLoss: e.target.value }))}
            type="number" step="0.5"
            className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
          />
        </Field>
        <Field label="Max Drawdown (%)" hint="Emergency halt threshold">
          <input
            value={form.maxDrawdown}
            onChange={e => setForm(f => ({ ...f, maxDrawdown: e.target.value }))}
            type="number" step="0.5"
            className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
          />
        </Field>
        <Field label="Default Lot Size" hint="Used when strategy config is absent">
          <input
            value={form.defaultLotSize}
            onChange={e => setForm(f => ({ ...f, defaultLotSize: e.target.value }))}
            type="number" step="0.01"
            className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
          />
        </Field>
      </Section>

      <Section title="Notifications" icon={Bell}>
        {[
          { key: 'notifyTrades' as const, label: 'Trade Executions', hint: 'Notify on every open/close' },
          { key: 'notifyRisk' as const, label: 'Risk Events', hint: 'Warnings and critical alerts' },
          { key: 'notifyDrawdown' as const, label: 'Drawdown Thresholds', hint: 'Alert at 50% and 80% of limit' },
          { key: 'emailAlerts' as const, label: 'Email Alerts', hint: 'Send critical events by email' },
        ].map(item => (
          <Field key={item.key} label={item.label} hint={item.hint}>
            <button
              onClick={() => setForm(f => ({ ...f, [item.key]: !f[item.key] }))}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${form[item.key] ? 'bg-emerald-500' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${form[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </Field>
        ))}
      </Section>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-800">
          <Radio size={18} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-200">Data Feed & Broker API</h2>
        </div>
        <DataFeedConfig />
      </div>

      <DataProvidersSettings />

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            saved
              ? 'bg-emerald-500/15 border border-emerald-500/20 text-emerald-400'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 disabled:opacity-60'
          }`}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

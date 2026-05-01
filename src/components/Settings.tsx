import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Globe, Server, Terminal, Database, Bell, Sliders, Radio,
  Save, Loader2, CheckCircle2, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUserSettings, useAccountData } from '../hooks/useSupabaseData';
import { upsertUserSettings } from '../services/tradingService';
import { DataFeedConfig } from './DataFeedConfig';
import { DataProvidersSettings } from '../pages/Settings/DataProviders';

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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

const ENV_CATEGORIES = [
  {
    label: 'Supabase',
    vars: [{ name: 'SUPABASE_SERVICE_ROLE_KEY', note: '⚠ Server-side only — bypasses RLS' }],
  },
  {
    label: 'Broker',
    vars: [
      { name: 'OANDA_ACCOUNT_ID', note: 'Python agent access' },
      { name: 'OANDA_API_TOKEN', note: 'Python agent access' },
      { name: 'OANDA_ACCOUNT_TYPE', note: 'practice | live' },
    ],
  },
  {
    label: 'Signal mode',
    vars: [
      { name: 'SIGNAL_MODE', note: 'rules | agent' },
      { name: 'USE_LANGGRAPH', note: '0 | 1' },
    ],
  },
  {
    label: 'Agent tuning',
    vars: [
      { name: 'AGENT_TIMEOUT_MS_PER_CALL', note: 'Per-agent deadline (ms)' },
      { name: 'AGENT_BUDGET_MS', note: 'Total gather cycle budget (ms)' },
    ],
  },
  {
    label: 'Vector memory',
    vars: [
      { name: 'USE_PGVECTOR', note: '0 | 1 — disable if not installed' },
      { name: 'MEMORY_TOP_K', note: 'Similar past decisions to retrieve' },
    ],
  },
  {
    label: 'LLM',
    vars: [{ name: 'OPENAI_API_KEY', note: 'GPT-4o-mini + embeddings' }],
  },
  {
    label: 'News',
    vars: [
      { name: 'NEWS_API_KEY', note: 'newsapi.org (priority 1)' },
      { name: 'FINNHUB_API_KEY', note: 'finnhub.io (priority 2)' },
      { name: 'ALPHA_VANTAGE_API_KEY', note: 'alphavantage.co (priority 3)' },
    ],
  },
  {
    label: 'Macro',
    vars: [{ name: 'FRED_API_KEY', note: 'Federal Reserve data' }],
  },
  {
    label: 'Sentiment',
    vars: [
      { name: 'SENTIMENT_API_KEY', note: 'Finnhub sentiment endpoint' },
      { name: 'TWITTER_BEARER_TOKEN', note: 'Twitter v2 API recent search' },
    ],
  },
  {
    label: 'CrewAI',
    vars: [{ name: 'USE_CREWAI_KICKOFF', note: 'Optional, expensive — 0 | 1' }],
  },
];

export function Settings() {
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useUserSettings();
  const { account } = useAccountData();

  const [savingRisk, setSavingRisk] = useState(false);
  const [savedRisk, setSavedRisk] = useState(false);
  const [savingNotify, setSavingNotify] = useState(false);
  const [savedNotify, setSavedNotify] = useState(false);

  const [form, setForm] = useState({
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

  async function handleSaveRisk() {
    if (!user) return;
    setSavingRisk(true);
    try {
      await upsertUserSettings(user.id, {
        risk_per_trade_pct: parseFloat(form.riskPerTrade),
        max_daily_loss_pct: parseFloat(form.maxDailyLoss),
        max_drawdown_pct: parseFloat(form.maxDrawdown),
        default_lot_size: parseFloat(form.defaultLotSize),
      });
      setSavedRisk(true);
      setTimeout(() => setSavedRisk(false), 2000);
    } finally {
      setSavingRisk(false);
    }
  }

  async function handleSaveNotify() {
    if (!user) return;
    setSavingNotify(true);
    try {
      await upsertUserSettings(user.id, {
        notify_trade_execution: form.notifyTrades,
        notify_risk_events: form.notifyRisk,
        notify_drawdown: form.notifyDrawdown,
        notify_email: form.emailAlerts,
      });
      setSavedNotify(true);
      setTimeout(() => setSavedNotify(false), 2000);
    } finally {
      setSavingNotify(false);
    }
  }

  const balance = account?.balance ?? 0;

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {settingsLoading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Loading settings...
        </div>
      )}

      {/* ── Dashboard / Browser group header ── */}
      <div className="flex items-center gap-3 pt-1">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/12">
          <Globe size={15} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">Dashboard / Browser</p>
          <p className="text-xs text-slate-500">Keys used by the frontend — stored in Supabase, never in localStorage</p>
        </div>
      </div>

      <Section title="Risk Management" icon={Sliders}>
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
        <div className="flex justify-end pt-4 border-t border-slate-800/50">
          <button
            onClick={handleSaveRisk}
            disabled={savingRisk}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              savedRisk
                ? 'bg-emerald-500/15 border border-emerald-500/20 text-emerald-400'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 disabled:opacity-70'
            }`}
          >
            {savingRisk ? <Loader2 size={16} className="animate-spin" /> : savedRisk ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {savingRisk ? 'Saving…' : savedRisk ? 'Saved' : 'Save Risk Limits'}
          </button>
        </div>
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
              role="switch"
              aria-checked={form[item.key]}
              aria-label={item.label}
              onClick={() => setForm(f => ({ ...f, [item.key]: !f[item.key] }))}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${form[item.key] ? 'bg-emerald-500' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${form[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </Field>
        ))}
        <div className="flex justify-end pt-4 border-t border-slate-800/50">
          <button
            onClick={handleSaveNotify}
            disabled={savingNotify}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              savedNotify
                ? 'bg-emerald-500/15 border border-emerald-500/20 text-emerald-400'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 disabled:opacity-70'
            }`}
          >
            {savingNotify ? <Loader2 size={16} className="animate-spin" /> : savedNotify ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {savingNotify ? 'Saving…' : savedNotify ? 'Saved' : 'Save Notifications'}
          </button>
        </div>
      </Section>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-800">
          <Radio size={18} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-200">Data Feed & Broker API</h2>
        </div>
        <DataFeedConfig />
      </div>

      <Section title="Backtest Data Providers" icon={Database}>
        <DataProvidersSettings />
      </Section>

      {/* ── Python Agents group header ── */}
      <div className="flex items-center gap-3 pt-1">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-sky-500/12">
          <Server size={15} className="text-sky-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">Python Agents <span className="text-slate-500 font-normal">(trading_system/.env)</span></p>
          <p className="text-xs text-slate-500">Configure in your .env file — these keys never reach the browser</p>
        </div>
      </div>

      <Section title="trading_system/.env Variables" icon={Terminal}>
        {/* SERVICE_ROLE_KEY warning */}
        <div className="flex items-start gap-2 p-4 rounded-lg bg-red-500/8 border border-red-500/20 mb-4">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-300 mb-1">
              SUPABASE_SERVICE_ROLE_KEY must never reach the browser
            </p>
            <p className="text-xs text-red-400/80 leading-relaxed">
              This key bypasses Row-Level Security. Place it only in{' '}
              <code className="font-mono text-red-300">trading_system/.env</code>
              {' '}and never in any <code className="font-mono text-red-300">VITE_*</code>{' '}
              variable or the browser bundle.
            </p>
          </div>
        </div>

        {/* Key list by category */}
        <div className="space-y-1">
          {ENV_CATEGORIES.map(cat => (
            <div key={cat.label}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-3 pb-1">{cat.label}</p>
              {cat.vars.map(v => (
                <div key={v.name} className="flex items-start gap-3 py-2 border-b border-slate-800/40 last:border-0">
                  <code className="text-xs font-mono text-slate-300 shrink-0 w-64">{v.name}</code>
                  <p className="text-xs text-slate-500">{v.note}</p>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* .env.example link */}
        <div className="flex items-center gap-2 pt-3 mt-2 border-t border-slate-800/50">
          <ExternalLink size={12} className="text-slate-500" />
          <a
            href="trading_system/.env.example"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-sky-400 transition-colors"
          >
            View trading_system/.env.example for the full template
          </a>
        </div>
      </Section>
    </div>
  );
}

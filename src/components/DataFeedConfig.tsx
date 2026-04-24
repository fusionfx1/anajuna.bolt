import React, { useState, useEffect } from 'react';
import {
  Wifi, WifiOff, Zap, AlertCircle, CheckCircle2, Settings2,
  Eye, EyeOff, Loader2, Radio, ChevronDown
} from 'lucide-react';
import type { DataFeedConfig, DataProvider, BrokerProvider, ConnectionStats } from '../types/dataFeed';
import { dataFeedService } from '../services/dataFeedService';
import { brokerService } from '../services/brokerService';
import { oandaService } from '../services/oandaService';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { FOREX_SYMBOLS } from '../lib/constants';

const PROVIDER_INFO: Record<DataProvider, { label: string; description: string; cost: string }> = {
  polygon: {
    label: 'Polygon.io',
    description: 'Real-time forex & stocks. Recommended for production.',
    cost: 'From $29/mo',
  },
  alpaca: {
    label: 'Alpaca Markets',
    description: 'Free streaming for US equities. Paper trading included.',
    cost: 'Free tier available',
  },
  simulation: {
    label: 'Simulation Mode',
    description: 'Realistic price simulation. No API key required.',
    cost: 'Free',
  },
};

const BROKER_INFO: Record<Exclude<BrokerProvider, 'paper'>, { label: string; description: string; docsUrl: string }> = {
  alpaca: {
    label: 'Alpaca Markets',
    description: 'US equities & crypto. Paper and live trading.',
    docsUrl: 'https://alpaca.markets/docs/trading',
  },
  oanda: {
    label: 'OANDA',
    description: 'Forex & CFDs. Practice and live accounts.',
    docsUrl: 'https://developer.oanda.com/rest-live-v20/introduction',
  },
};

const FX_SYMBOLS = FOREX_SYMBOLS.slice(0, 8);

interface StatusBadgeProps {
  stats: ConnectionStats;
}

function StatusBadge({ stats }: StatusBadgeProps) {
  const map: Record<string, { color: string; bg: string; label: string; pulse: boolean }> = {
    connected: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Connected', pulse: true },
    connecting: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Connecting…', pulse: true },
    reconnecting: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Reconnecting…', pulse: true },
    disconnected: { color: 'text-slate-400', bg: 'bg-slate-700/50 border-slate-700', label: 'Disconnected', pulse: false },
    error: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Error', pulse: false },
  };
  const s = map[stats.status] ?? map.disconnected;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${s.pulse ? 'animate-pulse' : ''}`} />
      {s.label}
      {stats.ticksReceived > 0 && (
        <span className="text-slate-500 ml-1">{stats.ticksReceived.toLocaleString()} ticks</span>
      )}
    </div>
  );
}

interface SecretInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function SecretInput({ label, value, onChange, placeholder }: SecretInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 pr-10"
        />
        <button
          onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

export function DataFeedConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<DataFeedConfig>({
    provider: 'simulation',
    apiKey: '',
    apiSecret: '',
    symbols: FX_SYMBOLS,
    paperTrading: true,
    brokerProvider: 'paper',
    alpacaKeyId: '',
    alpacaSecretKey: '',
    oandaAccountId: '',
    oandaApiToken: '',
    oandaAccountType: 'practice',
  });
  const [stats, setStats] = useState<ConnectionStats>(() => dataFeedService.getStats());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [activeSection, setActiveSection] = useState<'feed' | 'broker' | 'symbols'>('feed');
  const [activeBroker, setActiveBroker] = useState<'alpaca' | 'oanda'>('alpaca');

  useEffect(() => {
    const unsub = dataFeedService.onStatus(setStats);
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('data_feed_configs')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfig({
            provider: data.provider as DataProvider,
            apiKey: data.api_key ?? '',
            apiSecret: data.api_secret ?? '',
            symbols: data.symbols ?? FX_SYMBOLS,
            paperTrading: data.paper_trading ?? true,
            brokerProvider: (data.broker_provider as BrokerProvider) ?? 'paper',
            alpacaKeyId: data.alpaca_key_id ?? '',
            alpacaSecretKey: data.alpaca_secret_key ?? '',
            oandaAccountId: data.oanda_account_id ?? '',
            oandaApiToken: data.oanda_api_token ?? '',
            oandaAccountType: (data.oanda_account_type as 'practice' | 'live') ?? 'practice',
          });
          if (data.broker_provider === 'oanda') setActiveBroker('oanda');
        }
      });
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await supabase.from('data_feed_configs').upsert({
        user_id: user.id,
        provider: config.provider,
        api_key: config.apiKey,
        api_secret: config.apiSecret ?? '',
        symbols: config.symbols,
        paper_trading: config.paperTrading,
        broker_provider: config.brokerProvider,
        alpaca_key_id: config.alpacaKeyId ?? '',
        alpaca_secret_key: config.alpacaSecretKey ?? '',
        oanda_account_id: config.oandaAccountId ?? '',
        oanda_api_token: config.oandaApiToken ?? '',
        oanda_account_type: config.oandaAccountType ?? 'practice',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = () => {
    setConnecting(true);
    setTestResult(null);
    dataFeedService.connect(config);

    if (config.brokerProvider === 'oanda') {
      oandaService.configure({
        accountId: config.oandaAccountId ?? '',
        apiToken: config.oandaApiToken ?? '',
        accountType: config.oandaAccountType ?? 'practice',
      });
    } else {
      brokerService.configure({
        provider: config.brokerProvider === 'paper' ? 'alpaca' : config.brokerProvider,
        keyId: config.alpacaKeyId ?? '',
        secretKey: config.alpacaSecretKey ?? '',
        paperTrading: config.paperTrading,
      });
    }

    setTimeout(() => {
      setConnecting(false);
      const s = dataFeedService.getStats();
      setTestResult({
        ok: s.status === 'connected',
        msg: s.status === 'connected'
          ? `Connected via ${PROVIDER_INFO[s.provider].label}`
          : s.errorMessage ?? 'Connection failed',
      });
    }, 2500);
  };

  const handleDisconnect = () => {
    dataFeedService.disconnect();
    setTestResult(null);
  };

  const toggleSymbol = (sym: string) => {
    setConfig(prev => ({
      ...prev,
      symbols: prev.symbols.includes(sym)
        ? prev.symbols.filter(s => s !== sym)
        : [...prev.symbols, sym],
    }));
  };

  const isConnected = stats.status === 'connected';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Data Feed & Broker</h2>
          <p className="text-sm text-slate-400 mt-0.5">Configure real-time market data and trade execution</p>
        </div>
        <StatusBadge stats={stats} />
      </div>

      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg w-fit">
        {(['feed', 'broker', 'symbols'] as const).map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              activeSection === s
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s === 'feed' ? 'Data Feed' : s === 'broker' ? 'Broker API' : 'Symbols'}
          </button>
        ))}
      </div>

      {activeSection === 'feed' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(PROVIDER_INFO) as DataProvider[]).map(p => {
              const info = PROVIDER_INFO[p];
              const selected = config.provider === p;
              return (
                <button
                  key={p}
                  onClick={() => setConfig(prev => ({ ...prev, provider: p }))}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    selected
                      ? 'border-emerald-500/40 bg-emerald-500/8 ring-1 ring-emerald-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selected ? 'bg-emerald-500/15' : 'bg-slate-700'}`}>
                      <Radio size={15} className={selected ? 'text-emerald-400' : 'text-slate-400'} />
                    </div>
                    {selected && <CheckCircle2 size={14} className="text-emerald-400 mt-0.5" />}
                  </div>
                  <p className="font-medium text-sm text-white mb-0.5">{info.label}</p>
                  <p className="text-xs text-slate-400 mb-1 leading-relaxed">{info.description}</p>
                  <p className="text-xs font-medium text-emerald-400">{info.cost}</p>
                </button>
              );
            })}
          </div>

          {config.provider !== 'simulation' && (
            <div className="space-y-3">
              <SecretInput
                label={config.provider === 'polygon' ? 'Polygon API Key' : 'Alpaca Data Key'}
                value={config.apiKey}
                onChange={v => setConfig(prev => ({ ...prev, apiKey: v }))}
                placeholder="Enter your API key"
              />
              {config.provider === 'alpaca' && (
                <SecretInput
                  label="Alpaca Data Secret"
                  value={config.apiSecret ?? ''}
                  onChange={v => setConfig(prev => ({ ...prev, apiSecret: v }))}
                  placeholder="Enter secret key"
                />
              )}
            </div>
          )}

          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
              testResult.ok
                ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/8 border-red-500/20 text-red-400'
            }`}>
              {testResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {testResult.msg}
            </div>
          )}
        </div>
      )}

      {activeSection === 'broker' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(BROKER_INFO) as Array<'alpaca' | 'oanda'>).map(b => {
              const info = BROKER_INFO[b];
              const selected = activeBroker === b;
              return (
                <button
                  key={b}
                  onClick={() => {
                    setActiveBroker(b);
                    setConfig(prev => ({ ...prev, brokerProvider: b }));
                  }}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    selected
                      ? 'border-sky-500/40 bg-sky-500/8 ring-1 ring-sky-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selected ? 'bg-sky-500/15' : 'bg-slate-700'}`}>
                      <Radio size={15} className={selected ? 'text-sky-400' : 'text-slate-400'} />
                    </div>
                    {selected && <CheckCircle2 size={14} className="text-sky-400 mt-0.5" />}
                  </div>
                  <p className="font-medium text-sm text-white mb-0.5">{info.label}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{info.description}</p>
                </button>
              );
            })}
          </div>

          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${config.paperTrading ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span className="text-sm font-medium text-white">
                {config.paperTrading ? 'Paper / Practice Mode' : 'Live Trading Mode'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {config.paperTrading
                ? 'Orders are simulated. No real money at risk. Recommended for testing.'
                : 'Live trading is active. Real orders will be submitted to your broker.'}
            </p>
            <button
              onClick={() => setConfig(prev => ({ ...prev, paperTrading: !prev.paperTrading }))}
              className={`mt-3 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                config.paperTrading
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
                  : 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15'
              }`}
            >
              Switch to {config.paperTrading ? 'Live' : 'Paper / Practice'} Trading
            </button>
          </div>

          {activeBroker === 'alpaca' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                  Alpaca API Key (Broker)
                </label>
                <input
                  type="text"
                  value={config.alpacaKeyId ?? ''}
                  onChange={e => setConfig(prev => ({ ...prev, alpacaKeyId: e.target.value }))}
                  placeholder="APCA-API-KEY-ID"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <SecretInput
                label="Alpaca Secret Key (Broker)"
                value={config.alpacaSecretKey ?? ''}
                onChange={v => setConfig(prev => ({ ...prev, alpacaSecretKey: v }))}
                placeholder="APCA-API-SECRET-KEY"
              />
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <p className="text-xs font-medium text-slate-300 mb-1">PDT Rule Reminder</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  US accounts under $25,000 are limited to 3 round-trip day trades per 5 business days on margin accounts.
                </p>
              </div>
            </div>
          )}

          {activeBroker === 'oanda' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                  Account Type
                </label>
                <div className="flex gap-2">
                  {(['practice', 'live'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setConfig(prev => ({ ...prev, oandaAccountType: t }))}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all capitalize ${
                        config.oandaAccountType === t
                          ? t === 'live'
                            ? 'border-red-500/40 bg-red-500/10 text-red-400'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                          : 'border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {t === 'practice' ? 'Practice' : 'Live'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                  Account ID
                </label>
                <input
                  type="text"
                  value={config.oandaAccountId ?? ''}
                  onChange={e => setConfig(prev => ({ ...prev, oandaAccountId: e.target.value }))}
                  placeholder="e.g. 001-001-1234567-001"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 font-mono"
                />
              </div>
              <SecretInput
                label="API Token"
                value={config.oandaApiToken ?? ''}
                onChange={v => setConfig(prev => ({ ...prev, oandaApiToken: v }))}
                placeholder="OANDA Personal Access Token"
              />
              <div className="p-3 rounded-lg bg-sky-500/8 border border-sky-500/20">
                <p className="text-xs font-medium text-sky-300 mb-1">How to get your OANDA token</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Login to OANDA fxTrade → My Account → Manage API Access → Generate Personal Access Token.
                  Use practice credentials for the Practice environment.
                </p>
              </div>
              {config.oandaAccountType === 'live' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/8 border border-red-500/20">
                  <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-300 leading-relaxed">
                    Live account selected. Real money is at risk. Ensure risk limits are configured before connecting.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSection === 'symbols' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Select instruments to subscribe to. Only selected symbols receive live ticks.</p>
          <div className="grid grid-cols-4 gap-2">
            {FX_SYMBOLS.map(sym => {
              const active = config.symbols.includes(sym);
              return (
                <button
                  key={sym}
                  onClick={() => toggleSymbol(sym)}
                  className={`py-2.5 px-3 rounded-lg text-sm font-mono font-medium transition-all border ${
                    active
                      ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {sym}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">{config.symbols.length} of {FX_SYMBOLS.length} symbols selected</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Settings2 size={14} />}
          {saved ? 'Saved!' : 'Save Config'}
        </button>

        {isConnected ? (
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-medium rounded-lg transition-colors"
          >
            <WifiOff size={14} />
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-sm font-bold rounded-lg transition-colors disabled:opacity-70"
          >
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {connecting ? 'Connecting…' : 'Connect Feed'}
          </button>
        )}

        {isConnected && (
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span>Ticks: <span className="text-slate-300">{stats.ticksReceived.toLocaleString()}</span></span>
            {stats.reconnectCount > 0 && (
              <span>Reconnects: <span className="text-amber-400">{stats.reconnectCount}</span></span>
            )}
            {stats.latencyMs !== undefined && (
              <span>Latency: <span className="text-slate-300">{stats.latencyMs}ms</span></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

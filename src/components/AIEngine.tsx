import { useState } from 'react';
import {
  Brain, Plus, Trash2, Play, Square, CheckCircle2,
  AlertCircle, Zap, Clock, Activity, Cpu, RefreshCw,
  TrendingUp, TrendingDown, Minus, Shield, Loader2
} from 'lucide-react';
import { useAIProviders, useAIPredictions, useAIEngine } from '../hooks/useAIEngine';
import { createAIProvider, deleteAIProvider, updateAIProvider } from '../services/aiProviderService';
import { AIProviderModal } from './ai/AIProviderModal';
import { AISignalPanel } from './ai/AISignalPanel';
import { useAuth } from '../context/AuthContext';
import type { AIProviderConfig } from '../types/aiProvider';
import { ROLE_LABELS } from '../types/aiProvider';
import { INITIAL_MARKET_PRICES, FOREX_SYMBOLS } from '../lib/constants';

function ProviderCard({
  provider,
  onDelete,
  onToggle,
  onTest,
}: {
  provider: AIProviderConfig;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onTest: (id: string) => Promise<{ ok: boolean; latency_ms: number; message: string }>;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number; message: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const providerColors: Record<string, string> = {
    openai: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    anthropic: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    gemini: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    custom: 'text-slate-400 bg-slate-700 border-slate-600',
  };

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(provider.id);
      setTestResult(result);
      setTimeout(() => setTestResult(null), 5000);
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try { await onDelete(provider.id); } finally { setDeleting(false); }
  }

  return (
    <div className={`bg-slate-900 border rounded-xl p-5 transition-all ${
      provider.is_active ? 'border-emerald-500/20' : 'border-slate-800'
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${providerColors[provider.provider] ?? providerColors.custom}`}>
              {provider.provider.charAt(0).toUpperCase() + provider.provider.slice(1)}
            </span>
            <span className="text-sm font-semibold text-white font-mono">{provider.model_name}</span>
          </div>
          <p className="text-xs text-slate-600 font-mono truncate">{provider.api_endpoint}</p>
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${provider.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700'}`} />
          <span className={`text-xs ${provider.is_active ? 'text-emerald-400' : 'text-slate-600'}`}>
            {provider.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {provider.roles.map(role => (
          <span key={role} className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md">
            {ROLE_LABELS[role]}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-slate-600 mb-0.5">Temp</p>
          <p className="text-sm font-mono text-slate-300">{provider.temperature}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-slate-600 mb-0.5">Tokens</p>
          <p className="text-sm font-mono text-slate-300">{provider.max_tokens}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-slate-600 mb-0.5">Key</p>
          <p className="text-sm font-mono text-slate-300 truncate">{provider.api_key_masked}</p>
        </div>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 mb-3 ${
          testResult.ok
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {testResult.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {testResult.ok ? `Connected in ${testResult.latency_ms}ms` : testResult.message}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-lg text-xs font-medium hover:bg-sky-500/20 transition-colors disabled:opacity-50"
        >
          {testing ? <Loader2 size={11} className="animate-spin" /> : <Activity size={11} />}
          Test
        </button>
        <button
          onClick={() => onToggle(provider.id, !provider.is_active)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            provider.is_active
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
          }`}
        >
          {provider.is_active ? <Square size={11} /> : <Play size={11} />}
          {provider.is_active ? 'Disable' : 'Enable'}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          Remove
        </button>
      </div>
    </div>
  );
}

function EngineStatusBar({
  isRunning,
  signalCount,
  errorCount,
  avgLatencyMs,
  activeProvider,
  onStart,
  onStop,
}: {
  isRunning: boolean;
  signalCount: number;
  errorCount: number;
  avgLatencyMs: number;
  activeProvider: AIProviderConfig | null;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className={`rounded-xl border p-5 transition-all ${
      isRunning
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : 'bg-slate-900 border-slate-800'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isRunning ? 'bg-emerald-500/20' : 'bg-slate-800'
          }`}>
            <Brain size={20} className={isRunning ? 'text-emerald-400' : 'text-slate-500'} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">AI Signal Engine</h3>
            <p className="text-xs text-slate-500">
              {isRunning
                ? `Running • ${activeProvider?.model_name ?? 'unknown model'}`
                : activeProvider
                  ? `Ready • ${activeProvider.model_name}`
                  : 'No active provider configured'}
            </p>
          </div>
        </div>
        {activeProvider ? (
          <button
            onClick={isRunning ? onStop : onStart}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              isRunning
                ? 'bg-red-500/15 border border-red-500/20 text-red-400 hover:bg-red-500/25'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
            }`}
          >
            {isRunning ? <><Square size={14} /> Stop Engine</> : <><Play size={14} /> Start Engine</>}
          </button>
        ) : (
          <span className="text-xs text-slate-600 flex items-center gap-1.5">
            <AlertCircle size={12} />
            Add a provider first
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Signals Generated', value: signalCount.toLocaleString(), icon: Zap, color: isRunning ? 'text-emerald-400' : 'text-slate-500' },
          { label: 'Errors', value: String(errorCount), icon: AlertCircle, color: errorCount > 0 ? 'text-red-400' : 'text-slate-500' },
          { label: 'Avg Latency', value: avgLatencyMs > 0 ? `${avgLatencyMs}ms` : '--', icon: Clock, color: 'text-sky-400' },
          { label: 'Provider', value: activeProvider?.provider ?? 'none', icon: Cpu, color: 'text-slate-400' },
        ].map(m => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="bg-slate-800/50 rounded-lg p-3 text-center">
              <Icon size={16} className={`${m.color} mx-auto mb-1`} />
              <p className={`text-sm font-bold tabular-nums ${m.color}`}>{m.value}</p>
              <p className="text-xs text-slate-600 mt-0.5">{m.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ManualSignalTester({ providers }: { providers: AIProviderConfig[] }) {
  const [symbol, setSymbol] = useState('EURUSD');
  const [providerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    signal: string; confidence: number; reasoning: string; key_factors: string[]; latency_ms: number
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { requestSignal } = useAIEngine();

  const activeProviders = providers.filter(p => p.is_active);

  async function handleTest() {
    if (!providerId && activeProviders.length === 0) {
      setError('No active providers available.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const basePrice = INITIAL_MARKET_PRICES[symbol] ?? 1.0;
      const isJpy = symbol.includes('JPY') || symbol === 'XAUUSD';
      const pip = isJpy ? 0.001 : 0.00001;
      const atr = basePrice * 0.0005;
      const candles = Array.from({ length: 20 }, (_, i) => {
        const t = i / 20;
        const trend = Math.sin(t * Math.PI) * atr * 3;
        const noise = ((i * 17 + 31) % 7 - 3) * pip * 2;
        const close = basePrice + trend + noise;
        const range = atr * (0.5 + (i % 3) * 0.2);
        return {
          timestamp: Date.now() - (19 - i) * 3600000,
          open: parseFloat((close - range * 0.3).toFixed(isJpy ? 3 : 5)),
          high: parseFloat((close + range * 0.6).toFixed(isJpy ? 3 : 5)),
          low: parseFloat((close - range * 0.6).toFixed(isJpy ? 3 : 5)),
          close: parseFloat(close.toFixed(isJpy ? 3 : 5)),
          volume: 1000 + (i * 137 % 4000),
        };
      });
      const closes = candles.map(c => c.close);
      const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
      const emaFast = closes.slice(-8).reduce((a, b) => a + b, 0) / 8;
      const emaSlow = closes.slice(-21).length >= 21
        ? closes.slice(-21).reduce((a, b) => a + b, 0) / 21
        : avgClose;
      const gains = closes.slice(1).map((c, i) => Math.max(0, c - closes[i]));
      const losses = closes.slice(1).map((c, i) => Math.max(0, closes[i] - c));
      const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
      const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
      const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
      const rsi = 100 - (100 / (1 + rs));

      const response = await requestSignal({
        symbol,
        timeframe: 'H1',
        candles,
        indicators: {
          rsi_14: parseFloat(rsi.toFixed(2)),
          ema_fast: parseFloat(emaFast.toFixed(isJpy ? 3 : 5)),
          ema_slow: parseFloat(emaSlow.toFixed(isJpy ? 3 : 5)),
          macd: parseFloat((emaFast - emaSlow).toFixed(isJpy ? 4 : 6)),
          macd_signal: parseFloat(((emaFast - emaSlow) * 0.9).toFixed(isJpy ? 4 : 6)),
          atr_14: parseFloat(atr.toFixed(isJpy ? 4 : 6)),
        },
        strategy_context: 'EMA crossover mean reversion system',
      });

      if (response) {
        setResult(response);
      } else {
        setError('No response from AI engine. Ensure a provider is active.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setLoading(false);
    }
  }

  const signalIcon = result?.signal === 'BUY' ? TrendingUp : result?.signal === 'SELL' ? TrendingDown : Minus;
  const signalColor = result?.signal === 'BUY' ? 'text-emerald-400' : result?.signal === 'SELL' ? 'text-red-400' : 'text-slate-400';
  const SignalIcon = signalIcon;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
        <RefreshCw size={15} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-200">Manual Signal Test</h3>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1.5">Symbol</label>
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-600 transition-colors"
          >
            {FOREX_SYMBOLS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleTest}
          disabled={loading || activeProviders.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-sky-500/15 border border-sky-500/20 text-sky-400 rounded-lg text-sm font-medium hover:bg-sky-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
          {loading ? 'Requesting...' : 'Request Signal'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-xs text-red-400 mb-3">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-lg font-bold ${signalColor}`}>
              <SignalIcon size={20} />
              {result.signal}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-500">Confidence</span>
                <span className={`text-xs font-semibold ${signalColor}`}>{Math.round(result.confidence * 100)}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    result.signal === 'BUY' ? 'bg-emerald-500' : result.signal === 'SELL' ? 'bg-red-500' : 'bg-slate-600'
                  }`}
                  style={{ width: `${result.confidence * 100}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-slate-600 flex items-center gap-1">
              <Clock size={10} />
              {result.latency_ms}ms
            </span>
          </div>

          <div className="bg-slate-800/40 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">Reasoning</p>
            <p className="text-xs text-slate-300 leading-relaxed">{result.reasoning}</p>
          </div>

          {result.key_factors.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Key Factors</p>
              <div className="flex flex-wrap gap-1.5">
                {result.key_factors.map((f, i) => (
                  <span key={i} className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md">{f}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeProviders.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Shield size={12} />
          Enable at least one provider to test signals
        </div>
      )}
    </div>
  );
}

export function AIEngine() {
  const { user } = useAuth();
  const { providers, loading: providersLoading, setProviders } = useAIProviders();
  const { predictions, loading: predictionsLoading } = useAIPredictions(100);
  const { state, activeProvider, start, stop, testProvider } = useAIEngine();
  const [showAddModal, setShowAddModal] = useState(false);

  async function handleAddProvider(form: Parameters<typeof createAIProvider>[1]) {
    if (!user) return;
    const created = await createAIProvider(user.id, form);
    setProviders(prev => [created, ...prev]);
  }

  async function handleDeleteProvider(id: string) {
    await deleteAIProvider(id);
    setProviders(prev => prev.filter(p => p.id !== id));
  }

  async function handleToggleProvider(id: string, active: boolean) {
    await updateAIProvider(id, { is_active: active });
    setProviders(prev => prev.map(p => p.id === id ? { ...p, is_active: active } : p));
  }

  return (
    <div className="p-6 space-y-5">
      <EngineStatusBar
        isRunning={state.isRunning}
        signalCount={state.signalCount}
        errorCount={state.errorCount}
        avgLatencyMs={state.avgLatencyMs}
        activeProvider={activeProvider}
        onStart={start}
        onStop={stop}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">AI Providers</h3>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus size={13} /> Add Provider
            </button>
          </div>

          {providersLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-600 text-sm gap-2">
              <Loader2 size={16} className="animate-spin" />
              Loading providers...
            </div>
          ) : providers.length === 0 ? (
            <div className="bg-slate-900 border border-dashed border-slate-700 rounded-xl p-8 text-center">
              <Brain size={32} className="text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500 mb-1">No AI providers configured</p>
              <p className="text-xs text-slate-700 mb-4">Add OpenAI, Anthropic, Gemini, or a custom model to power your trading signals</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-sm font-semibold transition-colors"
              >
                <Plus size={14} /> Add First Provider
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map(p => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onDelete={handleDeleteProvider}
                  onToggle={handleToggleProvider}
                  onTest={testProvider}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <ManualSignalTester providers={providers} />
          <AISignalPanel predictions={predictions} loading={predictionsLoading} />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
          <Shield size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-200">How AI Signal Integration Works</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              step: '01',
              title: 'Configure Provider',
              desc: 'Add your AI provider API key (OpenAI, Anthropic, Gemini, or custom OpenAI-compatible endpoint). Keys are proxied securely through Supabase Edge Functions and never stored in plaintext.',
            },
            {
              step: '02',
              title: 'AI Analyzes Market',
              desc: 'OHLCV candlestick data and technical indicators (RSI, MACD, EMA, ATR, Stochastic) are sent to your AI model. The model returns BUY/SELL/HOLD with confidence score and reasoning.',
            },
            {
              step: '03',
              title: 'Signals Drive Strategies',
              desc: 'AI signals are logged to the predictions table and can override or supplement rule-based strategy signals. Risk manager validates each signal before order submission.',
            },
          ].map(item => (
            <div key={item.step} className="flex gap-3">
              <span className="text-2xl font-bold text-slate-800 flex-shrink-0 leading-none">{item.step}</span>
              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-1">{item.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showAddModal && user && (
        <AIProviderModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddProvider}
        />
      )}
    </div>
  );
}

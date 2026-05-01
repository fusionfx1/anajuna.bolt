import { useState } from 'react';
import { X, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { PROVIDER_DEFAULTS, ROLE_LABELS, type AIProviderFormData, type AIProviderType, type AIModelRole } from '../../types/aiProvider';

interface Props {
  onClose: () => void;
  onSave: (form: AIProviderFormData) => Promise<void>;
}

const PROVIDER_LABELS: Record<AIProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  custom: 'Custom Endpoint',
};

const DEFAULT_SYSTEM_PROMPTS: Record<AIProviderType, string> = {
  openai: `You are an expert forex trading signal generator. Analyze the provided OHLCV candlestick data and technical indicators to generate a trading signal.

Respond ONLY with valid JSON in this exact format:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "suggested_sl": number or null,
  "suggested_tp": number or null,
  "key_factors": ["factor1", "factor2"]
}`,
  anthropic: `You are an expert forex trading signal generator. Analyze the provided OHLCV candlestick data and technical indicators to generate a trading signal.

Respond ONLY with valid JSON in this exact format:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "suggested_sl": number or null,
  "suggested_tp": number or null,
  "key_factors": ["factor1", "factor2"]
}`,
  gemini: `You are an expert forex trading signal generator. Analyze the provided OHLCV candlestick data and technical indicators to generate a trading signal.

Respond ONLY with valid JSON in this exact format:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "suggested_sl": number or null,
  "suggested_tp": number or null,
  "key_factors": ["factor1", "factor2"]
}`,
  custom: `You are an expert forex trading signal generator. Analyze the provided market data and generate a JSON trading signal.`,
};

export function AIProviderModal({ onClose, onSave }: Props) {
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<AIProviderFormData>({
    provider: 'openai',
    model_name: PROVIDER_DEFAULTS.openai.defaultModel,
    api_endpoint: PROVIDER_DEFAULTS.openai.endpoint,
    api_key: '',
    roles: ['signal_generation'],
    temperature: 0.2,
    max_tokens: 512,
    system_prompt: DEFAULT_SYSTEM_PROMPTS.openai,
  });

  function handleProviderChange(provider: AIProviderType) {
    const defaults = PROVIDER_DEFAULTS[provider];
    setForm(f => ({
      ...f,
      provider,
      model_name: defaults.defaultModel,
      api_endpoint: defaults.endpoint,
      system_prompt: DEFAULT_SYSTEM_PROMPTS[provider],
    }));
  }

  function toggleRole(role: AIModelRole) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }));
  }

  async function handleSave() {
    if (!form.api_key.trim()) { setError('API key is required.'); return; }
    if (!form.model_name.trim()) { setError('Model name is required.'); return; }
    if (form.roles.length === 0) { setError('Select at least one role.'); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save provider.');
    } finally {
      setSaving(false);
    }
  }

  const models = PROVIDER_DEFAULTS[form.provider].models;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Add AI Provider</h2>
            <p className="text-xs text-slate-500 mt-0.5">Connect an external AI model for trading signal generation</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Provider</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['openai', 'anthropic', 'gemini', 'custom'] as AIProviderType[]).map(p => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                    form.provider === p
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  {PROVIDER_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Model {models.length > 0 ? '' : '(enter manually)'}
              </label>
              {models.length > 0 ? (
                <select
                  value={form.model_name}
                  onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors"
                >
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input
                  value={form.model_name}
                  onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))}
                  placeholder="e.g. llama-3-70b"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors placeholder:text-slate-600"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">API Endpoint</label>
              <input
                value={form.api_endpoint}
                onChange={e => setForm(f => ({ ...f, api_endpoint: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-slate-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.api_key}
                onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                placeholder="sk-..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 pr-10 text-sm font-mono text-white focus:outline-none focus:border-slate-500 transition-colors placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1">Key is sent securely through Supabase Edge Function and never stored in plaintext</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Temperature <span className="text-slate-600">({form.temperature})</span></label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={form.temperature}
                onChange={e => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) }))}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-slate-600 mt-1">
                <span>Precise (0)</span>
                <span>Creative (1)</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Max Tokens</label>
              <input
                type="number"
                value={form.max_tokens}
                onChange={e => setForm(f => ({ ...f, max_tokens: parseInt(e.target.value) || 512 }))}
                min={64}
                max={4096}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Roles</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ROLE_LABELS) as AIModelRole[]).map(role => (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                    form.roles.includes(role)
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-slate-700 bg-slate-900 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                  }`}
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">System Prompt</label>
            <textarea
              value={form.system_prompt}
              onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
              rows={6}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-slate-500 transition-colors resize-none leading-relaxed"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-sm text-red-400">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 flex-shrink-0">
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {saving ? 'Saving...' : 'Add Provider'}
          </button>
        </div>
      </div>
    </div>
  );
}

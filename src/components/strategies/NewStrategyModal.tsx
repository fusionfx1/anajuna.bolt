import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Plus, Minus, Check } from 'lucide-react';
import { STRATEGY_TEMPLATES, FOREX_SYMBOLS, STRATEGY_TYPE_LABELS, type StrategyTemplate } from './strategyTemplates';
import type { Strategy } from '../../types/trading';

interface Props {
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    description: string;
    strategy_type: Strategy['strategy_type'];
    symbols: string[];
    config: Record<string, unknown>;
    max_drawdown_pct: number;
    lot_size: number;
    max_concurrent_trades: number;
  }) => Promise<void>;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Beginner: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  Intermediate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  Advanced: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const BADGE_COLOR: Record<string, string> = {
  Popular: 'bg-sky-500/15 text-sky-400',
  Steady: 'bg-teal-500/15 text-teal-400',
  Breakout: 'bg-orange-500/15 text-orange-400',
  'Long Hold': 'bg-amber-500/15 text-amber-400',
  Session: 'bg-violet-500/15 text-violet-400',
  Fast: 'bg-rose-500/15 text-rose-400',
  Quant: 'bg-cyan-500/15 text-cyan-400',
  AI: 'bg-fuchsia-500/15 text-fuchsia-400',
  Custom: 'bg-slate-700 text-slate-400',
};

function TemplateCard({ tpl, selected, onClick }: { tpl: StrategyTemplate; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/30'
          : 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800/50'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm font-semibold text-white">{tpl.label}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${BADGE_COLOR[tpl.badge] ?? 'bg-slate-700 text-slate-400'}`}>
            {tpl.badge}
          </span>
          {selected && <Check size={14} className="text-emerald-400" />}
        </div>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">{tpl.description}</p>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${DIFFICULTY_COLOR[tpl.difficulty]}`}>
          {tpl.difficulty}
        </span>
        <span className="text-xs text-slate-600">{STRATEGY_TYPE_LABELS[tpl.strategy_type]}</span>
      </div>
    </button>
  );
}

function ConfigField({
  label, configKey, value, onChange
}: { label: string; configKey: string; value: unknown; onChange: (key: string, val: unknown) => void }) {
  const isNum = typeof value === 'number';
  const isBool = typeof value === 'boolean';
  return (
    <div className="bg-slate-800/60 rounded-lg px-3 py-2.5">
      <label className="block text-xs text-slate-500 mb-1.5 capitalize">{label}</label>
      {isBool ? (
        <button
          onClick={() => onChange(configKey, !value)}
          className={`w-8 h-4 rounded-full transition-colors relative ${value ? 'bg-emerald-500' : 'bg-slate-700'}`}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      ) : (
        <input
          type={isNum ? 'number' : 'text'}
          value={String(value)}
          step={isNum ? (String(value).includes('.') ? 0.01 : 1) : undefined}
          onChange={e => onChange(configKey, isNum ? parseFloat(e.target.value) || 0 : e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-slate-500 transition-colors"
        />
      )}
    </div>
  );
}

export function NewStrategyModal({ onClose, onCreate }: Props) {
  const [step, setStep] = useState<'template' | 'configure'>('template');
  const [selectedTpl, setSelectedTpl] = useState<StrategyTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    strategy_type: 'trend_following' as Strategy['strategy_type'],
    symbols: [] as string[],
    config: {} as Record<string, unknown>,
    max_drawdown_pct: 5.0,
    lot_size: 0.01,
    max_concurrent_trades: 3,
  });

  function applyTemplate(tpl: StrategyTemplate) {
    setSelectedTpl(tpl);
    setForm({
      name: tpl.id === 'custom' ? '' : tpl.label,
      description: tpl.id === 'custom' ? '' : tpl.description,
      strategy_type: tpl.strategy_type,
      symbols: [...tpl.symbols],
      config: { ...tpl.config },
      max_drawdown_pct: tpl.max_drawdown_pct,
      lot_size: tpl.lot_size,
      max_concurrent_trades: tpl.max_concurrent_trades,
    });
  }

  function toggleSymbol(sym: string) {
    setForm(f => ({
      ...f,
      symbols: f.symbols.includes(sym) ? f.symbols.filter(s => s !== sym) : [...f.symbols, sym]
    }));
  }

  function updateConfig(key: string, val: unknown) {
    setForm(f => ({ ...f, config: { ...f.config, [key]: val } }));
  }

  function addConfigKey() {
    const key = `param_${Object.keys(form.config).length + 1}`;
    setForm(f => ({ ...f, config: { ...f.config, [key]: 0 } }));
  }

  function removeConfigKey(key: string) {
    setForm(f => {
      const next = { ...f.config };
      delete next[key];
      return { ...f, config: next };
    });
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Strategy name is required.'); return; }
    if (form.symbols.length === 0) { setError('Select at least one symbol.'); return; }
    setError(null);
    setSaving(true);
    try {
      await onCreate(form);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create strategy.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">New Strategy</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === 'template' ? 'Choose a template to get started' : 'Configure your strategy parameters'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-semibold ${step === 'template' ? 'bg-emerald-500 text-slate-900' : 'bg-emerald-500/20 text-emerald-400'}`}>1</span>
              <span className={step === 'template' ? 'text-white' : 'text-slate-500'}>Template</span>
              <ChevronRight size={12} className="text-slate-700" />
              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-semibold ${step === 'configure' ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800 text-slate-600'}`}>2</span>
              <span className={step === 'configure' ? 'text-white' : 'text-slate-500'}>Configure</span>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {step === 'template' && (
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STRATEGY_TEMPLATES.map(tpl => (
                  <TemplateCard
                    key={tpl.id}
                    tpl={tpl}
                    selected={selectedTpl?.id === tpl.id}
                    onClick={() => applyTemplate(tpl)}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'configure' && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Strategy Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. My EMA Scalper"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors placeholder:text-slate-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    placeholder="Describe your strategy..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors placeholder:text-slate-600 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Strategy Type</label>
                  <select
                    value={form.strategy_type}
                    onChange={e => setForm(f => ({ ...f, strategy_type: e.target.value as Strategy['strategy_type'] }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors"
                  >
                    {Object.entries(STRATEGY_TYPE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Max Drawdown %</label>
                  <input
                    type="number"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={form.max_drawdown_pct}
                    onChange={e => setForm(f => ({ ...f, max_drawdown_pct: parseFloat(e.target.value) || 5 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Lot Size</label>
                  <input
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={form.lot_size}
                    onChange={e => setForm(f => ({ ...f, lot_size: parseFloat(e.target.value) || 0.01 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Max Concurrent Trades</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={form.max_concurrent_trades}
                    onChange={e => setForm(f => ({ ...f, max_concurrent_trades: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2 font-medium">Trading Symbols *</label>
                <div className="flex flex-wrap gap-1.5">
                  {FOREX_SYMBOLS.map(sym => (
                    <button
                      key={sym}
                      onClick={() => toggleSymbol(sym)}
                      className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-colors ${
                        form.symbols.includes(sym)
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
                {form.symbols.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1.5">{form.symbols.length} symbol{form.symbols.length !== 1 ? 's' : ''} selected</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-slate-400 font-medium">Strategy Parameters</label>
                  <button
                    onClick={addConfigKey}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <Plus size={12} /> Add Parameter
                  </button>
                </div>
                {Object.keys(form.config).length === 0 ? (
                  <p className="text-xs text-slate-600 italic">No parameters configured. Click "Add Parameter" to add custom settings.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(form.config).map(([k, v]) => (
                      <div key={k} className="relative group">
                        <ConfigField label={k.replace(/_/g, ' ')} configKey={k} value={v} onChange={updateConfig} />
                        <button
                          onClick={() => removeConfigKey(k)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500/80 text-white rounded-full items-center justify-center hidden group-hover:flex transition-all"
                        >
                          <Minus size={8} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-sm text-red-400">{error}</div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 flex-shrink-0">
          {step === 'configure' ? (
            <button
              onClick={() => setStep('template')}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft size={16} /> Back
            </button>
          ) : (
            <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          )}
          {step === 'template' ? (
            <button
              disabled={!selectedTpl}
              onClick={() => setStep('configure')}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Configure <ChevronRight size={16} />
            </button>
          ) : (
            <button
              disabled={saving}
              onClick={handleSubmit}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Strategy'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

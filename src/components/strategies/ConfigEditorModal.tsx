import React, { useState } from 'react';
import { X, Plus, Minus, Save } from 'lucide-react';
import { FOREX_SYMBOLS, STRATEGY_TYPE_LABELS } from './strategyTemplates';
import type { Strategy } from '../../types/trading';

interface Props {
  strategy: Strategy;
  onClose: () => void;
  onSave: (id: string, updates: {
    name?: string;
    description?: string;
    symbols?: string[];
    config?: Record<string, unknown>;
    max_drawdown_pct?: number;
    lot_size?: number;
    max_concurrent_trades?: number;
  }) => Promise<void>;
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

export function ConfigEditorModal({ strategy, onClose, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: strategy.name,
    description: strategy.description,
    strategy_type: strategy.strategy_type,
    symbols: [...strategy.symbols],
    config: { ...strategy.config },
    max_drawdown_pct: strategy.max_drawdown_pct,
    lot_size: strategy.lot_size,
    max_concurrent_trades: strategy.max_concurrent_trades,
  });

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

  async function handleSave() {
    if (!form.name.trim()) { setError('Strategy name is required.'); return; }
    if (form.symbols.length === 0) { setError('Select at least one symbol.'); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave(strategy.id, {
        name: form.name,
        description: form.description,
        symbols: form.symbols,
        config: form.config,
        max_drawdown_pct: form.max_drawdown_pct,
        lot_size: form.lot_size,
        max_concurrent_trades: form.max_concurrent_trades,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Edit Strategy</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{strategy.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Strategy Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-slate-500 transition-colors resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Strategy Type</label>
              <select
                value={form.strategy_type}
                disabled
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-400 cursor-not-allowed opacity-60"
              >
                {Object.entries(STRATEGY_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-600 mt-1">Strategy type cannot be changed after creation.</p>
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
              <p className="text-xs text-slate-600 italic">No parameters. Click "Add Parameter" to add one.</p>
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

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 flex-shrink-0">
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button
            disabled={saving}
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { SlidersHorizontal } from 'lucide-react';

export interface IndicatorToggles {
  ema21: boolean;
  ema50: boolean;
  ema200: boolean;
  bollinger: boolean;
  rsi: boolean;
  macd: boolean;
}

const STORAGE_KEY = 'chart_indicator_toggles';

const DEFAULTS: IndicatorToggles = {
  ema21:     true,
  ema50:     true,
  ema200:    true,
  bollinger: true,
  rsi:       true,
  macd:      true,
};

export function loadToggles(): IndicatorToggles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveToggles(t: IndicatorToggles): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    // ignore quota errors
  }
}

interface IndicatorDef {
  key: keyof IndicatorToggles;
  label: string;
  description: string;
  swatch: string;
  group: 'overlay' | 'pane';
}

const INDICATORS: IndicatorDef[] = [
  { key: 'ema21',     label: 'EMA 21',           description: '21-period EMA',        swatch: '#f97316', group: 'overlay' },
  { key: 'ema50',     label: 'EMA 50',           description: '50-period EMA',        swatch: '#22d3ee', group: 'overlay' },
  { key: 'ema200',    label: 'EMA 200',          description: '200-period EMA',       swatch: '#f8fafc', group: 'overlay' },
  { key: 'bollinger', label: 'Bollinger Bands',  description: '20-period, 2σ',        swatch: '#7dd3fc', group: 'overlay' },
  { key: 'rsi',       label: 'RSI',              description: '14-period RSI',        swatch: '#facc15', group: 'pane' },
  { key: 'macd',      label: 'MACD',             description: '12 / 26 / 9',          swatch: '#60a5fa', group: 'pane' },
];

interface Props {
  toggles: IndicatorToggles;
  onChange: (t: IndicatorToggles) => void;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border transition-colors duration-200 focus:outline-none ${
        checked
          ? 'bg-emerald-500 border-emerald-500'
          : 'bg-slate-700 border-slate-600'
      }`}
    >
      <span
        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
          checked ? 'translate-x-3.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function IndicatorControls({ toggles, onChange }: Props) {
  const set = (key: keyof IndicatorToggles, val: boolean) => {
    const next = { ...toggles, [key]: val };
    saveToggles(next);
    onChange(next);
  };

  const overlays = INDICATORS.filter(i => i.group === 'overlay');
  const panes    = INDICATORS.filter(i => i.group === 'pane');

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-800">
        <SlidersHorizontal size={14} className="text-emerald-400" />
        <span className="text-xs font-semibold text-slate-300 tracking-wide uppercase">Indicators</span>
      </div>

      <div className="px-3 py-2">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Overlay</p>
        <div className="space-y-2">
          {overlays.map(ind => (
            <div key={ind.key} className="flex items-center justify-between gap-2 group">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: ind.swatch }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-300 leading-none truncate">{ind.label}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{ind.description}</p>
                </div>
              </div>
              <Toggle
                checked={toggles[ind.key]}
                onChange={() => set(ind.key, !toggles[ind.key])}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-slate-800/60">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Sub-pane</p>
        <div className="space-y-2">
          {panes.map(ind => (
            <div key={ind.key} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: ind.swatch }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-300 leading-none truncate">{ind.label}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{ind.description}</p>
                </div>
              </div>
              <Toggle
                checked={toggles[ind.key]}
                onChange={() => set(ind.key, !toggles[ind.key])}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-slate-800">
        <button
          onClick={() => { saveToggles(DEFAULTS); onChange({ ...DEFAULTS }); }}
          className="w-full text-[10px] text-slate-600 hover:text-slate-400 transition-colors text-center"
        >
          Reset indicators
        </button>
      </div>
    </div>
  );
}

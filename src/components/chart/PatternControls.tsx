import type { PatternName } from '../../services/patternDetection';

export interface PatternToggles {
  'Bullish Engulfing': boolean;
  'Bearish Engulfing': boolean;
  'Hammer': boolean;
  'Shooting Star': boolean;
  'Doji': boolean;
  'SR Levels': boolean;
}

const STORAGE_KEY = 'chart_pattern_toggles';

const DEFAULTS: PatternToggles = {
  'Bullish Engulfing': true,
  'Bearish Engulfing': true,
  'Hammer':            true,
  'Shooting Star':     true,
  'Doji':              true,
  'SR Levels':         true,
};

export function loadPatternToggles(): PatternToggles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePatternToggles(t: PatternToggles): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch { /* ignore quota */ }
}

interface PatternDef {
  key: keyof PatternToggles;
  label: string;
  description: string;
  swatch: string;
  shape: string;
}

const PATTERN_DEFS: PatternDef[] = [
  { key: 'Bullish Engulfing', label: 'Bullish Engulfing', description: '2-candle reversal',  swatch: '#22c55e', shape: '▲' },
  { key: 'Bearish Engulfing', label: 'Bearish Engulfing', description: '2-candle reversal',  swatch: '#ef4444', shape: '▼' },
  { key: 'Hammer',            label: 'Hammer',            description: 'Long lower wick',     swatch: '#22c55e', shape: '▲' },
  { key: 'Shooting Star',     label: 'Shooting Star',     description: 'Long upper wick',     swatch: '#ef4444', shape: '▼' },
  { key: 'Doji',              label: 'Doji',              description: 'Indecision candle',   swatch: '#facc15', shape: '●' },
  { key: 'SR Levels',         label: 'S/R Levels',        description: '5 nearest levels',    swatch: '#94a3b8', shape: '━' },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-700 border-slate-600'
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

interface Props {
  toggles: PatternToggles;
  onChange: (t: PatternToggles) => void;
}

export function PatternControls({ toggles, onChange }: Props) {
  const set = (key: keyof PatternToggles, val: boolean) => {
    const next = { ...toggles, [key]: val };
    savePatternToggles(next);
    onChange(next);
  };

  const patterns = PATTERN_DEFS.filter(d => d.key !== 'SR Levels');
  const sr       = PATTERN_DEFS.find(d => d.key === 'SR Levels')!;

  return (
    <div className="px-3 py-2 border-t border-slate-800/60">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Patterns</p>
      <div className="space-y-2">
        {patterns.map(def => (
          <div key={def.key} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-xs flex-shrink-0 w-3 text-center leading-none"
                style={{ color: def.swatch }}
              >
                {def.shape}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-300 leading-none truncate">{def.label}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{def.description}</p>
              </div>
            </div>
            <Toggle
              checked={toggles[def.key as PatternName]}
              onChange={() => set(def.key, !toggles[def.key as PatternName])}
            />
          </div>
        ))}
      </div>

      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 mt-3">Levels</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs flex-shrink-0 w-3 text-center leading-none" style={{ color: sr.swatch }}>
            {sr.shape}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-300 leading-none">{sr.label}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{sr.description}</p>
          </div>
        </div>
        <Toggle
          checked={toggles['SR Levels']}
          onChange={() => set('SR Levels', !toggles['SR Levels'])}
        />
      </div>

      <button
        onClick={() => { savePatternToggles(DEFAULTS); onChange({ ...DEFAULTS }); }}
        className="w-full mt-3 text-[10px] text-slate-600 hover:text-slate-400 transition-colors text-center"
      >
        Reset patterns
      </button>
    </div>
  );
}

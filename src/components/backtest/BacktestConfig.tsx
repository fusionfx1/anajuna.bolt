import { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical, Square, Download, Loader2, ChevronDown,
  Settings2, Database, AlertCircle, Zap,
} from 'lucide-react';
import type { Strategy } from '../../types/trading';
import type {
  BacktestConfig as BacktestConfigType,
  BacktestGranularity, BacktestInstrument, BacktestStatus,
} from '../../types/backtest';
import { BACKTEST_GRANULARITIES, BACKTEST_INSTRUMENTS } from '../../types/backtest';
import { getDefaultStrategyConfig } from '../../services/backtestStrategies';

const DATE_PRESETS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
];

function monthsAgo(m: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  return d.toISOString().split('T')[0];
}

interface Props {
  strategies: Strategy[];
  strategiesLoading: boolean;
  status: BacktestStatus;
  onRun: (config: BacktestConfigType) => void;
  onCancel: () => void;
  onDownloadData: (instrument: BacktestInstrument, granularity: BacktestGranularity, from: string, to: string) => void;
  downloading: boolean;
}

export function BacktestConfigPanel({
  strategies, strategiesLoading, status, onRun, onCancel, onDownloadData, downloading,
}: Props) {
  const today = new Date().toISOString().split('T')[0];

  const [strategyId, setStrategyId] = useState('');
  const [strategyType, setStrategyType] = useState<string>('scalping');
  const [instrument, setInstrument] = useState<BacktestInstrument>('EUR_USD');
  const [granularity, setGranularity] = useState<BacktestGranularity>('H1');
  const [startDate, setStartDate] = useState(monthsAgo(6));
  const [endDate, setEndDate] = useState(today);
  const [initialBalance, setInitialBalance] = useState('10000');
  const [commissionPips, setCommissionPips] = useState('0');
  const [slippage, setSlippage] = useState<'none' | 'fixed' | 'random'>('none');
  const [slippagePips, setSlippagePips] = useState('0.5');
  const [positionSizing, setPositionSizing] = useState<'fixed' | 'risk_pct'>('fixed');
  const [lotSize, setLotSize] = useState('10000');
  const [riskPct, setRiskPct] = useState('1');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [strategyConfig, setStrategyConfig] = useState<Record<string, unknown>>(getDefaultStrategyConfig('scalping'));

  // Sync strategy selection
  useEffect(() => {
    if (strategyId && strategies.length > 0) {
      const s = strategies.find(st => st.id === strategyId);
      if (s) {
        setStrategyType(s.strategy_type);
        const merged = { ...getDefaultStrategyConfig(s.strategy_type), ...s.config };
        setStrategyConfig(merged);
      }
    }
  }, [strategyId, strategies]);

  const handleTypeChange = useCallback((type: string) => {
    setStrategyType(type);
    setStrategyId('');
    setStrategyConfig(getDefaultStrategyConfig(type));
  }, []);

  const handlePreset = useCallback((months: number) => {
    setStartDate(monthsAgo(months));
    setEndDate(today);
  }, [today]);

  const handleRun = useCallback(() => {
    const selected = strategies.find(s => s.id === strategyId);
    onRun({
      strategyId: strategyId || null,
      strategyName: selected?.name ?? `${strategyType} (custom)`,
      strategyType: strategyType as BacktestConfigType['strategyType'],
      instrument,
      granularity,
      startDate,
      endDate,
      initialBalance: parseFloat(initialBalance) || 10000,
      commissionPips: parseFloat(commissionPips) || 0,
      slippage,
      slippagePips: parseFloat(slippagePips) || 0.5,
      positionSizing,
      lotSize: parseInt(lotSize) || 10000,
      riskPct: parseFloat(riskPct) || 1,
      strategyConfig,
    });
  }, [strategyId, strategies, strategyType, instrument, granularity, startDate, endDate,
      initialBalance, commissionPips, slippage, slippagePips, positionSizing, lotSize, riskPct, strategyConfig, onRun]);

  const isRunning = status === 'running';
  const isArbitrage = strategyType === 'arbitrage';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <FlaskConical size={18} className="text-sky-400" />
          <h2 className="text-sm font-semibold text-slate-200">Backtest Configuration</h2>
        </div>
        <button
          onClick={() => onDownloadData(instrument, granularity, startDate, endDate)}
          disabled={downloading || isRunning}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {downloading ? 'Downloading...' : 'Download Data'}
        </button>
      </div>

      {strategiesLoading ? (
        <div className="flex items-center justify-center py-6 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin mr-2" />
          Loading strategies...
        </div>
      ) : (
        <>
          {/* Row 1: Strategy + Type */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Strategy</label>
              <div className="relative">
                <select
                  value={strategyId}
                  onChange={e => setStrategyId(e.target.value)}
                  className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50 pr-8"
                >
                  <option value="">Custom</option>
                  {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Strategy Type</label>
              <div className="relative">
                <select
                  value={strategyType}
                  onChange={e => handleTypeChange(e.target.value)}
                  disabled={!!strategyId}
                  className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50 pr-8 disabled:opacity-60"
                >
                  <option value="scalping">Scalping</option>
                  <option value="trend_following">Trend Following</option>
                  <option value="mean_reversion">Mean Reversion</option>
                  <option value="swing">Swing</option>
                  <option value="arbitrage">Arbitrage</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Instrument</label>
              <div className="relative">
                <select
                  value={instrument}
                  onChange={e => setInstrument(e.target.value as BacktestInstrument)}
                  className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50 pr-8"
                >
                  {BACKTEST_INSTRUMENTS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Timeframe</label>
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 gap-0.5">
                {BACKTEST_GRANULARITIES.map(g => (
                  <button
                    key={g.value}
                    onClick={() => setGranularity(g.value)}
                    className={`flex-1 px-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      granularity === g.value
                        ? 'bg-sky-500 text-slate-900 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {g.value}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Dates + Balance */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Start Date</label>
              <input
                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">End Date</label>
              <input
                type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Presets</label>
              <div className="flex gap-1">
                {DATE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p.months)}
                    className="flex-1 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Initial Balance ($)</label>
              <input
                type="number" value={initialBalance} onChange={e => setInitialBalance(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
              />
            </div>
          </div>

          {/* Strategy config parameters */}
          {!isArbitrage && Object.keys(strategyConfig).length > 0 && (
            <div className="mb-4 p-3 bg-slate-800/40 border border-slate-700/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2.5">
                <Settings2 size={12} className="text-slate-500" />
                <span className="text-xs font-medium text-slate-400">Strategy Parameters</span>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {Object.entries(strategyConfig).map(([key, value]) => (
                  <div key={key}>
                    <label className="text-[10px] text-slate-600 mb-1 block">{key.replace(/_/g, ' ')}</label>
                    <input
                      type="number"
                      value={value as number}
                      onChange={e => setStrategyConfig(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 font-mono outline-none focus:border-sky-500/50"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Advanced settings toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-3 transition-colors"
          >
            <ChevronDown size={12} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            Advanced Settings
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 p-3 bg-slate-800/30 border border-slate-700/40 rounded-lg">
              <div>
                <label className="text-[10px] text-slate-600 mb-1 block">Commission (pips)</label>
                <input
                  type="number" value={commissionPips} onChange={e => setCommissionPips(e.target.value)} step="0.1"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 font-mono outline-none focus:border-sky-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-600 mb-1 block">Slippage</label>
                <select
                  value={slippage} onChange={e => setSlippage(e.target.value as typeof slippage)}
                  className="w-full appearance-none bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-sky-500/50"
                >
                  <option value="none">None</option>
                  <option value="fixed">Fixed</option>
                  <option value="random">Random</option>
                </select>
              </div>
              {slippage !== 'none' && (
                <div>
                  <label className="text-[10px] text-slate-600 mb-1 block">Slippage (pips)</label>
                  <input
                    type="number" value={slippagePips} onChange={e => setSlippagePips(e.target.value)} step="0.1"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 font-mono outline-none focus:border-sky-500/50"
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] text-slate-600 mb-1 block">Position Sizing</label>
                <select
                  value={positionSizing} onChange={e => setPositionSizing(e.target.value as typeof positionSizing)}
                  className="w-full appearance-none bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-sky-500/50"
                >
                  <option value="fixed">Fixed Units</option>
                  <option value="risk_pct">Risk %</option>
                </select>
              </div>
              {positionSizing === 'fixed' ? (
                <div>
                  <label className="text-[10px] text-slate-600 mb-1 block">Lot Size (units)</label>
                  <input
                    type="number" value={lotSize} onChange={e => setLotSize(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 font-mono outline-none focus:border-sky-500/50"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[10px] text-slate-600 mb-1 block">Risk per Trade (%)</label>
                  <input
                    type="number" value={riskPct} onChange={e => setRiskPct(e.target.value)} step="0.5"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 font-mono outline-none focus:border-sky-500/50"
                  />
                </div>
              )}
            </div>
          )}

          {isArbitrage && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/8 border border-amber-500/20 rounded-lg mb-4">
              <AlertCircle size={14} className="text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">
                Arbitrage strategies require multiple instruments and are not supported in single-instrument backtesting.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {isRunning ? (
              <button
                onClick={onCancel}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-lg text-sm font-semibold transition-colors"
              >
                <Square size={14} />
                Cancel
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={isArbitrage}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-sky-500/20"
              >
                <Zap size={14} />
                Run Backtest
              </button>
            )}
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Database size={12} />
              <span>Uses simulated data if no OANDA credentials configured</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

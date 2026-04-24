import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Wifi, WifiOff, ChevronDown } from 'lucide-react';
import { CandleChart, useStableCrosshairCallback } from './chart/CandleChart';
import {
  fetchCandles, fetchLatestCandles,
  type Instrument, type Granularity, type OHLCVCandle,
} from '../services/candleService';

const INSTRUMENTS: { value: Instrument; label: string }[] = [
  { value: 'EUR_USD', label: 'EUR/USD' },
  { value: 'GBP_USD', label: 'GBP/USD' },
  { value: 'USD_JPY', label: 'USD/JPY' },
  { value: 'XAU_USD', label: 'XAU/USD' },
];

const TIMEFRAMES: { value: Granularity; label: string }[] = [
  { value: 'M1',  label: 'M1' },
  { value: 'M5',  label: 'M5' },
  { value: 'M15', label: 'M15' },
  { value: 'H1',  label: 'H1' },
];

const REFRESH_INTERVAL_MS = 10_000;

interface SelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}

function Select<T extends string>({ value, options, onChange, className = '' }: SelectProps<T>) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="appearance-none bg-slate-800 border border-slate-700 text-slate-200 text-sm font-medium rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 cursor-pointer transition-colors hover:border-slate-600"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
    </div>
  );
}

function OHLCDisplay({ candle, instrument }: { candle: OHLCVCandle | null; instrument: Instrument }) {
  const isJpy = instrument === 'USD_JPY';
  const isGold = instrument === 'XAU_USD';
  const dp = isJpy ? 3 : isGold ? 2 : 5;

  if (!candle) {
    return (
      <div className="flex items-center gap-4 text-xs font-mono text-slate-600 select-none">
        {['O', 'H', 'L', 'C'].map(l => (
          <span key={l}><span className="text-slate-500">{l} </span>—</span>
        ))}
      </div>
    );
  }

  const isBullish = candle.close >= candle.open;
  const color = isBullish ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className={`flex items-center gap-4 text-xs font-mono ${color} select-none`}>
      <span><span className="text-slate-500">O </span>{candle.open.toFixed(dp)}</span>
      <span><span className="text-slate-500">H </span>{candle.high.toFixed(dp)}</span>
      <span><span className="text-slate-500">L </span>{candle.low.toFixed(dp)}</span>
      <span><span className="text-slate-500">C </span>{candle.close.toFixed(dp)}</span>
    </div>
  );
}

function CountdownBar({ resetKey }: { resetKey: number }) {
  const [pct, setPct] = useState(100);

  useEffect(() => {
    setPct(100);
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      setPct(Math.max(0, 100 - (elapsed / REFRESH_INTERVAL_MS) * 100));
    }, 100);
    return () => clearInterval(timer);
  }, [resetKey]);

  return (
    <div className="h-0.5 bg-slate-800 w-28 rounded-full overflow-hidden">
      <div
        className="h-full bg-emerald-500/60 transition-none rounded-full"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ChartPage() {
  const [instrument, setInstrument] = useState<Instrument>('EUR_USD');
  const [granularity, setGranularity] = useState<Granularity>('M5');
  const [candles, setCandles] = useState<OHLCVCandle[]>([]);
  const [hoveredCandle, setHoveredCandle] = useState<OHLCVCandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const latestCandleRef = useRef<OHLCVCandle | null>(null);
  const displayCandle = hoveredCandle ?? latestCandleRef.current;

  // Full load whenever instrument or granularity changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCandles([]);

    fetchCandles(instrument, granularity, 500).then(data => {
      if (cancelled) return;
      setCandles(data);
      latestCandleRef.current = data[data.length - 1] ?? null;
      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Failed to load candles');
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [instrument, granularity]);

  // Auto-refresh: append latest candles every 10 seconds
  useEffect(() => {
    if (!live) return;

    const timer = setInterval(async () => {
      try {
        const latest = await fetchLatestCandles(instrument, granularity, 5);
        setCandles(prev => {
          if (prev.length === 0) return prev;
          const existing = new Map(prev.map(c => [c.time, c]));
          latest.forEach(c => existing.set(c.time, c));
          const merged = Array.from(existing.values()).sort((a, b) => a.time - b.time);
          latestCandleRef.current = merged[merged.length - 1] ?? null;
          return merged;
        });
        setRefreshKey(k => k + 1);
      } catch {
        // Silently ignore transient refresh errors
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [instrument, granularity, live]);

  const handleCrosshair = useStableCrosshairCallback((c) => setHoveredCandle(c));

  const handleManualRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCandles(instrument, granularity, 500);
      setCandles(data);
      latestCandleRef.current = data[data.length - 1] ?? null;
      setRefreshKey(k => k + 1);
    } finally {
      setLoading(false);
    }
  }, [instrument, granularity]);

  const handleInstrumentChange = useCallback((v: Instrument) => {
    setInstrument(v);
    setHoveredCandle(null);
  }, []);

  const handleGranularityChange = useCallback((v: Granularity) => {
    setGranularity(v);
    setHoveredCandle(null);
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-950" style={{ minHeight: 500 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-shrink-0 flex-wrap">
        {/* Left: selectors */}
        <div className="flex items-center gap-2">
          <Select<Instrument>
            value={instrument}
            options={INSTRUMENTS}
            onChange={handleInstrumentChange}
          />
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 gap-0.5">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.value}
                onClick={() => handleGranularityChange(tf.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-150 ${
                  granularity === tf.value
                    ? 'bg-emerald-500 text-slate-900 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Middle: OHLC */}
        <div className="flex-1 min-w-0">
          <OHLCDisplay candle={displayCandle} instrument={instrument} />
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-3 ml-auto">
          {live && <CountdownBar resetKey={refreshKey} />}

          <button
            onClick={() => setLive(v => !v)}
            title={live ? 'Pause auto-refresh' : 'Resume auto-refresh'}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all duration-150 ${
              live
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
          >
            {live
              ? <Wifi size={13} className="flex-shrink-0" />
              : <WifiOff size={13} className="flex-shrink-0" />}
            <span>{live ? 'Live' : 'Paused'}</span>
          </button>

          <button
            onClick={handleManualRefresh}
            disabled={loading}
            title="Refresh now"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 relative" style={{ minHeight: 500 }}>
        {loading && candles.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Loading candles…</p>
          </div>
        )}

        {error && candles.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={handleManualRefresh}
              className="text-xs text-emerald-400 hover:text-emerald-300 underline"
            >
              Retry
            </button>
          </div>
        )}

        {candles.length > 0 && (
          <CandleChart candles={candles} onCrosshairMove={handleCrosshair} />
        )}

        {/* Watermark */}
        {candles.length > 0 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none select-none">
            <span className="text-slate-800 text-4xl font-black tracking-widest opacity-60">
              {INSTRUMENTS.find(i => i.value === instrument)?.label}
            </span>
          </div>
        )}

        {/* Candle count badge */}
        {candles.length > 0 && (
          <div className="absolute bottom-2 left-3 text-xs text-slate-700 font-mono select-none pointer-events-none">
            {candles.length} candles
          </div>
        )}
      </div>
    </div>
  );
}

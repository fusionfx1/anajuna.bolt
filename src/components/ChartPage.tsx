import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RefreshCw, Wifi, WifiOff, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import { CandleChart, useStableCrosshairCallback } from './chart/CandleChart';
import { IndicatorControls, loadToggles, type IndicatorToggles } from './chart/IndicatorControls';
import { PatternControls, loadPatternToggles, type PatternToggles } from './chart/PatternControls';
import { TradeModal } from './paper/TradeModal';
import {
  fetchCandles, fetchLatestCandles,
  type Instrument, type Granularity, type OHLCVCandle,
} from '../services/candleService';
import { computeAllIndicators, type IndicatorData } from '../services/indicators';
import { detectPatterns, detectSRLevels, type CandlePattern, type SRLevel } from '../services/patternDetection';
import { useMarketData } from '../hooks/useMarketData';
import { usePaperAccount, usePaperPositions } from '../hooks/usePaperTrading';
import { instrumentToSymbol, priceDp, PAPER_INSTRUMENTS } from '../types/paper';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_INSTRUMENTS: { value: Instrument; label: string }[] = [
  { value: 'EUR_USD', label: 'EUR/USD' },
  { value: 'GBP_USD', label: 'GBP/USD' },
  { value: 'USD_JPY', label: 'USD/JPY' },
  { value: 'XAU_USD', label: 'XAU/USD' },
];

const TIMEFRAMES: { value: Granularity; label: string }[] = [
  { value: 'M1',  label: 'M1'  },
  { value: 'M5',  label: 'M5'  },
  { value: 'M15', label: 'M15' },
  { value: 'H1',  label: 'H1'  },
];

const REFRESH_INTERVAL_MS = 10_000;

const EMPTY_INDICATORS: IndicatorData = {
  ema21: [], ema50: [], ema200: [], rsi: [], macd: [], bollinger: [],
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Select<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="relative">
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
  const dp = priceDp(instrument);
  if (!candle) {
    return (
      <div className="flex items-center gap-4 text-xs font-mono text-slate-600 select-none">
        {['O', 'H', 'L', 'C'].map(l => (
          <span key={l}><span className="text-slate-500">{l} </span>—</span>
        ))}
      </div>
    );
  }
  const color = candle.close >= candle.open ? 'text-emerald-400' : 'text-red-400';
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
      setPct(Math.max(0, 100 - (Date.now() - start) / REFRESH_INTERVAL_MS * 100));
    }, 100);
    return () => clearInterval(timer);
  }, [resetKey]);
  return (
    <div className="h-0.5 bg-slate-800 w-28 rounded-full overflow-hidden">
      <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ChartPage() {
  const [instrument,    setInstrument]    = useState<Instrument>('EUR_USD');
  const [granularity,   setGranularity]   = useState<Granularity>('M5');
  const [candles,       setCandles]       = useState<OHLCVCandle[]>([]);
  const [hoveredCandle, setHoveredCandle] = useState<OHLCVCandle | null>(null);
  const [indToggles,    setIndToggles]    = useState<IndicatorToggles>(loadToggles);
  const [patToggles,    setPatToggles]    = useState<PatternToggles>(loadPatternToggles);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [live,          setLive]          = useState(true);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [tradeModal,    setTradeModal]    = useState<'buy' | 'sell' | null>(null);
  const [tradeMsg,      setTradeMsg]      = useState<string | null>(null);

  const latestCandleRef = useRef<OHLCVCandle | null>(null);
  const displayCandle   = hoveredCandle ?? latestCandleRef.current;

  // Market data for real bid/ask prices
  const { getQuote } = useMarketData(800);
  const symbol       = instrumentToSymbol(instrument);
  const quote        = getQuote(symbol);
  const bid          = quote?.bid ?? 0;
  const ask          = quote?.ask ?? 0;
  const dp           = priceDp(instrument);

  // Paper trading account + positions
  const { account, refresh: refreshAccount } = usePaperAccount();
  const { executeOpen } = usePaperPositions();

  // Memoised indicator / pattern computation
  const indicators = useMemo<IndicatorData>(
    () => (candles.length > 0 ? computeAllIndicators(candles) : EMPTY_INDICATORS),
    [candles]
  );
  const patterns = useMemo<CandlePattern[]>(
    () => (candles.length > 1 ? detectPatterns(candles) : []),
    [candles]
  );
  const srLevels = useMemo<SRLevel[]>(
    () => (candles.length > 11 ? detectSRLevels(candles, 5) : []),
    [candles]
  );

  // Full load on instrument / granularity change
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

  // Auto-refresh
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(async () => {
      try {
        const latest = await fetchLatestCandles(instrument, granularity, 5);
        setCandles(prev => {
          if (prev.length === 0) return prev;
          const map = new Map(prev.map(c => [c.time, c]));
          latest.forEach(c => map.set(c.time, c));
          const merged = Array.from(map.values()).sort((a, b) => a.time - b.time);
          latestCandleRef.current = merged[merged.length - 1] ?? null;
          return merged;
        });
        setRefreshKey(k => k + 1);
      } catch { /* ignore */ }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [instrument, granularity, live]);

  const handleCrosshair     = useStableCrosshairCallback(c => setHoveredCandle(c));
  const handleManualRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCandles(instrument, granularity, 500);
      setCandles(data);
      latestCandleRef.current = data[data.length - 1] ?? null;
      setRefreshKey(k => k + 1);
    } finally { setLoading(false); }
  }, [instrument, granularity]);

  const handleInstrumentChange = useCallback((v: Instrument) => {
    setInstrument(v); setHoveredCandle(null);
  }, []);
  const handleGranularityChange = useCallback((v: Granularity) => {
    setGranularity(v); setHoveredCandle(null);
  }, []);

  // Trade confirmation
  const handleTradeConfirm = useCallback(async (
    units: number, tp: number | null, sl: number | null
  ) => {
    const side = tradeModal!;
    const entryPrice = side === 'buy' ? ask : bid;
    await executeOpen({ instrument, side, units, entryPrice, tp, sl });
    await refreshAccount();
    setTradeModal(null);
    setTradeMsg(`${side === 'buy' ? 'Buy' : 'Sell'} ${units.toLocaleString()} ${PAPER_INSTRUMENTS[instrument]} opened`);
    setTimeout(() => setTradeMsg(null), 3500);
  }, [tradeModal, instrument, bid, ask, executeOpen, refreshAccount]);

  return (
    <div className="flex flex-col h-full bg-slate-950" style={{ minHeight: 500 }}>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-shrink-0 flex-wrap">
        {/* Left: selectors */}
        <div className="flex items-center gap-2">
          <Select<Instrument>
            value={instrument}
            options={CHART_INSTRUMENTS}
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

        {/* OHLC */}
        <div className="flex-1 min-w-0 hidden sm:block">
          <OHLCDisplay candle={displayCandle} instrument={instrument} />
        </div>

        {/* BUY / SELL buttons */}
        <div className="flex items-center gap-2">
          {/* Current bid/ask mini display */}
          {bid > 0 && (
            <div className="hidden md:flex items-center gap-2 font-mono text-xs mr-1">
              <span className="text-slate-500">B</span>
              <span className="text-red-400">{bid.toFixed(dp)}</span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-500">A</span>
              <span className="text-emerald-400">{ask.toFixed(dp)}</span>
            </div>
          )}
          <button
            onClick={() => setTradeModal('sell')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition-colors shadow"
          >
            <TrendingDown size={13} />
            <span>SELL</span>
          </button>
          <button
            onClick={() => setTradeModal('buy')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-xs font-bold transition-colors shadow"
          >
            <TrendingUp size={13} />
            <span>BUY</span>
          </button>
        </div>

        {/* Right: live / refresh */}
        <div className="flex items-center gap-3">
          {live && <CountdownBar resetKey={refreshKey} />}
          <button
            onClick={() => setLive(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all duration-150 ${
              live
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
          >
            {live ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span>{live ? 'Live' : 'Paused'}</span>
          </button>
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chart */}
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
              <button onClick={handleManualRefresh} className="text-xs text-emerald-400 hover:text-emerald-300 underline">
                Retry
              </button>
            </div>
          )}
          {candles.length > 0 && (
            <CandleChart
              candles={candles}
              indicators={indicators}
              toggles={indToggles}
              patterns={patterns}
              srLevels={srLevels}
              patternToggles={patToggles}
              onCrosshairMove={handleCrosshair}
            />
          )}
          {candles.length > 0 && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none select-none">
              <span className="text-slate-800 text-4xl font-black tracking-widest opacity-60">
                {CHART_INSTRUMENTS.find(i => i.value === instrument)?.label}
              </span>
            </div>
          )}
          {candles.length > 0 && (
            <div className="absolute bottom-2 left-3 flex items-center gap-3 pointer-events-none select-none">
              <span className="text-xs text-slate-700 font-mono">{candles.length} candles</span>
              {patterns.length > 0 && (
                <span className="text-xs text-slate-700 font-mono">{patterns.length} patterns</span>
              )}
            </div>
          )}

          {/* Trade success toast */}
          {tradeMsg && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2 shadow-lg backdrop-blur-sm pointer-events-none">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              {tradeMsg}
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="w-52 flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-y-auto">
          <IndicatorControls toggles={indToggles} onChange={setIndToggles} />
          <PatternControls   toggles={patToggles} onChange={setPatToggles} />

          {/* Account balance strip */}
          {account && (
            <div className="mt-auto px-3 py-3 border-t border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Paper Balance</p>
              <p className="font-mono text-sm font-semibold text-slate-200">
                ${account.balance.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Trade modal ── */}
      {tradeModal && account && (
        <TradeModal
          instrument={instrument}
          side={tradeModal}
          bid={bid}
          ask={ask}
          account={account}
          onConfirm={handleTradeConfirm}
          onClose={() => setTradeModal(null)}
        />
      )}
    </div>
  );
}

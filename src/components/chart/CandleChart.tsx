import React, { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type DeepPartial,
  type CandlestickSeriesOptions,
  type LineSeriesOptions,
  type HistogramSeriesOptions,
  type SeriesMarker,
  type LineData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';
import type { OHLCVCandle } from '../../services/candleService';
import type { IndicatorData } from '../../services/indicators';
import type { IndicatorToggles } from './IndicatorControls';
import type { CandlePattern, SRLevel } from '../../services/patternDetection';
import type { PatternToggles } from './PatternControls';

// ── Props ─────────────────────────────────────────────────────────────────────

interface CandleChartProps {
  candles: OHLCVCandle[];
  indicators: IndicatorData;
  toggles: IndicatorToggles;
  patterns: CandlePattern[];
  srLevels: SRLevel[];
  patternToggles: PatternToggles;
  onCrosshairMove?: (candle: OHLCVCandle | null) => void;
}

// ── Chart theme ───────────────────────────────────────────────────────────────

const BASE_CHART_OPTIONS = {
  layout: {
    background: { color: '#020617' },
    textColor: '#94a3b8',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
  },
  grid: {
    vertLines: { color: '#1e293b' },
    horzLines: { color: '#1e293b' },
  },
  crosshair: {
    vertLine: { color: '#475569', labelBackgroundColor: '#1e293b' },
    horzLine: { color: '#475569', labelBackgroundColor: '#1e293b' },
  },
  rightPriceScale: { borderColor: '#1e293b', textColor: '#64748b' },
  timeScale: {
    borderColor: '#1e293b',
    timeVisible: true,
    secondsVisible: false,
  },
  handleScroll: { mouseWheel: true, pressedMouseMove: true },
  handleScale: { mouseWheel: true, pinch: true },
} as const;

const CANDLE_OPTIONS: DeepPartial<CandlestickSeriesOptions> = {
  upColor: '#10b981', downColor: '#ef4444',
  borderUpColor: '#10b981', borderDownColor: '#ef4444',
  wickUpColor: '#34d399', wickDownColor: '#f87171',
};

function lineOpts(color: string, width = 1): DeepPartial<LineSeriesOptions> {
  return { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
}

function histOpts(color: string): DeepPartial<HistogramSeriesOptions> {
  return { color, priceLineVisible: false, lastValueVisible: false };
}

function srLineOpts(type: 'support' | 'resistance'): DeepPartial<LineSeriesOptions> {
  return {
    color: type === 'support' ? '#64748b' : '#475569',
    lineWidth: 1,
    lineStyle: 2,           // dashed
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: false,
  };
}

// ── Helpers for RSI level data ────────────────────────────────────────────────

function rsiLevelData(level: number, times: number[]): LineData<Time>[] {
  return times.map(t => ({ time: t as Time, value: level }));
}

// ── Refs to every series ──────────────────────────────────────────────────────

interface IndicatorSeriesRefs {
  ema21: ISeriesApi<'Line'> | null;
  ema50: ISeriesApi<'Line'> | null;
  ema200: ISeriesApi<'Line'> | null;
  bbUpper: ISeriesApi<'Line'> | null;
  bbMiddle: ISeriesApi<'Line'> | null;
  bbLower: ISeriesApi<'Line'> | null;
  rsiLine: ISeriesApi<'Line'> | null;
  rsiOb: ISeriesApi<'Line'> | null;
  rsiOs: ISeriesApi<'Line'> | null;
  macdLine: ISeriesApi<'Line'> | null;
  macdSig: ISeriesApi<'Line'> | null;
  macdHist: ISeriesApi<'Histogram'> | null;
}

function emptyIndRefs(): IndicatorSeriesRefs {
  return {
    ema21: null, ema50: null, ema200: null,
    bbUpper: null, bbMiddle: null, bbLower: null,
    rsiLine: null, rsiOb: null, rsiOs: null,
    macdLine: null, macdSig: null, macdHist: null,
  };
}

// Max S/R lines we'll ever render (matches detectSRLevels maxLevels)
const MAX_SR = 5;

// ── Component ─────────────────────────────────────────────────────────────────

export function CandleChart({
  candles, indicators, toggles,
  patterns, srLevels, patternToggles,
  onCrosshairMove,
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indRef       = useRef<IndicatorSeriesRefs>(emptyIndRefs());
  const markersRef   = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const srSeriesRef  = useRef<ISeriesApi<'Line'>[]>([]);
  const prevLenRef   = useRef(0);

  // ── Mount: create chart + all series once ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...BASE_CHART_OPTIONS,
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // Pane 0 – candles
    const candleSeries = chart.addSeries(CandlestickSeries, CANDLE_OPTIONS, 0);

    // Attach the markers plugin to the candle series
    const markersPlugin = createSeriesMarkers<Time>(candleSeries as ISeriesApi<'Candlestick', Time>, []);
    markersRef.current = markersPlugin;

    // Overlay series on pane 0
    const ema21   = chart.addSeries(LineSeries, lineOpts('#f97316', 1), 0);
    const ema50   = chart.addSeries(LineSeries, lineOpts('#22d3ee', 1), 0);
    const ema200  = chart.addSeries(LineSeries, lineOpts('#f8fafc', 1), 0);
    const bbUpper = chart.addSeries(LineSeries, lineOpts('#7dd3fc', 1), 0);
    const bbMid   = chart.addSeries(LineSeries, { ...lineOpts('#7dd3fc', 1), lineStyle: 2 }, 0);
    const bbLower = chart.addSeries(LineSeries, lineOpts('#7dd3fc', 1), 0);

    // Pre-create MAX_SR S/R line series on pane 0 (hidden until needed)
    const srSeries: ISeriesApi<'Line'>[] = [];
    for (let i = 0; i < MAX_SR; i++) {
      const s = chart.addSeries(LineSeries, { ...srLineOpts('support'), visible: false }, 0);
      srSeries.push(s);
    }
    srSeriesRef.current = srSeries;

    // Pane 1 – RSI
    chart.addPane();
    const rsiLine = chart.addSeries(LineSeries, lineOpts('#facc15', 1), 1);
    const rsiOb   = chart.addSeries(LineSeries, { ...lineOpts('#475569', 1), lineStyle: 1 }, 1);
    const rsiOs   = chart.addSeries(LineSeries, { ...lineOpts('#475569', 1), lineStyle: 1 }, 1);

    // Pane 2 – MACD
    chart.addPane();
    const macdLine = chart.addSeries(LineSeries,      lineOpts('#60a5fa', 1), 2);
    const macdSig  = chart.addSeries(LineSeries,      lineOpts('#f87171', 1), 2);
    const macdHist = chart.addSeries(HistogramSeries, histOpts('#22c55e'),    2);

    chart.priceScale('right', 1).applyOptions({ autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } });
    chart.priceScale('right', 2).applyOptions({ autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } });

    chartRef.current  = chart;
    candleRef.current = candleSeries;
    indRef.current = {
      ema21, ema50, ema200,
      bbUpper, bbMiddle: bbMid, bbLower,
      rsiLine, rsiOb, rsiOs,
      macdLine, macdSig, macdHist,
    };

    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      markersPlugin.detach();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      markersRef.current = null;
      indRef.current = emptyIndRefs();
      srSeriesRef.current = [];
      prevLenRef.current = 0;
    };
  }, []);

  // ── Crosshair ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!chart || !series || !onCrosshairMove) return;
    chart.subscribeCrosshairMove(param => {
      if (!param?.time) { onCrosshairMove(null); return; }
      const bar = param.seriesData.get(series) as OHLCVCandle | undefined;
      onCrosshairMove(bar ?? null);
    });
  }, [onCrosshairMove]);

  // ── Candle data ────────────────────────────────────────────────────────────
  useEffect(() => {
    const series = candleRef.current;
    if (!series || candles.length === 0) return;

    if (candles.length < prevLenRef.current) {
      series.setData(candles);
      chartRef.current?.timeScale().fitContent();
    } else if (candles.length > prevLenRef.current) {
      const tail = candles.slice(Math.max(0, prevLenRef.current - 1));
      tail.forEach(c => series.update(c));
    }
    prevLenRef.current = candles.length;
  }, [candles]);

  // ── Indicator data + visibility ────────────────────────────────────────────
  useEffect(() => {
    const r = indRef.current;
    if (!chartRef.current) return;

    const toLine = (pts: { time: number; value: number }[]): LineData<Time>[] =>
      pts.map(p => ({ time: p.time as Time, value: p.value }));

    const toHist = (pts: { time: number; histogram: number }[]): HistogramData<Time>[] =>
      pts.map(p => ({
        time: p.time as Time,
        value: p.histogram,
        color: p.histogram >= 0 ? '#22c55e' : '#ef4444',
      }));

    function applyLine(s: ISeriesApi<'Line'> | null, data: LineData<Time>[], visible: boolean) {
      if (!s) return;
      s.applyOptions({ visible });
      if (visible && data.length > 0) s.setData(data);
    }
    function applyHist(s: ISeriesApi<'Histogram'> | null, data: HistogramData<Time>[], visible: boolean) {
      if (!s) return;
      s.applyOptions({ visible });
      if (visible && data.length > 0) s.setData(data);
    }

    applyLine(r.ema21,  toLine(indicators.ema21),  toggles.ema21);
    applyLine(r.ema50,  toLine(indicators.ema50),  toggles.ema50);
    applyLine(r.ema200, toLine(indicators.ema200), toggles.ema200);

    applyLine(r.bbUpper,  toLine(indicators.bollinger.map(p => ({ time: p.time, value: p.upper  }))), toggles.bollinger);
    applyLine(r.bbMiddle, toLine(indicators.bollinger.map(p => ({ time: p.time, value: p.middle }))), toggles.bollinger);
    applyLine(r.bbLower,  toLine(indicators.bollinger.map(p => ({ time: p.time, value: p.lower  }))), toggles.bollinger);

    applyLine(r.rsiLine, toLine(indicators.rsi), toggles.rsi);
    const rsiTimes = indicators.rsi.map(p => p.time);
    applyLine(r.rsiOb, rsiLevelData(70, rsiTimes), toggles.rsi);
    applyLine(r.rsiOs, rsiLevelData(30, rsiTimes), toggles.rsi);

    applyLine(r.macdLine, toLine(indicators.macd.map(p => ({ time: p.time, value: p.macd   }))), toggles.macd);
    applyLine(r.macdSig,  toLine(indicators.macd.map(p => ({ time: p.time, value: p.signal }))), toggles.macd);
    applyHist(r.macdHist, toHist(indicators.macd), toggles.macd);

  }, [indicators, toggles]);

  // ── Pattern markers ────────────────────────────────────────────────────────
  useEffect(() => {
    const plugin = markersRef.current;
    if (!plugin) return;

    const markers: SeriesMarker<Time>[] = [];

    for (const p of patterns) {
      // Skip patterns whose toggle is off
      if (!patternToggles[p.name as keyof typeof patternToggles]) continue;

      if (p.bias === 'bullish') {
        markers.push({
          time:     p.time as Time,
          position: 'belowBar',
          shape:    'arrowUp',
          color:    '#22c55e',
          text:     p.name,
          size:     1,
        });
      } else if (p.bias === 'bearish') {
        markers.push({
          time:     p.time as Time,
          position: 'aboveBar',
          shape:    'arrowDown',
          color:    '#ef4444',
          text:     p.name,
          size:     1,
        });
      } else {
        // Doji — circle at price mid
        markers.push({
          time:     p.time as Time,
          position: 'inBar',
          shape:    'circle',
          color:    '#facc15',
          text:     p.name,
          size:     0.6,
        });
      }
    }

    // Sort ascending by time (required by lightweight-charts)
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    plugin.setMarkers(markers);
  }, [patterns, patternToggles]);

  // ── S/R levels ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const srSeries = srSeriesRef.current;
    const candle   = candleRef.current;
    if (!srSeries.length || !candle || candles.length === 0) return;

    const visible = patternToggles['SR Levels'];

    // Build flat line data spanning the full visible range
    const first = candles[Math.max(0, candles.length - 100)].time as Time;
    const last  = candles[candles.length - 1].time as Time;

    for (let i = 0; i < MAX_SR; i++) {
      const level = srLevels[i];
      const s     = srSeries[i];

      if (!level || !visible) {
        s.applyOptions({ visible: false });
        continue;
      }

      s.applyOptions({
        ...srLineOpts(level.type),
        visible: true,
      });

      s.setData([
        { time: first, value: level.price },
        { time: last,  value: level.price },
      ]);
    }
  }, [srLevels, patternToggles, candles]);

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: 500 }} />
  );
}

// Stable crosshair callback wrapper
export function useStableCrosshairCallback(cb: (candle: OHLCVCandle | null) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  return useCallback((c: OHLCVCandle | null) => ref.current(c), []);
}

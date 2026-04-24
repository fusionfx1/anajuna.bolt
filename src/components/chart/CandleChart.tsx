import React, { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type DeepPartial,
  type CandlestickSeriesOptions,
  type LineSeriesOptions,
  type HistogramSeriesOptions,
  type LineData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';
import type { OHLCVCandle } from '../../services/candleService';
import type { IndicatorData } from '../../services/indicators';
import type { IndicatorToggles } from './IndicatorControls';

interface CandleChartProps {
  candles: OHLCVCandle[];
  indicators: IndicatorData;
  toggles: IndicatorToggles;
  onCrosshairMove?: (candle: OHLCVCandle | null) => void;
}

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
  upColor:        '#10b981',
  downColor:      '#ef4444',
  borderUpColor:  '#10b981',
  borderDownColor:'#ef4444',
  wickUpColor:    '#34d399',
  wickDownColor:  '#f87171',
};

function lineOpts(color: string, width = 1): DeepPartial<LineSeriesOptions> {
  return { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
}

function histOpts(color: string): DeepPartial<HistogramSeriesOptions> {
  return { color, priceLineVisible: false, lastValueVisible: false };
}

// RSI horizontal level helper – we draw these as flat line series inside the RSI pane
function rsiLevelData(level: number, times: number[]): LineData<Time>[] {
  return times.map(t => ({ time: t as Time, value: level }));
}

// Refs to every indicator series so we can setData / update without recreating
interface IndicatorSeriesRefs {
  ema21:    ISeriesApi<'Line'> | null;
  ema50:    ISeriesApi<'Line'> | null;
  ema200:   ISeriesApi<'Line'> | null;
  bbUpper:  ISeriesApi<'Line'> | null;
  bbMiddle: ISeriesApi<'Line'> | null;
  bbLower:  ISeriesApi<'Line'> | null;
  rsiLine:  ISeriesApi<'Line'> | null;
  rsiOb:    ISeriesApi<'Line'> | null;
  rsiOs:    ISeriesApi<'Line'> | null;
  macdLine: ISeriesApi<'Line'> | null;
  macdSig:  ISeriesApi<'Line'> | null;
  macdHist: ISeriesApi<'Histogram'> | null;
}

function emptyRefs(): IndicatorSeriesRefs {
  return {
    ema21: null, ema50: null, ema200: null,
    bbUpper: null, bbMiddle: null, bbLower: null,
    rsiLine: null, rsiOb: null, rsiOs: null,
    macdLine: null, macdSig: null, macdHist: null,
  };
}

export function CandleChart({ candles, indicators, toggles, onCrosshairMove }: CandleChartProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const candleRef     = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indRef        = useRef<IndicatorSeriesRefs>(emptyRefs());
  const prevLenRef    = useRef(0);

  // ── Mount: create chart + all series once ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...BASE_CHART_OPTIONS,
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // Pane 0 – candles (default)
    const candleSeries = chart.addSeries(CandlestickSeries, CANDLE_OPTIONS, 0);

    // Overlay series on pane 0
    const ema21Series   = chart.addSeries(LineSeries, lineOpts('#f97316', 1), 0);
    const ema50Series   = chart.addSeries(LineSeries, lineOpts('#22d3ee', 1), 0);
    const ema200Series  = chart.addSeries(LineSeries, lineOpts('#f8fafc', 1), 0);
    const bbUpperSeries = chart.addSeries(LineSeries, lineOpts('#7dd3fc', 1), 0);
    const bbMidSeries   = chart.addSeries(LineSeries, { ...lineOpts('#7dd3fc', 1), lineStyle: 2 }, 0); // dashed
    const bbLowerSeries = chart.addSeries(LineSeries, lineOpts('#7dd3fc', 1), 0);

    // Pane 1 – RSI
    const rsiPane   = chart.addPane();
    rsiPane.moveTo(1);
    const rsiSeries = chart.addSeries(LineSeries, lineOpts('#facc15', 1), 1);
    const rsiOb     = chart.addSeries(LineSeries, { ...lineOpts('#475569', 1), lineStyle: 1 }, 1);
    const rsiOs     = chart.addSeries(LineSeries, { ...lineOpts('#475569', 1), lineStyle: 1 }, 1);

    // Pane 2 – MACD
    chart.addPane();
    const macdLineSeries = chart.addSeries(LineSeries,      lineOpts('#60a5fa', 1), 2);
    const macdSigSeries  = chart.addSeries(LineSeries,      lineOpts('#f87171', 1), 2);
    const macdHistSeries = chart.addSeries(HistogramSeries, histOpts('#22c55e'),    2);

    // Price scales for sub-panes: auto-scale, no fixed range needed
    chart.priceScale('right', 1).applyOptions({ autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } });
    chart.priceScale('right', 2).applyOptions({ autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } });

    chartRef.current   = chart;
    candleRef.current  = candleSeries;
    indRef.current = {
      ema21: ema21Series, ema50: ema50Series, ema200: ema200Series,
      bbUpper: bbUpperSeries, bbMiddle: bbMidSeries, bbLower: bbLowerSeries,
      rsiLine: rsiSeries, rsiOb, rsiOs,
      macdLine: macdLineSeries, macdSig: macdSigSeries, macdHist: macdHistSeries,
    };

    // Resize observer
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      indRef.current = emptyRefs();
      prevLenRef.current = 0;
    };
  }, []);

  // ── Crosshair subscription ─────────────────────────────────────────────────
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

  // ── Feed candle data (smart append) ───────────────────────────────────────
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

  // ── Apply indicator data + toggle visibility ───────────────────────────────
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

    // Helper that sets data and applies visibility
    function applyLine(
      s: ISeriesApi<'Line'> | null,
      data: LineData<Time>[],
      visible: boolean
    ) {
      if (!s) return;
      s.applyOptions({ visible });
      if (visible && data.length > 0) s.setData(data);
    }

    function applyHist(
      s: ISeriesApi<'Histogram'> | null,
      data: HistogramData<Time>[],
      visible: boolean
    ) {
      if (!s) return;
      s.applyOptions({ visible });
      if (visible && data.length > 0) s.setData(data);
    }

    // EMA overlays
    applyLine(r.ema21,  toLine(indicators.ema21),  toggles.ema21);
    applyLine(r.ema50,  toLine(indicators.ema50),  toggles.ema50);
    applyLine(r.ema200, toLine(indicators.ema200), toggles.ema200);

    // Bollinger
    const bbVisible = toggles.bollinger;
    applyLine(r.bbUpper,  toLine(indicators.bollinger.map(p => ({ time: p.time, value: p.upper  }))), bbVisible);
    applyLine(r.bbMiddle, toLine(indicators.bollinger.map(p => ({ time: p.time, value: p.middle }))), bbVisible);
    applyLine(r.bbLower,  toLine(indicators.bollinger.map(p => ({ time: p.time, value: p.lower  }))), bbVisible);

    // RSI
    const rsiVisible = toggles.rsi;
    applyLine(r.rsiLine, toLine(indicators.rsi), rsiVisible);

    const rsiTimes = indicators.rsi.map(p => p.time);
    applyLine(r.rsiOb, rsiLevelData(70, rsiTimes), rsiVisible);
    applyLine(r.rsiOs, rsiLevelData(30, rsiTimes), rsiVisible);

    // MACD
    const macdVisible = toggles.macd;
    applyLine(r.macdLine, toLine(indicators.macd.map(p => ({ time: p.time, value: p.macd   }))), macdVisible);
    applyLine(r.macdSig,  toLine(indicators.macd.map(p => ({ time: p.time, value: p.signal }))), macdVisible);
    applyHist(r.macdHist, toHist(indicators.macd), macdVisible);

  }, [indicators, toggles]);

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: 500 }} />
  );
}

// Stable crosshair callback wrapper
export function useStableCrosshairCallback(
  cb: (candle: OHLCVCandle | null) => void
) {
  const ref = useRef(cb);
  ref.current = cb;
  return useCallback((c: OHLCVCandle | null) => ref.current(c), []);
}

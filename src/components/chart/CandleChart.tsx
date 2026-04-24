import React, { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
  type DeepPartial,
} from 'lightweight-charts';
import type { OHLCVCandle } from '../../services/candleService';

interface CandleChartProps {
  candles: OHLCVCandle[];
  onCrosshairMove?: (candle: OHLCVCandle | null) => void;
}

const CHART_OPTIONS = {
  layout: {
    background: { color: '#020617' },   // slate-950
    textColor: '#94a3b8',               // slate-400
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
  },
  grid: {
    vertLines: { color: '#1e293b' },    // slate-800
    horzLines: { color: '#1e293b' },
  },
  crosshair: {
    vertLine: {
      color: '#475569',
      labelBackgroundColor: '#1e293b',
    },
    horzLine: {
      color: '#475569',
      labelBackgroundColor: '#1e293b',
    },
  },
  rightPriceScale: {
    borderColor: '#1e293b',
    textColor: '#64748b',
  },
  timeScale: {
    borderColor: '#1e293b',
    timeVisible: true,
    secondsVisible: false,
    fixLeftEdge: false,
    fixRightEdge: false,
  },
  handleScroll: { mouseWheel: true, pressedMouseMove: true },
  handleScale: { mouseWheel: true, pinch: true },
} as const;

const SERIES_OPTIONS: DeepPartial<CandlestickSeriesOptions> = {
  upColor: '#10b981',            // emerald-500
  downColor: '#ef4444',          // red-500
  borderUpColor: '#10b981',
  borderDownColor: '#ef4444',
  wickUpColor: '#34d399',        // emerald-400
  wickDownColor: '#f87171',      // red-400
};

export function CandleChart({ candles, onCrosshairMove }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Initialize chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, SERIES_OPTIONS);

    chartRef.current = chart;
    seriesRef.current = series;

    // Resize observer keeps chart in sync with container dimensions
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        chart.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Crosshair subscription — wired separately so it can reference onCrosshairMove
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !onCrosshairMove) return;

    chart.subscribeCrosshairMove(param => {
      if (!param || !param.time) {
        onCrosshairMove(null);
        return;
      }
      const bar = param.seriesData.get(series) as OHLCVCandle | undefined;
      onCrosshairMove(bar ?? null);
    });
  }, [onCrosshairMove]);

  // Feed data — full replace when candles array reference changes
  const prevLengthRef = useRef(0);
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candles.length === 0) return;

    if (candles.length < prevLengthRef.current) {
      // Full instrument/timeframe change — replace everything
      series.setData(candles);
      chartRef.current?.timeScale().fitContent();
    } else if (candles.length > prevLengthRef.current) {
      // Auto-refresh: only upsert new/updated tail candles
      const newSlice = candles.slice(prevLengthRef.current - 1);
      newSlice.forEach(c => series.update(c));
    }

    prevLengthRef.current = candles.length;
  }, [candles]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: 500 }}
    />
  );
}

// Stable callback wrapper so parent can pass a non-memo'd handler without re-mounting
export function useStableCrosshairCallback(
  cb: (candle: OHLCVCandle | null) => void
) {
  const ref = useRef(cb);
  ref.current = cb;
  return useCallback((c: OHLCVCandle | null) => ref.current(c), []);
}

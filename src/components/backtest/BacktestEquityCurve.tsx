import { useRef, useEffect } from 'react';
import { createChart, LineSeries, AreaSeries } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';
import type { EquityCurvePoint } from '../../types/backtest';

interface Props {
  data: EquityCurvePoint[];
  height?: number;
}

export function BacktestEquityCurve({ data, height = 220 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length < 2) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0f172a' },
        textColor: '#64748b',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        horzLine: { color: '#334155', labelBackgroundColor: '#334155' },
        vertLine: { color: '#334155', labelBackgroundColor: '#334155' },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
      },
      height,
    });

    chartRef.current = chart;

    // Equity line
    const equitySeries = chart.addSeries(LineSeries, {
      color: '#0ea5e9',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    equitySeries.setData(
      data.map(d => ({ time: d.time as UTCTimestamp, value: d.equity }))
    );

    // Drawdown area (inverted, shown below)
    const drawdownSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(239, 68, 68, 0.15)',
      bottomColor: 'rgba(239, 68, 68, 0.01)',
      lineColor: 'rgba(239, 68, 68, 0.4)',
      lineWidth: 1,
      priceScaleId: 'drawdown',
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chart.priceScale('drawdown').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    drawdownSeries.setData(
      data.map(d => ({ time: d.time as UTCTimestamp, value: d.drawdownPct }))
    );

    chart.timeScale().fitContent();

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height]);

  if (data.length < 2) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-sm text-slate-600">
        Not enough data for equity curve
      </div>
    );
  }

  const first = data[0];
  const last = data[data.length - 1];
  const returnPct = ((last.equity - first.balance) / first.balance * 100).toFixed(2);
  const isUp = last.equity >= first.balance;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">Equity Curve</h3>
        <span className={`text-xs font-semibold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
          {isUp ? '+' : ''}{returnPct}% return
        </span>
      </div>
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}

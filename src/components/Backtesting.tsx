import React, { useState, useCallback } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { useStrategies } from '../hooks/useSupabaseData';
import { useAuth } from '../context/AuthContext';
import { useBacktest } from '../hooks/useBacktest';
import { generateHistoricalCandles, fetchHistoricalCandles, saveBacktestRun, upsertCandles } from '../services/backtestService';
import { BacktestConfigPanel } from './backtest/BacktestConfig';
import { BacktestProgressBar } from './backtest/BacktestProgress';
import { BacktestResultsPanel } from './backtest/BacktestResults';
import { BacktestTradeLog } from './backtest/BacktestTradeLog';
import { BacktestEquityCurve } from './backtest/BacktestEquityCurve';
import { BacktestRunHistory } from './backtest/BacktestRunHistory';
import type { BacktestConfig, BacktestResult, BacktestRun, BacktestInstrument, BacktestGranularity } from '../types/backtest';

export function Backtesting() {
  const { user } = useAuth();
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { status, progress, result, error, run, cancel, reset } = useBacktest();

  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<BacktestResult | null>(null);
  const [lastConfig, setLastConfig] = useState<BacktestConfig | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const activeResult = result ?? savedResult;
  const activeConfig = lastConfig;

  // Run backtest
  const handleRun = useCallback(async (config: BacktestConfig) => {
    setLastConfig(config);
    setSavedResult(null);
    setDownloadMsg(null);

    // Try fetching from Supabase first, fall back to generated candles
    let candles;
    try {
      candles = await fetchHistoricalCandles(
        config.instrument, config.granularity, config.startDate, config.endDate,
      );
    } catch {
      candles = [];
    }

    if (candles.length < 50) {
      candles = generateHistoricalCandles(
        config.instrument, config.granularity, config.startDate, config.endDate,
      );
    }

    if (candles.length < 2) {
      setDownloadMsg('Not enough candle data for this date range.');
      return;
    }

    run(config, candles);
  }, [run]);

  // Save completed run to Supabase
  const handleSaveRun = useCallback(async () => {
    if (!user || !activeResult || !activeConfig) return;
    try {
      await saveBacktestRun(user.id, {
        strategyId: activeConfig.strategyId,
        strategyName: activeConfig.strategyName,
        strategyType: activeConfig.strategyType,
        instrument: activeConfig.instrument,
        granularity: activeConfig.granularity,
        startDate: activeConfig.startDate,
        endDate: activeConfig.endDate,
        initialBalance: activeConfig.initialBalance,
        config: activeConfig.strategyConfig,
        results: activeResult.metrics,
        tradeLog: activeResult.trades,
        equityCurve: activeResult.equityCurve,
        candleCount: activeResult.candleCount,
      });
      setHistoryRefreshKey(k => k + 1);
    } catch {
      // ignore
    }
  }, [user, activeResult, activeConfig]);

  // Auto-save on completion
  React.useEffect(() => {
    if (status === 'completed' && result && user && lastConfig) {
      handleSaveRun();
    }
  }, [status, result, user, lastConfig, handleSaveRun]);

  // Download historical data
  const handleDownloadData = useCallback(async (
    instrument: BacktestInstrument, granularity: BacktestGranularity, from: string, to: string,
  ) => {
    setDownloading(true);
    setDownloadMsg(null);
    try {
      const candles = generateHistoricalCandles(instrument, granularity, from, to);
      const inserted = await upsertCandles(instrument, granularity, candles);
      setDownloadMsg(`Saved ${inserted.toLocaleString()} simulated candles for ${instrument} / ${granularity}`);
    } catch (err) {
      setDownloadMsg(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDownloading(false);
    }
  }, []);

  // Load a past run
  const handleSelectRun = useCallback((pastRun: BacktestRun) => {
    reset();
    setSavedResult({
      metrics: pastRun.results,
      trades: pastRun.trade_log,
      equityCurve: pastRun.equity_curve,
      candleCount: pastRun.candle_count,
    });
    setLastConfig({
      strategyId: pastRun.strategy_id,
      strategyName: pastRun.strategy_name,
      strategyType: pastRun.strategy_type as BacktestConfig['strategyType'],
      instrument: pastRun.instrument as BacktestInstrument,
      granularity: pastRun.granularity as BacktestGranularity,
      startDate: pastRun.start_date,
      endDate: pastRun.end_date,
      initialBalance: pastRun.initial_balance,
      commissionPips: 0,
      slippage: 'none',
      slippagePips: 0,
      positionSizing: 'fixed',
      lotSize: 10000,
      riskPct: 1,
      strategyConfig: pastRun.config,
    });
  }, [reset]);

  return (
    <div className="p-6 space-y-5">
      {/* Configuration */}
      <BacktestConfigPanel
        strategies={strategies}
        strategiesLoading={strategiesLoading}
        status={status}
        onRun={handleRun}
        onCancel={cancel}
        onDownloadData={handleDownloadData}
        downloading={downloading}
      />

      {/* Download message */}
      {downloadMsg && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
          downloadMsg.includes('failed')
            ? 'bg-red-500/8 border-red-500/20 text-red-400'
            : 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400'
        }`}>
          <Info size={14} />
          {downloadMsg}
        </div>
      )}

      {/* Progress */}
      {status === 'running' && <BacktestProgressBar progress={progress} />}

      {/* Error */}
      {status === 'failed' && error && (
        <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Backtest failed</p>
            <p className="text-xs text-red-300/70 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {activeResult && activeResult.metrics.totalTrades > 0 && (
        <>
          {/* Header strip */}
          {activeConfig && (
            <div className="flex items-center justify-between p-3 bg-slate-800/30 border border-slate-700/40 rounded-lg">
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="font-medium text-slate-300">{activeConfig.strategyName}</span>
                <span className="text-slate-600">|</span>
                <span>{activeConfig.instrument.replace('_', '/')}</span>
                <span className="text-slate-600">|</span>
                <span>{activeConfig.granularity}</span>
                <span className="text-slate-600">|</span>
                <span>{activeResult.candleCount.toLocaleString()} candles</span>
              </div>
              <span className={`text-xs font-bold tabular-nums ${activeResult.metrics.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {activeResult.metrics.netPnl >= 0 ? '+' : ''}${activeResult.metrics.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Equity curve */}
          <BacktestEquityCurve data={activeResult.equityCurve} />

          {/* Metrics */}
          <BacktestResultsPanel
            metrics={activeResult.metrics}
            initialBalance={activeConfig?.initialBalance ?? 10000}
          />

          {/* Trade log */}
          <BacktestTradeLog trades={activeResult.trades} />
        </>
      )}

      {/* No trades generated */}
      {activeResult && activeResult.metrics.totalTrades === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <Info size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-400 mb-1">No trades generated</p>
          <p className="text-xs text-slate-600">
            The strategy did not produce any entry signals in this date range.
            Try a wider date range, different instrument, or adjust strategy parameters.
          </p>
        </div>
      )}

      {/* Run history */}
      <BacktestRunHistory onSelectRun={handleSelectRun} refreshKey={historyRefreshKey} />
    </div>
  );
}

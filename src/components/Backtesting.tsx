import React, { useState, useCallback } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { useStrategies } from '../hooks/useSupabaseData';
import { useAuth } from '../context/AuthContext';
import { useBacktest } from '../hooks/useBacktest';
import { useComparisonBacktest } from '../hooks/useComparisonBacktest';
import { generateHistoricalCandles, fetchHistoricalCandles, saveBacktestRun, upsertCandles } from '../services/backtestService';
import { fetchOHLCV } from '../services/dataFetchers/fetchOHLCV';
import { BacktestConfigPanel } from './backtest/BacktestConfig';
import { BacktestProgressBar } from './backtest/BacktestProgress';
import { BacktestResultsPanel } from './backtest/BacktestResults';
import { BacktestTradeLog } from './backtest/BacktestTradeLog';
import { BacktestEquityCurve } from './backtest/BacktestEquityCurve';
import { BacktestRunHistory } from './backtest/BacktestRunHistory';
import { BacktestDataSource } from './backtest/BacktestDataSource';
import { ComparisonResults } from './backtest/ComparisonResults';
import type { BacktestConfig, BacktestResult, BacktestRun, BacktestInstrument, BacktestGranularity } from '../types/backtest';
import type { DataProvider } from '../types/dataFeed';

export function Backtesting() {
  const { user } = useAuth();
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { status, progress, result, error, run, cancel, reset } = useBacktest();
  const {
    loading: comparisonLoading,
    error: comparisonError,
    results: comparisonResults,
    runComparison,
  } = useComparisonBacktest();

  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<BacktestResult | null>(null);
  const [lastConfig, setLastConfig] = useState<BacktestConfig | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [usedSyntheticCandles, setUsedSyntheticCandles] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<DataProvider>('synthetic');

  const activeResult = result ?? savedResult;
  const activeConfig = lastConfig;

  // Run backtest
  const handleRun = useCallback(async (config: BacktestConfig) => {
    setLastConfig(config);
    setSavedResult(null);
    setDownloadMsg(null);
    setUsedSyntheticCandles(false);

    let candles;
    let isSynthetic = false;

    // Try fetching from selected provider using fetchOHLCV
    try {
      const result = await fetchOHLCV({
        symbol: config.instrument,
        startDate: new Date(config.startDate),
        endDate: new Date(config.endDate),
        provider: selectedProvider,
        useCache: true,
      });

      // Convert NormalizedCandle[] to Candle[]
      candles = result.candles.map(c => ({
        time: Math.floor(c.timestamp.getTime() / 1000),
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
        volume: c.v,
      }));
    } catch {
      candles = [];
    }

    // Fallback to synthetic if not enough real data
    if (candles.length < 50) {
      candles = generateHistoricalCandles(
        config.instrument, config.granularity, config.startDate, config.endDate,
      );
      isSynthetic = true;
      setUsedSyntheticCandles(true);
    }

    if (candles.length < 2) {
      setDownloadMsg('Not enough candle data for this date range.');
      return;
    }

    run(config, candles);
  }, [run, selectedProvider]);

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
        candleSource: usedSyntheticCandles ? 'synthetic' : 'historical',
      });
      setHistoryRefreshKey(k => k + 1);
    } catch {
      // ignore
    }
  }, [user, activeResult, activeConfig, usedSyntheticCandles]);

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
      candleSource: pastRun.candle_source,
    });
    setUsedSyntheticCandles(pastRun.candle_source === 'synthetic');
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
      {/* Data Provider Selection */}
      <div className="rounded-lg border border-slate-700 p-4 bg-slate-800/30">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Data Source</h3>
        <BacktestDataSource
          selectedProvider={selectedProvider}
          onProviderChange={setSelectedProvider}
          disabled={status === 'running'}
          showDescription={true}
        />
      </div>

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

      {/* Synthetic data warning */}
      {usedSyntheticCandles && (
        <div className="flex items-center gap-3 bg-amber-500/15 border border-amber-500/30 rounded-lg p-4">
          <AlertCircle size={18} className="text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-200">Backtesting with Simulated Data</p>
            <p className="text-xs text-amber-300/80">No historical data was available. These results use synthetically generated price candles and may not reflect real market conditions.</p>
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
                {usedSyntheticCandles && <span className="text-amber-400 font-medium">(synthetic)</span>}
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

          {/* Comparison Results */}
          {activeConfig && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Provider Comparison</h3>
                <button
                  onClick={() => runComparison(activeConfig.strategyConfig, activeConfig.instrument, activeConfig.startDate, activeConfig.endDate)}
                  disabled={comparisonLoading || !activeConfig}
                  className="text-xs px-3 py-1.5 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 disabled:opacity-50"
                >
                  {comparisonLoading ? 'Comparing...' : 'Compare All Providers'}
                </button>
              </div>
              <ComparisonResults
                loading={comparisonLoading}
                error={comparisonError}
                results={comparisonResults}
              />
            </div>
          )}
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

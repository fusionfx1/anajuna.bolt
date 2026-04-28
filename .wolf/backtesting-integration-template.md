# Backtesting.tsx Integration Template

Multi-provider data backtesting integration. This template shows the structure and patterns needed to add provider selection and comparison results to the existing Backtesting component.

## Imports (Add to existing imports)

```typescript
import { BacktestDataSource } from './backtest/BacktestDataSource'
import { ComparisonResults } from './backtest/ComparisonResults'
import { useComparisonBacktest } from '../hooks/useComparisonBacktest'
import type { DataProvider } from '../types/dataFeed'
```

## State Management (Add to component)

```typescript
// Provider selection
const [selectedProvider, setSelectedProvider] = useState<DataProvider>('synthetic')

// Comparison backtest state
const {
  state: comparisonResults,
  runComparison,
  loading: comparisonLoading,
  error: comparisonError,
  reset: resetComparison,
} = useComparisonBacktest()
```

## Updated handleRun Callback

Replace existing handleRun with logic that:
1. Stores the selected provider in lastConfig
2. Optionally triggers comparison across all providers
3. Resets comparison results when a new backtest starts

```typescript
const handleRun = useCallback(async (config: BacktestConfig) => {
  setLastConfig({ ...config, dataProvider: selectedProvider })
  setSavedResult(null)
  setDownloadMsg(null)
  setUsedSyntheticCandles(false)
  resetComparison()

  // Fetch candles using selected provider
  let candles
  let isSynthetic = false
  try {
    // Call dataFetchers/fetchOHLCV with selectedProvider
    // candles = await fetchOHLCV(config.instrument, config.granularity, config.startDate, config.endDate, selectedProvider)
    candles = await fetchHistoricalCandles(config.instrument, config.granularity, config.startDate, config.endDate)
  } catch {
    candles = []
  }

  if (candles.length < 50) {
    candles = generateHistoricalCandles(config.instrument, config.granularity, config.startDate, config.endDate)
    isSynthetic = true
    setUsedSyntheticCandles(true)
  }

  if (candles.length < 2) {
    setDownloadMsg('Not enough candle data for this date range.')
    return
  }

  run(config, candles)

  // Optionally trigger comparison across all providers
  // runComparison(config, candles)
}, [run, selectedProvider, resetComparison, runComparison])
```

## JSX Structure (Integration Points)

### 1. Provider Selection Panel (Add before BacktestConfigPanel)

```typescript
<div className="rounded-lg border border-slate-700 p-4 bg-slate-800/30">
  <h3 className="text-sm font-semibold text-slate-200 mb-4">Data Source</h3>
  <BacktestDataSource
    selectedProvider={selectedProvider}
    onProviderChange={setSelectedProvider}
    disabled={status === 'running'}
    showDescription={true}
  />
</div>
```

### 2. Comparison Results Panel (Add after metrics/trade log)

```typescript
{activeResult && (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-slate-200">Provider Comparison</h3>
      <button
        onClick={() => runComparison(activeConfig!, activeResult.trades)}
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
```

## TypeScript Types (Add or update)

```typescript
// Extend BacktestConfig to include provider (if not using per-backtest selection)
interface BacktestConfig {
  // ... existing fields
  dataProvider?: DataProvider
}

// Or keep provider selection stateless (recommended):
// - selectedProvider stays in component state
// - pass to config only when saving to history
```

## Key Decisions

1. **Provider Selection Scope**: 
   - Global (one provider per session) vs Per-Backtest (store in config)
   - Template uses per-backtest (store in config for history)

2. **Comparison Triggering**:
   - Manual button (recommended) vs Auto-trigger on every run
   - Template shows manual button

3. **Display Location**:
   - Below single-provider results (recommended)
   - In separate tab (alternative)
   - Template shows integrated below results

## Integration Checklist

- [ ] Add imports for BacktestDataSource, ComparisonResults, useComparisonBacktest
- [ ] Add selectedProvider and comparison hook state
- [ ] Add provider selection UI before BacktestConfigPanel
- [ ] Update handleRun to use selectedProvider when fetching candles
- [ ] Add comparison results panel after main results
- [ ] Test single provider selection works
- [ ] Test comparison across all three providers
- [ ] Verify provider colors display correctly
- [ ] Check loading/error states for comparison

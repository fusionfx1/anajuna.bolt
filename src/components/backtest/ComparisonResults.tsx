import React from 'react'
import { TrendingUp, AlertCircle, Loader2 } from 'lucide-react'
import type { ComparisonBacktestState, BacktestMetrics } from '../../hooks/useComparisonBacktest'

interface ComparisonResultsProps {
  loading: boolean
  error: string | null
  results: ComparisonBacktestState
}

const PROVIDER_LABELS = {
  eodhd: 'EODHD',
  tiingo: 'Tiingo',
  synthetic: 'Synthetic',
}

const PROVIDER_COLORS = {
  eodhd: 'sky',
  tiingo: 'purple',
  synthetic: 'amber',
} as const

function MetricCard({
  label,
  value,
  format = (v) => v.toFixed(2),
  highlight = false,
}: {
  label: string
  value: number
  format?: (v: number) => string
  highlight?: boolean
}) {
  const isPositive = value >= 0
  const colorClass = isPositive ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`text-lg font-bold tabular-nums ${colorClass} ${
          highlight ? 'text-xl' : ''
        }`}
      >
        {isPositive ? '+' : ''}{format(value)}
      </p>
    </div>
  )
}

function ProviderResultCard({
  provider,
  metrics,
}: {
  provider: 'eodhd' | 'tiingo' | 'synthetic'
  metrics: BacktestMetrics
}) {
  const colors = {
    eodhd: { bg: 'bg-sky-500/10 border-sky-500/30', badge: 'bg-sky-500/20 text-sky-300' },
    tiingo: { bg: 'bg-purple-500/10 border-purple-500/30', badge: 'bg-purple-500/20 text-purple-300' },
    synthetic: { bg: 'bg-amber-500/10 border-amber-500/30', badge: 'bg-amber-500/20 text-amber-300' },
  }

  return (
    <div className={`border rounded-lg p-4 space-y-4 ${colors[provider].bg}`}>
      <div className={`inline-block px-2.5 py-1 rounded text-xs font-semibold ${colors[provider].badge}`}>
        {PROVIDER_LABELS[provider]}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label="Total Return"
          value={metrics.totalReturn}
          format={(v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          highlight
        />
        <MetricCard
          label="Win Rate"
          value={metrics.winRate * 100}
          format={(v) => `${v.toFixed(1)}%`}
        />
        <MetricCard
          label="Sharpe Ratio"
          value={metrics.sharpeRatio}
        />
        <MetricCard
          label="Max Drawdown"
          value={metrics.maxDrawdown}
          format={(v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
      </div>
    </div>
  )
}

export function ComparisonResults({
  loading,
  error,
  results,
}: ComparisonResultsProps) {
  const hasResults = Object.keys(results).length > 0

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="text-sky-400 animate-spin" />
          <p className="text-sm text-slate-400">Comparing data sources...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
        <AlertCircle size={16} className="text-red-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-red-400">Comparison failed</p>
          <p className="text-xs text-red-300/70 mt-0.5">{error}</p>
        </div>
      </div>
    )
  }

  if (!hasResults) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
        <TrendingUp size={32} className="text-slate-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-400">
          No comparison results yet
        </p>
        <p className="text-xs text-slate-600 mt-1">
          Run a backtest to compare results across data sources
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp size={18} className="text-sky-400" />
        <h3 className="text-sm font-semibold text-slate-200">
          Data Source Comparison
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {results.eodhd && (
          <ProviderResultCard provider="eodhd" metrics={results.eodhd.metrics} />
        )}
        {results.tiingo && (
          <ProviderResultCard
            provider="tiingo"
            metrics={results.tiingo.metrics}
          />
        )}
        {results.synthetic && (
          <ProviderResultCard
            provider="synthetic"
            metrics={results.synthetic.metrics}
          />
        )}
      </div>

      {Object.keys(results).length < 3 && (
        <div className="flex items-start gap-2 p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
          <AlertCircle size={14} className="text-slate-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400">
            Only {Object.keys(results).length} of 3 data sources available. Configure API keys to enable all sources.
          </p>
        </div>
      )}
    </div>
  )
}

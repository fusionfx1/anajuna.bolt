import { FetchResult } from '../services/dataFetchers/types'

interface BacktestMetrics {
  totalReturn: number
  sharpeRatio: number
  maxDrawdown: number
  winRate: number
}

interface ComparisonResultsProps {
  eodhd?: {
    fetchResult: FetchResult
    metrics: BacktestMetrics
  }
  tiingo?: {
    fetchResult: FetchResult
    metrics: BacktestMetrics
  }
  synthetic?: {
    fetchResult: FetchResult
    metrics: BacktestMetrics
  }
}

export function ComparisonResults({
  eodhd,
  tiingo,
  synthetic,
}: ComparisonResultsProps) {
  const results = [
    { label: 'EODHD', data: eodhd },
    { label: 'Tiingo', data: tiingo },
    { label: 'Synthetic', data: synthetic },
  ].filter((r) => r.data)

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No comparison results available
      </div>
    )
  }

  // Calculate the biggest difference in Sharpe Ratio
  const sharpes = results
    .map((r) => r.data?.metrics.sharpeRatio || 0)
    .filter((s) => s > 0)
  const maxSharpe = Math.max(...sharpes)
  const minSharpe = Math.min(...sharpes)
  const sharpeDiff = maxSharpe - minSharpe

  return (
    <div className="space-y-6">
      {/* Results Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {results.map(({ label, data }) => {
          if (!data) return null
          const { fetchResult, metrics } = data
          const isHighlighted =
            sharpeDiff > 0 && metrics.sharpeRatio === maxSharpe

          return (
            <div
              key={label}
              className={`border rounded-lg p-4 space-y-3 transition-colors ${
                isHighlighted
                  ? 'bg-green-50 border-green-300'
                  : 'bg-gray-50 border-gray-300'
              }`}
            >
              <div className="flex justify-between items-start">
                <h4 className="font-semibold text-sm">{label}</h4>
                <div className="text-xs space-y-1 text-right">
                  {fetchResult.fromCache ? (
                    <>
                      <div className="text-green-600">✓ From cache</div>
                      {fetchResult.cachedAt && (
                        <div className="text-gray-500">
                          {getDaysAgo(fetchResult.cachedAt)} days old
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-blue-600">⟳ Fresh API call</div>
                  )}
                  {label === 'Synthetic' && (
                    <div className="text-gray-500">⊗ Deterministic</div>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Return</span>
                  <span className="font-medium">
                    {(metrics.totalReturn * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Sharpe</span>
                  <span
                    className={`font-medium ${
                      isHighlighted ? 'text-green-600' : ''
                    }`}
                  >
                    {metrics.sharpeRatio.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Max Drawdown</span>
                  <span className="font-medium text-red-600">
                    {(metrics.maxDrawdown * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Win Rate</span>
                  <span className="font-medium">
                    {(metrics.winRate * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t text-xs text-gray-500">
                {fetchResult.count} candles loaded
              </div>
            </div>
          )
        })}
      </div>

      {/* Insight Summary */}
      {results.length > 1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">Insight</h4>
          <p className="text-sm text-gray-700">{generateInsight(results)}</p>
        </div>
      )}

      {/* Data Source Notes */}
      <div className="bg-gray-50 border rounded-lg p-4 text-xs text-gray-600 space-y-2">
        <div>
          <span className="font-medium">EODHD:</span> EOD Historical Data
          (high accuracy, rate limited)
        </div>
        <div>
          <span className="font-medium">Tiingo:</span> Tiingo API (daily data
          quality)
        </div>
        <div>
          <span className="font-medium">Synthetic:</span> Generated data
          (deterministic, unrealistic)
        </div>
      </div>
    </div>
  )
}

function getDaysAgo(date: Date): number {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function generateInsight(
  results: Array<{
    label: string
    data?: {
      fetchResult: FetchResult
      metrics: BacktestMetrics
    }
  }>
): string {
  const validResults = results.filter((r) => r.data)

  if (validResults.length < 2) {
    return 'Only one provider available. Add API keys to compare data quality.'
  }

  const sharpes = validResults.map(
    (r) => r.data?.metrics.sharpeRatio || 0
  )
  const returns = validResults.map(
    (r) => r.data?.metrics.totalReturn || 0
  )
  const allAgree = Math.max(...sharpes) - Math.min(...sharpes) < 0.1

  let insight = ''

  if (allAgree) {
    insight +=
      'Providers agree on direction. Risk metrics are consistent. '
  } else {
    const highest = validResults[
      sharpes.indexOf(Math.max(...sharpes))
    ]?.label
    const lowest = validResults[
      sharpes.indexOf(Math.min(...sharpes))
    ]?.label
    insight += `${highest} shows stronger risk-adjusted returns than ${lowest}. `
  }

  const returnSpread = Math.max(...returns) - Math.min(...returns)
  if (returnSpread > 0.05) {
    insight += 'Data quality differs noticeably between providers.'
  } else {
    insight += 'Expected returns are similar across providers.'
  }

  return insight
}

import { ProviderType } from '../services/dataFetchers/types'
import { useDataProvider } from '../context/DataProviderContext'

interface BacktestDataSourceProps {
  selectedProvider: ProviderType | 'default'
  onProviderChange: (provider: ProviderType | 'default') => void
  compareProviders: boolean
  onCompareChange: (compare: boolean) => void
  useCache: boolean
  onCacheChange: (useCache: boolean) => void
}

export function BacktestDataSource({
  selectedProvider,
  onProviderChange,
  compareProviders,
  onCompareChange,
  useCache,
  onCacheChange,
}: BacktestDataSourceProps) {
  const { primaryProvider } = useDataProvider()

  const providers: Array<{
    value: ProviderType | 'default'
    label: string
  }> = [
    { value: 'default', label: `Use Default (${primaryProvider})` },
    { value: 'eodhd', label: 'Use EODHD' },
    { value: 'tiingo', label: 'Use Tiingo' },
    { value: 'synthetic', label: 'Use Synthetic' },
  ]

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-gray-50">
      <h4 className="font-semibold text-sm">Data Source</h4>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-2">Provider</label>
          <select
            value={selectedProvider}
            onChange={(e) =>
              onProviderChange(e.target.value as ProviderType | 'default')
            }
            className="w-full px-3 py-2 border rounded text-sm"
          >
            {providers.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={compareProviders}
            onChange={(e) => onCompareChange(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm">
            Compare All Providers
            {compareProviders && (
              <span className="text-gray-500 text-xs ml-1">
                (runs 3 backtests)
              </span>
            )}
          </span>
        </label>

        <div className="flex gap-2">
          <button
            onClick={() => onCacheChange(true)}
            className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
              useCache
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            Use Cache
          </button>
          <button
            onClick={() => onCacheChange(false)}
            className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
              !useCache
                ? 'bg-amber-500 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            Force Refresh
          </button>
        </div>
      </div>

      {compareProviders && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
          ℹ️ Comparison mode will run identical backtests on EODHD, Tiingo, and Synthetic
          data. Results will be displayed side-by-side to highlight differences.
        </div>
      )}
    </div>
  )
}

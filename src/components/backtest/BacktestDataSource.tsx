import { Database, AlertCircle } from 'lucide-react'
import type { DataProvider } from '../../types/dataFeed'

const PROVIDERS: DataProvider[] = ['eodhd', 'tiingo', 'synthetic']

const PROVIDER_DESCRIPTIONS: Record<DataProvider, string> = {
  eodhd: 'Global market data, 30+ years historical',
  tiingo: 'Tiingo data for US equities and crypto',
  synthetic: 'Simulated data for testing strategies',
  polygon: 'Polygon.io real-time data',
  alpaca: 'Alpaca Markets streaming data',
  simulation: 'Simulation mode',
}

const PROVIDER_LABELS: Record<DataProvider, string> = {
  eodhd: 'EODHD',
  tiingo: 'Tiingo',
  synthetic: 'Synthetic',
  polygon: 'Polygon',
  alpaca: 'Alpaca',
  simulation: 'Simulation',
}

interface BacktestDataSourceProps {
  selectedProvider: DataProvider
  onProviderChange: (provider: DataProvider) => void
  disabled?: boolean
  showDescription?: boolean
}

export function BacktestDataSource({
  selectedProvider,
  onProviderChange,
  disabled = false,
  showDescription = true,
}: BacktestDataSourceProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Database size={16} className="text-sky-400" />
        <label className="text-sm font-semibold text-slate-200">Data Source</label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {PROVIDERS.map((provider) => (
          <button
            key={provider}
            onClick={() => onProviderChange(provider)}
            disabled={disabled}
            className={`px-4 py-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
              selectedProvider === provider
                ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {PROVIDER_LABELS[provider]}
          </button>
        ))}
      </div>

      {showDescription && (
        <p className="text-xs text-slate-500 mt-2">
          {PROVIDER_DESCRIPTIONS[selectedProvider]}
        </p>
      )}

      {selectedProvider === 'synthetic' && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-lg">
          <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            Synthetic data is for testing only. Results may not reflect real market conditions.
          </p>
        </div>
      )}
    </div>
  )
}

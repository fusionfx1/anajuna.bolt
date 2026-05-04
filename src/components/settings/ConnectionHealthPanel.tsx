import { Activity, RefreshCw, Wifi, WifiOff, Clock, AlertTriangle } from 'lucide-react'
import { useConnectionHealth, type ProviderHealth, type PingStatus } from '../../hooks/useConnectionHealth'
import { oandaService } from '../../services/oandaService'

const PROVIDER_LABELS: Record<ProviderHealth, string> = {
  eodhd: 'EODHD',
  tiingo: 'Tiingo',
  massive: 'Massive',
  oanda: 'OANDA',
}

const PROVIDER_DESCRIPTIONS: Record<ProviderHealth, string> = {
  eodhd: 'Historical OHLCV data provider',
  tiingo: 'End-of-day price data provider',
  massive: 'Multi-asset REST + WebSocket',
  oanda: 'FX broker / live trading',
}

function StatusBadge({ status, latencyMs }: { status: PingStatus; latencyMs: number | null }) {
  if (status === 'idle') {
    return <span className="text-xs text-slate-500">Not tested</span>
  }
  if (status === 'pinging') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <RefreshCw size={11} className="animate-spin" />
        Pinging…
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-400">
        <WifiOff size={11} />
        Error
      </span>
    )
  }
  const color = status === 'slow' ? 'text-amber-400' : 'text-emerald-400'
  const dot = status === 'slow' ? 'bg-amber-400' : 'bg-emerald-400'
  return (
    <span className={`flex items-center gap-1.5 text-xs ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />
      {latencyMs !== null ? `${latencyMs}ms` : 'OK'}
    </span>
  )
}

function LatencyBar({ latencyMs }: { latencyMs: number | null }) {
  if (latencyMs === null) return null
  const capped = Math.min(latencyMs, 3000)
  const pct = (capped / 3000) * 100
  const color = latencyMs < 500 ? 'bg-emerald-500' : latencyMs < 2000 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="mt-2 h-1 rounded-full bg-slate-700">
      <div className={`h-1 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ConnectionHealthPanel() {
  const { results, pinging, log, pingProvider, pingAll } = useConnectionHealth()
  const oandaConfigured = oandaService.isConfigured()

  const providers: ProviderHealth[] = ['eodhd', 'tiingo', 'massive', 'oanda']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Connection Health</h3>
        </div>
        <button
          onClick={pingAll}
          disabled={pinging.size > 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={11} className={pinging.size > 0 ? 'animate-spin' : ''} />
          Ping All
        </button>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-4 gap-3">
        {providers.map(provider => {
          const result = results[provider]
          const isPinging = pinging.has(provider)
          const isMassiveUnconfigured = provider === 'massive' && !localStorage.getItem('anjuna_devkey_massive')
          const isOandaUnconfigured = provider === 'oanda' && !oandaConfigured
          const isUnconfigured = isOandaUnconfigured || isMassiveUnconfigured

          return (
            <div
              key={provider}
              className="p-4 rounded-xl border border-slate-700 bg-slate-800/50 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{PROVIDER_LABELS[provider]}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{PROVIDER_DESCRIPTIONS[provider]}</p>
                </div>
                {result.status === 'error' ? (
                  <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                ) : result.status === 'ok' || result.status === 'slow' ? (
                  <Wifi size={14} className={result.status === 'slow' ? 'text-amber-400' : 'text-emerald-400'} />
                ) : null}
              </div>

              <StatusBadge status={result.status} latencyMs={result.latencyMs} />
              <LatencyBar latencyMs={result.latencyMs} />

              {result.errorMessage && (
                <p className="text-xs text-red-400 truncate" title={result.errorMessage}>
                  {result.errorMessage}
                </p>
              )}

              {isUnconfigured && (
                <p className="text-xs text-slate-500">
                  {isOandaUnconfigured ? 'Configure in Broker tab first' : 'Add API key in Data Providers'}
                </p>
              )}

              {result.lastChecked && (
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <Clock size={10} />
                  {result.lastChecked.toLocaleTimeString()}
                </div>
              )}

              <button
                onClick={() => pingProvider(provider)}
                disabled={isPinging || isUnconfigured}
                className="w-full py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPinging ? 'Pinging…' : 'Ping'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Connection log */}
      {log.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-700 text-xs font-medium text-slate-400">
            Connection Log
          </div>
          <div className="divide-y divide-slate-700/50 max-h-48 overflow-y-auto">
            {log.map((entry, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      entry.status === 'ok' ? 'bg-emerald-400'
                      : entry.status === 'slow' ? 'bg-amber-400'
                      : 'bg-red-400'
                    }`}
                  />
                  <span className="text-slate-300 font-medium">{PROVIDER_LABELS[entry.provider]}</span>
                  <span className={
                    entry.status === 'ok' ? 'text-emerald-400'
                    : entry.status === 'slow' ? 'text-amber-400'
                    : 'text-red-400'
                  }>
                    {entry.message}
                  </span>
                </div>
                <span className="text-slate-600">{entry.timestamp.toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

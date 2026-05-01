import { useState } from 'react'
import { BarChart2, CheckCircle2, AlertCircle, Loader2, Zap, Save } from 'lucide-react'
import { useDataProvider } from '../../context/DataProviderContext'
import { clearCache, getCacheMetadata } from '../../services/cache'
import { CacheStats } from '../../services/dataFetchers/types'
import { SecretInput } from '../../components/ui/SecretInput'

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  eodhd: 'Historical OHLCV + fundamentals. Requires API key.',
  tiingo: 'End-of-day prices and news. Requires API key.',
  synthetic: 'Generated data. No API key needed.',
}

export function DataProvidersSettings() {
  const {
    primaryProvider,
    setPrimaryProvider,
    hasEodhdKey,
    hasTiingoKey,
    saveEodhdKey,
    saveTiingoKey,
    deleteEodhdKey,
    deleteTiingoKey,
    cacheTTLDays,
    setCacheTTLDays,
    enableCache,
    setEnableCache,
    testConnection,
  } = useDataProvider()

  const [localEodhdKey, setLocalEodhdKey] = useState('')
  const [localTiingoKey, setLocalTiingoKey] = useState('')
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, boolean>>({})
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [clearState, setClearState] = useState<'idle' | 'confirming' | 'clearing' | 'done'>('idle')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleTestConnection = async (provider: string) => {
    setTestingProvider(provider)
    try {
      const key = provider === 'eodhd' ? localEodhdKey : localTiingoKey
      const success = await testConnection(
        provider as 'eodhd' | 'tiingo' | 'synthetic',
        key
      )
      setTestResults(prev => ({ ...prev, [provider]: success }))
    } catch {
      setTestResults(prev => ({ ...prev, [provider]: false }))
    } finally {
      setTestingProvider(null)
    }
  }

  const handleLoadCacheStats = async () => {
    const stats = await getCacheMetadata()
    setCacheStats(stats)
  }

  const handleClearCache = async () => {
    if (clearState === 'idle') {
      setClearState('confirming')
      return
    }
    if (clearState === 'confirming') {
      setClearState('clearing')
      try {
        await clearCache()
        setCacheStats(null)
        setClearState('done')
        setTimeout(() => setClearState('idle'), 2000)
      } catch (error) {
        console.error('Failed to clear cache:', error)
        setClearState('idle')
      }
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (localEodhdKey) await saveEodhdKey(localEodhdKey)
      if (localTiingoKey) await saveTiingoKey(localTiingoKey)
      setLocalEodhdKey('')
      setLocalTiingoKey('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('[DataProviders] Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  const canUseProvider = (provider: string): boolean => {
    if (provider === 'eodhd') return hasEodhdKey
    if (provider === 'tiingo') return hasTiingoKey
    return true
  }

  return (
    <div className="space-y-6">
      {/* Provider selection cards */}
      <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Primary data provider">
        {(['eodhd', 'tiingo', 'synthetic'] as const).map(provider => {
          const selected = primaryProvider === provider
          const disabled = provider !== 'synthetic' && !canUseProvider(provider)
          return (
            <button
              key={provider}
              role="radio"
              aria-checked={selected}
              onClick={() => !disabled && setPrimaryProvider(provider)}
              disabled={disabled}
              className={`text-left p-4 rounded-xl border transition-all ${
                selected
                  ? 'border-emerald-500/40 bg-emerald-500/8 ring-1 ring-emerald-500/20'
                  : disabled
                  ? 'border-slate-800 bg-slate-800/30 opacity-50 cursor-not-allowed'
                  : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${selected ? 'bg-emerald-500/15' : 'bg-slate-700'}`}>
                  <BarChart2 size={14} className={selected ? 'text-emerald-400' : 'text-slate-400'} />
                </div>
                {selected && <CheckCircle2 size={13} className="text-emerald-400" />}
              </div>
              <p className="font-semibold text-sm text-white mb-1">{provider.toUpperCase()}</p>
              <p className="text-xs text-slate-400">{PROVIDER_DESCRIPTIONS[provider]}</p>
            </button>
          )
        })}
      </div>

      {/* No-keys warning */}
      {!hasEodhdKey && !hasTiingoKey && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/8 border border-amber-500/20 text-amber-300 text-xs">
          <AlertCircle size={13} className="shrink-0" />
          No backtest API keys configured — backtests will use synthetic data.
        </div>
      )}

      {/* EODHD Panel */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">EODHD Configuration</p>
        <SecretInput
          id="eodhd-api-key"
          label="EODHD API Key"
          value={localEodhdKey}
          onChange={setLocalEodhdKey}
          placeholder="Enter your EODHD API key"
          hint={hasEodhdKey ? 'Key saved — enter a new key to rotate' : 'Not configured — save a key to enable this provider'}
        />
        {hasEodhdKey && (
          <button
            type="button"
            onClick={deleteEodhdKey}
            className="text-xs text-red-400/70 hover:text-red-400 transition-colors mt-1"
          >
            Remove saved key
          </button>
        )}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => handleTestConnection('eodhd')}
            disabled={testingProvider === 'eodhd' || (!localEodhdKey && !hasEodhdKey)}
            className="flex items-center gap-2 px-3 py-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-lg text-xs font-semibold hover:bg-sky-500/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testingProvider === 'eodhd' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {testingProvider === 'eodhd' ? 'Testing…' : 'Test Connection'}
          </button>
          {testResults['eodhd'] === true && (
            <span className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 size={12} /> Connected
            </span>
          )}
          {testResults['eodhd'] === false && (
            <span className="flex items-center gap-2 text-xs text-red-400" role="alert">
              <AlertCircle size={12} /> Connection failed — check your API key
            </span>
          )}
        </div>
      </div>

      {/* Tiingo Panel */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tiingo Configuration</p>
        <SecretInput
          id="tiingo-api-key"
          label="Tiingo API Key"
          value={localTiingoKey}
          onChange={setLocalTiingoKey}
          placeholder="Enter your Tiingo API key"
          hint={hasTiingoKey ? 'Key saved — enter a new key to rotate' : 'Not configured — save a key to enable this provider'}
        />
        {hasTiingoKey && (
          <button
            type="button"
            onClick={deleteTiingoKey}
            className="text-xs text-red-400/70 hover:text-red-400 transition-colors mt-1"
          >
            Remove saved key
          </button>
        )}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => handleTestConnection('tiingo')}
            disabled={testingProvider === 'tiingo' || (!localTiingoKey && !hasTiingoKey)}
            className="flex items-center gap-2 px-3 py-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-lg text-xs font-semibold hover:bg-sky-500/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testingProvider === 'tiingo' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {testingProvider === 'tiingo' ? 'Testing…' : 'Test Connection'}
          </button>
          {testResults['tiingo'] === true && (
            <span className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 size={12} /> Connected
            </span>
          )}
          {testResults['tiingo'] === false && (
            <span className="flex items-center gap-2 text-xs text-red-400" role="alert">
              <AlertCircle size={12} /> Connection failed — check your API key
            </span>
          )}
        </div>
      </div>

      {/* Cache Settings */}
      <div className="space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cache Settings</p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300">Enable Local Cache</p>
            <p className="text-xs text-slate-600 mt-0.5">Cache backtest data locally to reduce API calls</p>
          </div>
          <button
            role="switch"
            aria-checked={enableCache}
            aria-label="Enable Local Cache"
            onClick={() => setEnableCache(!enableCache)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${enableCache ? 'bg-emerald-500' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${enableCache ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {enableCache && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                Cache TTL (days)
              </label>
              <input
                type="number"
                value={cacheTTLDays}
                onChange={e => setCacheTTLDays(Math.max(1, parseInt(e.target.value, 10)))}
                min="1"
                max="365"
                className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleLoadCacheStats}
                className="flex items-center gap-2 px-3 py-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-lg text-xs font-semibold hover:bg-sky-500/15 transition-colors"
              >
                Load Cache Info
              </button>

              {/* Inline clear cache state machine */}
              {clearState === 'idle' && (
                <button
                  onClick={handleClearCache}
                  className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs font-semibold hover:bg-red-500/15 transition-colors"
                >
                  Clear Cache
                </button>
              )}
              {clearState === 'confirming' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearCache}
                    className="flex items-center gap-2 px-3 py-2 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg text-xs font-semibold hover:bg-red-500/25 transition-colors"
                  >
                    Confirm Clear?
                  </button>
                  <button
                    onClick={() => setClearState('idle')}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {clearState === 'clearing' && (
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 size={12} className="animate-spin" /> Clearing…
                </span>
              )}
              {clearState === 'done' && (
                <span className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 size={12} /> Cache cleared
                </span>
              )}
            </div>

            {cacheStats && (
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-1 text-xs text-slate-400 border border-slate-700/50">
                <div>Entries: <span className="text-slate-200">{cacheStats.totalEntries}</span></div>
                <div>Size: <span className="text-slate-200">{((cacheStats.totalSizeBytes ?? 0) / 1024 / 1024).toFixed(2)} MB</span></div>
                {cacheStats.oldestEntry && (
                  <div>Oldest: <span className="text-slate-200">{cacheStats.oldestEntry.toLocaleDateString()}</span></div>
                )}
                {cacheStats.newestEntry && (
                  <div>Newest: <span className="text-slate-200">{cacheStats.newestEntry.toLocaleDateString()}</span></div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save Provider Settings button */}
      <div className="flex justify-end pt-4 border-t border-slate-800/50">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
            saved
              ? 'bg-emerald-500/15 border border-emerald-500/20 text-emerald-400'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 disabled:opacity-70'
          }`}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save Provider Settings'}
        </button>
      </div>
    </div>
  )
}

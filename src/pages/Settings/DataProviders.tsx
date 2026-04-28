import React, { useState } from 'react'
import { useDataProvider } from '../../context/DataProviderContext'
import { clearCache, getCacheMetadata } from '../../services/cache'
import { CacheStats } from '../../services/dataFetchers/types'

export function DataProvidersSettings() {
  const {
    primaryProvider,
    setPrimaryProvider,
    eodhd_api_key,
    setEodhd_api_key,
    tiingo_api_key,
    setTiingo_api_key,
    cacheTTLDays,
    setCacheTTLDays,
    enableCache,
    setEnableCache,
    testConnection,
  } = useDataProvider()

  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, boolean>>({})
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [clearingCache, setClearingCache] = useState(false)

  const handleTestConnection = async (provider: string) => {
    setTestingProvider(provider)
    try {
      const success = await testConnection(
        provider as 'eodhd' | 'tiingo' | 'synthetic'
      )
      setTestResults((prev) => ({ ...prev, [provider]: success }))
    } catch (error) {
      console.error(`Test connection failed for ${provider}:`, error)
      setTestResults((prev) => ({ ...prev, [provider]: false }))
    } finally {
      setTestingProvider(null)
    }
  }

  const handleLoadCacheStats = async () => {
    const stats = await getCacheMetadata()
    setCacheStats(stats)
  }

  const handleClearCache = async () => {
    if (confirm('Are you sure you want to clear all cached data?')) {
      setClearingCache(true)
      try {
        await clearCache()
        setCacheStats(null)
        alert('Cache cleared successfully')
      } catch (error) {
        console.error('Failed to clear cache:', error)
        alert('Failed to clear cache')
      } finally {
        setClearingCache(false)
      }
    }
  }

  const canUseProvider = (provider: string): boolean => {
    if (provider === 'eodhd') return !!eodhd_api_key
    if (provider === 'tiingo') return !!tiingo_api_key
    return true // synthetic always available
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Data Providers</h3>

        {/* Primary Provider Selection */}
        <div className="border rounded-lg p-4 space-y-3">
          <label className="block text-sm font-medium">Primary Provider</label>
          <div className="space-y-2">
            {(['eodhd', 'tiingo', 'synthetic'] as const).map((provider) => (
              <label
                key={provider}
                className="flex items-center space-x-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name="primary-provider"
                  value={provider}
                  checked={primaryProvider === provider}
                  onChange={(e) =>
                    setPrimaryProvider(e.target.value as typeof provider)
                  }
                  disabled={
                    provider !== 'synthetic' && !canUseProvider(provider)
                  }
                  className="w-4 h-4"
                />
                <span
                  className={`text-sm ${
                    provider !== 'synthetic' && !canUseProvider(provider)
                      ? 'text-gray-400'
                      : ''
                  }`}
                >
                  {provider.toUpperCase()}
                </span>
              </label>
            ))}
          </div>
        </div>

        {!eodhd_api_key && !tiingo_api_key && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
            ⚠️ No API keys configured. Backtests will use synthetic data.
          </div>
        )}
      </section>

      {/* EODHD Configuration */}
      <section className="border rounded-lg p-4 space-y-3">
        <h4 className="font-semibold text-sm">EODHD Configuration</h4>

        <div>
          <label className="block text-xs font-medium mb-1">API Key</label>
          <input
            type="password"
            value={eodhd_api_key}
            onChange={(e) => setEodhd_api_key(e.target.value)}
            placeholder="Enter your EODHD API key"
            className="w-full px-3 py-2 border rounded text-sm"
          />
        </div>

        <button
          onClick={() => handleTestConnection('eodhd')}
          disabled={testingProvider === 'eodhd' || !eodhd_api_key}
          className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {testingProvider === 'eodhd' ? 'Testing...' : 'Test Connection'}
        </button>

        {testResults['eodhd'] === true && (
          <div className="text-sm text-green-600">✓ Connected</div>
        )}
        {testResults['eodhd'] === false && (
          <div className="text-sm text-red-600">✗ Failed to connect</div>
        )}
      </section>

      {/* Tiingo Configuration */}
      <section className="border rounded-lg p-4 space-y-3">
        <h4 className="font-semibold text-sm">Tiingo Configuration</h4>

        <div>
          <label className="block text-xs font-medium mb-1">API Key</label>
          <input
            type="password"
            value={tiingo_api_key}
            onChange={(e) => setTiingo_api_key(e.target.value)}
            placeholder="Enter your Tiingo API key"
            className="w-full px-3 py-2 border rounded text-sm"
          />
        </div>

        <button
          onClick={() => handleTestConnection('tiingo')}
          disabled={testingProvider === 'tiingo' || !tiingo_api_key}
          className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {testingProvider === 'tiingo' ? 'Testing...' : 'Test Connection'}
        </button>

        {testResults['tiingo'] === true && (
          <div className="text-sm text-green-600">✓ Connected</div>
        )}
        {testResults['tiingo'] === false && (
          <div className="text-sm text-red-600">✗ Failed to connect</div>
        )}
      </section>

      {/* Cache Settings */}
      <section className="border rounded-lg p-4 space-y-4">
        <h4 className="font-semibold text-sm">Cache Settings</h4>

        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enableCache}
            onChange={(e) => setEnableCache(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm">Enable Local Cache</span>
        </label>

        {enableCache && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">
                Cache expires after (days)
              </label>
              <input
                type="number"
                value={cacheTTLDays}
                onChange={(e) => setCacheTTLDays(Math.max(1, parseInt(e.target.value, 10)))}
                min="1"
                max="365"
                className="w-full px-3 py-2 border rounded text-sm"
              />
            </div>

            <button
              onClick={handleLoadCacheStats}
              className="px-3 py-2 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Load Cache Info
            </button>

            {cacheStats && (
              <div className="bg-gray-50 rounded p-3 space-y-2 text-xs">
                <div>Entries: {cacheStats.totalEntries}</div>
                <div>
                  Size: {(cacheStats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB
                </div>
                {cacheStats.oldestEntry && (
                  <div>Oldest: {cacheStats.oldestEntry.toLocaleDateString()}</div>
                )}
                {cacheStats.newestEntry && (
                  <div>Newest: {cacheStats.newestEntry.toLocaleDateString()}</div>
                )}
              </div>
            )}

            <button
              onClick={handleClearCache}
              disabled={clearingCache}
              className="px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {clearingCache ? 'Clearing...' : 'Clear All Cache'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

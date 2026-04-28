import React, { createContext, useContext, useState, useEffect } from 'react'
import { ProviderType } from '../services/dataFetchers/types'
import { setFetchConfig } from '../services/dataFetchers/fetchOHLCV'

interface DataProviderContextType {
  primaryProvider: ProviderType
  setPrimaryProvider: (provider: ProviderType) => void

  eodhd_api_key: string
  setEodhd_api_key: (key: string) => void

  tiingo_api_key: string
  setTiingo_api_key: (key: string) => void

  cacheTTLDays: number
  setCacheTTLDays: (days: number) => void

  enableCache: boolean
  setEnableCache: (enabled: boolean) => void

  // Testing utilities
  testConnection: (provider: ProviderType) => Promise<boolean>
}

const DataProviderContext = createContext<DataProviderContextType | undefined>(
  undefined
)

export function DataProviderProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [primaryProvider, setPrimaryProvider] = useState<ProviderType>(() => {
    const stored = localStorage.getItem('anjuna_primary_provider')
    return (stored as ProviderType) || 'synthetic'
  })

  const [eodhd_api_key, setEodhd_api_key] = useState(() => {
    return localStorage.getItem('anjuna_eodhd_key') || ''
  })

  const [tiingo_api_key, setTiingo_api_key] = useState(() => {
    return localStorage.getItem('anjuna_tiingo_key') || ''
  })

  const [cacheTTLDays, setCacheTTLDays] = useState(() => {
    const stored = localStorage.getItem('anjuna_cache_ttl')
    return stored ? parseInt(stored, 10) : 30
  })

  const [enableCache, setEnableCache] = useState(() => {
    const stored = localStorage.getItem('anjuna_enable_cache')
    return stored !== 'false'
  })

  // Persist all values to localStorage
  useEffect(() => {
    localStorage.setItem('anjuna_primary_provider', primaryProvider)
    setFetchConfig({ primary_provider: primaryProvider })
  }, [primaryProvider])

  useEffect(() => {
    localStorage.setItem('anjuna_eodhd_key', eodhd_api_key)
    setFetchConfig({ eodhd_api_key })
  }, [eodhd_api_key])

  useEffect(() => {
    localStorage.setItem('anjuna_tiingo_key', tiingo_api_key)
    setFetchConfig({ tiingo_api_key })
  }, [tiingo_api_key])

  useEffect(() => {
    localStorage.setItem('anjuna_cache_ttl', cacheTTLDays.toString())
    setFetchConfig({ cache_ttl_days: cacheTTLDays })
  }, [cacheTTLDays])

  useEffect(() => {
    localStorage.setItem('anjuna_enable_cache', enableCache.toString())
  }, [enableCache])

  const testConnection = async (provider: ProviderType): Promise<boolean> => {
    try {
      // Import here to avoid circular dependencies
      const { fetchOHLCV } = await import(
        '../services/dataFetchers/fetchOHLCV'
      )

      const result = await fetchOHLCV({
        symbol: 'EURUSD',
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date(),
        provider,
        useCache: false,
      })

      return result.count > 0
    } catch (error) {
      console.warn(`[DataProvider] Test connection failed for ${provider}:`, error)
      return false
    }
  }

  const value: DataProviderContextType = {
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
  }

  return (
    <DataProviderContext.Provider value={value}>
      {children}
    </DataProviderContext.Provider>
  )
}

export function useDataProvider(): DataProviderContextType {
  const context = useContext(DataProviderContext)
  if (!context) {
    throw new Error(
      'useDataProvider must be used within DataProviderProvider'
    )
  }
  return context
}

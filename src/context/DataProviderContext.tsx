import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { ProviderType } from '../services/dataFetchers/types'
import { setFetchConfig } from '../services/dataFetchers/fetchOHLCV'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

interface DataProviderContextType {
  primaryProvider: ProviderType
  setPrimaryProvider: (provider: ProviderType) => void
  hasEodhdKey: boolean
  hasTiingoKey: boolean
  hasMassiveKey: boolean
  saveEodhdKey: (key: string) => Promise<void>
  saveTiingoKey: (key: string) => Promise<void>
  saveMassiveKey: (key: string) => Promise<void>
  deleteEodhdKey: () => Promise<void>
  deleteTiingoKey: () => Promise<void>
  deleteMassiveKey: () => Promise<void>
  cacheTTLDays: number
  setCacheTTLDays: (days: number) => void
  enableCache: boolean
  setEnableCache: (enabled: boolean) => void
  testConnection: (provider: ProviderType, apiKey: string) => Promise<boolean>
}

const DataProviderContext = createContext<DataProviderContextType | undefined>(
  undefined
)

export function DataProviderProvider({
  children,
}: {
  children: ReactNode
}) {
  const { user } = useAuth()

  const [primaryProvider, setPrimaryProvider] = useState<ProviderType>(() => {
    return (localStorage.getItem('anjuna_primary_provider') as ProviderType) || 'synthetic'
  })
  const [hasEodhdKey, setHasEodhdKey] = useState(false)
  const [hasTiingoKey, setHasTiingoKey] = useState(false)
  const [hasMassiveKey, setHasMassiveKey] = useState(false)
  const [cacheTTLDays, setCacheTTLDays] = useState(() => {
    return parseInt(localStorage.getItem('anjuna_cache_ttl') || '30', 10)
  })
  const [enableCache, setEnableCache] = useState(() => {
    return localStorage.getItem('anjuna_enable_cache') !== 'false'
  })

  // Persist non-secret prefs to localStorage
  useEffect(() => {
    localStorage.setItem('anjuna_primary_provider', primaryProvider)
    setFetchConfig({ primary_provider: primaryProvider })
  }, [primaryProvider])

  useEffect(() => {
    localStorage.setItem('anjuna_cache_ttl', cacheTTLDays.toString())
    setFetchConfig({ cache_ttl_days: cacheTTLDays })
  }, [cacheTTLDays])

  useEffect(() => {
    localStorage.setItem('anjuna_enable_cache', enableCache.toString())
  }, [enableCache])

  const DEV_KEY_PREFIX = 'anjuna_devkey_'

  async function saveKeyToSupabase(providerId: 'eodhd' | 'tiingo' | 'massive', key: string) {
    if (!user?.id) {
      // devMode: persist to localStorage
      localStorage.setItem(`${DEV_KEY_PREFIX}${providerId}`, key)
      return
    }
    // Rotate: delete existing, then insert new (D-01: no UPDATE policy)
    await supabase
      .from('data_provider_api_keys')
      .delete()
      .eq('user_id', user.id)
      .eq('provider_id', providerId)
    const { error } = await supabase
      .from('data_provider_api_keys')
      .insert({ provider_id: providerId, user_id: user.id, api_key: key })
    if (error) throw error
  }

  async function refreshKeyFlags() {
    if (!user?.id) {
      setHasEodhdKey(!!localStorage.getItem(`${DEV_KEY_PREFIX}eodhd`))
      setHasTiingoKey(!!localStorage.getItem(`${DEV_KEY_PREFIX}tiingo`))
      setHasMassiveKey(!!localStorage.getItem(`${DEV_KEY_PREFIX}massive`))
      return
    }
    const [eodhdResult, tiingoResult, massiveResult] = await Promise.all([
      supabase
        .from('data_provider_api_keys')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('provider_id', 'eodhd'),
      supabase
        .from('data_provider_api_keys')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('provider_id', 'tiingo'),
      supabase
        .from('data_provider_api_keys')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('provider_id', 'massive'),
    ])
    setHasEodhdKey((eodhdResult.count ?? 0) > 0)
    setHasTiingoKey((tiingoResult.count ?? 0) > 0)
    setHasMassiveKey((massiveResult.count ?? 0) > 0)
  }

  // One-shot localStorage migration (D-03) + fetch key flags on user change
  // Also runs in devMode (no user) to read devKey localStorage flags
  useEffect(() => {
    async function initKeys() {
      if (!user?.id) {
        await refreshKeyFlags()
        return
      }
      const oldEodhd = localStorage.getItem('anjuna_eodhd_key')
      const oldTiingo = localStorage.getItem('anjuna_tiingo_key')

      if (oldEodhd) {
        try {
          await saveKeyToSupabase('eodhd', oldEodhd)
          localStorage.removeItem('anjuna_eodhd_key')
        } catch (e) {
          console.warn('[DataProvider] Failed to migrate EODHD key from localStorage:', e)
        }
      }
      if (oldTiingo) {
        try {
          await saveKeyToSupabase('tiingo', oldTiingo)
          localStorage.removeItem('anjuna_tiingo_key')
        } catch (e) {
          console.warn('[DataProvider] Failed to migrate Tiingo key from localStorage:', e)
        }
      }

      await refreshKeyFlags()
    }

    initKeys()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveEodhdKey(key: string) {
    await saveKeyToSupabase('eodhd', key)
    setHasEodhdKey(true)
    setFetchConfig({ primary_provider: primaryProvider })
  }

  async function saveTiingoKey(key: string) {
    await saveKeyToSupabase('tiingo', key)
    setHasTiingoKey(true)
  }

  async function saveMassiveKey(key: string) {
    await saveKeyToSupabase('massive', key)
    setHasMassiveKey(true)
  }

  async function deleteMassiveKey() {
    if (!user?.id) {
      localStorage.removeItem(`${DEV_KEY_PREFIX}massive`)
      setHasMassiveKey(false)
      return
    }
    await supabase
      .from('data_provider_api_keys')
      .delete()
      .eq('user_id', user.id)
      .eq('provider_id', 'massive')
    setHasMassiveKey(false)
  }

  async function deleteEodhdKey() {
    if (!user?.id) {
      localStorage.removeItem(`${DEV_KEY_PREFIX}eodhd`)
      setHasEodhdKey(false)
      return
    }
    await supabase
      .from('data_provider_api_keys')
      .delete()
      .eq('user_id', user.id)
      .eq('provider_id', 'eodhd')
    setHasEodhdKey(false)
  }

  async function deleteTiingoKey() {
    if (!user?.id) {
      localStorage.removeItem(`${DEV_KEY_PREFIX}tiingo`)
      setHasTiingoKey(false)
      return
    }
    await supabase
      .from('data_provider_api_keys')
      .delete()
      .eq('user_id', user.id)
      .eq('provider_id', 'tiingo')
    setHasTiingoKey(false)
  }

  async function testConnection(provider: ProviderType, apiKey: string): Promise<boolean> {
    try {
      // Massive: test directly via REST (no proxy needed)
      if (provider === 'massive') {
        const { createMassiveClient } = await import('../services/dataFetchers/massive')
        const key = apiKey || localStorage.getItem(`${DEV_KEY_PREFIX}massive`) || ''
        if (!key) return false
        return createMassiveClient(key).testConnection()
      }

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${supabaseUrl}/functions/v1/data-provider-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ provider, action: 'test', apiKey }),
      })
      const data = await res.json()
      return data.ok === true
    } catch (e) {
      console.warn(`[DataProvider] testConnection failed for ${provider}:`, e)
      return false
    }
  }

  const value: DataProviderContextType = {
    primaryProvider,
    setPrimaryProvider,
    hasEodhdKey,
    hasTiingoKey,
    hasMassiveKey,
    saveEodhdKey,
    saveTiingoKey,
    saveMassiveKey,
    deleteEodhdKey,
    deleteTiingoKey,
    deleteMassiveKey,
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

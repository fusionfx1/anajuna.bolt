import { useState, useCallback } from 'react'
import { oandaService } from '../services/oandaService'
import { supabase } from '../lib/supabase'

export type ProviderHealth = 'eodhd' | 'tiingo' | 'massive' | 'oanda'
export type PingStatus = 'idle' | 'pinging' | 'ok' | 'slow' | 'error'

export interface HealthResult {
  status: PingStatus
  latencyMs: number | null
  lastChecked: Date | null
  errorMessage: string | null
}

export interface ConnectionEvent {
  provider: ProviderHealth
  status: 'ok' | 'slow' | 'error'
  latencyMs: number | null
  timestamp: Date
  message: string
}

const INITIAL: HealthResult = { status: 'idle', latencyMs: null, lastChecked: null, errorMessage: null }

async function pingEodhd(apiKey: string): Promise<number> {
  const start = Date.now()
  const url = `https://eodhd.com/api/eod/AAPL.US?api_token=${apiKey}&fmt=json&limit=1`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Date.now() - start
}

async function pingTiingo(apiKey: string): Promise<number> {
  const start = Date.now()
  const url = `https://api.tiingo.com/tiingo/daily/AAPL/prices?startDate=2024-01-01&endDate=2024-01-05`
  const res = await fetch(url, { headers: { Authorization: `Token ${apiKey}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Date.now() - start
}

async function pingOanda(): Promise<number> {
  const start = Date.now()
  await oandaService.getAccount()
  return Date.now() - start
}

function getDevKey(provider: 'eodhd' | 'tiingo'): string {
  return localStorage.getItem(`anjuna_devkey_${provider}`) ?? ''
}

interface KeyResolution {
  type: 'direct' | 'proxy' | 'none'
  key?: string
  token?: string
  supabaseUrl?: string
}

async function pingMassive(): Promise<number> {
  const key = localStorage.getItem('anjuna_devkey_massive') ?? ''
  if (!key) throw new Error('No Massive API key configured')
  const start = Date.now()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 5)
  const from = yesterday.toISOString().split('T')[0]
  const to = new Date().toISOString().split('T')[0]
  const res = await fetch(`https://api.massive.com/v2/aggs/ticker/C:EURUSD/range/1/day/${from}/${to}?limit=1`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Date.now() - start
}

async function resolveApiKey(provider: 'eodhd' | 'tiingo'): Promise<KeyResolution> {
  const devKey = getDevKey(provider)
  if (devKey) return { type: 'direct', key: devKey }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { type: 'none' }

  return {
    type: 'proxy',
    token: session.access_token,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  }
}

async function pingViaProxy(provider: 'eodhd' | 'tiingo', token: string, supabaseUrl: string): Promise<number> {
  const start = Date.now()
  const res = await fetch(`${supabaseUrl}/functions/v1/data-provider-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ provider, action: 'test' }),
  })
  const data = await res.json() as { ok?: boolean }
  if (!data.ok) throw new Error('Key test failed')
  return Date.now() - start
}

function classifyLatency(ms: number): 'ok' | 'slow' {
  return ms < 2000 ? 'ok' : 'slow'
}

export function useConnectionHealth() {
  const [results, setResults] = useState<Record<ProviderHealth, HealthResult>>({
    eodhd: { ...INITIAL },
    tiingo: { ...INITIAL },
    massive: { ...INITIAL },
    oanda: { ...INITIAL },
  })
  const [pinging, setPinging] = useState<Set<ProviderHealth>>(new Set())
  const [log, setLog] = useState<ConnectionEvent[]>([])

  const addLog = useCallback((event: ConnectionEvent) => {
    setLog(prev => [event, ...prev].slice(0, 15))
  }, [])

  const pingProvider = useCallback(async (provider: ProviderHealth) => {
    setPinging(prev => new Set(prev).add(provider))
    setResults(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'pinging' } }))

    try {
      let latencyMs: number

      if (provider === 'oanda') {
        latencyMs = await pingOanda()
      } else if (provider === 'massive') {
        latencyMs = await pingMassive()
      } else {
        const resolution = await resolveApiKey(provider)
        if (resolution.type === 'none') {
          throw new Error('No API key configured')
        }
        if (resolution.type === 'direct') {
          latencyMs = provider === 'eodhd'
            ? await pingEodhd(resolution.key!)
            : await pingTiingo(resolution.key!)
        } else {
          latencyMs = await pingViaProxy(provider, resolution.token!, resolution.supabaseUrl!)
        }
      }

      const status = classifyLatency(latencyMs)
      const result: HealthResult = { status, latencyMs, lastChecked: new Date(), errorMessage: null }
      setResults(prev => ({ ...prev, [provider]: result }))
      addLog({
        provider, status, latencyMs, timestamp: new Date(),
        message: `${latencyMs}ms`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      const result: HealthResult = { status: 'error', latencyMs: null, lastChecked: new Date(), errorMessage: msg }
      setResults(prev => ({ ...prev, [provider]: result }))
      addLog({ provider, status: 'error', latencyMs: null, timestamp: new Date(), message: msg })
    } finally {
      setPinging(prev => {
        const next = new Set(prev)
        next.delete(provider)
        return next
      })
    }
  }, [addLog])

  const pingAll = useCallback(() => {
    pingProvider('eodhd')
    pingProvider('tiingo')
    pingProvider('oanda')
  }, [pingProvider])

  return { results, pinging, log, pingProvider, pingAll }
}

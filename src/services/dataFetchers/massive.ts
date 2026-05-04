import { FetchOptions, NormalizedCandle } from './types'

const BASE_URL = 'https://api.massive.com'
const MAX_RETRIES = 3

interface MassiveBar {
  o: number
  h: number
  l: number
  c: number
  v: number
  vw?: number
  t: number  // Unix milliseconds
  n?: number
}

interface MassiveResponse {
  ticker: string
  resultsCount: number
  results: MassiveBar[]
  next_url?: string
}

export class MassiveClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async getCandles(options: FetchOptions): Promise<NormalizedCandle[]> {
    const { symbol, startDate, endDate, timeframe = '1d' } = options
    const from = startDate.toISOString().split('T')[0]
    const to = endDate.toISOString().split('T')[0]

    const { multiplier, timespan } = resolveTimespan(timeframe)
    // Massive uses C:EURUSD format for forex; pass symbol as-is if already prefixed
    const ticker = symbol.includes(':') ? symbol : `C:${symbol.replace('/', '')}`

    let lastError: Error | null = null
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const candles = await this.fetchPage(ticker, multiplier, timespan, from, to)
        return candles.map(bar => ({
          timestamp: bar.t,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v,
          symbol,
          provider: 'massive' as const,
        })).sort((a, b) => a.timestamp - b.timestamp)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000))
        }
      }
    }
    throw lastError ?? new Error('Failed to fetch Massive data')
  }

  private async fetchPage(
    ticker: string,
    multiplier: number,
    timespan: string,
    from: string,
    to: string,
    limit = 5000,
  ): Promise<MassiveBar[]> {
    const url = `${BASE_URL}/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?limit=${limit}&sort=asc`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })

    if (res.status === 401) throw new Error('Massive API key invalid or unauthorized')
    if (!res.ok) throw new Error(`Massive API error ${res.status}`)

    const data = await res.json() as MassiveResponse
    return data.results ?? []
  }

  async testConnection(): Promise<boolean> {
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 5)
      const from = yesterday.toISOString().split('T')[0]
      const to = new Date().toISOString().split('T')[0]
      const url = `${BASE_URL}/v2/aggs/ticker/C:EURUSD/range/1/day/${from}/${to}?limit=1`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${this.apiKey}` } })
      return res.ok
    } catch {
      return false
    }
  }
}

function resolveTimespan(timeframe: string): { multiplier: number; timespan: string } {
  switch (timeframe) {
    case '1m':  return { multiplier: 1,  timespan: 'minute' }
    case '5m':  return { multiplier: 5,  timespan: 'minute' }
    case '15m': return { multiplier: 15, timespan: 'minute' }
    case '1h':  return { multiplier: 1,  timespan: 'hour' }
    case '1d':
    default:    return { multiplier: 1,  timespan: 'day' }
  }
}

export function createMassiveClient(apiKey: string): MassiveClient {
  return new MassiveClient(apiKey)
}

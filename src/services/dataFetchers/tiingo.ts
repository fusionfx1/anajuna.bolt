import axios from 'axios'
import { FetchOptions, NormalizedCandle } from './types'

export class TiingoClient {
  private apiKey: string
  private baseUrl = 'https://api.tiingo.com'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async getCandles(options: FetchOptions): Promise<NormalizedCandle[]> {
    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetchWithRetry(options, attempt)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError || new Error('Failed to fetch Tiingo data after max retries')
  }

  private async fetchWithRetry(options: FetchOptions, _attempt: number): Promise<NormalizedCandle[]> {
    const { symbol, startDate, endDate } = options

    const params = {
      token: this.apiKey,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    }

    const url = `${this.baseUrl}/tiingo/daily/${symbol}/prices`

    try {
      const response = await axios.get(url, { params })

      if (!Array.isArray(response.data)) {
        throw new Error('Invalid response from Tiingo API')
      }

      const candles: NormalizedCandle[] = response.data
        .filter((candle: unknown) => candle && typeof candle === 'object')
        .map((candle: unknown) => {
          const c = candle as Record<string, unknown>
          return {
          timestamp: new Date(c.date as string).getTime(),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume),
          symbol,
          provider: 'tiingo' as const,
        }
        })
        .sort((a, b) => a.timestamp - b.timestamp)

      return candles
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Tiingo API key invalid or unauthorized')
        }
        throw new Error(`Tiingo API error: ${error.message}`)
      }
      throw error
    }
  }
}

export function createTiingoClient(apiKey: string): TiingoClient {
  return new TiingoClient(apiKey)
}

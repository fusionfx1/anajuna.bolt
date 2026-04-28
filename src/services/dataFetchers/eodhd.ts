import axios from 'axios'
import { RawOHLCV, FetchOptions, NormalizedCandle } from './types'

export class EodhdhClient {
  private apiKey: string
  private baseUrl = 'https://eodhd.com/api'

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

    throw lastError || new Error('Failed to fetch EODHD data after max retries')
  }

  private async fetchWithRetry(options: FetchOptions, attempt: number): Promise<NormalizedCandle[]> {
    const { symbol, startDate, endDate, timeframe = '1d' } = options

    const params = {
      api_token: this.apiKey,
      fmt: 'json',
      from: startDate.toISOString().split('T')[0],
      to: endDate.toISOString().split('T')[0],
      period: timeframe,
    }

    const url = `${this.baseUrl}/eod/${symbol}`

    try {
      const response = await axios.get(url, { params })

      if (!response.data) {
        throw new Error('Empty response from EODHD API')
      }

      const candles: NormalizedCandle[] = response.data
        .filter((candle: any) => candle && typeof candle === 'object')
        .map((candle: any) => ({
          timestamp: new Date(candle.date).getTime(),
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
          volume: Number(candle.volume),
          symbol,
          provider: 'eodhd' as const,
        }))
        .sort((a, b) => a.timestamp - b.timestamp)

      return candles
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('EODHD API key invalid or unauthorized')
        }
        throw new Error(`EODHD API error: ${error.message}`)
      }
      throw error
    }
  }
}

export function createEodhhdClient(apiKey: string): EodhdhClient {
  return new EodhdhClient(apiKey)
}

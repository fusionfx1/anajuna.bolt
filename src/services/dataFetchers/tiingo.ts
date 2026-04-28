import axios, { AxiosInstance } from 'axios'
import {
  RawOHLCV,
  TiingoRawCandle,
  InvalidApiKeyError,
  RateLimitError,
  NetworkError,
  DataFetchError,
} from './types'

export class TiingoClient {
  private client: AxiosInstance
  private baseUrl = 'https://api.tiingo.com/tiingo/daily'

  constructor(private apiKey: string) {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    })
  }

  async getDailyHistory(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<RawOHLCV[]> {
    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const startISO = startDate.toISOString().split('T')[0]
        const endISO = endDate.toISOString().split('T')[0]

        const response = await this.client.get<TiingoRawCandle[]>(
          `/${symbol}/prices`,
          {
            params: {
              startDate: startISO,
              endDate: endISO,
              token: this.apiKey,
            },
          }
        )

        if (!Array.isArray(response.data)) {
          throw new DataFetchError(
            'INVALID_RESPONSE',
            'Tiingo returned invalid response format',
            'tiingo',
            false
          )
        }

        return response.data as RawOHLCV[]
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status
          const data = error.response?.data as Record<string, unknown> | undefined

          // 401/403: Invalid API key (not recoverable)
          if (status === 401 || status === 403) {
            throw new InvalidApiKeyError('tiingo')
          }

          // 429: Rate limit (recoverable, exponential backoff)
          if (status === 429) {
            const retryAfter = parseInt(
              error.response?.headers?.['retry-after'] || '60',
              10
            )
            if (attempt < maxRetries - 1) {
              const delay = Math.pow(2, attempt) * retryAfter * 1000
              await new Promise((resolve) => setTimeout(resolve, delay))
              lastError = new RateLimitError('tiingo', retryAfter)
              continue
            }
            throw new RateLimitError('tiingo', retryAfter)
          }

          // 404: Symbol not found
          if (status === 404) {
            throw new DataFetchError(
              'NOT_FOUND',
              `Symbol ${symbol} not found on Tiingo`,
              'tiingo',
              false
            )
          }

          // Network timeout or other connection errors
          if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') {
            lastError = new NetworkError('tiingo', error.message)
            if (attempt < maxRetries - 1) {
              await new Promise((resolve) =>
                setTimeout(resolve, Math.pow(2, attempt) * 1000)
              )
              continue
            }
            throw lastError
          }

          // Generic server error (5xx)
          if (status && status >= 500) {
            lastError = new DataFetchError(
              'SERVER_ERROR',
              `Tiingo server error: ${status}`,
              'tiingo',
              true
            )
            if (attempt < maxRetries - 1) {
              await new Promise((resolve) =>
                setTimeout(resolve, Math.pow(2, attempt) * 1000)
              )
              continue
            }
            throw lastError
          }

          // Other errors
          throw new DataFetchError(
            'HTTP_ERROR',
            `Tiingo HTTP ${status}: ${data?.message || error.message}`,
            'tiingo',
            attempt < maxRetries - 1
          )
        }

        // Non-Axios errors
        lastError = new NetworkError('tiingo', (error as Error).message)
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          )
          continue
        }
        throw lastError
      }
    }

    throw (
      lastError ||
      new DataFetchError(
        'UNKNOWN_ERROR',
        'Failed to fetch from Tiingo after retries',
        'tiingo',
        false
      )
    )
  }
}

export function createTiingoClient(apiKey: string): TiingoClient {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new InvalidApiKeyError('tiingo')
  }
  return new TiingoClient(apiKey)
}

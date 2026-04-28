import axios, { AxiosInstance } from 'axios'
import {
  RawOHLCV,
  EodhhdRawCandle,
  InvalidApiKeyError,
  RateLimitError,
  NetworkError,
  DataFetchError,
} from './types'

export class EodhhdClient {
  private client: AxiosInstance
  private baseUrl = 'https://eodhd.com/api/eod'

  constructor(private apiKey: string) {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    })
  }

  async getCandles(
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

        const response = await this.client.get<EodhhdRawCandle[]>('', {
          params: {
            symbol: symbol,
            period: 'h1',
            fmt: 'json',
            api_token: this.apiKey,
            from: startISO,
            to: endISO,
          },
        })

        if (!Array.isArray(response.data)) {
          throw new DataFetchError(
            'INVALID_RESPONSE',
            'EODHD returned invalid response format',
            'eodhd',
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
            throw new InvalidApiKeyError('eodhd')
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
              lastError = new RateLimitError('eodhd', retryAfter)
              continue
            }
            throw new RateLimitError('eodhd', retryAfter)
          }

          // 404: Symbol not found
          if (status === 404) {
            throw new DataFetchError(
              'NOT_FOUND',
              `Symbol ${symbol} not found on EODHD`,
              'eodhd',
              false
            )
          }

          // Network timeout or other connection errors
          if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') {
            lastError = new NetworkError('eodhd', error.message)
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
              `EODHD server error: ${status}`,
              'eodhd',
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
            `EODHD HTTP ${status}: ${data?.message || error.message}`,
            'eodhd',
            attempt < maxRetries - 1
          )
        }

        // Non-Axios errors
        lastError = new NetworkError('eodhd', (error as Error).message)
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
        'Failed to fetch from EODHD after retries',
        'eodhd',
        false
      )
    )
  }
}

export function createEodhhdClient(apiKey: string): EodhhdClient {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new InvalidApiKeyError('eodhd')
  }
  return new EodhhdClient(apiKey)
}

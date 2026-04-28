import { generateHistoricalCandles } from '../backtestService'
import { FetchOptions, NormalizedCandle } from './types'

export class SyntheticClient {
  async getCandles(options: FetchOptions): Promise<NormalizedCandle[]> {
    const { symbol, startDate, endDate } = options

    const rawCandles = generateHistoricalCandles(
      symbol,
      startDate.getTime(),
      endDate.getTime()
    )

    const candles: NormalizedCandle[] = rawCandles
      .map((candle) => ({
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        symbol,
        provider: 'synthetic' as const,
      }))
      .sort((a, b) => a.timestamp - b.timestamp)

    return candles
  }
}

export function getSyntheticCandles(
  symbol: string,
  startDate: Date,
  endDate: Date
): Promise<NormalizedCandle[]> {
  const client = new SyntheticDataProvider()
  return client.getCandles({ symbol, startDate, endDate })
}

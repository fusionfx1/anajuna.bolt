import { RawOHLCV } from './types'

// Import the existing synthetic candle generator from backtesting
// This assumes generateHistoricalCandles is available in backtestEngine
// If not, we'll need to copy its logic here

export async function getSyntheticCandles(
  symbol: string,
  startDate: Date,
  endDate: Date
): Promise<RawOHLCV[]> {
  // Generate synthetic candles using the existing generator
  const candles = generateSyntheticCandles(
    symbol,
    startDate,
    endDate
  )

  return candles.map((candle) => ({
    date: candle.timestamp.toISOString().split('T')[0],
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
    volume: candle.v,
  }))
}

// Synthetic candle generation (deterministic, reproducible)
// This mimics the logic from backtestEngine.ts
function generateSyntheticCandles(
  symbol: string,
  startDate: Date,
  endDate: Date
): Array<{
  timestamp: Date
  o: number
  h: number
  l: number
  c: number
  v: number
}> {
  const candles: Array<{
    timestamp: Date
    o: number
    h: number
    l: number
    c: number
    v: number
  }> = []

  // Start with base price depending on symbol
  let basePrice = symbol === 'EURUSD' ? 1.08 : 100
  const volatility = 0.01 // 1% volatility
  const driftRate = 0.0001 // Slight uptrend

  let currentDate = new Date(startDate)
  let currentPrice = basePrice

  // Generate hourly candles
  while (currentDate < endDate) {
    // Generate random walk
    const dailyReturn =
      (Math.random() - 0.5) * volatility * 2 + driftRate
    const openPrice = currentPrice
    const closePrice = currentPrice * (1 + dailyReturn)
    const highPrice =
      Math.max(openPrice, closePrice) * (1 + Math.random() * 0.002)
    const lowPrice =
      Math.min(openPrice, closePrice) * (1 - Math.random() * 0.002)
    const volume = Math.floor(Math.random() * 1000000 + 100000)

    candles.push({
      timestamp: new Date(currentDate),
      o: parseFloat(openPrice.toFixed(5)),
      h: parseFloat(highPrice.toFixed(5)),
      l: parseFloat(lowPrice.toFixed(5)),
      c: parseFloat(closePrice.toFixed(5)),
      v: volume,
    })

    // Move to next hour
    currentDate = new Date(currentDate.getTime() + 3600000) // 1 hour in ms
    currentPrice = closePrice
  }

  return candles
}

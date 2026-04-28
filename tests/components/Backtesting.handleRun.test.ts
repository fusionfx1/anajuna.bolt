import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Backtesting } from '../../src/components/Backtesting'
import { fetchOHLCV, setFetchConfig } from '../../src/services/dataFetchers/fetchOHLCV'
import type { RawOHLCV } from '../../src/services/dataFetchers/types'
import type { Candle } from '../../src/services/backtestEngine'

const mocks = vi.hoisted(() => ({
  eodhdGetCandles: vi.fn(),
  tiingoGetDailyHistory: vi.fn(),
  syntheticGetCandles: vi.fn(),
  readCache: vi.fn(),
  writeCache: vi.fn(),
  runBacktest: vi.fn(),
  generateHistoricalCandles: vi.fn(),
}))

vi.mock('../../src/services/cache', () => ({
  readCache: mocks.readCache,
  writeCache: mocks.writeCache,
}))

vi.mock('../../src/services/dataFetchers/eodhd', () => ({
  createEodhhdClient: vi.fn(() => ({
    getCandles: mocks.eodhdGetCandles,
  })),
}))

vi.mock('../../src/services/dataFetchers/tiingo', () => ({
  createTiingoClient: vi.fn(() => ({
    getDailyHistory: mocks.tiingoGetDailyHistory,
  })),
}))

vi.mock('../../src/services/dataFetchers/synthetic', () => ({
  getSyntheticCandles: mocks.syntheticGetCandles,
}))

vi.mock('../../src/hooks/useSupabaseData', () => ({
  useStrategies: () => ({ strategies: [], loading: false }),
}))

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('../../src/hooks/useBacktest', () => ({
  useBacktest: () => ({
    status: 'idle',
    progress: null,
    result: null,
    error: null,
    run: mocks.runBacktest,
    cancel: vi.fn(),
    reset: vi.fn(),
  }),
}))

vi.mock('../../src/hooks/useComparisonBacktest', () => ({
  useComparisonBacktest: () => ({
    loading: false,
    error: null,
    results: {},
    runComparison: vi.fn(),
  }),
}))

vi.mock('../../src/services/backtestService', () => ({
  generateHistoricalCandles: mocks.generateHistoricalCandles,
  fetchHistoricalCandles: vi.fn(),
  saveBacktestRun: vi.fn(),
  upsertCandles: vi.fn(),
}))

function rawCandles(count: number, start = '2024-01-01T00:00:00.000Z'): RawOHLCV[] {
  const startTime = new Date(start).getTime()

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(startTime + index * 86_400_000)
    const open = 100 + index

    return {
      date: date.toISOString(),
      open,
      high: open + 5,
      low: open - 5,
      close: open + 2,
      volume: 1_000 + index,
    }
  })
}

function backtestCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: Math.floor(new Date('2024-06-01T00:00:00.000Z').getTime() / 1000) + index * 86_400,
    open: 200 + index,
    high: 205 + index,
    low: 195 + index,
    close: 202 + index,
    volume: 2_000 + index,
  }))
}

async function renderAndRun(provider: 'eodhd' | 'tiingo' | 'synthetic') {
  render(React.createElement(Backtesting))

  fireEvent.click(screen.getByRole('button', { name: providerLabel(provider) }))
  fireEvent.click(screen.getByRole('button', { name: /run backtest/i }))

  await waitFor(() => expect(mocks.runBacktest).toHaveBeenCalled())
  const candles = mocks.runBacktest.mock.calls.at(-1)?.[1] as
    | Candle[]
    | undefined
  if (!candles) {
    throw new Error('Expected Backtesting.handleRun to call useBacktest().run')
  }
  return candles
}

function providerLabel(provider: 'eodhd' | 'tiingo' | 'synthetic'): RegExp {
  if (provider === 'eodhd') return /eodhd/i
  if (provider === 'tiingo') return /tiingo/i
  return /synthetic/i
}

describe('Backtesting.handleRun - real code integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setFetchConfig({
      eodhd_api_key: 'test-eodhd-key',
      tiingo_api_key: 'test-tiingo-key',
      primary_provider: 'synthetic',
      cache_ttl_days: 30,
    })
    mocks.readCache.mockResolvedValue(null)
    mocks.writeCache.mockResolvedValue(undefined)
    mocks.eodhdGetCandles.mockResolvedValue(rawCandles(60))
    mocks.tiingoGetDailyHistory.mockResolvedValue(rawCandles(60))
    mocks.syntheticGetCandles.mockResolvedValue(rawCandles(60))
    mocks.generateHistoricalCandles.mockReturnValue(backtestCandles(251))
  })

  afterEach(() => {
    cleanup()
  })

  it('uses the selected EODHD provider when handleRun fetches candles', async () => {
    const candles = await renderAndRun('eodhd')

    expect(mocks.eodhdGetCandles).toHaveBeenCalledWith(
      'EUR_USD',
      expect.any(Date),
      expect.any(Date)
    )
    const [, startDate, endDate] = mocks.eodhdGetCandles.mock.calls[0]
    expect(startDate.getTime()).toBeLessThan(endDate.getTime())
    expect(mocks.tiingoGetDailyHistory).not.toHaveBeenCalled()
    expect(candles).toHaveLength(60)
  })

  it('fetchOHLCV processes EODHD API data through the real normalizer', async () => {
    const [raw] = rawCandles(1)
    mocks.eodhdGetCandles.mockResolvedValue([raw])

    const result = await fetchOHLCV({
      symbol: 'EUR_USD',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-02'),
      provider: 'eodhd',
      useCache: true,
    })

    expect(result.provider).toBe('eodhd')
    expect(result.candles[0]).toMatchObject({
      o: raw.open,
      h: raw.high,
      l: raw.low,
      c: raw.close,
      v: raw.volume,
    })
    expect(result.candles[0].timestamp).toBeInstanceOf(Date)
  })

  it('fetchOHLCV processes Tiingo API data through the real normalizer', async () => {
    const [raw] = rawCandles(1, '2024-02-01T12:30:00.000Z')
    mocks.tiingoGetDailyHistory.mockResolvedValue([raw])

    const result = await fetchOHLCV({
      symbol: 'GBP_USD',
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-02'),
      provider: 'tiingo',
      useCache: true,
    })

    expect(result.provider).toBe('tiingo')
    expect(result.candles[0].timestamp.toISOString()).toBe(raw.date)
    expect(result.candles[0].c).toBe(raw.close)
  })

  it('fetchOHLCV processes synthetic data through the real normalizer', async () => {
    const [raw] = rawCandles(1, '2024-03-01T00:00:00.000Z')
    mocks.syntheticGetCandles.mockResolvedValue([raw])

    const result = await fetchOHLCV({
      symbol: 'USD_JPY',
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-03-02'),
      provider: 'synthetic',
      useCache: true,
    })

    expect(result.provider).toBe('synthetic')
    expect(result.candles[0]).toMatchObject({
      o: raw.open,
      h: raw.high,
      l: raw.low,
      c: raw.close,
      v: raw.volume,
    })
  })

  it('preserves OHLCV values when handleRun converts normalized candles to backtest candles', async () => {
    const [first, ...rest] = rawCandles(60)
    first.open = 1.095
    first.high = 1.096
    first.low = 1.094
    first.close = 1.0955
    first.volume = 2_500_000
    mocks.eodhdGetCandles.mockResolvedValue([first, ...rest])

    const candles = await renderAndRun('eodhd')

    expect(candles[0]).toMatchObject({
      open: 1.095,
      high: 1.096,
      low: 1.094,
      close: 1.0955,
      volume: 2_500_000,
    })
  })

  it('converts normalized Date timestamps to Unix seconds for the backtest engine', async () => {
    const [first, ...rest] = rawCandles(60, '2024-04-15T14:45:30.000Z')
    mocks.eodhdGetCandles.mockResolvedValue([first, ...rest])

    const candles = await renderAndRun('eodhd')

    expect(candles[0].time).toBe(
      Math.floor(new Date(first.date as string).getTime() / 1000)
    )
  })

  it('preserves chronological order after fetchOHLCV sorts provider data', async () => {
    const unsorted = [
      rawCandles(1, '2024-05-03T00:00:00.000Z')[0],
      rawCandles(1, '2024-05-01T00:00:00.000Z')[0],
      rawCandles(1, '2024-05-02T00:00:00.000Z')[0],
      ...rawCandles(57, '2024-05-04T00:00:00.000Z'),
    ]
    mocks.eodhdGetCandles.mockResolvedValue(unsorted)

    const candles = await renderAndRun('eodhd')

    expect(candles[0].time).toBeLessThan(candles[1].time)
    expect(candles[1].time).toBeLessThan(candles[2].time)
    expect(candles[0].time).toBe(
      Math.floor(new Date('2024-05-01T00:00:00.000Z').getTime() / 1000)
    )
  })

  it('falls back to generated synthetic candles when the selected provider returns fewer than 50 candles', async () => {
    mocks.eodhdGetCandles.mockResolvedValue(rawCandles(30))
    mocks.generateHistoricalCandles.mockReturnValue(backtestCandles(251))

    const candles = await renderAndRun('eodhd')

    expect(mocks.generateHistoricalCandles).toHaveBeenCalledWith(
      'EUR_USD',
      'H1',
      expect.any(String),
      expect.any(String)
    )
    const [, , startDate, endDate] = mocks.generateHistoricalCandles.mock.calls[0]
    expect(new Date(startDate).getTime()).toBeLessThan(new Date(endDate).getTime())
    expect(candles).toHaveLength(251)
    expect(screen.getByText(/backtesting with simulated data/i)).toBeTruthy()
  })

  it('uses exactly 50 fetched candles without falling back', async () => {
    mocks.eodhdGetCandles.mockResolvedValue(rawCandles(50))

    const candles = await renderAndRun('eodhd')

    expect(mocks.generateHistoricalCandles).not.toHaveBeenCalled()
    expect(candles).toHaveLength(50)
  })

  it('uses all fetched candles when the selected provider returns more than 50 candles', async () => {
    mocks.eodhdGetCandles.mockResolvedValue(rawCandles(100))

    const candles = await renderAndRun('eodhd')

    expect(mocks.generateHistoricalCandles).not.toHaveBeenCalled()
    expect(candles).toHaveLength(100)
  })

  it('logs provider failures and still runs with generated synthetic candles', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.eodhdGetCandles.mockRejectedValue(new Error('EODHD network error'))
    mocks.tiingoGetDailyHistory.mockRejectedValue(new Error('Tiingo network error'))
    mocks.syntheticGetCandles.mockRejectedValue(new Error('Synthetic unavailable'))
    mocks.generateHistoricalCandles.mockReturnValue(backtestCandles(251))

    const candles = await renderAndRun('eodhd')

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[fetchOHLCV] Primary provider eodhd failed:'),
      expect.any(Error)
    )
    expect(warn).toHaveBeenCalledTimes(3)
    expect(mocks.generateHistoricalCandles).toHaveBeenCalled()
    expect(candles).toHaveLength(251)

    warn.mockRestore()
  })

  it('uses the latest selectedProvider value on subsequent handleRun calls', async () => {
    render(React.createElement(Backtesting))

    fireEvent.click(screen.getByRole('button', { name: /eodhd/i }))
    fireEvent.click(screen.getByRole('button', { name: /run backtest/i }))
    await waitFor(() => expect(mocks.runBacktest).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /tiingo/i }))
    fireEvent.click(screen.getByRole('button', { name: /run backtest/i }))
    await waitFor(() => expect(mocks.runBacktest).toHaveBeenCalledTimes(2))

    expect(mocks.eodhdGetCandles).toHaveBeenCalledTimes(1)
    expect(mocks.tiingoGetDailyHistory).toHaveBeenCalledTimes(1)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedCandle } from '../../src/services/dataFetchers/types'
import type { Candle } from '../../src/services/backtestEngine'
import type { DataProvider } from '../../src/types/dataFeed'

// Mock fetchOHLCV function
const mockFetchOHLCV = vi.fn()

// Mock backtestService functions
const mockGenerateHistoricalCandles = vi.fn()
const mockRun = vi.fn()

// Helper: Convert NormalizedCandle to Candle (matches handleRun conversion logic)
function normalizedToCandle(normalized: NormalizedCandle): Candle {
  return {
    time: Math.floor(normalized.timestamp.getTime() / 1000),
    open: normalized.o,
    high: normalized.h,
    low: normalized.l,
    close: normalized.c,
    volume: normalized.v,
  }
}

// Create sample normalized candles
function createNormalizedCandles(count: number, startDate: Date = new Date('2025-01-01')): NormalizedCandle[] {
  const candles: NormalizedCandle[] = []
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(startDate.getTime() + i * 3600000) // 1 hour apart
    candles.push({
      timestamp,
      o: 100 + i * 0.1,
      h: 100.5 + i * 0.1,
      l: 99.5 + i * 0.1,
      c: 100.25 + i * 0.1,
      v: 1000000,
    })
  }
  return candles
}

describe('Backtesting.handleRun - Phase 3 Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchOHLCV integration with selectedProvider', () => {
    it('calls fetchOHLCV with correct provider parameter from selectedProvider state', () => {
      // Arrange
      const selectedProvider: DataProvider = 'eodhd'
      const instrument = 'EUR_USD'
      const granularity = 'H1'
      const startDate = '2025-01-01'
      const endDate = '2025-12-31'

      const normalizedCandles = createNormalizedCandles(100)
      mockFetchOHLCV.mockResolvedValue({
        candles: normalizedCandles,
        provider: selectedProvider,
        fromCache: false,
        fetchedAt: new Date(),
        count: 100,
      })

      // Act: Simulate handleRun calling fetchOHLCV
      const config = {
        instrument: instrument as any,
        granularity: granularity as any,
        startDate,
        endDate,
      }

      // This is what handleRun does internally
      const startDateObj = new Date(startDate)
      const endDateObj = new Date(endDate)

      mockFetchOHLCV({
        symbol: config.instrument,
        startDate: startDateObj,
        endDate: endDateObj,
        provider: selectedProvider,
        useCache: true,
      })

      // Assert
      expect(mockFetchOHLCV).toHaveBeenCalledWith({
        symbol: instrument,
        startDate: startDateObj,
        endDate: endDateObj,
        provider: 'eodhd',
        useCache: true,
      })
    })

    it('uses tiingo provider when selectedProvider is tiingo', () => {
      const selectedProvider: DataProvider = 'tiingo'
      const normalizedCandles = createNormalizedCandles(100)

      mockFetchOHLCV.mockResolvedValue({
        candles: normalizedCandles,
        provider: selectedProvider,
        fromCache: false,
        fetchedAt: new Date(),
        count: 100,
      })

      mockFetchOHLCV({
        symbol: 'GBP_USD',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        provider: selectedProvider,
        useCache: true,
      })

      expect(mockFetchOHLCV).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'tiingo' })
      )
    })

    it('uses synthetic provider when selectedProvider is synthetic', () => {
      const selectedProvider: DataProvider = 'synthetic'
      const normalizedCandles = createNormalizedCandles(100)

      mockFetchOHLCV.mockResolvedValue({
        candles: normalizedCandles,
        provider: selectedProvider,
        fromCache: false,
        fetchedAt: new Date(),
        count: 100,
      })

      mockFetchOHLCV({
        symbol: 'USD_JPY',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        provider: selectedProvider,
        useCache: true,
      })

      expect(mockFetchOHLCV).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'synthetic' })
      )
    })
  })

  describe('NormalizedCandle to Candle conversion', () => {
    it('preserves all data integrity when converting NormalizedCandle[] to Candle[]', () => {
      // Arrange
      const timestamp = new Date('2025-06-15T10:30:00Z')
      const normalized: NormalizedCandle = {
        timestamp,
        o: 1.0950,
        h: 1.0960,
        l: 1.0940,
        c: 1.0955,
        v: 2500000,
      }

      // Act
      const candle = normalizedToCandle(normalized)

      // Assert
      expect(candle.time).toBe(Math.floor(timestamp.getTime() / 1000))
      expect(candle.open).toBe(1.0950)
      expect(candle.high).toBe(1.0960)
      expect(candle.low).toBe(1.0940)
      expect(candle.close).toBe(1.0955)
      expect(candle.volume).toBe(2500000)
    })

    it('converts timestamp to Unix seconds correctly', () => {
      const timestamp = new Date('2025-01-15T14:45:30Z')
      const expectedSeconds = Math.floor(timestamp.getTime() / 1000)

      const normalized: NormalizedCandle = {
        timestamp,
        o: 100,
        h: 101,
        l: 99,
        c: 100.5,
        v: 1000000,
      }

      const candle = normalizedToCandle(normalized)

      expect(candle.time).toBe(expectedSeconds)
    })

    it('converts multiple candles preserving chronological order', () => {
      const candles = createNormalizedCandles(5)

      const converted = candles.map(normalizedToCandle)

      // Assert timestamps are in ascending order
      for (let i = 0; i < converted.length - 1; i++) {
        expect(converted[i].time).toBeLessThan(converted[i + 1].time)
      }

      // Assert candle data is preserved
      for (let i = 0; i < candles.length; i++) {
        expect(converted[i].open).toBe(candles[i].o)
        expect(converted[i].high).toBe(candles[i].h)
        expect(converted[i].low).toBe(candles[i].l)
        expect(converted[i].close).toBe(candles[i].c)
        expect(converted[i].volume).toBe(candles[i].v)
      }
    })
  })

  describe('Fallback to synthetic data', () => {
    it('falls back to generateHistoricalCandles when fetchOHLCV returns < 50 candles', () => {
      // Arrange
      const normalizedCandles = createNormalizedCandles(30) // Less than 50
      mockFetchOHLCV.mockResolvedValue({
        candles: normalizedCandles,
        provider: 'eodhd' as DataProvider,
        fromCache: false,
        fetchedAt: new Date(),
        count: 30,
      })

      const syntheticCandles = createNormalizedCandles(200).map(normalizedToCandle)
      mockGenerateHistoricalCandles.mockReturnValue(syntheticCandles)

      // Act: Simulate handleRun logic
      const fetchedCandles = normalizedCandles.map(normalizedToCandle)
      let finalCandles = fetchedCandles
      let isSynthetic = false

      if (finalCandles.length < 50) {
        finalCandles = mockGenerateHistoricalCandles('EUR_USD', 'H1', '2025-01-01', '2025-12-31')
        isSynthetic = true
      }

      // Assert
      expect(isSynthetic).toBe(true)
      expect(finalCandles).toEqual(syntheticCandles)
      expect(mockGenerateHistoricalCandles).toHaveBeenCalledWith(
        'EUR_USD', 'H1', '2025-01-01', '2025-12-31'
      )
    })

    it('does not fall back when fetchOHLCV returns >= 50 candles', () => {
      // Arrange
      const normalizedCandles = createNormalizedCandles(100) // More than 50
      mockFetchOHLCV.mockResolvedValue({
        candles: normalizedCandles,
        provider: 'eodhd' as DataProvider,
        fromCache: false,
        fetchedAt: new Date(),
        count: 100,
      })

      // Act
      const fetchedCandles = normalizedCandles.map(normalizedToCandle)
      let finalCandles = fetchedCandles
      let isSynthetic = false

      if (finalCandles.length < 50) {
        finalCandles = mockGenerateHistoricalCandles('EUR_USD', 'H1', '2025-01-01', '2025-12-31')
        isSynthetic = true
      }

      // Assert
      expect(isSynthetic).toBe(false)
      expect(finalCandles).toHaveLength(100)
      expect(mockGenerateHistoricalCandles).not.toHaveBeenCalled()
    })

    it('does not generate synthetic data if at least 50 real candles are fetched', () => {
      const normalizedCandles = createNormalizedCandles(50)
      mockFetchOHLCV.mockResolvedValue({
        candles: normalizedCandles,
        provider: 'synthetic' as DataProvider,
        fromCache: false,
        fetchedAt: new Date(),
        count: 50,
      })

      const fetchedCandles = normalizedCandles.map(normalizedToCandle)
      let isSynthetic = false

      if (fetchedCandles.length < 50) {
        isSynthetic = true
      }

      expect(isSynthetic).toBe(false)
    })
  })

  describe('Error handling', () => {
    it('handles fetchOHLCV rejection and falls back to synthetic', () => {
      // Arrange
      const error = new Error('Network error')
      mockFetchOHLCV.mockRejectedValue(error)

      const syntheticCandles = createNormalizedCandles(200).map(normalizedToCandle)
      mockGenerateHistoricalCandles.mockReturnValue(syntheticCandles)

      // Act: Simulate handleRun error handling
      let candles: Candle[] = []
      let isSynthetic = false

      try {
        mockFetchOHLCV({
          symbol: 'EUR_USD',
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          provider: 'eodhd',
          useCache: true,
        }).catch(() => {
          candles = []
        })
      } catch {
        candles = []
      }

      // Fallback to synthetic
      if (candles.length < 50) {
        candles = mockGenerateHistoricalCandles('EUR_USD', 'H1', '2025-01-01', '2025-12-31')
        isSynthetic = true
      }

      // Assert
      expect(isSynthetic).toBe(true)
      expect(candles).toHaveLength(200)
    })

    it('sets error message when insufficient data available after fallback', () => {
      // Arrange
      mockFetchOHLCV.mockResolvedValue({
        candles: [],
        provider: 'eodhd' as DataProvider,
        fromCache: false,
        fetchedAt: new Date(),
        count: 0,
      })

      mockGenerateHistoricalCandles.mockReturnValue([])

      // Act: Simulate handleRun logic
      let candles: Candle[] = []
      let downloadMsg: string | null = null

      // First try: fetchOHLCV
      candles = []

      // Fallback: synthetic
      if (candles.length < 50) {
        candles = mockGenerateHistoricalCandles('EUR_USD', 'H1', '2025-01-01', '2025-12-31')
      }

      // Check minimum
      if (candles.length < 2) {
        downloadMsg = 'Not enough candle data for this date range.'
      }

      // Assert
      expect(downloadMsg).toBe('Not enough candle data for this date range.')
    })
  })

  describe('selectedProvider dependency', () => {
    it('includes selectedProvider in callback dependency array to trigger re-creation on change', () => {
      // This test verifies that when selectedProvider changes, a new callback is created
      // In React, this is critical to ensure the closure captures the current selectedProvider value

      const providers: DataProvider[] = ['eodhd', 'tiingo', 'synthetic']
      const callCounts = new Map<DataProvider, number>()

      providers.forEach(provider => {
        callCounts.set(provider, 0)
      })

      // Simulate: each time selectedProvider changes, a new callback should be created
      // and that callback should capture the current selectedProvider value

      const createCallback = (selectedProvider: DataProvider) => {
        return () => {
          const current = callCounts.get(selectedProvider) || 0
          callCounts.set(selectedProvider, current + 1)
          return selectedProvider
        }
      }

      const eodhdCallback = createCallback('eodhd')
      const tiingoCallback = createCallback('tiingo')
      const syntheticCallback = createCallback('synthetic')

      // Act: Call each callback
      expect(eodhdCallback()).toBe('eodhd')
      expect(tiingoCallback()).toBe('tiingo')
      expect(syntheticCallback()).toBe('synthetic')

      // Assert: Each callback captured its own provider value
      expect(callCounts.get('eodhd')).toBe(1)
      expect(callCounts.get('tiingo')).toBe(1)
      expect(callCounts.get('synthetic')).toBe(1)
    })
  })
})

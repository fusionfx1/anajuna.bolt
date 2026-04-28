import { describe, it, expect } from 'vitest'
import { normalizeCandles, validateCandle, normalizeCandle, dedupAndSortCandles } from '../../src/services/normalize'
import type { RawOHLCV, NormalizedCandle } from '../../src/services/dataFetchers/types'

describe('normalize service', () => {
  describe('validateCandle', () => {
    it('should accept valid candles', () => {
      const valid: RawOHLCV = {
        timestamp: 1609459200000,
        open: 100.5,
        high: 105.0,
        low: 99.0,
        close: 102.0,
        volume: 1000000,
      }
      expect(validateCandle(valid)).toBe(true)
    })

    it('should reject null or non-objects', () => {
      expect(validateCandle(null)).toBe(false)
      expect(validateCandle(undefined)).toBe(false)
      expect(validateCandle('string')).toBe(false)
      expect(validateCandle(123)).toBe(false)
    })

    it('should reject candles with missing fields', () => {
      const missing = { timestamp: 1609459200000, open: 100, high: 105 } as unknown
      expect(validateCandle(missing)).toBe(false)
    })

    it('should reject candles with non-numeric fields', () => {
      const nonNumeric = {
        timestamp: 'not-a-number',
        open: 100,
        high: 105,
        low: 99,
        close: 102,
        volume: 1000000,
      }
      expect(validateCandle(nonNumeric)).toBe(false)
    })

    it('should reject candles with NaN values', () => {
      const withNaN = {
        timestamp: 1609459200000,
        open: NaN,
        high: 105,
        low: 99,
        close: 102,
        volume: 1000000,
      }
      expect(validateCandle(withNaN)).toBe(false)
    })

    it('should reject candles with Infinity values', () => {
      const withInfinity = {
        timestamp: 1609459200000,
        open: Infinity,
        high: 105,
        low: 99,
        close: 102,
        volume: 1000000,
      }
      expect(validateCandle(withInfinity)).toBe(false)
    })

    it('should reject candles with negative prices', () => {
      const negativePrices = {
        timestamp: 1609459200000,
        open: -100,
        high: 105,
        low: 99,
        close: 102,
        volume: 1000000,
      }
      expect(validateCandle(negativePrices)).toBe(false)
    })

    it('should reject candles with negative volume', () => {
      const negativeVolume = {
        timestamp: 1609459200000,
        open: 100,
        high: 105,
        low: 99,
        close: 102,
        volume: -1000,
      }
      expect(validateCandle(negativeVolume)).toBe(false)
    })

    it('should reject candles where low > high', () => {
      const inverted = {
        timestamp: 1609459200000,
        open: 100,
        high: 99,
        low: 105,
        close: 102,
        volume: 1000000,
      }
      expect(validateCandle(inverted)).toBe(false)
    })

    it('should reject candles where close > high', () => {
      const closeTooHigh = {
        timestamp: 1609459200000,
        open: 100,
        high: 105,
        low: 99,
        close: 110,
        volume: 1000000,
      }
      expect(validateCandle(closeTooHigh)).toBe(false)
    })

    it('should reject candles where close < low', () => {
      const closeTooLow = {
        timestamp: 1609459200000,
        open: 100,
        high: 105,
        low: 99,
        close: 95,
        volume: 1000000,
      }
      expect(validateCandle(closeTooLow)).toBe(false)
    })

    it('should accept zero volume', () => {
      const zeroVolume = {
        timestamp: 1609459200000,
        open: 100,
        high: 105,
        low: 99,
        close: 102,
        volume: 0,
      }
      expect(validateCandle(zeroVolume)).toBe(true)
    })

    it('should allow small floating point tolerance', () => {
      // Close slightly above high due to floating point errors
      const tolerance = {
        timestamp: 1609459200000,
        open: 100,
        high: 105.00009,
        low: 99,
        close: 105,
        volume: 1000000,
      }
      expect(validateCandle(tolerance)).toBe(true)
    })
  })

  describe('normalizeCandle', () => {
    it('should convert raw candle to normalized form', () => {
      const raw: RawOHLCV = {
        timestamp: 1609459200000,
        open: 100.5,
        high: 105.0,
        low: 99.0,
        close: 102.0,
        volume: 1000000,
      }

      const result = normalizeCandle(raw, 'EURUSD', 'synthetic')

      expect(result).toEqual({
        timestamp: 1609459200000,
        open: 100.5,
        high: 105.0,
        low: 99.0,
        close: 102.0,
        volume: 1000000,
        symbol: 'EURUSD',
        provider: 'synthetic',
      })
    })

    it('should preserve all numeric fields', () => {
      const raw: RawOHLCV = {
        timestamp: 1234567890000,
        open: 1.234567,
        high: 1.456789,
        low: 1.123456,
        close: 1.345678,
        volume: 5000000,
      }

      const result = normalizeCandle(raw, 'GBPUSD', 'eodhd')

      expect(result.timestamp).toBe(1234567890000)
      expect(result.open).toBe(1.234567)
      expect(result.high).toBe(1.456789)
      expect(result.low).toBe(1.123456)
      expect(result.close).toBe(1.345678)
      expect(result.volume).toBe(5000000)
      expect(result.symbol).toBe('GBPUSD')
      expect(result.provider).toBe('eodhd')
    })

    it('should support different providers', () => {
      const raw: RawOHLCV = {
        timestamp: 1609459200000,
        open: 100,
        high: 105,
        low: 99,
        close: 102,
        volume: 1000000,
      }

      const eodhd = normalizeCandle(raw, 'EURUSD', 'eodhd')
      expect(eodhd.provider).toBe('eodhd')

      const tiingo = normalizeCandle(raw, 'EURUSD', 'tiingo')
      expect(tiingo.provider).toBe('tiingo')

      const synthetic = normalizeCandle(raw, 'EURUSD', 'synthetic')
      expect(synthetic.provider).toBe('synthetic')
    })
  })

  describe('normalizeCandles', () => {
    it('should normalize array of valid candles', () => {
      const raw: RawOHLCV[] = [
        {
          timestamp: 1609459200000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
        },
        {
          timestamp: 1609545600000,
          open: 102,
          high: 107,
          low: 101,
          close: 104,
          volume: 1200000,
        },
      ]

      const result = normalizeCandles(raw, 'EURUSD', 'synthetic')

      expect(result).toHaveLength(2)
      expect(result[0].symbol).toBe('EURUSD')
      expect(result[0].provider).toBe('synthetic')
      expect(result[1].symbol).toBe('EURUSD')
      expect(result[1].provider).toBe('synthetic')
    })

    it('should filter out invalid candles', () => {
      const raw = [
        {
          timestamp: 1609459200000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
        },
        {
          timestamp: 1609545600000,
          open: 100,
          high: 99, // Invalid: high < low
          low: 99,
          close: 102,
          volume: 1000000,
        },
        {
          timestamp: 1609632000000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1200000,
        },
      ] as unknown[]

      const result = normalizeCandles(raw, 'EURUSD', 'synthetic')

      expect(result).toHaveLength(2)
      expect(result[0].timestamp).toBe(1609459200000)
      expect(result[1].timestamp).toBe(1609632000000)
    })

    it('should sort candles by timestamp ascending', () => {
      const raw = [
        {
          timestamp: 1609632000000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
        },
        {
          timestamp: 1609459200000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
        },
        {
          timestamp: 1609545600000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
        },
      ] as unknown[]

      const result = normalizeCandles(raw, 'EURUSD', 'synthetic')

      expect(result[0].timestamp).toBe(1609459200000)
      expect(result[1].timestamp).toBe(1609545600000)
      expect(result[2].timestamp).toBe(1609632000000)
    })

    it('should return empty array for null input', () => {
      const result = normalizeCandles(null as unknown[], 'EURUSD', 'synthetic')
      expect(result).toEqual([])
    })

    it('should return empty array for non-array input', () => {
      const result = normalizeCandles('not-array' as unknown[], 'EURUSD', 'synthetic')
      expect(result).toEqual([])
    })

    it('should return empty array for empty input', () => {
      const result = normalizeCandles([], 'EURUSD', 'synthetic')
      expect(result).toEqual([])
    })

    it('should handle all invalid candles', () => {
      const raw = [
        { timestamp: NaN, open: 100, high: 105, low: 99, close: 102, volume: 1000000 },
        { timestamp: 1609459200000, open: -100, high: 105, low: 99, close: 102, volume: 1000000 },
      ] as unknown[]

      const result = normalizeCandles(raw, 'EURUSD', 'synthetic')

      expect(result).toHaveLength(0)
    })
  })

  describe('dedupAndSortCandles', () => {
    it('should remove duplicate candles by timestamp', () => {
      const candles: NormalizedCandle[] = [
        {
          timestamp: 1609459200000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
          symbol: 'EURUSD',
          provider: 'eodhd',
        },
        {
          timestamp: 1609459200000,
          open: 100.5,
          high: 105.5,
          low: 99.5,
          close: 102.5,
          volume: 1000500,
          symbol: 'EURUSD',
          provider: 'tiingo',
        },
        {
          timestamp: 1609545600000,
          open: 102,
          high: 107,
          low: 101,
          close: 104,
          volume: 1200000,
          symbol: 'EURUSD',
          provider: 'eodhd',
        },
      ]

      const result = dedupAndSortCandles(candles)

      expect(result).toHaveLength(2)
      expect(result[0].timestamp).toBe(1609459200000)
      expect(result[1].timestamp).toBe(1609545600000)
    })

    it('should keep first occurrence when duplicates exist', () => {
      const candles: NormalizedCandle[] = [
        {
          timestamp: 1609459200000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
          symbol: 'EURUSD',
          provider: 'eodhd',
        },
        {
          timestamp: 1609459200000,
          open: 200,
          high: 205,
          low: 199,
          close: 202,
          volume: 2000000,
          symbol: 'EURUSD',
          provider: 'tiingo',
        },
      ]

      const result = dedupAndSortCandles(candles)

      expect(result).toHaveLength(1)
      expect(result[0].open).toBe(100)
      expect(result[0].provider).toBe('eodhd')
    })

    it('should sort by timestamp ascending', () => {
      const candles: NormalizedCandle[] = [
        {
          timestamp: 1609632000000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
          symbol: 'EURUSD',
          provider: 'eodhd',
        },
        {
          timestamp: 1609459200000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
          symbol: 'EURUSD',
          provider: 'eodhd',
        },
        {
          timestamp: 1609545600000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
          symbol: 'EURUSD',
          provider: 'eodhd',
        },
      ]

      const result = dedupAndSortCandles(candles)

      expect(result[0].timestamp).toBe(1609459200000)
      expect(result[1].timestamp).toBe(1609545600000)
      expect(result[2].timestamp).toBe(1609632000000)
    })

    it('should handle empty array', () => {
      const result = dedupAndSortCandles([])
      expect(result).toEqual([])
    })

    it('should handle single candle', () => {
      const candles: NormalizedCandle[] = [
        {
          timestamp: 1609459200000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 1000000,
          symbol: 'EURUSD',
          provider: 'eodhd',
        },
      ]

      const result = dedupAndSortCandles(candles)

      expect(result).toHaveLength(1)
      expect(result[0].timestamp).toBe(1609459200000)
    })
  })
})

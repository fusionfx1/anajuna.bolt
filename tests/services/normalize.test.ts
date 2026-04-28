import { describe, it, expect } from 'vitest'
import {
  normalizeCandles,
  normalizeCandle,
  validateCandle,
  dedupAndSortCandles,
} from '../../src/services/normalize'
import { NormalizedCandle } from '../../src/services/dataFetchers/types'

describe('normalize.ts', () => {
  const mockEodhhdCandle = {
    date: '2026-04-29',
    open: 1.0850,
    high: 1.0860,
    low: 1.0840,
    close: 1.0855,
    volume: 1000000,
  }

  const mockTiingoCandle = {
    date: '2026-04-29',
    time: '00:00:00',
    close: 1.0855,
    high: 1.0860,
    low: 1.0840,
    open: 1.0850,
    volume: 1000000,
  }

  const mockSyntheticCandle = {
    date: 1714435200000,
    timestamp: 1714435200000,
    open: 1.0850,
    high: 1.0860,
    low: 1.0840,
    close: 1.0855,
    volume: 1000000,
  }

  describe('normalizeCandle', () => {
    it('normalizes EODHD candle correctly', () => {
      const result = normalizeCandle(mockEodhhdCandle, 'eodhd')
      expect(result.o).toBe(1.0850)
      expect(result.h).toBe(1.0860)
      expect(result.l).toBe(1.0840)
      expect(result.c).toBe(1.0855)
      expect(result.v).toBe(1000000)
      expect(result.timestamp).toBeInstanceOf(Date)
    })

    it('normalizes Tiingo candle correctly', () => {
      const result = normalizeCandle(mockTiingoCandle, 'tiingo')
      expect(result.o).toBe(1.0850)
      expect(result.h).toBe(1.0860)
      expect(result.l).toBe(1.0840)
      expect(result.c).toBe(1.0855)
      expect(result.v).toBe(1000000)
      expect(result.timestamp).toBeInstanceOf(Date)
    })

    it('normalizes Synthetic candle correctly', () => {
      const result = normalizeCandle(mockSyntheticCandle, 'synthetic')
      expect(result.o).toBe(1.0850)
      expect(result.h).toBe(1.0860)
      expect(result.l).toBe(1.0840)
      expect(result.c).toBe(1.0855)
      expect(result.v).toBe(1000000)
      expect(result.timestamp).toBeInstanceOf(Date)
    })
  })

  describe('normalizeCandles', () => {
    it('normalizes array of EODHD candles', () => {
      const input = [mockEodhhdCandle, mockEodhhdCandle]
      const result = normalizeCandles(input, 'eodhd')
      expect(result).toHaveLength(2)
      expect(result[0].c).toBe(1.0855)
    })

    it('normalizes array of Tiingo candles', () => {
      const input = [mockTiingoCandle, mockTiingoCandle]
      const result = normalizeCandles(input, 'tiingo')
      expect(result).toHaveLength(2)
      expect(result[0].c).toBe(1.0855)
    })

    it('normalizes array of Synthetic candles', () => {
      const input = [mockSyntheticCandle, mockSyntheticCandle]
      const result = normalizeCandles(input, 'synthetic')
      expect(result).toHaveLength(2)
      expect(result[0].c).toBe(1.0855)
    })

    it('returns empty array for empty input', () => {
      const result = normalizeCandles([], 'eodhd')
      expect(result).toHaveLength(0)
    })
  })

  describe('validateCandle', () => {
    const validCandle: NormalizedCandle = {
      timestamp: new Date('2026-04-29'),
      o: 1.0850,
      h: 1.0860,
      l: 1.0840,
      c: 1.0855,
      v: 1000000,
    }

    it('validates correct candle', () => {
      expect(validateCandle(validCandle)).toBe(true)
    })

    it('rejects candle with negative open price', () => {
      const invalid = { ...validCandle, o: -1 }
      expect(validateCandle(invalid)).toBe(false)
    })

    it('rejects candle with high < open', () => {
      const invalid = { ...validCandle, h: 1.0800 }
      expect(validateCandle(invalid)).toBe(false)
    })

    it('rejects candle with low > close', () => {
      const invalid = { ...validCandle, l: 1.0900 }
      expect(validateCandle(invalid)).toBe(false)
    })

    it('rejects candle with negative volume', () => {
      const invalid = { ...validCandle, v: -1000 }
      expect(validateCandle(invalid)).toBe(false)
    })

    it('rejects candle with invalid timestamp', () => {
      const invalid = { ...validCandle, timestamp: new Date('invalid') }
      expect(validateCandle(invalid)).toBe(false)
    })
  })

  describe('dedupAndSortCandles', () => {
    it('deduplicates and sorts candles by timestamp', () => {
      const candles: NormalizedCandle[] = [
        {
          timestamp: new Date('2026-04-29T03:00:00'),
          open: 1.0850,
          high: 1.0860,
          low: 1.0840,
          close: 1.0855,
          volume: 1000000,
        },
        {
          timestamp: new Date('2026-04-29T01:00:00'),
          open: 1.0840,
          high: 1.0850,
          low: 1.0830,
          close: 1.0845,
          volume: 1000000,
        },
        {
          timestamp: new Date('2026-04-29T01:00:00'),
          open: 1.0840,
          high: 1.0850,
          low: 1.0830,
          close: 1.0845,
          volume: 1000000,
        },
      ]

      const result = dedupAndSortCandles(candles)
      expect(result).toHaveLength(2)
      expect(result[0].timestamp).toEqual(new Date('2026-04-29T01:00:00'))
      expect(result[1].timestamp).toEqual(new Date('2026-04-29T03:00:00'))
    })

    it('preserves candle data integrity after dedup', () => {
      const candle: NormalizedCandle = {
        timestamp: new Date('2026-04-29'),
        open: 1.0850,
        high: 1.0860,
        low: 1.0840,
        close: 1.0855,
        volume: 1000000,
      }
      const result = dedupAndSortCandles([candle, candle])
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(candle)
    })

    it('handles single candle', () => {
      const candle: NormalizedCandle = {
        timestamp: new Date('2026-04-29'),
        open: 1.0850,
        high: 1.0860,
        low: 1.0840,
        close: 1.0855,
        volume: 1000000,
      }
      const result = dedupAndSortCandles([candle])
      expect(result).toHaveLength(1)
    })

    it('handles empty array', () => {
      const result = dedupAndSortCandles([])
      expect(result).toHaveLength(0)
    })
  })
})

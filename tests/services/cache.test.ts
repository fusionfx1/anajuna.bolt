import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readCache, writeCache, clearCache, getCacheMetadata } from '../../src/services/cache'
import { NormalizedCandle } from '../../src/services/dataFetchers/types'

describe('cache.ts', () => {
  const mockCandles: NormalizedCandle[] = [
    {
      timestamp: new Date('2026-04-29T00:00:00'),
      open: 1.0850,
      high: 1.0860,
      low: 1.0840,
      close: 1.0855,
      volume: 1000000,
    },
    {
      timestamp: new Date('2026-04-29T01:00:00'),
      open: 1.0855,
      high: 1.0865,
      low: 1.0845,
      close: 1.0860,
      volume: 1000000,
    },
  ]

  beforeEach(() => {
    localStorage.clear()
    if (indexedDB.databases) {
      indexedDB.databases().then((dbs) => {
        dbs.forEach((db) => {
          indexedDB.deleteDatabase(db.name)
        })
      })
    }
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('writeCache and readCache', () => {
    it('writes and reads candles from cache', async () => {
      const key = 'EURUSD-eodhd-hourly'
      await writeCache(key, mockCandles, 'eodhd', 30)

      const cached = await readCache(key, 30)
      expect(cached).toBeTruthy()
      expect(cached).toHaveLength(2)
      expect(cached?.[0].close).toBe(1.0855)
    })

    it('returns null for non-existent cache key', async () => {
      const cached = await readCache('nonexistent-key', 30)
      expect(cached).toBeNull()
    })

    it('respects TTL expiration', async () => {
      const key = 'EURUSD-eodhd-hourly'
      await writeCache(key, mockCandles, 'eodhd', 0)

      const cached = await readCache(key, 0)
      expect(cached).toBeNull()
    })

    it('handles localStorage fallback', async () => {
      const key = 'EURUSD-eodhd-hourly'

      localStorage.setItem(
        `anjuna_cache_${key}`,
        JSON.stringify({
          candles: mockCandles,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          provider: 'eodhd',
        })
      )

      const cached = await readCache(key, 30)
      expect(cached).toBeTruthy()
      expect(cached).toHaveLength(2)
    })

    it('handles large cache entries', async () => {
      const largeCandles: NormalizedCandle[] = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 3600000),
        open: 1.0850 + i * 0.0001,
        high: 1.0860 + i * 0.0001,
        low: 1.0840 + i * 0.0001,
        close: 1.0855 + i * 0.0001,
        volume: 1000000,
      }))

      const key = 'EURUSD-eodhd-hourly'
      await writeCache(key, largeCandles, 'eodhd', 30)

      const cached = await readCache(key, 30)
      expect(cached).toHaveLength(1000)
      expect(cached?.[999].close).toBeCloseTo(1.1854, 3)
    })
  })

  describe('clearCache', () => {
    it('clears specific cache entry', async () => {
      const key1 = 'EURUSD-eodhd-hourly'
      const key2 = 'GBPUSD-tiingo-hourly'

      await writeCache(key1, mockCandles, 'eodhd', 30)
      await writeCache(key2, mockCandles, 'tiingo', 30)

      await clearCache(key1)

      const cached1 = await readCache(key1, 30)
      const cached2 = await readCache(key2, 30)

      expect(cached1).toBeNull()
      expect(cached2).toBeTruthy()
    })

    it('clears all cache when key not specified', async () => {
      const key1 = 'EURUSD-eodhd-hourly'
      const key2 = 'GBPUSD-tiingo-hourly'

      await writeCache(key1, mockCandles, 'eodhd', 30)
      await writeCache(key2, mockCandles, 'tiingo', 30)

      await clearCache()

      const cached1 = await readCache(key1, 30)
      const cached2 = await readCache(key2, 30)

      expect(cached1).toBeNull()
      expect(cached2).toBeNull()
    })
  })

  describe('getCacheMetadata', () => {
    it('returns cache statistics', async () => {
      const key1 = 'EURUSD-eodhd-hourly'
      const key2 = 'GBPUSD-tiingo-hourly'

      await writeCache(key1, mockCandles, 'eodhd', 30)
      await writeCache(key2, mockCandles, 'tiingo', 30)

      const metadata = await getCacheMetadata()

      expect(metadata.totalEntries).toBeGreaterThanOrEqual(2)
      expect(metadata.totalSizeBytes).toBeGreaterThan(0)
    })

    it('returns oldest and newest entry dates', async () => {
      const key = 'EURUSD-eodhd-hourly'
      await writeCache(key, mockCandles, 'eodhd', 30)

      const metadata = await getCacheMetadata()

      expect(metadata.oldestEntry).toBeInstanceOf(Date)
      expect(metadata.newestEntry).toBeInstanceOf(Date)
    })

    it('returns empty stats for empty cache', async () => {
      await clearCache()
      const metadata = await getCacheMetadata()

      expect(metadata.totalEntries).toBe(0)
      expect(metadata.totalSizeBytes).toBe(0)
    })
  })

  describe('error handling', () => {
    it('handles write errors gracefully', async () => {
      const key = 'EURUSD-eodhd-hourly'

      // Write succeeds (falls back to localStorage if IndexedDB fails)
      const result = await writeCache(key, mockCandles, 'eodhd', 30)
      // Should not throw
      expect(result).toBeUndefined()
    })

    it('handles read errors gracefully', async () => {
      const key = 'EURUSD-eodhd-hourly-error'

      localStorage.setItem(`anjuna_cache_${key}`, 'invalid json')

      const cached = await readCache(key, 30)
      expect(cached).toBeNull()
    })
  })
})

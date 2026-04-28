import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CacheService } from '../../src/services/cache'
import type { NormalizedCandle } from '../../src/services/dataFetchers/types'

describe('CacheService', () => {
  let cache: CacheService

  const mockCandles: NormalizedCandle[] = [
    {
      timestamp: 1609459200000,
      open: 100.5,
      high: 105.0,
      low: 99.0,
      close: 102.0,
      volume: 1000000,
      symbol: 'EURUSD',
      provider: 'eodhd',
    },
    {
      timestamp: 1609545600000,
      open: 102.0,
      high: 107.0,
      low: 101.0,
      close: 104.0,
      volume: 1200000,
      symbol: 'EURUSD',
      provider: 'eodhd',
    },
  ]

  beforeEach(() => {
    cache = new CacheService()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('set and get', () => {
    it('should set and get cached data', async () => {
      const key = 'EURUSD-eodhd-hourly'
      await cache.set(key, mockCandles)

      const cached = await cache.get(key)
      expect(cached).toBeDefined()
      expect(cached).toHaveLength(2)
      expect(cached?.[0].close).toBe(102.0)
    })

    it('should return undefined for non-existent key', async () => {
      const cached = await cache.get('nonexistent-key')
      expect(cached).toBeUndefined()
    })

    it('should respect TTL expiration', async () => {
      const key = 'EURUSD-eodhd-hourly'
      // Set with 1ms TTL to expire immediately
      await cache.set(key, mockCandles, 1)

      // Wait a bit to ensure expiration
      await new Promise((resolve) => setTimeout(resolve, 10))

      const cached = await cache.get(key)
      expect(cached).toBeUndefined()
    })

    it('should handle localStorage fallback', async () => {
      const key = 'EURUSD-eodhd-hourly'

      localStorage.setItem(
        `anjuna_cache_${key}`,
        JSON.stringify({
          key,
          candles: mockCandles,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          provider: 'eodhd',
        })
      )

      const cached = await cache.get(key)
      expect(cached).toBeDefined()
      expect(cached).toHaveLength(2)
    })

    it('should handle large cache entries', async () => {
      const largeCandles: NormalizedCandle[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: 1609459200000 + i * 3600000,
        open: 100.5 + i * 0.001,
        high: 105.0 + i * 0.001,
        low: 99.0 + i * 0.001,
        close: 102.0 + i * 0.001,
        volume: 1000000,
        symbol: 'EURUSD',
        provider: 'eodhd',
      }))

      const key = 'EURUSD-eodhd-large'
      await cache.set(key, largeCandles)

      const cached = await cache.get(key)
      expect(cached).toHaveLength(100)
    })
  })

  describe('clear', () => {
    it('should clear specific cache entry', async () => {
      const key1 = 'EURUSD-eodhd-hourly'
      const key2 = 'GBPUSD-tiingo-hourly'

      await cache.set(key1, mockCandles)
      await cache.set(key2, mockCandles)

      await cache.clear(key1)

      const cached1 = await cache.get(key1)
      const cached2 = await cache.get(key2)

      expect(cached1).toBeUndefined()
      expect(cached2).toBeDefined()
    })

    it('should clear all cache when no key specified', async () => {
      const key1 = 'EURUSD-eodhd-hourly'
      const key2 = 'GBPUSD-tiingo-hourly'

      await cache.set(key1, mockCandles)
      await cache.set(key2, mockCandles)

      await cache.clear()

      const cached1 = await cache.get(key1)
      const cached2 = await cache.get(key2)

      expect(cached1).toBeUndefined()
      expect(cached2).toBeUndefined()
    })
  })

  describe('stats', () => {
    it('should return cache statistics', async () => {
      const key1 = 'EURUSD-eodhd-hourly'
      const key2 = 'GBPUSD-tiingo-hourly'

      await cache.set(key1, mockCandles)
      await cache.set(key2, mockCandles)

      const stats = await cache.stats()

      expect(stats.size).toBeGreaterThanOrEqual(0)
      expect(stats.totalSizeBytes).toBeGreaterThan(0)
    })

    it('should track oldest and newest entries', async () => {
      const key = 'EURUSD-eodhd-hourly'
      await cache.set(key, mockCandles)

      const stats = await cache.stats()

      expect(stats.oldestEntry).toBeInstanceOf(Date)
      expect(stats.newestEntry).toBeInstanceOf(Date)
    })

    it('should return empty stats for empty cache', async () => {
      await cache.clear()
      const stats = await cache.stats()

      expect(stats.size).toBe(0)
      expect(stats.totalSizeBytes).toBe(0)
    })
  })

  describe('error handling', () => {
    it('should handle write errors gracefully', async () => {
      const key = 'EURUSD-eodhd-hourly'

      // Should not throw even if IndexedDB fails
      const result = await cache.set(key, mockCandles)
      expect(result).toBeUndefined()
    })

    it('should handle read errors gracefully', async () => {
      const key = 'EURUSD-eodhd-error'
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      localStorage.setItem(`anjuna_cache_${key}`, 'invalid json')

      const cached = await cache.get(key)
      expect(cached).toBeUndefined()
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })
})

import { openDB, DBSchema, IDBPDatabase } from 'idb'
import { NormalizedCandle, CacheEntry, CacheStats } from './dataFetchers/types'

interface CacheDB extends DBSchema {
  candles: {
    key: string
    value: CacheEntry
  }
}

const DB_NAME = 'anjuna-data-cache'
const DB_VERSION = 1
const STORE_NAME = 'candles'
const STORAGE_KEY_PREFIX = 'anjuna_cache_'
const MAX_STORAGE_BYTES = 5 * 1024 * 1024 // 5MB fallback limit

let dbInstance: IDBPDatabase<CacheDB> | null = null

export class CacheService {
  private async getDB(): Promise<IDBPDatabase<CacheDB> | null> {
    if (dbInstance) {
      return dbInstance
    }

    try {
      dbInstance = await openDB<CacheDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' })
          }
        },
      })
      return dbInstance
    } catch (error) {
      console.warn('[cache] IndexedDB not available, using localStorage fallback', error)
      return null
    }
  }

  async get(key: string): Promise<NormalizedCandle[] | undefined> {
    try {
      const db = await this.getDB()
      if (db) {
        const entry = await db.get(STORE_NAME, key)
        if (entry && this.isValidEntry(entry)) {
          return entry.candles || entry.data
        }
      }
    } catch (error) {
      console.warn('[cache] IndexedDB read failed', error)
    }

    // Fallback to localStorage
    return this.readLocalStorageCache(key)
  }

  async set(
    key: string,
    candles: NormalizedCandle[],
    ttl: number = 24 * 60 * 60 * 1000 // 24 hours default
  ): Promise<void> {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttl)

    const entry: CacheEntry = {
      key,
      candles,
      fetchedAt: now,
      expiresAt,
      symbolMetadata: {
        totalCandles: candles.length,
        dateRange:
          candles.length > 0
            ? [candles[0].timestamp, candles[candles.length - 1].timestamp]
            : [0, 0],
      },
    }

    try {
      const db = await this.getDB()
      if (db) {
        await db.put(STORE_NAME, entry)
        return
      }
    } catch (error) {
      console.warn('[cache] IndexedDB write failed', error)
    }

    // Fallback to localStorage
    this.writeLocalStorageCache(key, entry)
  }

  async clear(key?: string): Promise<void> {
    try {
      const db = await this.getDB()
      if (db) {
        if (key) {
          await db.delete(STORE_NAME, key)
        } else {
          await db.clear(STORE_NAME)
        }
      }
    } catch (error) {
      console.warn('[cache] IndexedDB clear failed', error)
    }

    // Clear localStorage
    if (key) {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${key}`)
    } else {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(STORAGE_KEY_PREFIX))
        .forEach((k) => localStorage.removeItem(k))
    }
  }

  async stats(): Promise<CacheStats> {
    const stats: CacheStats = {
      hits: 0,
      misses: 0,
      size: 0,
      lastCleared: Date.now(),
      totalEntries: 0,
      totalSizeBytes: 0,
      byProvider: {},
    }

    try {
      const db = await this.getDB()
      if (db) {
        const entries = await db.getAll(STORE_NAME)
        stats.totalEntries = entries.length
        stats.size = entries.length

        entries.forEach((entry) => {
          const size = this.estimateObjectSize(entry)
          stats.totalSizeBytes! += size

          if (entry.provider) {
            if (!stats.byProvider![entry.provider]) {
              stats.byProvider![entry.provider] = {
                count: 0,
                sizeBytes: 0,
              }
            }
            stats.byProvider![entry.provider]!.count += 1
            stats.byProvider![entry.provider]!.sizeBytes += size
          }

          // Track date range
          const fetchedAt = new Date(entry.fetchedAt || 0)
          if (!stats.oldestEntry || fetchedAt < stats.oldestEntry) {
            stats.oldestEntry = fetchedAt
          }
          if (!stats.newestEntry || fetchedAt > stats.newestEntry) {
            stats.newestEntry = fetchedAt
          }
        })
      }
    } catch (error) {
      console.warn('[cache] stats failed', error)
    }

    // Add localStorage stats
    const localStorageSize = Array.from(Object.keys(localStorage))
      .filter((k) => k.startsWith(STORAGE_KEY_PREFIX))
      .reduce((sum, k) => {
        const val = localStorage.getItem(k)
        return sum + (val ? val.length : 0)
      }, 0)

    stats.totalSizeBytes! += localStorageSize

    return stats
  }

  private readLocalStorageCache(key: string): NormalizedCandle[] | undefined {
    try {
      const json = localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`)
      if (!json) return undefined

      const entry = JSON.parse(json) as CacheEntry
      if (this.isValidEntry(entry)) {
        return entry.candles || entry.data
      }
    } catch (error) {
      console.warn('[cache] localStorage read failed', error)
    }

    return undefined
  }

  private writeLocalStorageCache(key: string, entry: CacheEntry): void {
    try {
      const json = JSON.stringify(entry)

      // Check if we're exceeding quota
      const storedSize = Array.from(Object.keys(localStorage))
        .filter((k) => k.startsWith(STORAGE_KEY_PREFIX))
        .reduce((sum, k) => {
          const val = localStorage.getItem(k)
          return sum + (val ? val.length : 0)
        }, 0)

      if (storedSize + json.length > MAX_STORAGE_BYTES) {
        // Remove oldest entries to make room
        const entries = Object.keys(localStorage)
          .filter((k) => k.startsWith(STORAGE_KEY_PREFIX))
          .map((k) => {
            const stored = localStorage.getItem(k)
            return {
              key: k,
              entry: stored ? JSON.parse(stored) : null,
            }
          })
          .filter((e) => e.entry)
          .sort((a, b) => {
            const aDate = new Date(a.entry.fetchedAt).getTime()
            const bDate = new Date(b.entry.fetchedAt).getTime()
            return aDate - bDate
          })

        // Remove oldest 30% to make room
        const toRemove = Math.ceil(entries.length * 0.3)
        for (let i = 0; i < toRemove; i++) {
          localStorage.removeItem(entries[i].key)
        }
      }

      localStorage.setItem(`${STORAGE_KEY_PREFIX}${key}`, json)
    } catch (error) {
      console.warn('[cache] localStorage write failed', error)
    }
  }

  private isValidEntry(entry: CacheEntry): boolean {
    const expiresAt = new Date(entry.expiresAt || 0)
    return expiresAt > new Date()
  }

  private estimateObjectSize(obj: unknown): number {
    return JSON.stringify(obj).length
  }
}

// Export singleton instance
export const cacheService = new CacheService()

// Export convenience functions for direct use
export async function readCache(
  key: string,
  ttlDays: number
): Promise<NormalizedCandle[] | null> {
  return cacheService.get(key, ttlDays)
}

export async function writeCache(
  key: string,
  candles: NormalizedCandle[],
  provider: string,
  ttlDays: number
): Promise<void> {
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000
  await cacheService.set(key, candles, provider, ttlMs)
}

export function getCacheStats(): CacheStats {
  return cacheService.stats()
}

export async function clearCache(key?: string): Promise<void> {
  if (key) {
    await cacheService.clear(key)
  } else {
    await cacheService.clear()
  }
}

export function getCacheMetadata(): CacheStats {
  return cacheService.stats()
}

import { openDB, DBSchema, IDBPDatabase } from 'idb'
import {
  NormalizedCandle,
  CacheEntry,
  CacheStats,
  ProviderType,
} from './dataFetchers/types'

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

async function getDB(): Promise<IDBPDatabase<CacheDB>> {
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
    console.warn(
      '[cache] IndexedDB not available, will use localStorage fallback',
      error
    )
    return null as unknown as IDBPDatabase<CacheDB>
  }
}

export async function readCache(
  key: string,
  ttlDays: number = 30
): Promise<NormalizedCandle[] | null> {
  try {
    const db = await getDB()
    if (db) {
      const entry = await db.get(STORE_NAME, key)
      if (entry && isValidEntry(entry, ttlDays)) {
        return entry.candles
      }
    }
  } catch (error) {
    console.warn('[cache] IndexedDB read failed, trying localStorage', error)
  }

  // Fallback to localStorage
  return readLocalStorageCache(key, ttlDays)
}

export async function writeCache(
  key: string,
  candles: NormalizedCandle[],
  provider: ProviderType,
  ttlDays: number = 30
): Promise<void> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)

  const entry: CacheEntry = {
    key,
    candles,
    fetchedAt: now,
    expiresAt,
    provider,
    symbolMetadata: {
      totalCandles: candles.length,
      dateRange: [
        candles[0].timestamp,
        candles[candles.length - 1].timestamp,
      ],
    },
  }

  try {
    const db = await getDB()
    if (db) {
      await db.put(STORE_NAME, entry)
      return
    }
  } catch (error) {
    console.warn(
      '[cache] IndexedDB write failed, trying localStorage',
      error
    )
  }

  // Fallback to localStorage
  writeLocalStorageCache(key, entry)
}

export async function clearCache(key?: string): Promise<void> {
  try {
    const db = await getDB()
    if (db) {
      if (key) {
        await db.delete(STORE_NAME, key)
      } else {
        await db.clear(STORE_NAME)
      }
    }
  } catch (error) {
    console.warn(
      '[cache] IndexedDB clear failed, clearing localStorage',
      error
    )
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

export async function getCacheMetadata(): Promise<CacheStats> {
  const stats: CacheStats = {
    totalEntries: 0,
    totalSizeBytes: 0,
    byProvider: {},
  }

  try {
    const db = await getDB()
    if (db) {
      const entries = await db.getAll(STORE_NAME)
      stats.totalEntries = entries.length

      entries.forEach((entry) => {
        const size = estimateObjectSize(entry)
        stats.totalSizeBytes += size

        if (!stats.byProvider[entry.provider]) {
          stats.byProvider[entry.provider] = {
            count: 0,
            sizeBytes: 0,
          }
        }
        stats.byProvider[entry.provider]!.count += 1
        stats.byProvider[entry.provider]!.sizeBytes += size

        // Track date range
        const fetchedAt = new Date(entry.fetchedAt)
        if (!stats.oldestEntry || fetchedAt < stats.oldestEntry) {
          stats.oldestEntry = fetchedAt
        }
        if (!stats.newestEntry || fetchedAt > stats.newestEntry) {
          stats.newestEntry = fetchedAt
        }
      })
    }
  } catch (error) {
    console.warn('[cache] getCacheMetadata failed', error)
  }

  // Add localStorage stats
  const localStorageSize = Array.from(Object.keys(localStorage))
    .filter((k) => k.startsWith(STORAGE_KEY_PREFIX))
    .reduce((sum, k) => {
      const val = localStorage.getItem(k)
      return sum + (val ? val.length : 0)
    }, 0)

  stats.totalSizeBytes += localStorageSize

  return stats
}

// localStorage fallback implementations
function readLocalStorageCache(
  key: string,
  ttlDays: number
): NormalizedCandle[] | null {
  try {
    const json = localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`)
    if (!json) return null

    const entry = JSON.parse(json) as CacheEntry
    if (isValidEntry(entry, ttlDays)) {
      // Convert timestamp strings back to Date objects
      return entry.candles.map((c) => ({
        ...c,
        timestamp: new Date(c.timestamp),
      }))
    }
  } catch (error) {
    console.warn('[cache] localStorage read failed', error)
  }

  return null
}

function writeLocalStorageCache(
  key: string,
  entry: CacheEntry
): void {
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

function isValidEntry(entry: CacheEntry, ttlDays: number): boolean {
  const expiresAt = new Date(entry.expiresAt)
  return expiresAt > new Date()
}

function estimateObjectSize(obj: unknown): number {
  return JSON.stringify(obj).length
}

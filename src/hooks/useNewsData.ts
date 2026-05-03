import { useState, useEffect, useRef, useCallback } from 'react';
import { toZonedTime, format as tzFormat } from 'date-fns-tz';
import type { ImpactLevel, NewsEvent, NewsApiResponse } from '../types/news';

const EDGE_FUNCTION_URL =
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-proxy`;

const DISPLAY_TZ = 'Asia/Bangkok'; // UTC+7, no DST

// ── Client-side cache (persists for the JS session, clears on hard reload) ────
let clientCache: { events: NewsEvent[]; expiresAt: number; v: number } | null = null;
const CLIENT_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Bump when API/normalization shape changes so stale sessions don't reuse bad cached rows */
const CLIENT_CACHE_V = 2;

/** Map API country codes to flag emoji when `flag` is omitted */
function flagForCountry(code: string): string {
  const m: Record<string, string> = {
    US: '🇺🇸',
    EUR: '🇪🇺',
    EU: '🇪🇺',
    UK: '🇬🇧',
    GB: '🇬🇧',
    JP: '🇯🇵',
    AU: '🇦🇺',
    CA: '🇨🇦',
    CH: '🇨🇭',
    NZ: '🇳🇿',
    CN: '🇨🇳',
  };
  return m[code.toUpperCase()] ?? '🌍';
}

/**
 * Normalize edge payloads: legacy mock used `event` instead of `title` and omitted utcMs/flag,
 * which crashed formatting (`utcMs !== null` is true when utcMs is undefined).
 */
function normalizeNewsItem(raw: unknown): NewsEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title =
    typeof r.title === 'string'
      ? r.title
      : typeof r.event === 'string'
        ? r.event
        : '';
  if (!title.trim()) return null;

  const utcRaw = r.utcMs;
  let utcMs: number | null =
    typeof utcRaw === 'number' && Number.isFinite(utcRaw) ? utcRaw : null;

  const impactRaw = String(r.impact ?? 'low').toLowerCase();
  const impact: ImpactLevel =
    impactRaw === 'high' || impactRaw === 'medium' ? impactRaw : 'low';

  const country = String(r.country ?? '');
  const flag =
    typeof r.flag === 'string' && r.flag.trim() !== ''
      ? r.flag
      : flagForCountry(country);

  return {
    title,
    country,
    flag,
    impact,
    forecast: String(r.forecast ?? ''),
    previous: String(r.previous ?? ''),
    actual: String(r.actual ?? ''),
    utcMs,
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Format a UTC epoch ms as "HH:mm" in Asia/Bangkok */
export function fmtTimeBangkok(utcMs: number): string {
  return tzFormat(toZonedTime(new Date(utcMs), DISPLAY_TZ), 'HH:mm', { timeZone: DISPLAY_TZ });
}

/** Format a UTC epoch ms as "EEE dd MMM" in Asia/Bangkok */
export function fmtDateBangkok(utcMs: number): string {
  return tzFormat(toZonedTime(new Date(utcMs), DISPLAY_TZ), 'EEE dd MMM', { timeZone: DISPLAY_TZ });
}

/** Minutes until a UTC epoch ms from now (negative = past) */
export function minsUntil(utcMs: number): number {
  return Math.floor((utcMs - Date.now()) / 60_000);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseNewsDataReturn {
  events: NewsEvent[];
  loading: boolean;
  error: string | null;
  nextHigh: NewsEvent | null;
  source: 'finnhub' | 'mock' | null;
  refresh: () => void;
}

export function useNewsData(): UseNewsDataReturn {
  const [events,  setEvents]  = useState<NewsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [source,  setSource]  = useState<'finnhub' | 'mock' | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (force = false) => {
    if (!force && clientCache && clientCache.v === CLIENT_CACHE_V && Date.now() < clientCache.expiresAt) {
      setEvents(clientCache.events);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: NewsApiResponse = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Unknown error from news proxy');

      const rawItems = Array.isArray(data.items) ? data.items : [];
      const items = rawItems
        .map(normalizeNewsItem)
        .filter((x): x is NewsEvent => x !== null);

      const dataSource = (data as { source?: string }).source === 'finnhub' ? 'finnhub' : 'mock';
      clientCache = { events: items, expiresAt: Date.now() + CLIENT_TTL_MS, v: CLIENT_CACHE_V };
      setEvents(items);
      setSource(dataSource);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load news');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => { abortRef.current?.abort(); };
  }, [load]);

  const now = Date.now();
  const nextHigh =
    events.find(e => e.impact === 'high' && e.utcMs != null && e.utcMs > now) ??
    null;

  return { events, loading, error, nextHigh, source, refresh: () => load(true) };
}

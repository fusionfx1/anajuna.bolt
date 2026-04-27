import { useCallback, useEffect, useRef, useState } from 'react';
import {
  runHealthCheck,
  type HealthStatus,
  type HealthCheckConfig,
} from '../services/healthCheck';

export interface UseHealthCheckOptions {
  /** Polling interval in milliseconds. Set to 0 to disable auto-refresh. */
  intervalMs?: number;
  /** Run a check immediately on mount (default true). */
  immediate?: boolean;
  /** Per-check configuration override (timeout, retries, etc.). */
  config?: Partial<HealthCheckConfig>;
}

export interface UseHealthCheckResult {
  status: HealthStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * React hook that runs the Supabase health check on mount and (optionally)
 * on a recurring interval. Components get a memoised refresh callback so
 * "Run check" buttons can force an out-of-band probe.
 *
 * Example:
 *   const { status, loading, refresh } = useHealthCheck({ intervalMs: 30_000 });
 */
export function useHealthCheck(options: UseHealthCheckOptions = {}): UseHealthCheckResult {
  const { intervalMs = 30_000, immediate = true, config } = options;
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const inflightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    try {
      const result = await runHealthCheck(config);
      setStatus(result);
    } finally {
      setLoading(false);
      inflightRef.current = false;
    }
  // The config object is treated by reference; callers should memoise it
  // if they want to change it without spamming reruns.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (immediate) void refresh();
    if (intervalMs <= 0) return;
    const id = setInterval(() => { void refresh(); }, intervalMs);
    return () => clearInterval(id);
  }, [immediate, intervalMs, refresh]);

  return { status, loading, refresh };
}

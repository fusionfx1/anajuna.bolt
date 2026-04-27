import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { connectionLogger } from './connectionLogger';

// ── Types ─────────────────────────────────────────────────────────────────────

export type HealthState = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface CheckResult {
  state: HealthState;
  latencyMs: number | null;
  message: string;
  error?: string;
}

export interface HealthStatus {
  /** Aggregate state — 'down' if any required check is down, 'degraded' if any is degraded */
  overall: HealthState;
  database: CheckResult;
  api: CheckResult;
  auth: CheckResult;
  /** ISO-8601 timestamp of when this snapshot was produced */
  checkedAt: string;
  /** Pre-formatted timestamp suitable for UI ("yyyy-MM-dd HH:mm:ss") */
  checkedAtPretty: string;
  /** How many retries were used to produce this snapshot */
  retriesUsed: number;
}

export interface HealthCheckConfig {
  /** Per-check timeout in milliseconds */
  timeoutMs: number;
  /** Number of retry attempts on failure before giving up */
  maxRetries: number;
  /** Backoff between retries in milliseconds (linear) */
  retryDelayMs: number;
  /** Latency above this threshold (ms) flips a check to 'degraded' */
  degradedLatencyMs: number;
}

const DEFAULT_CONFIG: HealthCheckConfig = {
  timeoutMs: 5000,
  maxRetries: 2,
  retryDelayMs: 1000,
  degradedLatencyMs: 1500,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wraps any promise in a timeout that rejects when the deadline elapses. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Run an async probe with retries; returns the last failure if every attempt fails. */
async function withRetries<T>(
  fn: () => Promise<T>,
  config: HealthCheckConfig,
): Promise<{ value?: T; error?: unknown; attempts: number }> {
  let lastError: unknown;
  const total = config.maxRetries + 1;
  for (let attempt = 1; attempt <= total; attempt++) {
    try {
      const value = await fn();
      return { value, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt < total) await sleep(config.retryDelayMs * attempt);
    }
  }
  return { error: lastError, attempts: total };
}

function classifyLatency(latencyMs: number, config: HealthCheckConfig): HealthState {
  if (latencyMs >= config.timeoutMs) return 'down';
  if (latencyMs >= config.degradedLatencyMs) return 'degraded';
  return 'healthy';
}

// ── Individual probes ─────────────────────────────────────────────────────────

/** Probes the Supabase REST endpoint with a low-cost auth.getSession() call. */
async function probeApi(config: HealthCheckConfig): Promise<CheckResult> {
  const t0 = performance.now();
  const { error, attempts } = await withRetries(async () => {
    const { error: sessionErr } = await withTimeout(
      supabase.auth.getSession(),
      config.timeoutMs,
      'API probe',
    );
    if (sessionErr) throw sessionErr;
    return true;
  }, config);

  const latencyMs = Math.round(performance.now() - t0);

  if (error) {
    return {
      state: 'down',
      latencyMs,
      message: `API unreachable after ${attempts} attempt(s)`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    state: classifyLatency(latencyMs, config),
    latencyMs,
    message: 'Supabase API reachable',
  };
}

/** Probes the database by selecting a single row from a small public table. */
async function probeDatabase(config: HealthCheckConfig): Promise<CheckResult> {
  const t0 = performance.now();
  const { error, attempts } = await withRetries(async () => {
    // Lightweight head request — counts rows without returning data.
    const { error: queryErr } = await withTimeout(
      supabase.from('connection_logs').select('id', { count: 'exact', head: true }).limit(1),
      config.timeoutMs,
      'DB probe',
    );
    // RLS may return zero rows for unauthenticated callers; that's still a
    // healthy database. Only network/permission errors count as failures.
    if (queryErr && queryErr.code !== 'PGRST116') throw queryErr;
    return true;
  }, config);

  const latencyMs = Math.round(performance.now() - t0);

  if (error) {
    return {
      state: 'down',
      latencyMs,
      message: `Database unreachable after ${attempts} attempt(s)`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    state: classifyLatency(latencyMs, config),
    latencyMs,
    message: 'Database query succeeded',
  };
}

/** Verifies whether a user session exists (does not retry — auth state is binary). */
async function probeAuth(config: HealthCheckConfig): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    const { data, error } = await withTimeout(
      supabase.auth.getUser(),
      config.timeoutMs,
      'Auth probe',
    );
    const latencyMs = Math.round(performance.now() - t0);

    if (error) {
      return {
        state: 'degraded',
        latencyMs,
        message: 'Auth check returned an error',
        error: error.message,
      };
    }
    if (!data?.user) {
      return {
        state: 'degraded',
        latencyMs,
        message: 'No authenticated user (anonymous session)',
      };
    }
    return {
      state: classifyLatency(latencyMs, config),
      latencyMs,
      message: `Authenticated as ${data.user.email ?? data.user.id}`,
    };
  } catch (err) {
    return {
      state: 'down',
      latencyMs: Math.round(performance.now() - t0),
      message: 'Auth probe failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function aggregate(...checks: CheckResult[]): HealthState {
  if (checks.some(c => c.state === 'down')) return 'down';
  if (checks.some(c => c.state === 'degraded')) return 'degraded';
  if (checks.every(c => c.state === 'healthy')) return 'healthy';
  return 'unknown';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs all health probes (API, database, auth) in parallel and returns a
 * structured snapshot. Any probe that fails after exhausting retries is
 * recorded both in the result and in the connection log.
 */
export async function runHealthCheck(
  override?: Partial<HealthCheckConfig>,
): Promise<HealthStatus> {
  const config: HealthCheckConfig = { ...DEFAULT_CONFIG, ...override };
  const startedAt = new Date();

  const [api, database, auth] = await Promise.all([
    probeApi(config),
    probeDatabase(config),
    probeAuth(config),
  ]);

  // Log any failures so operators have a paper trail
  for (const [name, result] of Object.entries({ api, database, auth })) {
    if (result.state === 'down') {
      void connectionLogger.error('health_check', `${name} probe failed: ${result.message}`, result.error, {
        latencyMs: result.latencyMs,
        probe: name,
      });
    } else if (result.state === 'degraded') {
      void connectionLogger.warn('health_check', `${name} probe degraded: ${result.message}`, undefined, {
        latencyMs: result.latencyMs,
        probe: name,
      });
    }
  }

  const overall = aggregate(api, database, auth);
  const checkedAt = startedAt.toISOString();

  return {
    overall,
    api,
    database,
    auth,
    checkedAt,
    checkedAtPretty: format(startedAt, 'yyyy-MM-dd HH:mm:ss'),
    retriesUsed: Math.max(0, config.maxRetries),
  };
}

export const HEALTH_CHECK_DEFAULTS = DEFAULT_CONFIG;

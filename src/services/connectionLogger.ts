import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LogLevel = 'ERROR' | 'WARN' | 'INFO';

export interface ConnectionLogEntry {
  id: string;
  user_id: string | null;
  level: LogLevel;
  category: string;
  message: string;
  error_type?: string | null;
  stack_trace?: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;          // ISO-8601
  occurred_at_pretty?: string;  // formatted for UI
}

export interface LogInput {
  level: LogLevel;
  category: string;
  message: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

export interface LoggerConfig {
  /** Maximum entries kept locally (oldest evicted first) */
  localBufferSize: number;
  /** Maximum entries kept in Supabase per user (older rows pruned) */
  remoteRetention: number;
  /** Throttle local-storage writes to at most once per N ms */
  flushIntervalMs: number;
}

const DEFAULT_CONFIG: LoggerConfig = {
  localBufferSize: 200,
  remoteRetention: 1000,
  flushIntervalMs: 1000,
};

const LOCAL_STORAGE_KEY = 'fusion_fx_connection_logs_v1';

// ── Storage helpers ───────────────────────────────────────────────────────────

function safeReadLocal(): ConnectionLogEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ConnectionLogEntry[]) : [];
  } catch {
    return [];
  }
}

function safeWriteLocal(entries: ConnectionLogEntry[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded — drop the oldest half and retry once
    try {
      const half = entries.slice(Math.ceil(entries.length / 2));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(half));
    } catch {
      // Give up silently — losing logs is preferable to crashing
    }
  }
}

// ── Error normalization ───────────────────────────────────────────────────────

function describeError(err: unknown): { error_type: string | null; stack_trace: string | null; message: string } {
  if (err instanceof Error) {
    return {
      error_type: err.name,
      stack_trace: err.stack ?? null,
      message: err.message,
    };
  }
  if (typeof err === 'string') {
    return { error_type: 'StringError', stack_trace: null, message: err };
  }
  if (err && typeof err === 'object') {
    return {
      error_type: 'ObjectError',
      stack_trace: null,
      message: JSON.stringify(err).slice(0, 500),
    };
  }
  return { error_type: null, stack_trace: null, message: '' };
}

function nowIso(): string {
  return new Date().toISOString();
}

function nowPretty(): string {
  return format(new Date(), 'yyyy-MM-dd HH:mm:ss');
}

// ── Logger class ──────────────────────────────────────────────────────────────

class ConnectionLogger {
  private config: LoggerConfig = { ...DEFAULT_CONFIG };
  private pendingFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirtyLocalBuffer: ConnectionLogEntry[] | null = null;

  configure(partial: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Append a log entry. Always writes to the local buffer (rotated). When a
   * Supabase session exists the entry is also persisted remotely. Failures
   * are swallowed so logging never throws — telemetry must not break the app.
   */
  async log(input: LogInput): Promise<ConnectionLogEntry> {
    const { error_type, stack_trace, message: errMessage } = describeError(input.error);
    const occurredAt = nowIso();
    const entry: ConnectionLogEntry = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: null,
      level: input.level,
      category: input.category,
      message: input.message || errMessage,
      error_type,
      stack_trace,
      metadata: input.metadata ?? {},
      occurred_at: occurredAt,
      occurred_at_pretty: nowPretty(),
    };

    this.appendLocal(entry);

    // Best-effort remote persistence; never throws upward.
    void this.persistRemote(entry).catch(() => undefined);

    // Mirror to console so devs see issues during development.
    const consoleFn = input.level === 'ERROR' ? console.error
      : input.level === 'WARN' ? console.warn
      : console.info;
    consoleFn(`[${input.category}] ${entry.message}`, input.error ?? '');

    return entry;
  }

  // Convenience methods --------------------------------------------------------

  error(category: string, message: string, error?: unknown, metadata?: Record<string, unknown>) {
    return this.log({ level: 'ERROR', category, message, error, metadata });
  }
  warn(category: string, message: string, error?: unknown, metadata?: Record<string, unknown>) {
    return this.log({ level: 'WARN', category, message, error, metadata });
  }
  info(category: string, message: string, metadata?: Record<string, unknown>) {
    return this.log({ level: 'INFO', category, message, metadata });
  }

  // Reads ---------------------------------------------------------------------

  /** Returns the most recent local logs (newest first). */
  getLocalLogs(limit = 100): ConnectionLogEntry[] {
    return safeReadLocal().slice(0, limit);
  }

  /** Reads the most recent logs for the current user from Supabase. */
  async getRemoteLogs(limit = 100): Promise<ConnectionLogEntry[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('connection_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map(row => ({
      ...row,
      occurred_at_pretty: format(new Date(row.occurred_at), 'yyyy-MM-dd HH:mm:ss'),
    })) as ConnectionLogEntry[];
  }

  clearLocal(): void {
    safeWriteLocal([]);
  }

  // Internal ------------------------------------------------------------------

  private appendLocal(entry: ConnectionLogEntry): void {
    const buffer = this.dirtyLocalBuffer ?? safeReadLocal();
    buffer.unshift(entry);
    // Rotation: keep newest N entries
    if (buffer.length > this.config.localBufferSize) {
      buffer.length = this.config.localBufferSize;
    }
    this.dirtyLocalBuffer = buffer;
    this.scheduleLocalFlush();
  }

  private scheduleLocalFlush(): void {
    if (this.pendingFlushTimer) return;
    this.pendingFlushTimer = setTimeout(() => {
      this.pendingFlushTimer = null;
      if (this.dirtyLocalBuffer) {
        safeWriteLocal(this.dirtyLocalBuffer);
        this.dirtyLocalBuffer = null;
      }
    }, this.config.flushIntervalMs);
  }

  private async persistRemote(entry: ConnectionLogEntry): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('connection_logs').insert({
      user_id: user.id,
      level: entry.level,
      category: entry.category,
      message: entry.message,
      error_type: entry.error_type,
      stack_trace: entry.stack_trace,
      metadata: entry.metadata,
      occurred_at: entry.occurred_at,
    });

    if (error) return;

    // Lazy log rotation: every ~50th write, prune old rows beyond retention
    if (Math.random() < 0.02) {
      void this.rotateRemote(user.id).catch(() => undefined);
    }
  }

  /**
   * Deletes any rows beyond `remoteRetention` for the user, oldest first.
   * Implemented as a single DELETE bounded by a subquery for older IDs.
   */
  private async rotateRemote(userId: string): Promise<void> {
    const { data: keepers } = await supabase
      .from('connection_logs')
      .select('id')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(this.config.remoteRetention);

    if (!keepers || keepers.length < this.config.remoteRetention) return;

    const keepIds = keepers.map(k => k.id as string);
    await supabase
      .from('connection_logs')
      .delete()
      .eq('user_id', userId)
      .not('id', 'in', `(${keepIds.map(id => `"${id}"`).join(',')})`);
  }
}

export const connectionLogger = new ConnectionLogger();

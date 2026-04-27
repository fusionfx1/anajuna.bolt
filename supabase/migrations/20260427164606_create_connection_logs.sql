/*
  # Connection logs table

  1. New Tables
    - `connection_logs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to auth.users) — owner of the log entry
      - `level` (text) — 'ERROR' | 'WARN' | 'INFO'
      - `category` (text) — short error category (e.g. 'health_check', 'broker', 'feed')
      - `message` (text) — short human-readable summary
      - `error_type` (text, nullable) — the JS error name (e.g. TypeError)
      - `stack_trace` (text, nullable) — captured stack trace
      - `metadata` (jsonb) — arbitrary structured payload
      - `occurred_at` (timestamptz) — when the event happened on the client
      - `created_at` (timestamptz, default now())

  2. Indexes
    - Composite index on (user_id, occurred_at DESC) for fast recent-log queries
    - Index on (user_id, level) for filtering by severity

  3. Security
    - Enable RLS
    - SELECT policy: users can only read their own logs
    - INSERT policy: authenticated users can insert their own logs
    - DELETE policy: users can prune their own logs (used by log rotation)
    - No UPDATE policy — logs are append-only

  4. Notes
    - `level` is constrained to the three supported severities
    - `metadata` defaults to `'{}'::jsonb` so consumers can always rely on it
*/

CREATE TABLE IF NOT EXISTS connection_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'INFO',
  category text NOT NULL DEFAULT 'general',
  message text NOT NULL DEFAULT '',
  error_type text,
  stack_trace text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_logs_level_check CHECK (level IN ('ERROR', 'WARN', 'INFO'))
);

CREATE INDEX IF NOT EXISTS idx_connection_logs_user_time
  ON connection_logs (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_connection_logs_user_level
  ON connection_logs (user_id, level);

ALTER TABLE connection_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own connection logs"
  ON connection_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connection logs"
  ON connection_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own connection logs"
  ON connection_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

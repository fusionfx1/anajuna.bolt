
/*
  # Add account settings and seed tracking

  ## New Tables

  ### user_settings
  Stores per-user broker connection settings and risk defaults.
  - broker connection details (server, login, timeout)
  - risk management defaults (risk_per_trade, max_daily_loss, etc.)
  - notification preferences (JSONB)

  ### account_snapshots
  Latest known account state per user (balance, equity, margin, etc.).
  Used to display account summary without requiring a live broker connection.

  ## Notes
  - RLS on both tables (authenticated users only, own data only)
  - user_settings uses upsert pattern (one row per user)
*/

CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  broker_server text DEFAULT 'demo.icmarkets.com:443',
  broker_login text DEFAULT '',
  broker_timeout_ms int NOT NULL DEFAULT 5000,
  risk_per_trade_pct numeric(5,2) NOT NULL DEFAULT 1.00,
  max_daily_loss_pct numeric(5,2) NOT NULL DEFAULT 3.00,
  max_drawdown_pct numeric(5,2) NOT NULL DEFAULT 8.00,
  default_lot_size numeric(10,4) NOT NULL DEFAULT 0.01,
  notify_trade_execution boolean NOT NULL DEFAULT true,
  notify_risk_events boolean NOT NULL DEFAULT true,
  notify_drawdown boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  equity numeric(12,2) NOT NULL DEFAULT 0,
  margin_used numeric(12,2) NOT NULL DEFAULT 0,
  free_margin numeric(12,2) NOT NULL DEFAULT 0,
  margin_level_pct numeric(10,2) NOT NULL DEFAULT 0,
  open_pnl numeric(12,2) NOT NULL DEFAULT 0,
  daily_pnl numeric(12,2) NOT NULL DEFAULT 0,
  daily_pnl_pct numeric(8,4) NOT NULL DEFAULT 0,
  drawdown_pct numeric(6,3) NOT NULL DEFAULT 0,
  peak_balance numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own account snapshot"
  ON account_snapshots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own account snapshot"
  ON account_snapshots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own account snapshot"
  ON account_snapshots FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

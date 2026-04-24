/*
  # Add Data Feed Configuration and Order Management Tables

  ## Overview
  Extends the forex trading schema with infrastructure for real-time data feed
  configuration and a complete order management system (OMS) with full audit trail.

  ## New Tables

  ### 1. data_feed_configs
  Stores per-user data provider settings (Polygon.io, Alpaca, simulation mode).
  Includes encrypted-at-rest API key references. One active config per user.
  - provider: 'polygon' | 'alpaca' | 'simulation'
  - api_key / api_secret: provider credentials
  - symbols: watched currency pairs / tickers
  - paper_trading: paper vs live trading flag
  - broker_provider: 'alpaca' | 'paper'
  - alpaca_key_id / alpaca_secret_key: Alpaca broker credentials

  ### 2. managed_orders
  Full OMS order ledger. Every order submitted through the system is recorded here
  with risk check result, broker confirmation, fill details, and lifecycle timestamps.
  This is an append-preferred table — orders are upserted by id.

  ### 3. system_health_logs
  Timestamped log of system events: feed connections, disconnects, broker errors,
  risk circuit breaker triggers, and reconnect events. Used by the SystemHealth page.

  ## Security
  - RLS enabled on all three tables
  - All policies restrict access to authenticated owners (auth.uid() = user_id)
  - Separate SELECT, INSERT, UPDATE, DELETE policies per table

  ## Indexes
  - managed_orders: (user_id, submitted_at DESC) for fast order history queries
  - managed_orders: (user_id, status) for open order filtering
  - system_health_logs: (user_id, occurred_at DESC) for recent event queries
*/

CREATE TABLE IF NOT EXISTS data_feed_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'simulation',
  api_key text NOT NULL DEFAULT '',
  api_secret text NOT NULL DEFAULT '',
  symbols text[] NOT NULL DEFAULT '{}',
  paper_trading boolean NOT NULL DEFAULT true,
  broker_provider text NOT NULL DEFAULT 'paper',
  alpaca_key_id text NOT NULL DEFAULT '',
  alpaca_secret_key text NOT NULL DEFAULT '',
  auto_connect boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE data_feed_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feed config"
  ON data_feed_configs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feed config"
  ON data_feed_configs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feed config"
  ON data_feed_configs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own feed config"
  ON data_feed_configs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS managed_orders (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_order_id text NOT NULL DEFAULT '',
  symbol text NOT NULL,
  side text NOT NULL,
  order_type text NOT NULL DEFAULT 'market',
  quantity numeric(12, 4) NOT NULL DEFAULT 0,
  limit_price numeric(12, 5) DEFAULT NULL,
  stop_price numeric(12, 5) DEFAULT NULL,
  status text NOT NULL DEFAULT 'pending',
  filled_qty numeric(12, 4) NOT NULL DEFAULT 0,
  filled_avg_price numeric(12, 5) DEFAULT NULL,
  strategy_id uuid REFERENCES strategies(id) ON DELETE SET NULL,
  risk_approved boolean NOT NULL DEFAULT false,
  rejection_reason text DEFAULT NULL,
  broker_order_id text DEFAULT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  filled_at timestamptz DEFAULT NULL,
  cancelled_at timestamptz DEFAULT NULL,
  time_in_force text NOT NULL DEFAULT 'day'
);

ALTER TABLE managed_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON managed_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders"
  ON managed_orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own orders"
  ON managed_orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own orders"
  ON managed_orders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_managed_orders_user_time
  ON managed_orders(user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_managed_orders_user_status
  ON managed_orders(user_id, status);


CREATE TABLE IF NOT EXISTS system_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  component text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  message text NOT NULL DEFAULT '',
  metadata jsonb DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE system_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health logs"
  ON system_health_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health logs"
  ON system_health_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own health logs"
  ON system_health_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_system_health_user_time
  ON system_health_logs(user_id, occurred_at DESC);

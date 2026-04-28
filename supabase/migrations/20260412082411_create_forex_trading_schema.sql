
/*
  # Forex Trading Dashboard Schema

  ## Overview
  Creates the core tables for a production-grade automated forex trading system.

  ## New Tables

  ### strategies
  Stores trading bot strategy configurations. Each row represents one deployable strategy.
  - id, name, description, type (scalping/swing/trend)
  - status (active/paused/stopped/backtesting)
  - config JSONB for strategy-specific parameters (MA periods, RSI thresholds, etc.)
  - risk settings: max_drawdown_pct, lot_size, max_concurrent_trades
  - performance snapshot fields updated periodically

  ### positions
  Open and closed trade positions. Represents a single market order lifecycle.
  - Linked to strategy via strategy_id
  - symbol, direction (BUY/SELL), entry/exit price and time
  - lot_size, stop_loss, take_profit
  - pnl_usd calculated on close
  - status: open / closed / cancelled

  ### trades
  Immutable append-only trade execution log. Every order event gets a record.
  - Linked to position via position_id
  - order_type (MARKET/LIMIT/STOP), side, quantity, price, slippage
  - broker_order_id for reconciliation against MT5/broker records
  - execution_latency_ms for performance monitoring

  ### equity_snapshots
  Time-series equity curve. Captured at configurable intervals (e.g., hourly).
  - balance, equity, margin_used, free_margin, drawdown_pct
  - Used to render the equity chart and compute max drawdown

  ### risk_events
  Audit log of risk management actions (drawdown breaches, circuit breakers, etc.)
  - severity: INFO / WARNING / CRITICAL
  - action_taken: NONE / PAUSED_BOT / CLOSED_POSITIONS / HALTED_ALL

  ## Security
  - RLS enabled on all tables
  - Authenticated users can only access their own data (user_id = auth.uid())
*/

CREATE TABLE IF NOT EXISTS strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  strategy_type text NOT NULL DEFAULT 'scalping',
  status text NOT NULL DEFAULT 'stopped',
  symbols text[] NOT NULL DEFAULT '{}',
  config jsonb NOT NULL DEFAULT '{}',
  max_drawdown_pct numeric(5,2) NOT NULL DEFAULT 5.00,
  lot_size numeric(10,4) NOT NULL DEFAULT 0.01,
  max_concurrent_trades int NOT NULL DEFAULT 3,
  total_trades int NOT NULL DEFAULT 0,
  win_rate numeric(5,2) NOT NULL DEFAULT 0,
  total_pnl_usd numeric(12,2) NOT NULL DEFAULT 0,
  sharpe_ratio numeric(8,4) DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id uuid REFERENCES strategies(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  direction text NOT NULL,
  lot_size numeric(10,4) NOT NULL,
  entry_price numeric(12,5) NOT NULL,
  exit_price numeric(12,5) DEFAULT NULL,
  stop_loss numeric(12,5) DEFAULT NULL,
  take_profit numeric(12,5) DEFAULT NULL,
  pnl_usd numeric(12,2) DEFAULT NULL,
  pnl_pips numeric(10,1) DEFAULT NULL,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz DEFAULT NULL,
  broker_ticket_id text DEFAULT NULL,
  notes text DEFAULT ''
);

CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id uuid REFERENCES positions(id) ON DELETE SET NULL,
  strategy_id uuid REFERENCES strategies(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  order_type text NOT NULL DEFAULT 'MARKET',
  side text NOT NULL,
  quantity numeric(10,4) NOT NULL,
  requested_price numeric(12,5) NOT NULL,
  fill_price numeric(12,5) NOT NULL,
  slippage_pips numeric(8,2) NOT NULL DEFAULT 0,
  commission_usd numeric(8,4) NOT NULL DEFAULT 0,
  swap_usd numeric(8,4) NOT NULL DEFAULT 0,
  pnl_usd numeric(12,2) DEFAULT NULL,
  broker_order_id text DEFAULT NULL,
  execution_latency_ms int DEFAULT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(12,2) NOT NULL,
  equity numeric(12,2) NOT NULL,
  margin_used numeric(12,2) NOT NULL DEFAULT 0,
  free_margin numeric(12,2) NOT NULL DEFAULT 0,
  drawdown_pct numeric(6,3) NOT NULL DEFAULT 0,
  open_positions_count int NOT NULL DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id uuid REFERENCES strategies(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'INFO',
  event_type text NOT NULL,
  message text NOT NULL,
  action_taken text NOT NULL DEFAULT 'NONE',
  metadata jsonb DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_positions_user_status ON positions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_positions_strategy ON positions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_user_executed ON trades(user_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_position ON trades(position_id);
CREATE INDEX IF NOT EXISTS idx_equity_snapshots_user_time ON equity_snapshots(user_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_user_time ON risk_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategies_user_status ON strategies(user_id, status);

ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE equity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own strategies"
  ON strategies FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own strategies"
  ON strategies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own strategies"
  ON strategies FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own strategies"
  ON strategies FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own positions"
  ON positions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own positions"
  ON positions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own positions"
  ON positions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own trades"
  ON trades FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades"
  ON trades FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own equity snapshots"
  ON equity_snapshots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own equity snapshots"
  ON equity_snapshots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own risk events"
  ON risk_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own risk events"
  ON risk_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

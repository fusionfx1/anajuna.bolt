/*
  # Add OANDA Positions and Trades Tables

  ## Summary
  Creates two new tables to persist OANDA broker data for open positions
  and open trades, enabling historical snapshots and dashboard equity curves
  to reflect live OANDA account state.

  ## New Tables

  ### oanda_positions
  Stores a snapshot of each open position per instrument at the time of refresh.
  - `id` — UUID primary key
  - `user_id` — references auth.users, scoped per user
  - `account_id` — the OANDA account ID string
  - `instrument` — e.g. EUR_USD
  - `long_units`, `short_units` — unit sizes for each direction
  - `long_avg_price`, `short_avg_price` — average fill price per direction
  - `long_unrealized_pl`, `short_unrealized_pl` — unrealized P&L per direction
  - `long_realized_pl`, `short_realized_pl` — realized P&L per direction
  - `unrealized_pl`, `realized_pl` — combined totals
  - `snapshot_at` — timestamp of the snapshot

  ### oanda_trades
  Stores individual open trade details from OANDA.
  - `id` — UUID primary key
  - `user_id` — references auth.users
  - `account_id` — OANDA account ID
  - `trade_id` — OANDA's trade ID string
  - `instrument` — e.g. EUR_USD
  - `open_time` — when the trade was opened (timestamptz)
  - `price` — entry price
  - `current_units` — signed (negative = short)
  - `unrealized_pl` — current unrealized P&L
  - `financing` — overnight financing charges accrued
  - `state` — OPEN | CLOSED | CLOSE_WHEN_TRADEABLE
  - `snapshot_at` — timestamp when this row was written

  ## Security
  - RLS enabled on both tables
  - Users can only read/write their own rows (auth.uid() = user_id)
  - Separate policies for SELECT, INSERT, UPDATE, DELETE
*/

-- oanda_positions
CREATE TABLE IF NOT EXISTS oanda_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL DEFAULT '',
  instrument text NOT NULL,
  long_units numeric NOT NULL DEFAULT 0,
  short_units numeric NOT NULL DEFAULT 0,
  long_avg_price numeric NOT NULL DEFAULT 0,
  short_avg_price numeric NOT NULL DEFAULT 0,
  long_unrealized_pl numeric NOT NULL DEFAULT 0,
  short_unrealized_pl numeric NOT NULL DEFAULT 0,
  long_realized_pl numeric NOT NULL DEFAULT 0,
  short_realized_pl numeric NOT NULL DEFAULT 0,
  unrealized_pl numeric NOT NULL DEFAULT 0,
  realized_pl numeric NOT NULL DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE oanda_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own oanda positions"
  ON oanda_positions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own oanda positions"
  ON oanda_positions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own oanda positions"
  ON oanda_positions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own oanda positions"
  ON oanda_positions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_oanda_positions_user_id ON oanda_positions (user_id);
CREATE INDEX IF NOT EXISTS idx_oanda_positions_snapshot_at ON oanda_positions (snapshot_at DESC);

-- oanda_trades
CREATE TABLE IF NOT EXISTS oanda_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL DEFAULT '',
  trade_id text NOT NULL,
  instrument text NOT NULL,
  open_time timestamptz NOT NULL DEFAULT now(),
  price numeric NOT NULL DEFAULT 0,
  current_units numeric NOT NULL DEFAULT 0,
  unrealized_pl numeric NOT NULL DEFAULT 0,
  financing numeric NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'OPEN',
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE oanda_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own oanda trades"
  ON oanda_trades FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own oanda trades"
  ON oanda_trades FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own oanda trades"
  ON oanda_trades FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own oanda trades"
  ON oanda_trades FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_oanda_trades_user_id ON oanda_trades (user_id);
CREATE INDEX IF NOT EXISTS idx_oanda_trades_trade_id ON oanda_trades (trade_id);
CREATE INDEX IF NOT EXISTS idx_oanda_trades_snapshot_at ON oanda_trades (snapshot_at DESC);

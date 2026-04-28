/*
  # Paper Trading Tables

  ## Summary
  Creates two tables for a paper (simulated) trading system:

  ### New Tables

  1. **paper_account**
     - Single-row account tracking paper trading balance
     - `id` (uuid, pk) — fixed account identifier
     - `balance` (numeric 12,2) — current cash balance, default $10,000
     - `currency` (text) — account currency, default 'USD'
     - `updated_at` (timestamptz) — last modification time

  2. **paper_trades**
     - Each row represents one paper trade (open or closed)
     - `id` (uuid, pk, auto-generated)
     - `instrument` (text) — e.g. "EUR_USD"
     - `side` (text) — "buy" or "sell"
     - `units` (integer) — trade size
     - `entry_price` (numeric 10,5) — price at open
     - `exit_price` (numeric 10,5) — price at close, null while open
     - `tp` (numeric 10,5) — take profit level, optional
     - `sl` (numeric 10,5) — stop loss level, optional
     - `status` (text) — "open" or "closed"
     - `opened_at` (timestamptz) — when trade was opened
     - `closed_at` (timestamptz) — when trade was closed, null while open
     - `pnl` (numeric 10,2) — realised P&L in account currency

  ### Security
  - RLS enabled on both tables
  - Permissive anon read + write policies (auth will be layered in later)

  ### Notes
  - paper_account seeds a single row on creation (balance = 10000 USD)
  - paper_trades uses IF NOT EXISTS guards to be idempotent
*/

-- ── paper_account ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS paper_account (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  balance     numeric(12,2) NOT NULL    DEFAULT 10000.00,
  currency    text          NOT NULL    DEFAULT 'USD',
  updated_at  timestamptz   NOT NULL    DEFAULT now()
);

ALTER TABLE paper_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read paper_account"
  ON paper_account FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert paper_account"
  ON paper_account FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update paper_account"
  ON paper_account FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Seed the single account row
INSERT INTO paper_account (id, balance, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 10000.00, 'USD')
ON CONFLICT (id) DO NOTHING;

-- ── paper_trades ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS paper_trades (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument   text          NOT NULL,
  side         text          NOT NULL    CHECK (side IN ('buy', 'sell')),
  units        integer       NOT NULL    CHECK (units > 0),
  entry_price  numeric(10,5) NOT NULL,
  exit_price   numeric(10,5),
  tp           numeric(10,5),
  sl           numeric(10,5),
  status       text          NOT NULL    DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at    timestamptz   NOT NULL    DEFAULT now(),
  closed_at    timestamptz,
  pnl          numeric(10,2)
);

CREATE INDEX IF NOT EXISTS paper_trades_status_idx     ON paper_trades (status);
CREATE INDEX IF NOT EXISTS paper_trades_instrument_idx ON paper_trades (instrument);
CREATE INDEX IF NOT EXISTS paper_trades_opened_at_idx  ON paper_trades (opened_at DESC);

ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read paper_trades"
  ON paper_trades FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert paper_trades"
  ON paper_trades FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update paper_trades"
  ON paper_trades FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

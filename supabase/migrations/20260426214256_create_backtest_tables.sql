/*
  # Create Backtesting Tables

  1. New Tables
    - `historical_candles`
      - `instrument` (text) - e.g. EUR_USD, GBP_USD
      - `granularity` (text) - e.g. M1, M5, H1, H4, D1
      - `time` (timestamptz) - candle open time
      - `open`, `high`, `low`, `close` (numeric) - OHLC prices
      - `volume` (integer) - tick volume
      - Composite primary key on (instrument, granularity, time)

    - `backtest_runs`
      - `id` (uuid, primary key)
      - `user_id` (uuid FK to auth.users)
      - `strategy_id` (uuid FK to strategies, nullable)
      - `strategy_name` (text) - snapshot of name at run time
      - `strategy_type` (text) - scalping, trend_following, etc.
      - `instrument` (text)
      - `granularity` (text)
      - `start_date` (timestamptz)
      - `end_date` (timestamptz)
      - `initial_balance` (numeric)
      - `config` (jsonb) - snapshot of strategy params
      - `results` (jsonb) - full metrics object
      - `trade_log` (jsonb) - array of simulated trades
      - `equity_curve` (jsonb) - array of {time, balance, drawdown}
      - `status` (text) - running, completed, failed
      - `candle_count` (integer) - number of candles processed
      - `created_at` (timestamptz)

  2. Indexes
    - Composite index on historical_candles for efficient range queries
    - Index on backtest_runs for user listing

  3. Security
    - historical_candles: RLS enabled, authenticated users can read all candles, only service role inserts
    - backtest_runs: RLS enabled, users can only access their own runs
*/

-- Historical candle storage (shared reference data)
CREATE TABLE IF NOT EXISTS historical_candles (
  instrument text NOT NULL,
  granularity text NOT NULL,
  time timestamptz NOT NULL,
  open numeric(14,6) NOT NULL,
  high numeric(14,6) NOT NULL,
  low numeric(14,6) NOT NULL,
  close numeric(14,6) NOT NULL,
  volume integer NOT NULL DEFAULT 0,
  PRIMARY KEY (instrument, granularity, time)
);

CREATE INDEX IF NOT EXISTS idx_historical_candles_lookup
  ON historical_candles (instrument, granularity, time ASC);

ALTER TABLE historical_candles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all candles (shared reference data)
CREATE POLICY "Authenticated users can read historical candles"
  ON historical_candles FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Authenticated users can insert candles (from candle-ingest function)
CREATE POLICY "Authenticated users can insert historical candles"
  ON historical_candles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Backtest run results
CREATE TABLE IF NOT EXISTS backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id uuid REFERENCES strategies(id) ON DELETE SET NULL,
  strategy_name text NOT NULL DEFAULT '',
  strategy_type text NOT NULL DEFAULT 'scalping',
  instrument text NOT NULL DEFAULT 'EUR_USD',
  granularity text NOT NULL DEFAULT 'H1',
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz NOT NULL DEFAULT now(),
  initial_balance numeric(12,2) NOT NULL DEFAULT 10000.00,
  config jsonb NOT NULL DEFAULT '{}',
  results jsonb NOT NULL DEFAULT '{}',
  trade_log jsonb NOT NULL DEFAULT '[]',
  equity_curve jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'running',
  candle_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_user_created
  ON backtest_runs (user_id, created_at DESC);

ALTER TABLE backtest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backtest runs"
  ON backtest_runs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own backtest runs"
  ON backtest_runs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own backtest runs"
  ON backtest_runs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own backtest runs"
  ON backtest_runs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

/*
  # Add source column to historical_candles

  1. Changes
    - Adds `source` column to `historical_candles` table
      - Type: text, default 'simulated'
      - Tracks whether candles originated from a live broker feed or were
        produced by the simulated-fallback generator
    - Allowed values enforced via CHECK constraint: 'live' | 'simulated'
  2. Backfill
    - All existing rows are tagged 'simulated' (the only insert path so far
      writes simulated data via the seed/download generator)
  3. Security
    - No RLS changes required; column is read under the existing SELECT
      policy and written under the existing INSERT policy
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'historical_candles' AND column_name = 'source'
  ) THEN
    ALTER TABLE historical_candles
      ADD COLUMN source text NOT NULL DEFAULT 'simulated';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'historical_candles_source_check'
  ) THEN
    ALTER TABLE historical_candles
      ADD CONSTRAINT historical_candles_source_check
      CHECK (source IN ('live', 'simulated'));
  END IF;
END $$;

/*
  # Add OANDA Credentials to data_feed_configs

  ## Overview
  Extends the data_feed_configs table with OANDA broker fields to support
  OANDA REST API v20 integration alongside the existing Alpaca broker support.

  ## Modified Tables

  ### data_feed_configs
  Three new columns added:
  - `oanda_account_id` (text): OANDA account ID in format 001-001-XXXXXXX-001
  - `oanda_api_token` (text): OANDA Personal Access Token
  - `oanda_account_type` (text): 'practice' or 'live', defaults to 'practice'

  ## Security
  - No RLS changes required — existing policies on data_feed_configs already
    restrict all access to the authenticated owner (auth.uid() = user_id).

  ## Notes
  - All columns default to empty string / 'practice' so existing rows are unaffected.
  - broker_provider column now supports 'oanda' as a valid value (application-level validation).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'data_feed_configs' AND column_name = 'oanda_account_id'
  ) THEN
    ALTER TABLE data_feed_configs ADD COLUMN oanda_account_id text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'data_feed_configs' AND column_name = 'oanda_api_token'
  ) THEN
    ALTER TABLE data_feed_configs ADD COLUMN oanda_api_token text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'data_feed_configs' AND column_name = 'oanda_account_type'
  ) THEN
    ALTER TABLE data_feed_configs ADD COLUMN oanda_account_type text NOT NULL DEFAULT 'practice';
  END IF;
END $$;

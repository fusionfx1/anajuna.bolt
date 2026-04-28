/*
  # Add Circuit Breaker Settings to user_settings

  1. Changes
    - Adds 5 boolean columns to user_settings for circuit breaker state persistence:
      - cb_daily_loss_limit: Halt trading if daily drawdown exceeds limit
      - cb_max_drawdown: Emergency stop if account drawdown hits max
      - cb_spread_filter: Skip entries when spread is too wide
      - cb_news_filter: Pause trading before high-impact news
      - cb_overnight_hold: Auto-close positions before session end

  2. Defaults match the existing RiskMonitor initial state:
    - daily_loss_limit: true (on)
    - max_drawdown: true (on)
    - spread_filter: true (on)
    - news_filter: false (off)
    - overnight_hold: false (off)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'cb_daily_loss_limit'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN cb_daily_loss_limit boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'cb_max_drawdown'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN cb_max_drawdown boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'cb_spread_filter'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN cb_spread_filter boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'cb_news_filter'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN cb_news_filter boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'cb_overnight_hold'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN cb_overnight_hold boolean NOT NULL DEFAULT false;
  END IF;
END $$;

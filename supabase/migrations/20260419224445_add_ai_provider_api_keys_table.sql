/*
  # AI Provider API Keys Secure Storage

  ## Summary
  Adds a secure table to store AI provider API keys server-side.
  The Edge Function reads keys from this table via the service role key,
  so the frontend never needs to transmit the raw key after initial setup.

  ## New Tables
  - **ai_provider_api_keys**
    - provider_id: FK to ai_provider_configs
    - user_id: owner
    - api_key: plaintext key stored securely on the Supabase backend only

  ## Security
  - RLS enabled
  - SELECT is blocked for authenticated users (keys are only readable by the service role)
  - INSERT and DELETE allowed for the owning user
  - No UPDATE policy — to rotate a key, delete and re-insert
*/

CREATE TABLE IF NOT EXISTS ai_provider_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES ai_provider_configs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, user_id)
);

ALTER TABLE ai_provider_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own API keys"
  ON ai_provider_api_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys"
  ON ai_provider_api_keys FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

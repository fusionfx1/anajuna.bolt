/*
  # Data Provider API Keys Secure Storage

  Stores EODHD and Tiingo API keys server-side so the browser never
  receives the raw key after initial setup. Keys are read only by the
  Edge Function (data-provider-proxy) via service role.

  Mirror of: supabase/migrations/20260419224445_add_ai_provider_api_keys_table.sql

  Security:
  - RLS enabled
  - SELECT blocked for authenticated users
  - INSERT and DELETE allowed for the owning user
  - No UPDATE policy — rotate by deleting and re-inserting (D-01)
*/

CREATE TABLE IF NOT EXISTS data_provider_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL CHECK (provider_id IN ('eodhd', 'tiingo')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, user_id)
);

ALTER TABLE data_provider_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own data provider API keys"
  ON data_provider_api_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own data provider API keys"
  ON data_provider_api_keys FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

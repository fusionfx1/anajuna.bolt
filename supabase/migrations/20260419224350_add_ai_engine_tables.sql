/*
  # AI Engine Tables

  ## Summary
  Adds two tables to support the AI Strategy Engine feature:

  1. **ai_provider_configs** — stores per-user AI model provider configurations
     - provider: openai | anthropic | gemini | custom
     - model_name: which model to call (gpt-4o, claude-3-5-haiku, etc.)
     - api_endpoint: the REST API URL for the provider
     - api_key_masked: first/last 4 chars only, never full key
     - roles: array of roles this provider handles (signal_generation, risk_analysis, etc.)
     - is_active: whether this provider is currently enabled
     - temperature / max_tokens: model hyperparameters
     - system_prompt: the instruction prompt prepended to every request

  2. **ai_predictions** — append-only log of every AI signal generated
     - provider_id: FK to ai_provider_configs
     - strategy_id: optional FK to strategies table
     - symbol: forex pair (e.g. EURUSD)
     - signal: BUY | SELL | HOLD
     - confidence: 0.0-1.0 float
     - reasoning: text explanation from the model
     - price_at_signal: last close price when signal was generated
     - indicators_snapshot: JSONB of all indicator values at signal time
     - model_name: denormalized model name for fast querying
     - latency_ms: round-trip time to the AI API

  ## Security
  - RLS enabled on both tables
  - Users can only access their own rows via auth.uid()
  - Separate INSERT and SELECT policies

  ## Indexes
  - ai_predictions(user_id, created_at DESC) for fast recent signal queries
  - ai_predictions(symbol, signal) for signal statistics
*/

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini', 'custom')),
  model_name text NOT NULL DEFAULT '',
  api_endpoint text NOT NULL DEFAULT '',
  api_key_masked text NOT NULL DEFAULT '••••••••',
  roles text[] NOT NULL DEFAULT ARRAY['signal_generation'],
  is_active boolean NOT NULL DEFAULT true,
  temperature numeric(3,2) NOT NULL DEFAULT 0.20,
  max_tokens integer NOT NULL DEFAULT 512,
  system_prompt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_provider_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own AI provider configs"
  ON ai_provider_configs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI provider configs"
  ON ai_provider_configs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI provider configs"
  ON ai_provider_configs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own AI provider configs"
  ON ai_provider_configs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS ai_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES ai_provider_configs(id) ON DELETE SET NULL,
  strategy_id uuid REFERENCES strategies(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  signal text NOT NULL CHECK (signal IN ('BUY', 'SELL', 'HOLD')),
  confidence numeric(4,3) NOT NULL DEFAULT 0.000 CHECK (confidence >= 0 AND confidence <= 1),
  reasoning text NOT NULL DEFAULT '',
  price_at_signal numeric(12,5) NOT NULL DEFAULT 0,
  indicators_snapshot jsonb NOT NULL DEFAULT '{}',
  model_name text NOT NULL DEFAULT '',
  latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own AI predictions"
  ON ai_predictions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI predictions"
  ON ai_predictions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_predictions_user_created_idx
  ON ai_predictions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_predictions_symbol_signal_idx
  ON ai_predictions (symbol, signal);

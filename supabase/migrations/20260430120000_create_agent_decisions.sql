/*
  # Create Agent Decisions Table

  ## Overview
  Introduces `agent_decisions`, the persistent audit ledger for every trading
  decision emitted by the AI agent layer (FusedSignal).  Every BUY / SELL / HOLD
  signal produced by the rules engine or LLM agent is written here before an
  order is placed, giving full traceability from market signal → order execution.

  ## New Tables

  ### 1. agent_decisions
  Append-only record of every FusedSignal decision.
  - `decision_id`    — UUID string from FusedSignal, unique natural key
  - `user_id`        — nullable; paper-trading sessions have no authenticated user
  - `symbol`         — ticker / instrument (e.g. AAPL, EUR_USD)
  - `signal_type`    — BUY | SELL | HOLD
  - `confidence`     — 0–1 numeric score
  - `reasoning`      — free-text agent explanation
  - `blockers`       — risk-check rejections that prevented execution
  - `contributions`  — JSON list of AgentSignalContribution objects per sub-agent
  - `embedding`      — OpenAI text-embedding-3-small (1536-dim) for semantic search
  - `signal_mode`    — 'rules' (deterministic) | 'agent' (LLM-driven)

  ## Modified Tables

  ### 2. managed_orders
  Gains a nullable `decision_id` (text FK) so every order can be traced back to
  the FusedSignal that triggered it.  The FK is text (not uuid) because
  FusedSignal.decision_id arrives as a Python str.

  ## New RPC Functions

  ### match_agent_decisions
  Top-k cosine similarity search over the embedding column using pgvector's <=>
  operator.  SECURITY DEFINER so the caller does not need direct table access.

  ## Security Model
  - RLS enabled on agent_decisions
  - Authenticated users: SELECT and INSERT their own rows (user_id = auth.uid())
  - Service role: unrestricted SELECT + INSERT (for paper-trading, no auth user)
  - NO DELETE policy — agent_decisions is append-only for audit integrity

  ## Vector Index Note
  An IVFFlat index on the embedding column is intentionally NOT created here.
  IVFFlat requires training data (ideally 1 000+ rows per list) to be built
  correctly.  Create it manually after the first meaningful batch is ingested:

      CREATE INDEX agent_decisions_embedding_idx
        ON agent_decisions
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);

  ## Indexes
  - (user_id, created_at DESC) — paginated decision history per user
  - (decision_id)              — fast FK lookups from managed_orders
  - (symbol, created_at DESC)  — per-instrument signal history
*/

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 1. agent_decisions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_decisions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE,  -- nullable: paper trading has no user
  decision_id   text        NOT NULL UNIQUE,          -- UUID string from FusedSignal.decision_id
  symbol        text        NOT NULL,
  signal_type   text        NOT NULL,                 -- BUY | SELL | HOLD
  confidence    numeric(5,4) NOT NULL DEFAULT 0,
  reasoning     text        NOT NULL DEFAULT '',
  blockers      text[]      NOT NULL DEFAULT '{}',
  contributions jsonb       NOT NULL DEFAULT '[]',    -- serialized AgentSignalContribution list
  embedding     vector(1536),                         -- OpenAI ada-002 / text-embedding-3-small
  signal_mode   text        NOT NULL DEFAULT 'rules', -- rules | agent
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Standard scalar indexes
CREATE INDEX IF NOT EXISTS agent_decisions_user_id_created_at_idx
  ON agent_decisions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_decisions_decision_id_idx
  ON agent_decisions (decision_id);

CREATE INDEX IF NOT EXISTS agent_decisions_symbol_created_at_idx
  ON agent_decisions (symbol, created_at DESC);

-- IVFFlat vector index is intentionally deferred.
-- IVFFlat requires training data to build correctly; creating it on an empty
-- table produces a degenerate index.  Run the CREATE INDEX statement shown in
-- the migration header comment manually after 1 000+ rows have been ingested.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'agent_decisions_embedding_idx'
  ) THEN
    -- Placeholder: IVFFlat index must be created manually after first data batch.
    -- CREATE INDEX agent_decisions_embedding_idx
    --   ON agent_decisions
    --   USING ivfflat (embedding vector_cosine_ops)
    --   WITH (lists = 100);
    NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Row Level Security — agent_decisions
-- ---------------------------------------------------------------------------

ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read only their own decisions
CREATE POLICY "Users can view own agent decisions"
  ON agent_decisions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated users may insert only their own decisions
CREATE POLICY "Users can insert own agent decisions"
  ON agent_decisions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Service role insert: covers paper trading where user_id is NULL
CREATE POLICY "Service role can insert agent decisions"
  ON agent_decisions FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role read: full access for back-office / analytics
CREATE POLICY "Service role can read agent decisions"
  ON agent_decisions FOR SELECT
  TO service_role
  USING (true);

-- NOTE: No DELETE policy — agent_decisions is append-only for audit integrity.

-- ---------------------------------------------------------------------------
-- 3. Link managed_orders → agent_decisions
-- ---------------------------------------------------------------------------

-- decision_id is text (not uuid) because FusedSignal.decision_id is a Python str
ALTER TABLE managed_orders
  ADD COLUMN IF NOT EXISTS decision_id text REFERENCES agent_decisions(decision_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS managed_orders_decision_id_idx
  ON managed_orders (decision_id);

-- ---------------------------------------------------------------------------
-- 4. RPC: match_agent_decisions — top-k cosine similarity search
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION match_agent_decisions(
  query_embedding vector(1536),
  match_count     int  DEFAULT 5,
  filter_user_id  uuid DEFAULT NULL,
  filter_symbol   text DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  decision_id   text,
  symbol        text,
  signal_type   text,
  confidence    numeric,
  reasoning     text,
  contributions jsonb,
  created_at    timestamptz,
  similarity    float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ad.id,
    ad.decision_id,
    ad.symbol,
    ad.signal_type,
    ad.confidence,
    ad.reasoning,
    ad.contributions,
    ad.created_at,
    1 - (ad.embedding <=> query_embedding) AS similarity
  FROM agent_decisions ad
  WHERE
    (filter_user_id IS NULL OR ad.user_id = filter_user_id)
    AND (filter_symbol IS NULL OR ad.symbol = filter_symbol)
    AND ad.embedding IS NOT NULL
  ORDER BY ad.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Enable Supabase Realtime for live INSERT push to frontend
ALTER PUBLICATION supabase_realtime ADD TABLE agent_decisions;

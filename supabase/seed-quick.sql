-- ── Quick setup: agent_decisions table + 5 sample rows ─────────────────────
-- Paste this entire file in Supabase Dashboard → SQL Editor → Run

-- 1. Create table (skip if already exists)
CREATE TABLE IF NOT EXISTS agent_decisions (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_id     text          NOT NULL UNIQUE,
  symbol          text          NOT NULL,
  signal_type     text          NOT NULL,
  confidence      numeric(5,4)  NOT NULL DEFAULT 0,
  reasoning       text          NOT NULL DEFAULT '',
  blockers        text[]        NOT NULL DEFAULT '{}',
  contributions   jsonb         NOT NULL DEFAULT '[]',
  signal_mode     text          NOT NULL DEFAULT 'agent',
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;

-- 3. Allow anon read/write for testing (tighten later)
DROP POLICY IF EXISTS "Anon full access agent_decisions" ON agent_decisions;
CREATE POLICY "Anon full access agent_decisions"
  ON agent_decisions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_decisions;

-- 5. Insert 5 sample decisions
INSERT INTO agent_decisions (decision_id, symbol, signal_type, confidence, reasoning, blockers, contributions, signal_mode)
VALUES
  (
    gen_random_uuid()::text, 'EURUSD', 'BUY', 0.84,
    'Fusion: news BUY@0.72 — FOMC USD weakness | fred BUY@0.65 — DGS10 falling | sentiment HOLD@0.20 | technical BUY@0.91 — RSI 28',
    '{}',
    '[{"source":"news","signal_type":"BUY","confidence":0.72,"reasoning":"FOMC minutes signal USD weakness","status":"success","agent_id":"news-v1","latency_ms":43},{"source":"fred","signal_type":"BUY","confidence":0.65,"reasoning":"DGS10 falling 0.12pp","status":"success","agent_id":"fred-v1","latency_ms":312},{"source":"sentiment","signal_type":"HOLD","confidence":0.20,"reasoning":"Neutral social tone","status":"warning","agent_id":"sentiment-v1","latency_ms":88},{"source":"technical","signal_type":"BUY","confidence":0.91,"reasoning":"RSI 28 oversold, BB lower band","status":"success","agent_id":"technical-v1","latency_ms":12}]',
    'agent'
  ),
  (
    gen_random_uuid()::text, 'EURUSD', 'HOLD', 0.42,
    'Fusion: conflicting BUY/SELL signals within 0.15 threshold — staying flat',
    '{"conflicting_signals"}',
    '[{"source":"news","signal_type":"HOLD","confidence":0.30,"reasoning":"Mixed headlines","status":"success","agent_id":"news-v1","latency_ms":55},{"source":"fred","signal_type":"BUY","confidence":0.55,"reasoning":"Rate cut expectations","status":"success","agent_id":"fred-v1","latency_ms":298},{"source":"sentiment","signal_type":"HOLD","confidence":0.25,"reasoning":"Low conviction","status":"warning","agent_id":"sentiment-v1","latency_ms":102},{"source":"technical","signal_type":"SELL","confidence":0.48,"reasoning":"RSI 65 overbought","status":"success","agent_id":"technical-v1","latency_ms":11}]',
    'agent'
  ),
  (
    gen_random_uuid()::text, 'GBPUSD', 'HOLD', 0.00,
    'Guard: CIRCUIT_BREAKER — daily loss limit exceeded',
    '{"CIRCUIT_BREAKER"}',
    '[{"source":"news","signal_type":"SELL","confidence":0.78,"reasoning":"BoE dovish","status":"success","agent_id":"news-v1","latency_ms":61},{"source":"fred","signal_type":"BUY","confidence":0.40,"reasoning":"US macro neutral","status":"success","agent_id":"fred-v1","latency_ms":341},{"source":"sentiment","signal_type":"SELL","confidence":0.65,"reasoning":"68% bearish tweets","status":"success","agent_id":"sentiment-v1","latency_ms":95},{"source":"technical","signal_type":"HOLD","confidence":0.35,"reasoning":"RSI 50 range-bound","status":"success","agent_id":"technical-v1","latency_ms":9}]',
    'agent'
  ),
  (
    gen_random_uuid()::text, 'EURUSD', 'SELL', 0.61,
    'Fusion: fred SELL@0.70 | sentiment SELL@0.68 | technical SELL@0.55 (News timed out)',
    '{"news_error"}',
    '[{"source":"news","signal_type":"HOLD","confidence":0.00,"reasoning":"Timeout 1500ms — fallback HOLD","status":"error","agent_id":"news-v1","latency_ms":1500},{"source":"fred","signal_type":"SELL","confidence":0.70,"reasoning":"DGS10 rising hawkish","status":"success","agent_id":"fred-v1","latency_ms":289},{"source":"sentiment","signal_type":"SELL","confidence":0.68,"reasoning":"62% bearish social","status":"success","agent_id":"sentiment-v1","latency_ms":77},{"source":"technical","signal_type":"SELL","confidence":0.55,"reasoning":"RSI 74 overbought","status":"success","agent_id":"technical-v1","latency_ms":14}]',
    'agent'
  ),
  (
    gen_random_uuid()::text, 'USDJPY', 'BUY', 0.71,
    'Fusion: fred BUY@0.80 — DGS10-JGB spread | news BUY@0.60 | technical BUY@0.75 — EMA cross',
    '{}',
    '[{"source":"news","signal_type":"BUY","confidence":0.60,"reasoning":"Risk-on JPY weakness","status":"success","agent_id":"news-v1","latency_ms":67},{"source":"fred","signal_type":"BUY","confidence":0.80,"reasoning":"DGS10-JGB spread widening","status":"success","agent_id":"fred-v1","latency_ms":310},{"source":"sentiment","signal_type":"HOLD","confidence":0.30,"reasoning":"Mixed JPY signals","status":"success","agent_id":"sentiment-v1","latency_ms":92},{"source":"technical","signal_type":"BUY","confidence":0.75,"reasoning":"EMA 9 crossed EMA 21","status":"success","agent_id":"technical-v1","latency_ms":8}]',
    'agent'
  )
ON CONFLICT (decision_id) DO NOTHING;

SELECT symbol, signal_type, confidence, created_at FROM agent_decisions ORDER BY created_at DESC;

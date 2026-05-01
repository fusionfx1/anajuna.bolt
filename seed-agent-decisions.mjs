/**
 * Seed script: insert 5 sample agent_decisions for testing Agent Feed UI.
 * Usage:  node seed-agent-decisions.mjs
 *
 * REQUIRES SERVICE ROLE KEY — the anon key cannot INSERT rows because the RLS
 * INSERT policy enforces auth.uid() = user_id, and unauthenticated requests
 * have no auth.uid().  Using the anon key would silently produce no rows.
 *
 * Set env vars before running:
 *   $env:SUPABASE_URL="https://xxxx.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."  (from Supabase dashboard → Settings → API)
 */

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL      || process.env.SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SERVICE_ROLE_KEY) {
  console.error('Error: seed-agent-decisions.mjs requires SUPABASE_SERVICE_ROLE_KEY. Running with anon key would silently produce no rows (RLS blocks INSERT).');
  process.exit(1);
}

if (SERVICE_ROLE_KEY === SUPABASE_ANON_KEY) {
  console.error('Error: seed-agent-decisions.mjs requires SUPABASE_SERVICE_ROLE_KEY. Running with anon key would silently produce no rows (RLS blocks INSERT).');
  process.exit(1);
}

if (!SUPABASE_URL || SUPABASE_URL.includes('placeholder')) {
  console.error('❌  Missing SUPABASE_URL.\n');
  console.error('Run:');
  console.error('  $env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"');
  console.error('  node seed-agent-decisions.mjs');
  process.exit(1);
}

const BASE = `${SUPABASE_URL}/rest/v1/agent_decisions`;
const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Prefer': 'return=minimal',
};

const crypto = await import('crypto');
const uuid = () => crypto.randomUUID();

const mkContribs = (votes) => votes.map(([source, sig, conf, reason, status = 'success', latency = 50]) => ({
  source, signal_type: sig, confidence: conf,
  reasoning: reason, status, agent_id: `${source}-v1`, latency_ms: latency,
}));

const SAMPLES = [
  {
    decision_id: uuid(), symbol: 'EURUSD', signal_type: 'BUY', confidence: 0.84,
    reasoning: 'Fusion: news: BUY@0.72 — FOMC minutes USD weakness | fred: BUY@0.65 — DGS10 falling 0.12pp | sentiment: HOLD@0.20 — neutral | technical: BUY@0.91 — RSI 28 oversold',
    blockers: [], signal_mode: 'agent',
    contributions: mkContribs([
      ['news',      'BUY',  0.72, 'FOMC minutes signal USD weakness', 'success', 43],
      ['fred',      'BUY',  0.65, 'DGS10 falling 0.12pp; DFF stable', 'success', 312],
      ['sentiment', 'HOLD', 0.20, 'Neutral social — 48% bullish Twitter', 'warning', 88],
      ['technical', 'BUY',  0.91, 'RSI 28 oversold — BB lower band breach', 'success', 12],
    ]),
  },
  {
    decision_id: uuid(), symbol: 'EURUSD', signal_type: 'HOLD', confidence: 0.42,
    reasoning: 'Fusion: conflicting BUY/SELL signals within 0.15 threshold — staying flat',
    blockers: ['conflicting_signals'], signal_mode: 'agent',
    contributions: mkContribs([
      ['news',      'HOLD', 0.30, 'Mixed headlines — no clear bias', 'success', 55],
      ['fred',      'BUY',  0.55, 'Fed rate cut expectations rising', 'success', 298],
      ['sentiment', 'HOLD', 0.25, 'Neutral positioning; low conviction', 'warning', 102],
      ['technical', 'SELL', 0.48, 'RSI 65 approaching overbought', 'success', 11],
    ]),
  },
  {
    decision_id: uuid(), symbol: 'GBPUSD', signal_type: 'HOLD', confidence: 0.00,
    reasoning: 'Guard: CIRCUIT_BREAKER — daily loss limit exceeded. All signals halted.',
    blockers: ['CIRCUIT_BREAKER'], signal_mode: 'agent',
    contributions: mkContribs([
      ['news',      'SELL', 0.78, 'BoE governor speech — dovish tone', 'success', 61],
      ['fred',      'BUY',  0.40, 'US macro neutral; no strong USD bias', 'success', 341],
      ['sentiment', 'SELL', 0.65, '68% bearish tweets GBP/USD', 'success', 95],
      ['technical', 'HOLD', 0.35, 'RSI 50; range-bound price action', 'success', 9],
    ]),
  },
  {
    decision_id: uuid(), symbol: 'EURUSD', signal_type: 'SELL', confidence: 0.61,
    reasoning: 'Fusion: fred: SELL@0.70 — DGS10 rising | sentiment: SELL@0.68 | technical: SELL@0.55 (News timed out)',
    blockers: ['news_error'], signal_mode: 'agent',
    contributions: mkContribs([
      ['news',      'HOLD', 0.00, 'Timeout after 1500ms — fallback HOLD', 'error', 1500],
      ['fred',      'SELL', 0.70, 'DGS10 rising 0.18pp — hawkish', 'success', 289],
      ['sentiment', 'SELL', 0.68, '62% bearish social sentiment', 'success', 77],
      ['technical', 'SELL', 0.55, 'RSI 74 overbought zone', 'success', 14],
    ]),
  },
  {
    decision_id: uuid(), symbol: 'USDJPY', signal_type: 'BUY', confidence: 0.71,
    reasoning: 'Fusion: news: BUY@0.60 | fred: BUY@0.80 — DGS10-JGB spread widening | technical: BUY@0.75 — EMA cross',
    blockers: [], signal_mode: 'agent',
    contributions: mkContribs([
      ['news',      'BUY',  0.60, 'Risk-on sentiment; JPY weakening', 'success', 67],
      ['fred',      'BUY',  0.80, 'DGS10-JGB spread widening — USD bullish', 'success', 310],
      ['sentiment', 'HOLD', 0.30, 'Mixed JPY/USD social signals', 'success', 92],
      ['technical', 'BUY',  0.75, 'EMA 9 crossed EMA 21 — momentum up', 'success', 8],
    ]),
  },
];

console.log(`🔗  Connecting to ${SUPABASE_URL}`);
console.log(`📦  Inserting ${SAMPLES.length} sample decisions...\n`);

let ok = 0;
for (const row of SAMPLES) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(row),
  });

  if (res.ok) {
    console.log(`✅  ${row.signal_type.padEnd(4)} ${row.symbol}  ${row.decision_id.slice(0,8)}`);
    ok++;
  } else {
    const txt = await res.text();
    console.error(`❌  ${row.symbol}: ${res.status} ${txt}`);
  }
}

console.log(`\n${ok}/${SAMPLES.length} inserted.`);
if (ok > 0) console.log('🔄  Agent Feed should update via Realtime — check http://localhost:5173');

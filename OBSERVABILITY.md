# Observability Runbook — Anjuna FX Agent Stack

This document covers operational guidance for monitoring the agent decision pipeline,
vector index lifecycle, and query plan inspection.

---

## Vector Index Runbook (OBS-03)

### When to Apply the IVFFlat Index

Apply `agent_decisions_embedding_idx` once the `agent_decisions` table reaches **10,000 rows**.
Below this threshold Supabase pgvector performs sequential scans faster than IVFFlat,
so adding the index early hurts rather than helps.

### Verify Row Count Before Applying

```sql
SELECT COUNT(*) AS total_rows,
       COUNT(embedding) AS rows_with_embedding
FROM agent_decisions;
-- Apply index only when total_rows > 10000
```

### Migration SQL

Run via the Supabase Dashboard SQL editor or `supabase db push`:

```sql
-- lists = sqrt(row_count) is a reasonable starting value (sqrt(10000) = 100)
CREATE INDEX IF NOT EXISTS agent_decisions_embedding_idx
  ON agent_decisions
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

Tune `lists` as the table grows:

| Row count | Recommended `lists` |
|-----------|---------------------|
| 10 000    | 100                 |
| 100 000   | 316                 |
| 1 000 000 | 1000                |

### EXPLAIN Capture for `match_agent_decisions`

After applying the index, capture the query plan to verify it is used:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, decision_id, symbol, confidence, created_at,
       embedding <=> '[0.1, 0.2, ...]'::vector AS distance
FROM agent_decisions
WHERE embedding IS NOT NULL
ORDER BY distance
LIMIT 10;
```

Save the output to `docs/explain/match_agent_decisions_<date>.txt` so query plan
regressions are detectable across Supabase upgrades.

Look for `Index Scan using agent_decisions_embedding_idx` in the plan output —
if you see `Seq Scan` the index was not applied or the planner bypassed it
(possible when `lists` is mis-sized or statistics are stale; run `ANALYZE agent_decisions`).

### Threshold Monitoring (Weekly)

```sql
SELECT COUNT(*) AS total_rows,
       COUNT(embedding) AS rows_with_embedding,
       ROUND(COUNT(embedding)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS embedding_coverage_pct
FROM agent_decisions;
```

---

## Stale Feed Threshold (OBS-04)

The `useAgentDecisions` hook marks the feed stale when no Realtime INSERT event
(or initial fetch) has occurred within **60 seconds**.

The threshold constant lives at:

```
src/hooks/useAgentDecisions.ts → STALE_THRESHOLD_MS = 60_000
```

Adjust this value if agent decision cadence changes (e.g. lower-frequency strategies).

---

## Persistence Error Signals (OBS-02)

`trading_system/agents/persistence.py::save_decision` emits a **loguru ERROR** log and
re-raises on any persistence failure.

Filter for persistence failures in production logs:

```
grep "\[persistence\] save_decision failed" <logfile>
```

Common causes:
- `SUPABASE_SERVICE_ROLE_KEY` not set → `EnvironmentError` (caught earlier, returns `None`)
- RLS policy blocks insert → Supabase client error
- Network timeout → requests exception

Note: the earlier `EnvironmentError` path (missing credentials) is still caught and returns
`None` silently, as that path indicates the system is running without Supabase configured
(e.g. CI, unit tests). Only authenticated persistence failures are elevated to ERROR + raise.

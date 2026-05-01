# Phase 04 — Observability & Health: Context

**Goal:** Operators can tell at a glance whether the agent stack is alive, what failed,
and how stale the feed is — without trusting heuristics that look operational but aren't.

---

## Decisions

### D-01 (OBS-01): Health badge approach

**Choice:** Label the heuristic explicitly as "(est.)" in the health percentage display,
and add a `title` tooltip clarifying it's latency-derived.

**Rationale:** Lowest-risk change — preserves layout, is visually honest.
`contributions[].status` already drives the LIVE/TIMEOUT label and the dot color correctly.
The only misleading element is the `health %` bar which uses `latency_ms % 12` for its value.
We label that number rather than remove it.

---

### D-02 (OBS-02): Persistence error logging

**Choice:** Upgrade the `logger.warning` in the `save_decision` except block to
`logger.error`, and add `raise` to re-raise the exception.

**Note on design contract change:** The module docstring states "save_decision() NEVER raises."
We are intentionally breaking this contract to satisfy OBS-02. The docstring will be updated.
Callers that do not handle exceptions (signal_providers.py background thread) will surface
failures rather than silently swallow them.

---

### D-03 (OBS-03): Vector index documentation

**Choice:** Create a new `OBSERVABILITY.md` file at the repo root. The `trading_system/README.md`
is already 300+ lines of Thai + English content; appending a DBA runbook there would hurt
readability. `OBSERVABILITY.md` is more discoverable for ops/infra owners.

---

### D-04 (OBS-04): Stale feed indicator

**Choice:** Track `lastUpdated: Date | null` in `useAgentDecisions`. Stale threshold = 60 seconds.
Set `lastUpdated` when initial fetch completes AND on every Realtime INSERT event.
Export `isStale: boolean` from the hook. Render amber banner in `AgentFeed` when `isStale`.

**Threshold rationale:** 60 s is reasonable for a live trading feed — agents typically produce
decisions every few seconds to minutes. A 60 s gap indicates a connectivity or agent issue.

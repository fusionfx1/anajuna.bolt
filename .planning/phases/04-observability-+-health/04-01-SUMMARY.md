---
phase: "04"
plan: "01"
subsystem: "frontend, python-persistence"
tags: ["observability", "stale-feed", "health-badge", "persistence", "realtime"]
key-files:
  modified:
    - src/hooks/useAgentDecisions.ts
    - src/components/AgentFeed.tsx
    - trading_system/agents/persistence.py
decisions:
  - "D-01: Label health% as latency-based estimate (title + '(est.)' text) rather than restructuring layout"
  - "D-02: Upgrade persistence failure from logger.warning to logger.error + re-raise"
  - "D-04: STALE_THRESHOLD_MS=60000, isStale derived from lastUpdated state"
metrics:
  duration: "~15 min"
  completed: "2026-05-01"
  tasks_completed: 3
  files_modified: 3
---

# Phase 04 Plan 01: Observability Code Changes Summary

**One-liner:** Stale feed banner (60s threshold), latency-heuristic badge label, persistence ERROR log + re-raise.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | useAgentDecisions: lastUpdated + isStale | c2de1fb | src/hooks/useAgentDecisions.ts |
| 2 | AgentFeed: stale banner + health badge label | c2de1fb | src/components/AgentFeed.tsx |
| 3 | persistence.py: logger.error + raise | c2de1fb | trading_system/agents/persistence.py |

## What Was Built

### OBS-04 — Stale Feed Indicator
- `useAgentDecisions` exports `lastUpdated: Date | null` and `isStale: boolean`
- `lastUpdated` set on initial fetch completion and on every Realtime INSERT event
- `isStale = lastUpdated !== null && elapsed > 60_000ms`
- `AgentFeed` renders amber banner: "⚠ Feed stale — no new data for Xs. Check agent connection."

### OBS-01 — Health Badge Honesty
- `AgentHealthCard` health percentage span gains `title="Latency-based estimate — not a live health signal"`
- Percentage label now shows `{health}% (est.)` to make the heuristic visible in the UI
- `contributions[].status` already correctly drove LIVE/TIMEOUT and dot color — no change needed there

### OBS-02 — Persistence Error Logging
- `save_decision` except block upgraded: `logger.warning` → `logger.error`
- `raise` added after the log so callers are alerted to failures
- Module docstring updated to reflect the new "raises on failure" contract
- Early-exit paths (missing env, empty decision_id) unchanged — still silent returns

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all implemented features are fully wired.

## Self-Check: PASSED

- `src/hooks/useAgentDecisions.ts` — exists, exports lastUpdated/isStale
- `src/components/AgentFeed.tsx` — exists, stale banner present, health label present
- `trading_system/agents/persistence.py` — exists, logger.error + raise in except block
- Commit c2de1fb — verified in git log
- TypeScript: no errors in modified files (pre-existing errors in unrelated files)
- Python syntax: `py_compile` passes

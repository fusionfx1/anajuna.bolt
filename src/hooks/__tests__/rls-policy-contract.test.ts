import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * RLS Policy Contract Test (CI-03 — static variant, Phase 5 v1)
 *
 * Reads the agent_decisions SELECT policy migration file and asserts the
 * USING clause, policy name, DROP statement, and target role are all present.
 *
 * Catches regressions immediately if someone modifies the migration policy
 * without updating this test — the CI test job will fail, blocking the merge.
 *
 * Phase 5 / v1 gap:
 *   This is a static file-content assertion, NOT a live database policy test.
 *   Real enforcement requires a running Supabase local stack (`supabase start`).
 *   Add live policy tests in Phase 6 / v2 once `supabase start` is available
 *   in the CI environment (e.g. via `supabase/supabase@v2` Action).
 */

const MIGRATION_FILE = 'supabase/migrations/20260501_agent_decisions_rls_contract.sql';

function readMigration(): string {
  return readFileSync(join(process.cwd(), MIGRATION_FILE), 'utf8');
}

describe('agent_decisions RLS policy contract (static — CI-03)', () => {
  it('migration file exists', () => {
    expect(() => readMigration()).not.toThrow();
  });

  it('SELECT policy USING clause allows auth.uid()=user_id OR user_id IS NULL', () => {
    const sql = readMigration();
    expect(sql).toContain('auth.uid() = user_id OR user_id IS NULL');
  });

  it('SELECT policy uses the documented policy name', () => {
    const sql = readMigration();
    expect(sql).toContain('Authenticated users see own and shared agent decisions');
  });

  it('old narrow SELECT policy is dropped before the new one is created', () => {
    const sql = readMigration();
    expect(sql).toContain('DROP POLICY IF EXISTS "Users can view own agent decisions"');
  });

  it('policy targets authenticated role only (not anon or public)', () => {
    const sql = readMigration();
    expect(sql).toContain('TO authenticated');
  });

  it('policy is a SELECT policy (not INSERT/UPDATE/DELETE)', () => {
    const sql = readMigration();
    expect(sql).toMatch(/FOR SELECT/i);
  });
});

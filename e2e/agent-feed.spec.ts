import { test, expect } from '@playwright/test';

/**
 * CI E2E happy-path smoke tests for Anjuna FX (CI-02).
 *
 * In CI, VITE_SUPABASE_URL is set to a placeholder — the app renders
 * the EnvErrorOverlay or the LoginScreen depending on build-time env resolution.
 * These tests verify the app loads and renders something meaningful;
 * they do NOT test Supabase authentication (that requires a live Supabase instance).
 *
 * Phase 5 / v1 scope:
 *   - Structural smoke tests run in CI with placeholder Supabase env
 *   - Authenticated Agent Feed flow is a Phase 6 / v2 E2E milestone
 */

test.describe('App structural smoke tests (CI-02)', () => {
  test('page loads without crashing', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Filter known non-fatal Supabase placeholder errors
    const fatalErrors = errors.filter(
      e =>
        !e.includes('Supabase') &&
        !e.includes('placeholder') &&
        !e.includes('fetch') &&
        !e.includes('NetworkError') &&
        !e.includes('Failed to fetch'),
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('page renders visible content (not blank)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent('body');
    expect(bodyText?.trim().length).toBeGreaterThan(0);
  });

  test('login page has expected elements when Supabase is configured', async ({ page }) => {
    // Skip in CI where VITE_SUPABASE_URL is the placeholder
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? '';
    test.skip(
      !supabaseUrl || supabaseUrl.includes('placeholder'),
      'Skipped in CI: real Supabase URL required for auth flow tests',
    );

    await page.goto('/');
    // When Supabase is configured, the LoginScreen renders a sign-in button
    await expect(page.getByRole('button', { name: /sign in|log in|login/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});

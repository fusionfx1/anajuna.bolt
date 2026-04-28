/**
 * Setup script: creates a test user account via the browser UI.
 * Run once before the main E2E suite to provision test credentials.
 *
 * Usage: npx playwright test e2e/setup-test-user.ts --headed
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const TEST_EMAIL = 'e2e-anjuna@mailinator.com';
const TEST_PASSWORD = 'E2eTest@2026!';

test('create test user account', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // If already on dashboard, user exists and is logged in
  const onLogin = await page.locator('text=Sign in to your account').isVisible({ timeout: 3000 }).catch(() => false);
  if (!onLogin) {
    console.log('Already authenticated — test user exists');
    return;
  }

  // Switch to register mode
  await page.getByRole('button', { name: /register/i }).click();
  await page.waitForTimeout(300);

  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();

  // Wait for success or error
  const success = await page.locator('text=/account created|now logged in/i').isVisible({ timeout: 15_000 }).catch(() => false);
  const error = await page.locator('[class*="red"]').filter({ hasText: /.+/ }).first().isVisible({ timeout: 2000 }).catch(() => false);

  if (success) {
    console.log(`Test user created: ${TEST_EMAIL}`);
    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/setup-success.png', fullPage: true });
  } else if (error) {
    const errorText = await page.locator('[class*="red"]').first().innerText().catch(() => 'unknown');
    console.log(`Registration error (user may already exist): ${errorText}`);
    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/setup-error.png', fullPage: true });
    // Try to login instead
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(300);
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(8000);
    const loggedIn = !(await page.locator('text=Sign in to your account').isVisible({ timeout: 2000 }).catch(() => false));
    console.log(`Login attempt result: ${loggedIn ? 'SUCCESS' : 'FAILED'}`);
  }

  await page.screenshot({ path: 'h:/tmp/anjuna-e2e/setup-final.png', fullPage: true });
});

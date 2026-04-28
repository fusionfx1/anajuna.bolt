import { test, expect } from '@playwright/test';

test('Login debug - check for errors and navigation', async ({ page }) => {
  // Enable logging
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('response', res => {
    if (res.url().includes('supabase') || res.status() >= 400) {
      console.log(`${res.status()} ${res.url()}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForSelector('input[type="email"]');

  // Fill credentials
  await page.fill('input[type="email"]', 'kittipong.fx@gmail.com');
  await page.fill('input[type="password"]', '@Fusion1988');

  // Click and wait for any response
  const signInButton = page.locator('button:has-text("Sign In")');
  await signInButton.click();

  // Wait up to 10 seconds for either error or navigation
  const navigationPromise = page.waitForNavigation().catch(() => null);
  const errorPromise = page.waitForSelector('[role="alert"], .text-red-500', { timeout: 5000 }).catch(() => null);

  const [navResult, errorResult] = await Promise.all([navigationPromise, errorPromise]);

  if (errorResult) {
    const errorText = await page.locator('[role="alert"], .text-red-500').first().textContent();
    console.log('ERROR DISPLAYED:', errorText);
  } else if (navResult) {
    console.log('NAVIGATION SUCCESSFUL');
  } else {
    console.log('NO NAVIGATION OR ERROR - LOGIN MAY BE HANGING');
  }

  // Check current URL
  console.log('Current URL:', page.url());

  // Check if dashboard elements exist
  const dashboardExists = await page.locator('[data-testid="dashboard"]').count();
  console.log('Dashboard visible:', dashboardExists > 0);

  await page.screenshot({ path: 'e2e-screenshots/login-debug.png', fullPage: true });
});

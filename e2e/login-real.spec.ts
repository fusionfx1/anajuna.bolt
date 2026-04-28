import { test, expect } from '@playwright/test';

test('Login with real credentials', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Wait for login form to load
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  // Fill in credentials
  await page.fill('input[type="email"]', 'kittipong.fx@gmail.com');
  await page.fill('input[type="password"]', '@Fusion1988');

  // Click Sign In button
  const signInButton = page.locator('button:has-text("Sign In")');
  await signInButton.click();

  // Wait for response (either error or success)
  await page.waitForTimeout(5000);

  // Check if we got an error
  const errorAlert = page.locator('[role="alert"], .text-red-500');
  const errorCount = await errorAlert.count();

  if (errorCount > 0) {
    const errorText = await errorAlert.first().textContent();
    console.log('Login Error:', errorText);
  } else {
    console.log('Login appears successful');
  }

  // Take screenshot
  await page.screenshot({ path: 'e2e-screenshots/login-real.png', fullPage: true });
});

/**
 * Anjuna Trading Dashboard — Critical Flow E2E Tests
 *
 * Flows tested:
 *   1. Authentication (Login / Signup)
 *   2. Dashboard — page load and data display
 *   3. Market Watch — price data rendering
 *   4. Order Management — new order form and submission
 *   5. Backtesting — run with synthetic candle data
 *   6. Trade History — table display
 *   7. Broker Connection — status panel
 *   8. System Health — metrics and health check
 *
 * Note: The app uses Supabase for auth and data. Without real .env.local credentials
 * (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), login will hang or fail — all
 * post-auth flows are necessarily skipped. That itself is a critical bug.
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Test credentials — uses the project's real Supabase instance
// These are demo/test credentials for the Anjuna trading platform
const TEST_EMAIL = 'kittipong.fx@gmail.com';
const TEST_PASSWORD = 'demo1234';

/** Navigate to a sidebar page by its nav-label text */
async function navigateTo(page: Page, label: string) {
  await page.getByRole('button', { name: label }).click();
  await page.waitForTimeout(800);
}

/** Wait until network is idle (covers most data-fetch scenarios) */
async function waitForLoad(page: Page, timeout = 12_000) {
  await page.waitForLoadState('networkidle', { timeout });
}

/** Returns true when the app shows the login screen (no session) */
async function isOnLoginScreen(page: Page): Promise<boolean> {
  return page.locator('text=Sign in to your account').isVisible({ timeout: 3000 }).catch(() => false);
}

/**
 * Attempt to login with the test credentials.
 * Returns true if login succeeded (user reaches dashboard).
 */
async function attemptLogin(page: Page, email: string, password: string): Promise<boolean> {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const onLogin = await isOnLoginScreen(page);
  if (!onLogin) return true; // already authenticated

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for either redirect to dashboard OR error message (max 12s)
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const stillOnLogin = await isOnLoginScreen(page);
    const errorShown = await page.locator('text=/invalid|error|failed/i').isVisible({ timeout: 300 }).catch(() => false);
    if (!stillOnLogin) return true;  // redirected to dashboard
    if (errorShown) return false;    // login error
    await page.waitForTimeout(500);
  }
  return false;
}

/**
 * Attach a console listener to the page.
 * Returns a getter function for all collected messages.
 */
function attachConsoleCapture(page: Page): () => ConsoleMessage[] {
  const messages: ConsoleMessage[] = [];
  page.on('console', msg => messages.push(msg));
  return () => messages;
}

// =============================================================================
// FLOW 0 — Environment & App Bootstrapping
// =============================================================================
test.describe('Flow 0: App Bootstrap & Environment', () => {
  test('app loads over HTTP 200', async ({ page }) => {
    const response = await page.goto(BASE_URL);
    expect(response?.status(), 'Expected HTTP 200 from dev server').toBe(200);
  });

  test('detects missing Supabase env vars and logs warning', async ({ page }) => {
    const getMessages = attachConsoleCapture(page);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const consoleMsgs = getMessages().map(m => `[${m.type()}] ${m.text()}`);
    const supabaseWarn = consoleMsgs.find(m =>
      /supabase|VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY|placeholder/i.test(m)
    );

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/00-bootstrap.png', fullPage: true });

    // This confirms env var missing — a CONFIG BUG
    expect(
      supabaseWarn,
      `Expected a Supabase missing-env warning in console. All console messages:\n${consoleMsgs.join('\n')}`
    ).toBeTruthy();
  });

  test('landing page shows either login screen or dashboard', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const onLogin = await isOnLoginScreen(page);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const hasDashboard = /dashboard|fusion fx|market watch/i.test(bodyText);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/00-landing.png', fullPage: true });

    // Either the login screen (no session) or dashboard (has session) must be shown
    expect(
      onLogin || hasDashboard,
      `App should show login screen or dashboard on landing. Got: ${bodyText.slice(0, 200)}`
    ).toBe(true);

    test.info().annotations.push({
      type: 'auth-state',
      description: `Login screen: ${onLogin}, Dashboard: ${hasDashboard}`,
    });
  });
});

// =============================================================================
// FLOW 1 — Authentication
// =============================================================================
test.describe('Flow 1: Authentication', () => {
  test('login screen renders all required UI elements', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const onLogin = await isOnLoginScreen(page);
    if (!onLogin) {
      test.info().annotations.push({ type: 'note', description: 'Session already active — skipping' });
      return;
    }

    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /register/i })).toBeVisible();

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/01-login-screen.png', fullPage: true });
  });

  test('sign-in with invalid credentials: Supabase response behavior', async ({ page }) => {
    const getMessages = attachConsoleCapture(page);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const onLogin = await isOnLoginScreen(page);
    if (!onLogin) {
      test.skip(true, 'Already authenticated — cannot test login error');
      return;
    }

    // Monitor network requests to Supabase
    const supabaseRequests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('supabase')) {
        supabaseRequests.push(`${req.method()} ${req.url()}`);
      }
    });
    const supabaseResponses: { url: string; status: number }[] = [];
    page.on('response', res => {
      if (res.url().includes('supabase')) {
        supabaseResponses.push({ url: res.url(), status: res.status() });
      }
    });

    // Use a domain that resolves (real Supabase) but credentials are wrong
    await page.locator('input[type="email"]').fill('invalid@gmail.com');
    await page.locator('input[type="password"]').fill('wrongpassword123');

    const signInButton = page.getByRole('button', { name: /sign in/i });
    await signInButton.click();

    // Wait up to 15s for either: error shown, loading spinner gone, or timeout
    let errorShown = false;
    let spinnerGone = false;
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      errorShown = await page.locator('text=/invalid|incorrect|error|failed|wrong|credentials/i').isVisible({ timeout: 500 }).catch(() => false);
      spinnerGone = !(await page.locator('button:disabled').first().isVisible({ timeout: 300 }).catch(() => false));
      if (errorShown || spinnerGone) break;
      await page.waitForTimeout(500);
    }

    const consoleMsgs = getMessages().map(m => `[${m.type()}] ${m.text()}`);
    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/01-login-error.png', fullPage: true });

    // DIAGNOSTIC: Report what actually happened
    const findings = [
      `Supabase requests sent: ${supabaseRequests.length}`,
      `Supabase responses received: ${JSON.stringify(supabaseResponses)}`,
      `Error message shown: ${errorShown}`,
      `Loading spinner gone: ${spinnerGone}`,
      `Console messages: ${consoleMsgs.join(' | ')}`,
    ];
    test.info().annotations.push({ type: 'diagnostic', description: findings.join('\n') });

    // FAIL CONDITION: If Supabase is using placeholder URL, the auth call will
    // never complete — the spinner stays forever and no error is shown.
    if (supabaseRequests.length === 0) {
      // No request was even made — likely a JS error before fetch
      expect.soft(false, `BUG: No Supabase auth request was made. Console: ${consoleMsgs.join(' | ')}`).toBe(true);
    } else if (supabaseResponses.length === 0) {
      expect.soft(false, 'BUG: Supabase auth request was sent but never received a response (network timeout — likely placeholder URL)').toBe(true);
    } else {
      // At least a response came back — check for error message
      expect(
        errorShown,
        `Expected error message after failed login. Responses: ${JSON.stringify(supabaseResponses)}`
      ).toBe(true);
    }
  });

  test('toggle to register mode renders create account form', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const onLogin = await isOnLoginScreen(page);
    if (!onLogin) {
      test.skip(true, 'Already authenticated');
      return;
    }

    await page.getByRole('button', { name: /register/i }).click();
    await page.waitForTimeout(400);

    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/01-register-mode.png', fullPage: true });
  });

  test('sign-in with placeholder Supabase never resolves (UI freezes)', async ({ page }) => {
    /**
     * This test documents a critical bug: when VITE_SUPABASE_URL is the placeholder
     * value, auth requests are fired at "placeholder.supabase.co" which either
     * returns CORS errors or times out entirely, leaving the button in a disabled
     * loading state with no user-visible error.
     */
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const onLogin = await isOnLoginScreen(page);
    if (!onLogin) {
      test.skip(true, 'Already authenticated');
      return;
    }

    await page.locator('input[type="email"]').fill('test@test.com');
    await page.locator('input[type="password"]').fill('password123');

    const signInButton = page.getByRole('button', { name: /sign in/i });
    await signInButton.click();

    // Wait 5 seconds (reasonable UX timeout)
    await page.waitForTimeout(5000);

    const buttonDisabled = await signInButton.isDisabled().catch(() => false);
    const errorShown = await page.locator('[class*="red-4"]').isVisible({ timeout: 500 }).catch(() => false);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/01-login-frozen.png', fullPage: true });

    if (buttonDisabled && !errorShown) {
      // Document the bug — button is stuck in loading state
      test.info().annotations.push({
        type: 'BUG-CRITICAL',
        description: 'LOGIN FREEZE: Button stays disabled after 5s with no error shown. ' +
          'Root cause: VITE_SUPABASE_URL is "placeholder.supabase.co" — no .env.local configured. ' +
          'Supabase auth request hangs indefinitely. User cannot login, dismiss error, or retry.',
      });
      // This is the expected broken behaviour — mark soft fail to document it
      expect.soft(errorShown, 'BUG: Login button frozen, no error shown after 5 seconds').toBe(true);
    }
  });
});

// =============================================================================
// FLOW 2 — Dashboard (requires auth)
// =============================================================================
test.describe('Flow 2: Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await attemptLogin(page, TEST_EMAIL, TEST_PASSWORD);
    if (!loggedIn) {
      test.skip(true, `Not authenticated — login failed with ${TEST_EMAIL}. Check credentials or Supabase project.`);
    }
  });

  test('dashboard page loads with key sections', async ({ page }) => {
    await waitForLoad(page);
    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/02-dashboard-load.png', fullPage: true });

    const hasContent = await page.locator('main').first().isVisible();
    expect(hasContent, 'Main content area should be visible').toBe(true);

    const bodyText = await page.locator('main').innerText().catch(() => '');
    const hasDashboardKeywords = /balance|equity|p&l|pnl|account|position/i.test(bodyText);
    expect(hasDashboardKeywords, `Dashboard should show account metrics. Body: ${bodyText.slice(0, 200)}`).toBe(true);
  });

  test('sidebar navigation shows all groups', async ({ page }) => {
    await waitForLoad(page);

    await expect(page.getByRole('button', { name: /dashboard/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /market watch/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /order management/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /backtesting/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /system health/i }).first()).toBeVisible();
  });
});

// =============================================================================
// FLOW 3 — Market Watch
// =============================================================================
test.describe('Flow 3: Market Watch', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await attemptLogin(page, TEST_EMAIL, TEST_PASSWORD);
    if (!loggedIn) {
      test.skip(true, `Not authenticated — login failed with ${TEST_EMAIL}`);
    }
  });

  test('market watch page renders forex pairs and prices', async ({ page }) => {
    await navigateTo(page, 'Market Watch');
    await waitForLoad(page);
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/03-market-watch.png', fullPage: true });

    const mainText = await page.locator('main').innerText().catch(() => '');
    expect(/EUR|GBP|USD|JPY/i.test(mainText), `Should show forex pairs. Got: ${mainText.slice(0, 300)}`).toBe(true);
  });

  test('market watch shows numeric price values', async ({ page }) => {
    await navigateTo(page, 'Market Watch');
    await waitForLoad(page);
    await page.waitForTimeout(2000);

    const mainText = await page.locator('main').innerText().catch(() => '');
    const hasPrices = /1\.\d{4,}|[0-9]+\.\d{3,}/.test(mainText);
    expect(hasPrices, `Market Watch should display prices. Got: ${mainText.slice(0, 400)}`).toBe(true);
  });
});

// =============================================================================
// FLOW 4 — Order Management
// =============================================================================
test.describe('Flow 4: Order Management', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await attemptLogin(page, TEST_EMAIL, TEST_PASSWORD);
    if (!loggedIn) {
      test.skip(true, `Not authenticated — login failed with ${TEST_EMAIL}`);
    }
  });

  test('order management renders stat cards and empty ledger', async ({ page }) => {
    await navigateTo(page, 'Order Management');
    await waitForLoad(page);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/04-order-mgmt-page.png', fullPage: true });

    await expect(page.getByText('Total Orders')).toBeVisible();
    await expect(page.getByText('Fill Rate')).toBeVisible();
    await expect(page.getByRole('button', { name: /new order/i })).toBeVisible();
  });

  test('new order modal opens with all fields', async ({ page }) => {
    await navigateTo(page, 'Order Management');
    await waitForLoad(page);

    await page.getByRole('button', { name: /new order/i }).click();
    await page.waitForTimeout(400);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/04-order-form-open.png', fullPage: true });

    await expect(page.getByRole('heading', { name: /new order/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /buy/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sell/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /submit/i })).toBeVisible();
  });

  test('submit market BUY order triggers risk check', async ({ page }) => {
    const getMessages = attachConsoleCapture(page);

    await navigateTo(page, 'Order Management');
    await waitForLoad(page);

    await page.getByRole('button', { name: /new order/i }).click();
    await page.waitForTimeout(400);

    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('1');

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/04-order-form-filled.png', fullPage: true });

    await page.getByRole('button', { name: /submit.*buy|buy.*order/i }).click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/04-order-risk-check.png', fullPage: true });

    const consoleMsgs = getMessages().map(m => `[${m.type()}] ${m.text()}`);

    // Risk check modal text variants observed in screenshots
    const riskModalVisible = await page.locator('text=Risk Check Result').isVisible({ timeout: 4000 }).catch(() => false)
      || await page.locator('text=Order Approved').isVisible({ timeout: 2000 }).catch(() => false)
      || await page.locator('text=Order Rejected').isVisible({ timeout: 2000 }).catch(() => false);

    // OR order appears in the ledger table
    const orderInLedger = await page.locator('main').getByText('EURUSD').isVisible({ timeout: 2000 }).catch(() => false);

    test.info().annotations.push({
      type: 'diagnostic',
      description: `Risk modal: ${riskModalVisible}, Order in ledger: ${orderInLedger}, Console: ${consoleMsgs.join(' | ')}`,
    });

    expect(
      riskModalVisible || orderInLedger,
      `Expected risk check modal or order in ledger. Console: ${consoleMsgs.join(' | ')}`
    ).toBe(true);
  });
});

// =============================================================================
// FLOW 5 — Backtesting
// =============================================================================
test.describe('Flow 5: Backtesting', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await attemptLogin(page, TEST_EMAIL, TEST_PASSWORD);
    if (!loggedIn) {
      test.skip(true, `Not authenticated — login failed with ${TEST_EMAIL}`);
    }
  });

  test('backtesting page loads with config panel', async ({ page }) => {
    await navigateTo(page, 'Backtesting');
    await waitForLoad(page);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/05-backtest-page.png', fullPage: true });

    const mainText = await page.locator('main').innerText().catch(() => '');
    const hasKeywords = /backtest|strategy|instrument|start date|run/i.test(mainText);
    expect(hasKeywords, `Backtesting page should show config. Got: ${mainText.slice(0, 300)}`).toBe(true);
  });

  test('run backtest produces results or synthetic-data warning', async ({ page }) => {
    const getMessages = attachConsoleCapture(page);

    await navigateTo(page, 'Backtesting');
    await waitForLoad(page);

    const runButton = page.getByRole('button', { name: /run backtest|^run$/i }).first();
    const runVisible = await runButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!runVisible) {
      await page.screenshot({ path: 'h:/tmp/anjuna-e2e/05-backtest-no-run-btn.png', fullPage: true });
      const mainText = await page.locator('main').innerText().catch(() => '');
      test.info().annotations.push({
        type: 'BUG',
        description: `Run Backtest button not found. Page content: ${mainText.slice(0, 400)}`,
      });
      expect(runVisible, 'BUG: Run Backtest button not visible on Backtesting page').toBe(true);
      return;
    }

    await runButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/05-backtest-running.png', fullPage: true });

    // Wait for completion (synthetic candles — should be quick)
    await page.waitForSelector('text=/completed|no trades|simulated|synthetic|net pnl|total trades/i', { timeout: 25_000 }).catch(() => null);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/05-backtest-results.png', fullPage: true });

    const mainText = await page.locator('main').innerText().catch(() => '');
    const consoleMsgs = getMessages().map(m => `[${m.type()}] ${m.text()}`);

    const hasResults = /total trades|net pnl|win rate|completed|no trades|simulated|synthetic/i.test(mainText);
    test.info().annotations.push({
      type: 'diagnostic',
      description: `Console: ${consoleMsgs.join(' | ')} | Page: ${mainText.slice(0, 400)}`,
    });

    expect(hasResults, `Backtest should produce output. Got: ${mainText.slice(0, 400)}`).toBe(true);
  });
});

// =============================================================================
// FLOW 6 — Trade History
// =============================================================================
test.describe('Flow 6: Trade History', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await attemptLogin(page, TEST_EMAIL, TEST_PASSWORD);
    if (!loggedIn) {
      test.skip(true, `Not authenticated — login failed with ${TEST_EMAIL}`);
    }
  });

  test('trade history page renders table or empty state', async ({ page }) => {
    await navigateTo(page, 'Trade History');
    await waitForLoad(page);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/06-trade-history.png', fullPage: true });

    const mainText = await page.locator('main').innerText().catch(() => '');
    const hasExpected = /trade|history|no trades|symbol|profit|pnl/i.test(mainText);
    expect(hasExpected, `Trade History should render. Got: ${mainText.slice(0, 300)}`).toBe(true);
  });
});

// =============================================================================
// FLOW 7 — Broker Connection
// =============================================================================
test.describe('Flow 7: Broker Connection', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await attemptLogin(page, TEST_EMAIL, TEST_PASSWORD);
    if (!loggedIn) {
      test.skip(true, `Not authenticated — login failed with ${TEST_EMAIL}`);
    }
  });

  test('broker demo page loads with status indicators', async ({ page }) => {
    await navigateTo(page, 'Broker Demo');
    await waitForLoad(page);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/07-broker-demo.png', fullPage: true });

    const mainText = await page.locator('main').innerText().catch(() => '');
    const hasBrokerInfo = /broker|account|paper|connected|api|order|oanda|alpaca/i.test(mainText);
    expect(hasBrokerInfo, `Broker Demo page should show broker info. Got: ${mainText.slice(0, 300)}`).toBe(true);
  });

  test('settings page has data feed and broker configuration fields', async ({ page }) => {
    await navigateTo(page, 'Settings');
    await waitForLoad(page);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/07-settings.png', fullPage: true });

    const mainText = await page.locator('main').innerText().catch(() => '');
    const hasSettingsOptions = /settings|api key|broker|feed|oanda|alpaca|risk/i.test(mainText);
    expect(hasSettingsOptions, `Settings page should show config. Got: ${mainText.slice(0, 300)}`).toBe(true);
  });
});

// =============================================================================
// FLOW 8 — System Health
// =============================================================================
test.describe('Flow 8: System Health', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await attemptLogin(page, TEST_EMAIL, TEST_PASSWORD);
    if (!loggedIn) {
      test.skip(true, `Not authenticated — login failed with ${TEST_EMAIL}`);
    }
  });

  test('system health page renders 8 metric cards', async ({ page }) => {
    await navigateTo(page, 'System Health');
    await waitForLoad(page);
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/08-system-health.png', fullPage: true });

    // Use exact:true to avoid strict mode violations from partial text matches
    await expect(page.getByText('Data Feed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Database', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Broker API', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Risk Engine', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Order Management', { exact: true }).first()).toBeVisible();
  });

  test('overall status badge is visible', async ({ page }) => {
    await navigateTo(page, 'System Health');
    await waitForLoad(page);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/08-system-health-status.png', fullPage: true });

    const statusBadge = page.locator('text=/all systems operational|degraded|incident/i');
    await expect(statusBadge).toBeVisible({ timeout: 5000 });
  });

  test('database metric shows latency or unreachable status', async ({ page }) => {
    await navigateTo(page, 'System Health');
    await waitForLoad(page);
    await page.waitForTimeout(4000); // DB latency check is async

    await page.screenshot({ path: 'h:/tmp/anjuna-e2e/08-db-latency.png', fullPage: true });

    // Find the Database card and extract its text
    const mainText = await page.locator('main').innerText().catch(() => '');
    const hasDbStatus = /\d+ms|unreachable|cannot reach/i.test(mainText);
    expect(hasDbStatus, `DB card should report latency or unreachable status. Page: ${mainText.slice(0, 400)}`).toBe(true);
  });

  test('feed statistics section renders provider and tick info', async ({ page }) => {
    await navigateTo(page, 'System Health');
    await waitForLoad(page);
    await page.waitForTimeout(1500);

    await expect(page.getByText('Feed Statistics')).toBeVisible();
    await expect(page.getByText('Provider')).toBeVisible();
    await expect(page.getByText('Total Ticks')).toBeVisible();
  });
});

// =============================================================================
// FLOW — Navigation smoke test (all pages reachable without crash)
// =============================================================================
test.describe('Navigation: all pages reachable', () => {
  const PAGES = [
    { label: 'Dashboard',        keyword: /dashboard|equity|balance|position/i },
    { label: 'Market Watch',     keyword: /EUR|GBP|market|watch/i },
    { label: 'Order Management', keyword: /order|total orders/i },
    { label: 'Backtesting',      keyword: /backtest|strategy|run/i },
    { label: 'Trade History',    keyword: /trade|history|pnl/i },
    { label: 'System Health',    keyword: /data feed|database|health/i },
    { label: 'Broker Demo',      keyword: /broker|paper|account/i },
    { label: 'Settings',         keyword: /setting|api|risk/i },
  ];

  test.beforeEach(async ({ page }) => {
    const loggedIn = await attemptLogin(page, TEST_EMAIL, TEST_PASSWORD);
    if (!loggedIn) {
      test.skip(true, `Not authenticated — navigation test requires login. Login failed with ${TEST_EMAIL}`);
    }
  });

  for (const { label, keyword } of PAGES) {
    test(`"${label}" page renders expected content`, async ({ page }) => {
      const getMessages = attachConsoleCapture(page);

      await navigateTo(page, label);
      await waitForLoad(page);
      await page.waitForTimeout(800);

      const mainText = await page.locator('main').innerText().catch(() => '');
      const filename = label.toLowerCase().replace(/\s+/g, '-');
      await page.screenshot({ path: `h:/tmp/anjuna-e2e/nav-${filename}.png`, fullPage: true });

      const errors = getMessages().filter(m => m.type() === 'error').map(m => m.text());
      if (errors.length > 0) {
        test.info().annotations.push({ type: 'console-errors', description: errors.join(' | ') });
      }

      expect(
        keyword.test(mainText),
        `Page "${label}" should render expected content. Got: ${mainText.slice(0, 200)}`
      ).toBe(true);
    });
  }
});

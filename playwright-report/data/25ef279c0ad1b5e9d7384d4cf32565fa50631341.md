# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: anjuna-dashboard.spec.ts >> Flow 0: App Bootstrap & Environment >> detects missing Supabase env vars and logs warning
- Location: e2e\anjuna-dashboard.spec.ts:90:3

# Error details

```
Error: Expected a Supabase missing-env warning in console. All console messages:
[debug] [vite] connecting...
[debug] [vite] connected.
[info] %cDownload the React DevTools for a better development experience: https://reactjs.org/link/react-devtools font-weight:bold

expect(received).toBeTruthy()

Received: undefined
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - img [ref=e7]
    - generic [ref=e10]:
      - generic [ref=e11]: Fusion FX
      - generic [ref=e12]: Automated Forex Trading
  - generic [ref=e13]:
    - heading "Sign in to your account" [level=2] [ref=e14]
    - paragraph [ref=e15]: Enter your credentials to access your trading dashboard.
    - generic [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e18]: Email
        - generic [ref=e19]:
          - img [ref=e20]
          - textbox "trader@example.com" [ref=e23]
      - generic [ref=e24]:
        - generic [ref=e25]: Password
        - generic [ref=e26]:
          - img [ref=e27]
          - textbox "••••••••" [ref=e30]
          - button [ref=e31] [cursor=pointer]:
            - img [ref=e32]
      - button "Sign In" [ref=e35] [cursor=pointer]
    - generic [ref=e36]:
      - text: Don't have an account?
      - button "Register" [ref=e37] [cursor=pointer]
  - paragraph [ref=e38]: Demo trading platform. No real funds involved.
```

# Test source

```ts
  6   |  *   2. Dashboard — page load and data display
  7   |  *   3. Market Watch — price data rendering
  8   |  *   4. Order Management — new order form and submission
  9   |  *   5. Backtesting — run with synthetic candle data
  10  |  *   6. Trade History — table display
  11  |  *   7. Broker Connection — status panel
  12  |  *   8. System Health — metrics and health check
  13  |  *
  14  |  * Note: The app uses Supabase for auth and data. Without real .env.local credentials
  15  |  * (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), login will hang or fail — all
  16  |  * post-auth flows are necessarily skipped. That itself is a critical bug.
  17  |  */
  18  | 
  19  | import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
  20  | 
  21  | const BASE_URL = 'http://localhost:5173';
  22  | 
  23  | // ── Helpers ──────────────────────────────────────────────────────────────────
  24  | 
  25  | // Test credentials — uses the project's real Supabase instance
  26  | // These are demo/test credentials for the Anjuna trading platform
  27  | const TEST_EMAIL = 'kittipong.fx@gmail.com';
  28  | const TEST_PASSWORD = 'demo1234';
  29  | 
  30  | /** Navigate to a sidebar page by its nav-label text */
  31  | async function navigateTo(page: Page, label: string) {
  32  |   await page.getByRole('button', { name: label }).click();
  33  |   await page.waitForTimeout(800);
  34  | }
  35  | 
  36  | /** Wait until network is idle (covers most data-fetch scenarios) */
  37  | async function waitForLoad(page: Page, timeout = 12_000) {
  38  |   await page.waitForLoadState('networkidle', { timeout });
  39  | }
  40  | 
  41  | /** Returns true when the app shows the login screen (no session) */
  42  | async function isOnLoginScreen(page: Page): Promise<boolean> {
  43  |   return page.locator('text=Sign in to your account').isVisible({ timeout: 3000 }).catch(() => false);
  44  | }
  45  | 
  46  | /**
  47  |  * Attempt to login with the test credentials.
  48  |  * Returns true if login succeeded (user reaches dashboard).
  49  |  */
  50  | async function attemptLogin(page: Page, email: string, password: string): Promise<boolean> {
  51  |   await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  52  |   const onLogin = await isOnLoginScreen(page);
  53  |   if (!onLogin) return true; // already authenticated
  54  | 
  55  |   await page.locator('input[type="email"]').fill(email);
  56  |   await page.locator('input[type="password"]').fill(password);
  57  |   await page.getByRole('button', { name: /sign in/i }).click();
  58  | 
  59  |   // Wait for either redirect to dashboard OR error message (max 12s)
  60  |   const deadline = Date.now() + 12_000;
  61  |   while (Date.now() < deadline) {
  62  |     const stillOnLogin = await isOnLoginScreen(page);
  63  |     const errorShown = await page.locator('text=/invalid|error|failed/i').isVisible({ timeout: 300 }).catch(() => false);
  64  |     if (!stillOnLogin) return true;  // redirected to dashboard
  65  |     if (errorShown) return false;    // login error
  66  |     await page.waitForTimeout(500);
  67  |   }
  68  |   return false;
  69  | }
  70  | 
  71  | /**
  72  |  * Attach a console listener to the page.
  73  |  * Returns a getter function for all collected messages.
  74  |  */
  75  | function attachConsoleCapture(page: Page): () => ConsoleMessage[] {
  76  |   const messages: ConsoleMessage[] = [];
  77  |   page.on('console', msg => messages.push(msg));
  78  |   return () => messages;
  79  | }
  80  | 
  81  | // =============================================================================
  82  | // FLOW 0 — Environment & App Bootstrapping
  83  | // =============================================================================
  84  | test.describe('Flow 0: App Bootstrap & Environment', () => {
  85  |   test('app loads over HTTP 200', async ({ page }) => {
  86  |     const response = await page.goto(BASE_URL);
  87  |     expect(response?.status(), 'Expected HTTP 200 from dev server').toBe(200);
  88  |   });
  89  | 
  90  |   test('detects missing Supabase env vars and logs warning', async ({ page }) => {
  91  |     const getMessages = attachConsoleCapture(page);
  92  |     await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  93  |     await page.waitForTimeout(1000);
  94  | 
  95  |     const consoleMsgs = getMessages().map(m => `[${m.type()}] ${m.text()}`);
  96  |     const supabaseWarn = consoleMsgs.find(m =>
  97  |       /supabase|VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY|placeholder/i.test(m)
  98  |     );
  99  | 
  100 |     await page.screenshot({ path: 'h:/tmp/anjuna-e2e/00-bootstrap.png', fullPage: true });
  101 | 
  102 |     // This confirms env var missing — a CONFIG BUG
  103 |     expect(
  104 |       supabaseWarn,
  105 |       `Expected a Supabase missing-env warning in console. All console messages:\n${consoleMsgs.join('\n')}`
> 106 |     ).toBeTruthy();
      |       ^ Error: Expected a Supabase missing-env warning in console. All console messages:
  107 |   });
  108 | 
  109 |   test('landing page shows either login screen or dashboard', async ({ page }) => {
  110 |     await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  111 |     await page.waitForTimeout(1500);
  112 | 
  113 |     const onLogin = await isOnLoginScreen(page);
  114 |     const bodyText = await page.locator('body').innerText().catch(() => '');
  115 |     const hasDashboard = /dashboard|fusion fx|market watch/i.test(bodyText);
  116 | 
  117 |     await page.screenshot({ path: 'h:/tmp/anjuna-e2e/00-landing.png', fullPage: true });
  118 | 
  119 |     // Either the login screen (no session) or dashboard (has session) must be shown
  120 |     expect(
  121 |       onLogin || hasDashboard,
  122 |       `App should show login screen or dashboard on landing. Got: ${bodyText.slice(0, 200)}`
  123 |     ).toBe(true);
  124 | 
  125 |     test.info().annotations.push({
  126 |       type: 'auth-state',
  127 |       description: `Login screen: ${onLogin}, Dashboard: ${hasDashboard}`,
  128 |     });
  129 |   });
  130 | });
  131 | 
  132 | // =============================================================================
  133 | // FLOW 1 — Authentication
  134 | // =============================================================================
  135 | test.describe('Flow 1: Authentication', () => {
  136 |   test('login screen renders all required UI elements', async ({ page }) => {
  137 |     await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  138 | 
  139 |     const onLogin = await isOnLoginScreen(page);
  140 |     if (!onLogin) {
  141 |       test.info().annotations.push({ type: 'note', description: 'Session already active — skipping' });
  142 |       return;
  143 |     }
  144 | 
  145 |     await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();
  146 |     await expect(page.locator('input[type="email"]')).toBeVisible();
  147 |     await expect(page.locator('input[type="password"]')).toBeVisible();
  148 |     await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  149 |     await expect(page.getByRole('button', { name: /register/i })).toBeVisible();
  150 | 
  151 |     await page.screenshot({ path: 'h:/tmp/anjuna-e2e/01-login-screen.png', fullPage: true });
  152 |   });
  153 | 
  154 |   test('sign-in with invalid credentials: Supabase response behavior', async ({ page }) => {
  155 |     const getMessages = attachConsoleCapture(page);
  156 |     await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  157 | 
  158 |     const onLogin = await isOnLoginScreen(page);
  159 |     if (!onLogin) {
  160 |       test.skip(true, 'Already authenticated — cannot test login error');
  161 |       return;
  162 |     }
  163 | 
  164 |     // Monitor network requests to Supabase
  165 |     const supabaseRequests: string[] = [];
  166 |     page.on('request', req => {
  167 |       if (req.url().includes('supabase')) {
  168 |         supabaseRequests.push(`${req.method()} ${req.url()}`);
  169 |       }
  170 |     });
  171 |     const supabaseResponses: { url: string; status: number }[] = [];
  172 |     page.on('response', res => {
  173 |       if (res.url().includes('supabase')) {
  174 |         supabaseResponses.push({ url: res.url(), status: res.status() });
  175 |       }
  176 |     });
  177 | 
  178 |     // Use a domain that resolves (real Supabase) but credentials are wrong
  179 |     await page.locator('input[type="email"]').fill('invalid@gmail.com');
  180 |     await page.locator('input[type="password"]').fill('wrongpassword123');
  181 | 
  182 |     const signInButton = page.getByRole('button', { name: /sign in/i });
  183 |     await signInButton.click();
  184 | 
  185 |     // Wait up to 15s for either: error shown, loading spinner gone, or timeout
  186 |     let errorShown = false;
  187 |     let spinnerGone = false;
  188 |     const deadline = Date.now() + 15_000;
  189 | 
  190 |     while (Date.now() < deadline) {
  191 |       errorShown = await page.locator('text=/invalid|incorrect|error|failed|wrong|credentials/i').isVisible({ timeout: 500 }).catch(() => false);
  192 |       spinnerGone = !(await page.locator('button:disabled').first().isVisible({ timeout: 300 }).catch(() => false));
  193 |       if (errorShown || spinnerGone) break;
  194 |       await page.waitForTimeout(500);
  195 |     }
  196 | 
  197 |     const consoleMsgs = getMessages().map(m => `[${m.type()}] ${m.text()}`);
  198 |     await page.screenshot({ path: 'h:/tmp/anjuna-e2e/01-login-error.png', fullPage: true });
  199 | 
  200 |     // DIAGNOSTIC: Report what actually happened
  201 |     const findings = [
  202 |       `Supabase requests sent: ${supabaseRequests.length}`,
  203 |       `Supabase responses received: ${JSON.stringify(supabaseResponses)}`,
  204 |       `Error message shown: ${errorShown}`,
  205 |       `Loading spinner gone: ${spinnerGone}`,
  206 |       `Console messages: ${consoleMsgs.join(' | ')}`,
```
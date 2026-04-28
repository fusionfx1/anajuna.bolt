# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: anjuna-dashboard.spec.ts >> Flow 1: Authentication >> sign-in with invalid credentials: Supabase response behavior
- Location: e2e\anjuna-dashboard.spec.ts:154:3

# Error details

```
Error: BUG: Supabase auth request was sent but never received a response (network timeout — likely placeholder URL)

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
          - textbox "trader@example.com" [ref=e23]: invalid@gmail.com
      - generic [ref=e24]:
        - generic [ref=e25]: Password
        - generic [ref=e26]:
          - img [ref=e27]
          - textbox "••••••••" [ref=e30]: wrongpassword123
          - button [ref=e31] [cursor=pointer]:
            - img [ref=e32]
      - button "Sign In" [disabled] [ref=e35]:
        - img [ref=e36]
        - text: Sign In
    - generic [ref=e38]:
      - text: Don't have an account?
      - button "Register" [ref=e39] [cursor=pointer]
  - paragraph [ref=e40]: Demo trading platform. No real funds involved.
```

# Test source

```ts
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
  207 |     ];
  208 |     test.info().annotations.push({ type: 'diagnostic', description: findings.join('\n') });
  209 | 
  210 |     // FAIL CONDITION: If Supabase is using placeholder URL, the auth call will
  211 |     // never complete — the spinner stays forever and no error is shown.
  212 |     if (supabaseRequests.length === 0) {
  213 |       // No request was even made — likely a JS error before fetch
  214 |       expect.soft(false, `BUG: No Supabase auth request was made. Console: ${consoleMsgs.join(' | ')}`).toBe(true);
  215 |     } else if (supabaseResponses.length === 0) {
> 216 |       expect.soft(false, 'BUG: Supabase auth request was sent but never received a response (network timeout — likely placeholder URL)').toBe(true);
      |                                                                                                                                          ^ Error: BUG: Supabase auth request was sent but never received a response (network timeout — likely placeholder URL)
  217 |     } else {
  218 |       // At least a response came back — check for error message
  219 |       expect(
  220 |         errorShown,
  221 |         `Expected error message after failed login. Responses: ${JSON.stringify(supabaseResponses)}`
  222 |       ).toBe(true);
  223 |     }
  224 |   });
  225 | 
  226 |   test('toggle to register mode renders create account form', async ({ page }) => {
  227 |     await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  228 | 
  229 |     const onLogin = await isOnLoginScreen(page);
  230 |     if (!onLogin) {
  231 |       test.skip(true, 'Already authenticated');
  232 |       return;
  233 |     }
  234 | 
  235 |     await page.getByRole('button', { name: /register/i }).click();
  236 |     await page.waitForTimeout(400);
  237 | 
  238 |     await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
  239 |     await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  240 |     await page.screenshot({ path: 'h:/tmp/anjuna-e2e/01-register-mode.png', fullPage: true });
  241 |   });
  242 | 
  243 |   test('sign-in with placeholder Supabase never resolves (UI freezes)', async ({ page }) => {
  244 |     /**
  245 |      * This test documents a critical bug: when VITE_SUPABASE_URL is the placeholder
  246 |      * value, auth requests are fired at "placeholder.supabase.co" which either
  247 |      * returns CORS errors or times out entirely, leaving the button in a disabled
  248 |      * loading state with no user-visible error.
  249 |      */
  250 |     await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  251 | 
  252 |     const onLogin = await isOnLoginScreen(page);
  253 |     if (!onLogin) {
  254 |       test.skip(true, 'Already authenticated');
  255 |       return;
  256 |     }
  257 | 
  258 |     await page.locator('input[type="email"]').fill('test@test.com');
  259 |     await page.locator('input[type="password"]').fill('password123');
  260 | 
  261 |     const signInButton = page.getByRole('button', { name: /sign in/i });
  262 |     await signInButton.click();
  263 | 
  264 |     // Wait 5 seconds (reasonable UX timeout)
  265 |     await page.waitForTimeout(5000);
  266 | 
  267 |     const buttonDisabled = await signInButton.isDisabled().catch(() => false);
  268 |     const errorShown = await page.locator('[class*="red-4"]').isVisible({ timeout: 500 }).catch(() => false);
  269 | 
  270 |     await page.screenshot({ path: 'h:/tmp/anjuna-e2e/01-login-frozen.png', fullPage: true });
  271 | 
  272 |     if (buttonDisabled && !errorShown) {
  273 |       // Document the bug — button is stuck in loading state
  274 |       test.info().annotations.push({
  275 |         type: 'BUG-CRITICAL',
  276 |         description: 'LOGIN FREEZE: Button stays disabled after 5s with no error shown. ' +
  277 |           'Root cause: VITE_SUPABASE_URL is "placeholder.supabase.co" — no .env.local configured. ' +
  278 |           'Supabase auth request hangs indefinitely. User cannot login, dismiss error, or retry.',
  279 |       });
  280 |       // This is the expected broken behaviour — mark soft fail to document it
  281 |       expect.soft(errorShown, 'BUG: Login button frozen, no error shown after 5 seconds').toBe(true);
  282 |     }
  283 |   });
  284 | });
  285 | 
  286 | // =============================================================================
  287 | // FLOW 2 — Dashboard (requires auth)
  288 | // =============================================================================
  289 | test.describe('Flow 2: Dashboard', () => {
  290 |   test.beforeEach(async ({ page }) => {
  291 |     const loggedIn = await attemptLogin(page, TEST_EMAIL, TEST_PASSWORD);
  292 |     if (!loggedIn) {
  293 |       test.skip(true, `Not authenticated — login failed with ${TEST_EMAIL}. Check credentials or Supabase project.`);
  294 |     }
  295 |   });
  296 | 
  297 |   test('dashboard page loads with key sections', async ({ page }) => {
  298 |     await waitForLoad(page);
  299 |     await page.screenshot({ path: 'h:/tmp/anjuna-e2e/02-dashboard-load.png', fullPage: true });
  300 | 
  301 |     const hasContent = await page.locator('main').first().isVisible();
  302 |     expect(hasContent, 'Main content area should be visible').toBe(true);
  303 | 
  304 |     const bodyText = await page.locator('main').innerText().catch(() => '');
  305 |     const hasDashboardKeywords = /balance|equity|p&l|pnl|account|position/i.test(bodyText);
  306 |     expect(hasDashboardKeywords, `Dashboard should show account metrics. Body: ${bodyText.slice(0, 200)}`).toBe(true);
  307 |   });
  308 | 
  309 |   test('sidebar navigation shows all groups', async ({ page }) => {
  310 |     await waitForLoad(page);
  311 | 
  312 |     await expect(page.getByRole('button', { name: /dashboard/i }).first()).toBeVisible();
  313 |     await expect(page.getByRole('button', { name: /market watch/i }).first()).toBeVisible();
  314 |     await expect(page.getByRole('button', { name: /order management/i }).first()).toBeVisible();
  315 |     await expect(page.getByRole('button', { name: /backtesting/i }).first()).toBeVisible();
  316 |     await expect(page.getByRole('button', { name: /system health/i }).first()).toBeVisible();
```
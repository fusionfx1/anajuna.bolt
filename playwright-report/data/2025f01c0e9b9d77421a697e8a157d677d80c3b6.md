# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: setup-user.spec.ts >> Setup: Create and confirm user account
- Location: e2e\setup-user.spec.ts:3:1

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('input[type="email"]') to be visible

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - img [ref=e8]
        - generic [ref=e10]: Fusion
        - generic [ref=e11]: FX
      - button [ref=e12] [cursor=pointer]:
        - img [ref=e13]
    - generic [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]:
          - generic [ref=e18]: Tokyo
          - generic [ref=e19]: London
          - generic [ref=e20]: New York
        - generic [ref=e21]: 07:42 UTC
      - generic [ref=e35]:
        - generic [ref=e36]: "00"
        - generic [ref=e37]: "04"
        - generic [ref=e38]: "08"
        - generic [ref=e39]: "12"
        - generic [ref=e40]: "16"
        - generic [ref=e41]: "20"
        - generic [ref=e42]: "24"
    - navigation [ref=e43]:
      - generic [ref=e44]:
        - paragraph [ref=e45]: Trading
        - generic [ref=e46]:
          - button "Dashboard" [ref=e47] [cursor=pointer]:
            - img [ref=e48]
            - generic [ref=e53]: Dashboard
          - button "Market Watch" [ref=e54] [cursor=pointer]:
            - img [ref=e55]
            - generic [ref=e58]: Market Watch
          - button "Chart" [ref=e59] [cursor=pointer]:
            - img [ref=e60]
            - generic [ref=e64]: Chart
          - button "News Calendar" [ref=e65] [cursor=pointer]:
            - img [ref=e66]
            - generic [ref=e69]: News Calendar
      - generic [ref=e70]:
        - paragraph [ref=e71]: Paper
        - generic [ref=e72]:
          - button "Positions" [ref=e73] [cursor=pointer]:
            - img [ref=e74]
            - generic [ref=e75]: Positions
          - button "Paper History" [ref=e76] [cursor=pointer]:
            - img [ref=e77]
            - generic [ref=e80]: Paper History
      - generic [ref=e81]:
        - paragraph [ref=e82]: System
        - generic [ref=e83]:
          - button "Strategies 2" [ref=e84] [cursor=pointer]:
            - img [ref=e85]
            - generic [ref=e88]: Strategies
            - generic [ref=e89]: "2"
          - button "AI Engine" [ref=e90] [cursor=pointer]:
            - img [ref=e91]
            - generic [ref=e101]: AI Engine
          - button "Order Management" [ref=e102] [cursor=pointer]:
            - img [ref=e103]
            - generic [ref=e106]: Order Management
          - button "Trade History" [ref=e107] [cursor=pointer]:
            - img [ref=e108]
            - generic [ref=e112]: Trade History
          - button "Risk Monitor 1" [ref=e113] [cursor=pointer]:
            - img [ref=e114]
            - generic [ref=e116]: Risk Monitor
            - generic [ref=e117]: "1"
          - button "Backtesting" [ref=e118] [cursor=pointer]:
            - img [ref=e119]
            - generic [ref=e121]: Backtesting
          - button "System Health" [ref=e122] [cursor=pointer]:
            - img [ref=e123]
            - generic [ref=e126]: System Health
          - button "Broker Demo" [ref=e127] [cursor=pointer]:
            - img [ref=e128]
            - generic [ref=e133]: Broker Demo
          - button "Settings" [ref=e134] [cursor=pointer]:
            - img [ref=e135]
            - generic [ref=e138]: Settings
    - generic [ref=e139]:
      - generic [ref=e140]:
        - img [ref=e141]
        - generic [ref=e145]: Sim Feed
      - generic [ref=e146]:
        - generic [ref=e147]:
          - img [ref=e149]
          - generic [ref=e152]:
            - paragraph [ref=e153]: kittipong.fx
            - paragraph [ref=e154]: Demo Account
        - button "Sign out" [ref=e155] [cursor=pointer]:
          - img [ref=e156]
  - generic [ref=e159]:
    - banner [ref=e160]:
      - generic [ref=e161]:
        - heading "Dashboard" [level=1] [ref=e162]
        - paragraph [ref=e163]: Tuesday, April 28, 2026
      - generic [ref=e164]:
        - button "News" [ref=e165] [cursor=pointer]:
          - img [ref=e166]
          - generic [ref=e169]: News
        - generic [ref=e172]: Live
        - button [ref=e173] [cursor=pointer]:
          - img [ref=e174]
    - main [ref=e178]:
      - generic [ref=e179]:
        - generic [ref=e180]:
          - generic [ref=e181]:
            - img [ref=e183]
            - generic [ref=e189]:
              - paragraph [ref=e190]: Data Feed
              - paragraph [ref=e191]: connected
          - generic [ref=e193]:
            - img [ref=e195]
            - generic [ref=e197]:
              - paragraph [ref=e198]: Tick Rate
              - paragraph [ref=e199]: 0 total
          - generic [ref=e200]:
            - img [ref=e202]
            - generic [ref=e205]:
              - paragraph [ref=e206]: Open Orders
              - paragraph [ref=e207]: "0"
          - generic [ref=e208]:
            - img [ref=e210]
            - generic [ref=e212]:
              - paragraph [ref=e213]: Fill Rate
              - paragraph [ref=e214]: —
        - generic [ref=e215]:
          - generic [ref=e216]:
            - generic [ref=e217]:
              - paragraph [ref=e218]: Account Balance
              - img [ref=e220]
            - paragraph [ref=e222]: $0.00
            - generic [ref=e223]:
              - paragraph [ref=e224]: IC Markets Demo
              - generic [ref=e225]: ▲ +$0.00 today
          - generic [ref=e226]:
            - generic [ref=e227]:
              - paragraph [ref=e228]: Daily P&L
              - img [ref=e230]
            - paragraph [ref=e233]: +$0.00
            - generic [ref=e234]:
              - paragraph [ref=e235]: "Target: +$0.00"
              - generic [ref=e236]: ▲ 0.00%
          - generic [ref=e237]:
            - generic [ref=e238]:
              - paragraph [ref=e239]: Open P&L
              - img [ref=e241]
            - paragraph [ref=e243]: +$0.00
            - paragraph [ref=e245]: 0 positions open
          - generic [ref=e246]:
            - generic [ref=e247]:
              - paragraph [ref=e248]: Drawdown
              - img [ref=e250]
            - paragraph [ref=e252]: 0.00%
            - paragraph [ref=e254]: "Max allowed: 5.00%"
        - generic [ref=e255]:
          - generic [ref=e256]:
            - generic [ref=e257]:
              - generic [ref=e258]:
                - heading "Equity Curve" [level=2] [ref=e259]
                - paragraph [ref=e260]: 30-day balance history
              - generic [ref=e261]:
                - generic [ref=e262]:
                  - text: "Start:"
                  - generic [ref=e263]: $—
                - generic [ref=e264]:
                  - text: "Now:"
                  - generic [ref=e265]: $0
            - generic [ref=e267]: No data yet
            - generic [ref=e268]:
              - generic [ref=e269]:
                - paragraph [ref=e270]: Total P&L
                - paragraph [ref=e271]: +$0
              - generic [ref=e272]:
                - paragraph [ref=e273]: Strategies
                - paragraph [ref=e274]: "0"
              - generic [ref=e275]:
                - paragraph [ref=e276]: Avg Win Rate
                - paragraph [ref=e277]: 0.0%
              - generic [ref=e278]:
                - paragraph [ref=e279]: Total Trades
                - paragraph [ref=e280]: "0"
          - generic [ref=e281]:
            - heading "Strategy Bots" [level=2] [ref=e282]
            - paragraph [ref=e284]: No strategies found
        - generic [ref=e285]:
          - generic [ref=e286]:
            - generic [ref=e287]:
              - heading "Open Positions" [level=2] [ref=e288]
              - generic [ref=e289]: 0 active
            - paragraph [ref=e291]: No open positions
          - generic [ref=e292]:
            - heading "Account Overview" [level=2] [ref=e293]
            - generic [ref=e294]:
              - generic [ref=e295]:
                - paragraph [ref=e296]: Equity
                - paragraph [ref=e297]: $0.00
              - generic [ref=e298]:
                - paragraph [ref=e299]: Margin Used
                - paragraph [ref=e300]: $0.00
              - generic [ref=e301]:
                - paragraph [ref=e302]: Free Margin
                - paragraph [ref=e303]: $0.00
              - generic [ref=e304]:
                - paragraph [ref=e305]: Peak Balance
                - paragraph [ref=e306]: $0.00
              - generic [ref=e307]:
                - paragraph [ref=e308]: Active Bots
                - paragraph [ref=e309]: "0"
              - generic [ref=e310]:
                - paragraph [ref=e311]: Paused Bots
                - paragraph [ref=e312]: "0"
            - generic [ref=e313]:
              - paragraph [ref=e314]: Account Drawdown Gauge
              - generic [ref=e316]:
                - generic [ref=e317]: "Current: 0.00%"
                - generic [ref=e318]: "Limit: 5%"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | 
  3   | test('Setup: Create and confirm user account', async ({ page, context }) => {
  4   |   // Navigate to login page
  5   |   await page.goto('http://localhost:5173')
  6   |   await page.waitForSelector('input[type="email"]', { timeout: 10000 })
  7   | 
  8   |   const email = 'kittipong.fx@gmail.com'
  9   |   const password = '@Fusion1988'
  10  | 
  11  |   console.log(`📝 Attempting to sign up ${email}...`)
  12  | 
  13  |   // Fill sign up fields
  14  |   await page.fill('input[type="email"]', email)
  15  |   await page.fill('input[type="password"]', password)
  16  | 
  17  |   // Click sign up button (should toggle to signup mode first if needed)
  18  |   const signInButton = page.locator('button:has-text("Sign In")')
  19  |   const isVisible = await signInButton.isVisible()
  20  | 
  21  |   if (isVisible) {
  22  |     // If we see "Sign In", we need to find the signup toggle or link
  23  |     const toggleLink = page.locator('a, button:has-text("Sign up"), [role="button"]:has-text("Create")')
  24  |     if (await toggleLink.first().isVisible()) {
  25  |       await toggleLink.first().click()
  26  |       await page.waitForTimeout(500)
  27  |     }
  28  |   }
  29  | 
  30  |   // Fill credentials again in case form reset
  31  |   await page.fill('input[type="email"]', email)
  32  |   await page.fill('input[type="password"]', password)
  33  | 
  34  |   // Click sign up button
  35  |   const submitButton = page.locator('button').filter({ hasText: /Sign Up|Sign In/ }).first()
  36  |   await submitButton.click()
  37  | 
  38  |   // Wait for response or error
  39  |   await page.waitForTimeout(3000)
  40  | 
  41  |   // Check for error message
  42  |   const errorElement = page.locator('[role="alert"], .text-red-500').first()
  43  |   const hasError = await errorElement.isVisible().catch(() => false)
  44  | 
  45  |   if (hasError) {
  46  |     const errorText = await errorElement.textContent()
  47  |     console.log(`⚠️  Response: ${errorText}`)
  48  |   } else {
  49  |     console.log(`✅ Sign up request completed`)
  50  |   }
  51  | 
  52  |   // Now try to confirm the email via the edge function
  53  |   console.log(`📧 Confirming email via edge function...`)
  54  |   const confirmResponse = await context.request.post(
  55  |     'https://pmwlukvixofqqjehlokj.supabase.co/functions/v1/confirm-user-email',
  56  |     {
  57  |       data: { email },
  58  |       headers: {
  59  |         'Content-Type': 'application/json',
  60  |         'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtd2x1a3ZpeG9mcXFqZWhsb2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDczODUsImV4cCI6MjA5Mjg4MzM4NX0.IGrvvmUujFuXZI85CYO-GYRUXQxS6jzo76TDM6WQUyU`,
  61  |       },
  62  |     }
  63  |   )
  64  | 
  65  |   const confirmStatus = confirmResponse.status()
  66  |   const confirmData = await confirmResponse.json()
  67  | 
  68  |   if (confirmStatus === 200) {
  69  |     console.log(`✅ Email confirmed via function`)
  70  |   } else {
  71  |     console.log(`⚠️  Confirmation status: ${confirmStatus}`, confirmData)
  72  |   }
  73  | 
  74  |   // Try to log in
  75  |   console.log(`🔐 Attempting login...`)
  76  |   await page.goto('http://localhost:5173')
> 77  |   await page.waitForSelector('input[type="email"]', { timeout: 10000 })
      |              ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  78  | 
  79  |   await page.fill('input[type="email"]', email)
  80  |   await page.fill('input[type="password"]', password)
  81  | 
  82  |   const loginButton = page.locator('button:has-text("Sign In")').first()
  83  |   await loginButton.click()
  84  | 
  85  |   // Wait for navigation or error
  86  |   const navigationPromise = page.waitForNavigation().catch(() => null)
  87  |   const errorPromise = page.waitForSelector('[role="alert"], .text-red-500', { timeout: 5000 }).catch(() => null)
  88  | 
  89  |   const [navResult, errorResult] = await Promise.all([navigationPromise, errorPromise])
  90  | 
  91  |   if (errorResult) {
  92  |     const errorText = await page.locator('[role="alert"], .text-red-500').first().textContent()
  93  |     console.log(`❌ Login error: ${errorText}`)
  94  |   } else if (navResult) {
  95  |     console.log(`✅ Login successful - navigated to ${page.url()}`)
  96  |   } else {
  97  |     console.log(`⏳ Login may be hanging or pending`)
  98  |   }
  99  | 
  100 |   // Check for dashboard
  101 |   const dashboardVisible = await page.locator('[data-testid="dashboard"]').isVisible().catch(() => false)
  102 |   console.log(`Dashboard visible: ${dashboardVisible}`)
  103 | })
  104 | 
```
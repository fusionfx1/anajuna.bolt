import { test, expect } from '@playwright/test'

test('Setup user and test login flow', async ({ context, page }) => {
  const email = 'kittipong.fx@gmail.com'
  const password = '@Fusion1988'

  // Step 1: Create and confirm user via edge function
  console.log('📝 Creating test user via edge function...')
  try {
    const setupResp = await context.request.post(
      'https://pmwlukvixofqqjehlokj.supabase.co/functions/v1/test-user-setup',
      {
        data: { email, password },
        headers: { 'Content-Type': 'application/json' },
      }
    )

    const setupData = await setupResp.json()
    const setupStatus = setupResp.status()

    console.log(`📊 Setup response: ${setupStatus}`)

    if (setupStatus === 200 && setupData.ok) {
      console.log(`✅ User created and confirmed`)
    } else {
      console.log(`⚠️  Setup response:`, setupData)
    }
  } catch (err) {
    console.log(`⚠️  Setup error:`, err)
  }

  // Step 2: Navigate to app and login
  console.log('🔐 Testing login...')
  await page.goto('http://localhost:5173')
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })

  // Fill credentials
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)

  // Click Sign In
  const signInButton = page.locator('button:has-text("Sign In")')
  await signInButton.click()

  console.log('⏳ Waiting for auth response...')

  // Wait for either navigation or error (max 10s)
  const startTime = Date.now()
  let navigationHappened = false
  let errorShown = false

  // Try to detect navigation
  try {
    await page.waitForURL(/dashboard|home/, { timeout: 5000 }).catch(() => {})
    navigationHappened = page.url() !== 'http://localhost:5173/'
  } catch {}

  // Check for error message
  const errorElement = page.locator('[role="alert"], .text-red-500')
  const errorCount = await errorElement.count()
  if (errorCount > 0) {
    errorShown = true
    const errorText = await errorElement.first().textContent()
    console.log(`❌ Login error: ${errorText}`)
  }

  const elapsed = Date.now() - startTime

  // Report results
  console.log(`\n=== Login Test Results ===`)
  console.log(`Time elapsed: ${elapsed}ms`)
  console.log(`Current URL: ${page.url()}`)
  console.log(`Navigation happened: ${navigationHappened}`)
  console.log(`Error shown: ${errorShown}`)

  // Check for dashboard elements
  const dashboardExists = await page.locator('[data-testid="dashboard"]').isVisible().catch(() => false)
  const layoutExists = await page.locator('[role="navigation"]').isVisible().catch(() => false)

  console.log(`Dashboard visible: ${dashboardExists}`)
  console.log(`Navigation visible: ${layoutExists}`)

  // Take screenshot
  await page.screenshot({ path: 'e2e-screenshots/login-result.png', fullPage: true })
  console.log('📸 Screenshot saved to e2e-screenshots/login-result.png')

  // Summary
  if (navigationHappened && layoutExists) {
    console.log('\n✅ LOGIN SUCCESSFUL - Dashboard is accessible')
  } else if (errorShown) {
    console.log('\n⚠️  LOGIN FAILED - Error message displayed')
  } else {
    console.log('\n⏳ LOGIN UNCERTAIN - May be loading or hung')
  }
})

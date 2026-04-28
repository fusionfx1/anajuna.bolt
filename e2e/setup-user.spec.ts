import { test, expect } from '@playwright/test'

test('Setup: Create and confirm user account', async ({ page, context }) => {
  // Navigate to login page
  await page.goto('http://localhost:5173')
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })

  const email = 'kittipong.fx@gmail.com'
  const password = '@Fusion1988'

  console.log(`📝 Attempting to sign up ${email}...`)

  // Fill sign up fields
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)

  // Click sign up button (should toggle to signup mode first if needed)
  const signInButton = page.locator('button:has-text("Sign In")')
  const isVisible = await signInButton.isVisible()

  if (isVisible) {
    // If we see "Sign In", we need to find the signup toggle or link
    const toggleLink = page.locator('a, button:has-text("Sign up"), [role="button"]:has-text("Create")')
    if (await toggleLink.first().isVisible()) {
      await toggleLink.first().click()
      await page.waitForTimeout(500)
    }
  }

  // Fill credentials again in case form reset
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)

  // Click sign up button
  const submitButton = page.locator('button').filter({ hasText: /Sign Up|Sign In/ }).first()
  await submitButton.click()

  // Wait for response or error
  await page.waitForTimeout(3000)

  // Check for error message
  const errorElement = page.locator('[role="alert"], .text-red-500').first()
  const hasError = await errorElement.isVisible().catch(() => false)

  if (hasError) {
    const errorText = await errorElement.textContent()
    console.log(`⚠️  Response: ${errorText}`)
  } else {
    console.log(`✅ Sign up request completed`)
  }

  // Now try to confirm the email via the edge function
  console.log(`📧 Confirming email via edge function...`)
  const confirmResponse = await context.request.post(
    'https://pmwlukvixofqqjehlokj.supabase.co/functions/v1/confirm-user-email',
    {
      data: { email },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtd2x1a3ZpeG9mcXFqZWhsb2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDczODUsImV4cCI6MjA5Mjg4MzM4NX0.IGrvvmUujFuXZI85CYO-GYRUXQxS6jzo76TDM6WQUyU`,
      },
    }
  )

  const confirmStatus = confirmResponse.status()
  const confirmData = await confirmResponse.json()

  if (confirmStatus === 200) {
    console.log(`✅ Email confirmed via function`)
  } else {
    console.log(`⚠️  Confirmation status: ${confirmStatus}`, confirmData)
  }

  // Try to log in
  console.log(`🔐 Attempting login...`)
  await page.goto('http://localhost:5173')
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })

  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)

  const loginButton = page.locator('button:has-text("Sign In")').first()
  await loginButton.click()

  // Wait for navigation or error
  const navigationPromise = page.waitForNavigation().catch(() => null)
  const errorPromise = page.waitForSelector('[role="alert"], .text-red-500', { timeout: 5000 }).catch(() => null)

  const [navResult, errorResult] = await Promise.all([navigationPromise, errorPromise])

  if (errorResult) {
    const errorText = await page.locator('[role="alert"], .text-red-500').first().textContent()
    console.log(`❌ Login error: ${errorText}`)
  } else if (navResult) {
    console.log(`✅ Login successful - navigated to ${page.url()}`)
  } else {
    console.log(`⏳ Login may be hanging or pending`)
  }

  // Check for dashboard
  const dashboardVisible = await page.locator('[data-testid="dashboard"]').isVisible().catch(() => false)
  console.log(`Dashboard visible: ${dashboardVisible}`)
})

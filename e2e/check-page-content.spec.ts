import { test } from '@playwright/test'

test('Check page content', async ({ page, context }) => {
  // Enable dev mode
  await context.addInitScript(() => {
    localStorage.setItem('devMode', 'true')
  })

  await page.goto('http://localhost:5173')

  // Wait a bit for page to render
  await page.waitForTimeout(3000)

  // Get page content
  const html = await page.content()
  const title = await page.title()

  console.log(`\n=== Page Check ===`)
  console.log(`Title: ${title}`)
  console.log(`URL: ${page.url()}`)

  // Check for login screen
  const hasLoginForm = html.includes('Sign in to your account') || html.includes('Sign In')
  console.log(`\nHas login form: ${hasLoginForm}`)

  // Check for dashboard elements
  const hasLayout = html.includes('<Layout') || html.includes('role="navigation"')
  const hasDashboard = html.includes('Dashboard') || html.includes('data-testid')
  console.log(`Has layout: ${hasLayout}`)
  console.log(`Has dashboard: ${hasDashboard}`)

  // List all buttons
  const buttons = await page.locator('button').allTextContents()
  console.log(`\nButtons found (${buttons.length}):`)
  buttons.slice(0, 10).forEach(b => console.log(`  ${b.trim()}`))

  // Check body classes
  const bodyClass = await page.locator('body').getAttribute('class')
  console.log(`\nBody class: ${bodyClass}`)

  // Take screenshot
  await page.screenshot({ path: 'e2e-screenshots/page-check.png', fullPage: true })
  console.log(`Screenshot saved`)
})

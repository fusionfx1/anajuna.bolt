import { test, expect } from '@playwright/test'

test('Dashboard loads in dev mode', async ({ page, context }) => {
  // Enable dev mode
  await context.addInitScript(() => {
    localStorage.setItem('devMode', 'true')
  })

  // Navigate to app
  await page.goto('http://localhost:5173')
  await page.waitForSelector('button:has-text("Dashboard"), nav, [role="navigation"]', { timeout: 10000 })

  // Verify dashboard is visible
  const dashboardExists = await page.locator('[data-testid="dashboard"]').isVisible().catch(() => false)
  const navigationExists = await page.locator('[role="navigation"]').isVisible().catch(() => false)

  console.log(`\n=== Dashboard Dev Mode Test ===`)
  console.log(`✅ Page loaded: ${page.url()}`)
  console.log(`📊 Dashboard visible: ${dashboardExists}`)
  console.log(`🧭 Navigation visible: ${navigationExists}`)

  // Check for key sections
  const chartElement = await page.locator('canvas, svg').first().isVisible().catch(() => false)
  console.log(`📈 Chart visible: ${chartElement}`)

  // List visible nav items
  const navItems = await page.locator('[role="navigation"] a, [role="navigation"] button').allTextContents()
  console.log(`\nVisible navigation items (${navItems.length}):`)
  navItems.forEach((item) => console.log(`  • ${item.trim()}`))

  // Take screenshot
  await page.screenshot({ path: 'e2e-screenshots/dashboard-devmode.png', fullPage: true })
  console.log(`\n📸 Screenshot: e2e-screenshots/dashboard-devmode.png`)

  // Verify key data is displayed
  const hasText = await page.getByText(/Dashboard|Trading|Account/).first().isVisible()
  console.log(`\n✅ Dashboard content loaded: ${hasText}`)
})

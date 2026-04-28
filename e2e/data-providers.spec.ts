import { test, expect } from '@playwright/test'

test.describe('Data Providers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173')
  })

  test('navigates to settings and configures EODHD API key', async ({ page }) => {
    await page.click('a:has-text("Settings")')
    await page.waitForURL('**/settings')

    const eodhd_input = page.locator('input[placeholder*="EODHD"]').first()
    await eodhd_input.fill('test-api-key-12345')

    const test_button = page
      .locator('button:has-text("Test Connection")')
      .first()
    await test_button.click()

    await page.waitForTimeout(2000)
    const result = page.locator('text=Connected|Failed')
    await expect(result.first()).toBeVisible()
  })

  test('configures cache settings', async ({ page }) => {
    await page.click('a:has-text("Settings")')
    await page.waitForURL('**/settings')

    const enable_cache = page.locator('input[type="checkbox"]').first()
    await enable_cache.check()

    const ttl_input = page.locator('input[type="number"]')
    await ttl_input.fill('45')

    const load_cache_btn = page.locator('button:has-text("Load Cache Info")')
    await load_cache_btn.click()

    await page.waitForTimeout(1000)
    const cache_info = page.locator('text=Entries:|Size:|Oldest:|Newest:')
    await expect(cache_info.first()).toBeVisible({ timeout: 5000 })
  })

  test('clears cache with confirmation', async ({ page }) => {
    await page.click('a:has-text("Settings")')
    await page.waitForURL('**/settings')

    page.once('dialog', (dialog) => {
      dialog.accept()
    })

    const clear_btn = page.locator('button:has-text("Clear All Cache")')
    await clear_btn.click()

    const success_msg = page.locator('text=Cache cleared successfully')
    await expect(success_msg).toBeVisible({ timeout: 5000 })
  })

  test('selects data provider for backtest', async ({ page }) => {
    await page.click('a:has-text("Backtesting")')
    await page.waitForURL('**/backtesting')

    const provider_dropdown = page.locator('select').first()
    await provider_dropdown.selectOption('tiingo')

    const selected_value = await provider_dropdown.inputValue()
    expect(selected_value).toBe('tiingo')
  })

  test('enables comparison mode', async ({ page }) => {
    await page.click('a:has-text("Backtesting")')
    await page.waitForURL('**/backtesting')

    const compare_checkbox = page
      .locator('input[type="checkbox"]')
      .filter({ hasText: 'Compare All Providers' })
    await compare_checkbox.check()

    const info_banner = page.locator('text=Comparison mode will run')
    await expect(info_banner).toBeVisible()
  })

  test('toggles cache vs force refresh', async ({ page }) => {
    await page.click('a:has-text("Backtesting")')
    await page.waitForURL('**/backtesting')

    const use_cache_btn = page.locator('button:has-text("Use Cache")').first()
    const force_refresh_btn = page
      .locator('button:has-text("Force Refresh")')
      .first()

    await use_cache_btn.click()
    const use_cache_style = await use_cache_btn.getAttribute('class')
    expect(use_cache_style).toContain('bg-blue-500')

    await force_refresh_btn.click()
    const force_refresh_style = await force_refresh_btn.getAttribute('class')
    expect(force_refresh_style).toContain('bg-amber-500')
  })

  test('displays comparison results with side-by-side metrics', async ({
    page,
  }) => {
    await page.click('a:has-text("Backtesting")')
    await page.waitForURL('**/backtesting')

    const run_button = page.locator('button:has-text("Run Backtest")')
    const is_visible = await run_button.isVisible()

    if (is_visible) {
      await run_button.click()
      await page.waitForTimeout(5000)

      const comparison_cards = page.locator('[class*="border rounded-lg p-4"]')
      const count = await comparison_cards.count()
      expect(count).toBeGreaterThan(0)

      const metrics = page.locator('text=Return|Sharpe|Max Drawdown|Win Rate')
      await expect(metrics.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('highlights highest sharpe ratio provider', async ({ page }) => {
    await page.click('a:has-text("Backtesting")')
    await page.waitForURL('**/backtesting')

    const run_button = page.locator('button:has-text("Run Backtest")')
    const is_visible = await run_button.isVisible()

    if (is_visible) {
      await run_button.click()
      await page.waitForTimeout(5000)

      const highlighted = page.locator('[class*="bg-green-50"]')
      await expect(highlighted.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('displays cache status for each provider', async ({ page }) => {
    await page.click('a:has-text("Backtesting")')
    await page.waitForURL('**/backtesting')

    const run_button = page.locator('button:has-text("Run Backtest")')
    const is_visible = await run_button.isVisible()

    if (is_visible) {
      await run_button.click()
      await page.waitForTimeout(5000)

      const cache_status = page.locator('text=From cache|Fresh API call|Deterministic')
      await expect(cache_status.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('shows candle count in comparison results', async ({ page }) => {
    await page.click('a:has-text("Backtesting")')
    await page.waitForURL('**/backtesting')

    const run_button = page.locator('button:has-text("Run Backtest")')
    const is_visible = await run_button.isVisible()

    if (is_visible) {
      await run_button.click()
      await page.waitForTimeout(5000)

      const candle_count = page.locator('text=candles loaded')
      await expect(candle_count.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('displays insight summary for multiple providers', async ({ page }) => {
    await page.click('a:has-text("Backtesting")')
    await page.waitForURL('**/backtesting')

    const run_button = page.locator('button:has-text("Run Backtest")')
    const is_visible = await run_button.isVisible()

    if (is_visible) {
      await run_button.click()
      await page.waitForTimeout(5000)

      const insight = page.locator('[class*="bg-blue-50"] h4:has-text("Insight")')
      await expect(insight.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('shows data source notes', async ({ page }) => {
    await page.click('a:has-text("Backtesting")')
    await page.waitForURL('**/backtesting')

    const run_button = page.locator('button:has-text("Run Backtest")')
    const is_visible = await run_button.isVisible()

    if (is_visible) {
      await run_button.click()
      await page.waitForTimeout(5000)

      const eodhd_note = page.locator('text=EOD Historical Data')
      const tiingo_note = page.locator('text=Tiingo API')
      const synthetic_note = page.locator('text=Generated data')

      await expect(eodhd_note).toBeVisible({ timeout: 5000 })
      await expect(tiingo_note).toBeVisible({ timeout: 5000 })
      await expect(synthetic_note).toBeVisible({ timeout: 5000 })
    }
  })
})

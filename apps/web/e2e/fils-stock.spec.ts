import { test, expect, type Page } from '@playwright/test'
import { installMockApi, FIXED_TIME, type MockApi } from './support/mock-api'

let mock: MockApi

test.beforeEach(async ({ page }) => {
  mock = await installMockApi(page)
  await page.clock.setFixedTime(FIXED_TIME)
  await page.goto('/fils/stock')
  await expect(page.locator('tr[data-stock-row]').first()).toBeVisible()
})

test.afterEach(() => {
  expect(mock.unmatched).toEqual([])
})

async function openDrawer(page: Page) {
  await page.locator('tr[data-stock-row]').first().click()
  await expect(page.getByRole('button', { name: 'Modifier' })).toBeVisible()
  // Drawer body content (detail fixture) rendered
  await expect(page.getByText('Provenance')).toBeVisible()
}

test('table-default', async ({ page }) => {
  await expect(page).toHaveScreenshot('table-default.png')
})

test('drawer-view', async ({ page }) => {
  await openDrawer(page)
  await expect(page).toHaveScreenshot('drawer-view.png')
})

test('drawer-edit', async ({ page }) => {
  await openDrawer(page)
  await page.getByRole('button', { name: 'Modifier' }).click()
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible()
  await expect(page).toHaveScreenshot('drawer-edit.png')
})

test('dialog-new', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920', 'one desktop viewport is enough')
  await page.getByRole('button', { name: 'Nouveau' }).click()
  await expect(page.getByText('Nouveau lot de fil')).toBeVisible()
  await expect(page).toHaveScreenshot('dialog-new.png')
})

test('table-filtered', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920', 'one desktop viewport is enough')
  await page.getByPlaceholder(/Rechercher/).fill('DEFIBER')
  await expect(page).toHaveScreenshot('table-filtered.png')
})

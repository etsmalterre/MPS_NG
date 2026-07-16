import { test, expect } from '@playwright/test'
import { installMockApi, FIXED_TIME, type MockApi } from './support/mock-api'

// Runs only on the < md (768px) projects — see playwright.config.ts testMatch.
// Below md the table is display:none and the card list takes over.

let mock: MockApi

test.beforeEach(async ({ page }) => {
  mock = await installMockApi(page)
  await page.clock.setFixedTime(FIXED_TIME)
  await page.goto('/fils/stock')
  await expect(page.locator('div[data-stock-row]').first()).toBeVisible()
})

test.afterEach(() => {
  expect(mock.unmatched).toEqual([])
})

test('cards-default', async ({ page }) => {
  // The table is hidden below md; the card list renders the same rows.
  await expect(page.locator('tr[data-stock-row]').first()).toBeHidden()
  await expect(page).toHaveScreenshot('cards-default.png')
})

test('mobile-sort', async ({ page }) => {
  // Switch the sort key via the popover, then flip direction.
  await page.getByRole('button', { name: 'Date entrée' }).click()
  await page.getByRole('button', { name: 'Référence', exact: true }).click()
  await page.getByTitle('Tri décroissant').click()
  await expect(page.getByTitle('Tri croissant')).toBeVisible()
  await expect(page).toHaveScreenshot('cards-sorted-ref-asc.png')
})

test('drawer-mobile', async ({ page }) => {
  await page.locator('div[data-stock-row]').first().click()
  await expect(page.getByRole('button', { name: 'Modifier' })).toBeVisible()
  await expect(page.getByText('Provenance')).toBeVisible()
  await expect(page).toHaveScreenshot('drawer-mobile.png')
  // The mobile X closes the drawer (no "outside" left to tap at full width).
  await page.getByTitle('Fermer').click()
  await expect(page.getByRole('button', { name: 'Modifier' })).toBeHidden()
})

test('dialog-new-mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'fold-cover-345', 'narrowest viewport is the stress case')
  await page.getByRole('button', { name: 'Nouveau' }).click()
  await expect(page.getByText('Nouveau lot de fil')).toBeVisible()
  await expect(page).toHaveScreenshot('dialog-new-mobile.png')
})

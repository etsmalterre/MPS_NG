import { test, expect, type Page } from '@playwright/test'
import { installMockApi, FIXED_TIME, type MockApi } from './support/mock-api'

// NOTE: "Modifier" exists twice on this screen — the toolbar's edit-mode
// toggle (first in DOM) and the drawer's gold edit button (last in DOM).
// Use .first() / .last() accordingly.

let mock: MockApi

test.beforeEach(async ({ page }) => {
  mock = await installMockApi(page)
  await page.clock.setFixedTime(FIXED_TIME)
  await page.goto('/finis/stock')
  await expect(page.locator('tr[data-stock-row]').first()).toBeVisible()
})

test.afterEach(() => {
  expect(mock.unmatched).toEqual([])
})

async function openDrawer(page: Page) {
  await page.locator('tr[data-stock-row]').first().click()
  await expect(page.getByTitle("Imprimer l'étiquette")).toBeVisible()
  await expect(page.getByText('Provenance')).toBeVisible()
}

test('table-default', async ({ page }) => {
  await expect(page).toHaveScreenshot('fini-table-default.png')
})

test('drawer-view', async ({ page }) => {
  await openDrawer(page)
  await expect(page).toHaveScreenshot('fini-drawer-view.png')
})

test('drawer-edit', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920', 'one desktop viewport is enough')
  await openDrawer(page)
  await page.getByRole('button', { name: 'Modifier' }).last().click()
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible()
  await expect(page).toHaveScreenshot('fini-drawer-edit.png')
})

test('edit-multiselect', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920', 'one desktop viewport is enough')
  await page.getByRole('button', { name: 'Modifier' }).first().click()
  await expect(page.getByText('Mode édition')).toBeVisible()
  await page.locator('tr[data-stock-row]').nth(0).click()
  await page.locator('tr[data-stock-row]').nth(1).click()
  await expect(page.getByText('sélectionnés')).toBeVisible()
  await expect(page).toHaveScreenshot('fini-edit-multiselect.png')
})

test('dialog-new', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920', 'one desktop viewport is enough')
  await page.getByRole('button', { name: 'Nouveau' }).click()
  await expect(page.getByText('Nouveau rouleau fini')).toBeVisible()
  await expect(page).toHaveScreenshot('fini-dialog-new.png')
})

test('table-filtered', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920', 'one desktop viewport is enough')
  await page.getByPlaceholder(/Rechercher/).fill('029A')
  await expect(page).toHaveScreenshot('fini-table-filtered.png')
})

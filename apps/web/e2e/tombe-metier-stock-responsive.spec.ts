import { test, expect } from '@playwright/test'
import { installMockApi, FIXED_TIME, type MockApi } from './support/mock-api'

// Runs only on the < md (768px) projects — see playwright.config.ts testMatch.

let mock: MockApi

test.beforeEach(async ({ page }) => {
  mock = await installMockApi(page)
  await page.clock.setFixedTime(FIXED_TIME)
  await page.goto('/tombe-metier/stock')
  await expect(page.locator('div[data-stock-row]').first()).toBeVisible()
})

test.afterEach(() => {
  expect(mock.unmatched).toEqual([])
})

test('ecru-cards-default', async ({ page }) => {
  await expect(page.locator('tr[data-stock-row]').first()).toBeHidden()
  await expect(page).toHaveScreenshot('ecru-cards-default.png')
})

test('ecru-mobile-sort', async ({ page }) => {
  await page.getByRole('button', { name: 'Date saisie' }).click()
  await page.getByRole('button', { name: 'Poids', exact: true }).click()
  await page.getByTitle('Tri décroissant').click()
  await expect(page.getByTitle('Tri croissant')).toBeVisible()
  await expect(page).toHaveScreenshot('ecru-cards-sorted-poids-asc.png')
})

test('ecru-drawer-mobile', async ({ page }) => {
  await page.locator('div[data-stock-row]').first().click()
  await expect(page.getByText('Réservation client')).toBeVisible()
  await expect(page.getByText('Provenance')).toBeVisible()
  await expect(page).toHaveScreenshot('ecru-drawer-mobile.png')
  await page.getByTitle('Fermer').click()
  await expect(page.getByText('Réservation client')).toBeHidden()
})

test('ecru-edit-multiselect-mobile', async ({ page }) => {
  // Enter edit mode from the toolbar, tap two cards, check the selection summary.
  await page.getByRole('button', { name: 'Modifier' }).first().click()
  await expect(page.getByText('Mode édition')).toBeVisible()
  await page.locator('div[data-stock-row]').nth(0).click()
  await page.locator('div[data-stock-row]').nth(1).click()
  await expect(page.getByText('sélectionnées')).toBeVisible()
  await expect(page).toHaveScreenshot('ecru-edit-multiselect-mobile.png')
})

test('ecru-dialog-new-mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'fold-cover-345', 'narrowest viewport is the stress case')
  await page.getByRole('button', { name: 'Nouveau' }).click()
  await expect(page.getByText('Nouveau rouleau écru')).toBeVisible()
  await expect(page).toHaveScreenshot('ecru-dialog-new-mobile.png')
})

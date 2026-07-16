import type { Page } from '@playwright/test'
import authMe from '../fixtures/auth-me.json' with { type: 'json' }
import permissionsMe from '../fixtures/permissions-me.json' with { type: 'json' }
import stockFil from '../fixtures/stock-fil.json' with { type: 'json' }
import stockFilAll from '../fixtures/stock-fil-all.json' with { type: 'json' }
import stockFilDetail1783 from '../fixtures/stock-fil-detail-1783.json' with { type: 'json' }
import fournisseurs from '../fixtures/fournisseurs.json' with { type: 'json' }

const stockDetails: Record<string, unknown> = {
  '1783': stockFilDetail1783,
}

export interface MockApi {
  /** Requests that hit no fixture — assert empty in afterEach so gaps fail loudly. */
  unmatched: string[]
}

/**
 * Intercepts every /api/ request and serves fixture JSON. Anything without a
 * fixture is fulfilled 500 and recorded in `unmatched`, so a screenshot can
 * never silently include a broken-fetch state.
 */
export async function installMockApi(page: Page): Promise<MockApi> {
  const unmatched: string[] = []
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const json = (body: unknown) => route.fulfill({ json: body })

    if (url.pathname === '/api/auth/me') return json(authMe)
    if (url.pathname === '/api/permissions/me') return json(permissionsMe)
    if (url.pathname === '/api/stock/fil') {
      return json(url.searchParams.get('termine') === 'all' ? stockFilAll : stockFil)
    }
    const detail = url.pathname.match(/^\/api\/stock\/fil\/(\d+)$/)
    if (detail && stockDetails[detail[1]]) return json(stockDetails[detail[1]])
    if (url.pathname === '/api/fournisseurs') return json(fournisseurs)

    unmatched.push(`${route.request().method()} ${url.pathname}${url.search}`)
    return route.fulfill({ status: 500, json: { error: 'e2e: unmocked endpoint' } })
  })
  return { unmatched }
}

/** Freeze Date.now() — ageDays() and todayInputDate() would drift daily otherwise. */
export const FIXED_TIME = new Date('2026-07-16T10:00:00')

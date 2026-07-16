import type { Page } from '@playwright/test'
import authMe from '../fixtures/auth-me.json' with { type: 'json' }
import permissionsMe from '../fixtures/permissions-me.json' with { type: 'json' }
import stockFil from '../fixtures/stock-fil.json' with { type: 'json' }
import stockFilAll from '../fixtures/stock-fil-all.json' with { type: 'json' }
import stockFilDetail1783 from '../fixtures/stock-fil-detail-1783.json' with { type: 'json' }
import fournisseurs from '../fixtures/fournisseurs.json' with { type: 'json' }
import stockFini from '../fixtures/stock-fini.json' with { type: 'json' }
import stockFiniAll from '../fixtures/stock-fini-all.json' with { type: 'json' }
import stockFiniDetail50366 from '../fixtures/stock-fini-detail-50366.json' with { type: 'json' }
import stockFiniProvenance50366 from '../fixtures/stock-fini-provenance-50366.json' with { type: 'json' }
import stockFiniEtats from '../fixtures/stock-fini-etats.json' with { type: 'json' }
import stockFiniRefs from '../fixtures/stock-fini-refs.json' with { type: 'json' }
import stockFiniMagasins from '../fixtures/stock-fini-magasins.json' with { type: 'json' }

const stockDetails: Record<string, unknown> = {
  '1783': stockFilDetail1783,
}

const stockFiniDetails: Record<string, unknown> = {
  '50366': stockFiniDetail50366,
}

const stockFiniProvenances: Record<string, unknown> = {
  '50366': stockFiniProvenance50366,
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

    if (url.pathname === '/api/stock/fini') {
      return json(url.searchParams.get('expedie') === 'all' ? stockFiniAll : stockFini)
    }
    if (url.pathname === '/api/stock/fini/lookups/etats') return json(stockFiniEtats)
    if (url.pathname === '/api/stock/fini/lookups/refs') return json(stockFiniRefs)
    if (url.pathname === '/api/stock/fini/lookups/magasins') return json(stockFiniMagasins)
    if (url.pathname === '/api/stock/fini/lookups/coloris') return json([])
    const finiProv = url.pathname.match(/^\/api\/stock\/fini\/(\d+)\/provenance$/)
    if (finiProv && stockFiniProvenances[finiProv[1]]) return json(stockFiniProvenances[finiProv[1]])
    const finiDetail = url.pathname.match(/^\/api\/stock\/fini\/(\d+)$/)
    if (finiDetail && stockFiniDetails[finiDetail[1]]) return json(stockFiniDetails[finiDetail[1]])

    unmatched.push(`${route.request().method()} ${url.pathname}${url.search}`)
    return route.fulfill({ status: 500, json: { error: 'e2e: unmocked endpoint' } })
  })
  return { unmatched }
}

/** Freeze Date.now() — ageDays() and todayInputDate() would drift daily otherwise. */
export const FIXED_TIME = new Date('2026-07-16T10:00:00')

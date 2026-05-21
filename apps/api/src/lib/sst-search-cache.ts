// Server-side cache for the Sous-traitants Commandes list search box.
//
// The list endpoint used to scan the whole `commande_sous_traitant` table
// (4k+ rows for "Terminées"), strip RTF on every commentaire, then filter
// in JS. That made every keystroke take 5-20 seconds.
//
// Search now resolves against in-process caches of the (small) catalog
// tables and pushes the result IDs into the main WHERE as IN-lists. Each
// catalog is loaded on demand and refreshed on a TTL. Stale labels are
// fine for narrowing search results — the user can refresh if they just
// added a brand-new ref.

import { query, fixEncoding } from './hfsql-auto.js'

const TTL_MS = 5 * 60 * 1000 // 5 min

interface CacheSnapshot {
  // Lower-cased + accent-stripped label → array of IDs (multiple rows can
  // share the same label, especially for coloris like "NOIR"). We store
  // the normalised label per row and match by substring at search time.
  rows: { id: number; norm: string }[]
}

interface CacheEntry {
  snapshot: CacheSnapshot
  expiresAt: number
}

const caches = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<CacheSnapshot>>()

// U+0300 to U+036F — Unicode "Combining Diacritical Marks" block. After
// NFD normalisation accented chars split into base + combining mark; we
// strip the combining marks so "café" matches "cafe".
const DIACRITICS_REGEX = /[̀-ͯ]/g

function normalise(s: string | null | undefined): string {
  if (!s) return ''
  return s.normalize('NFD').replace(DIACRITICS_REGEX, '').toLowerCase().trim()
}

async function loadCatalog(
  key: string,
  loader: () => Promise<{ id: number; label: string }[]>,
): Promise<CacheSnapshot> {
  const existing = caches.get(key)
  if (existing && existing.expiresAt > Date.now()) return existing.snapshot
  const pending = inflight.get(key)
  if (pending) return pending
  const promise = (async () => {
    const rows = await loader()
    const snapshot: CacheSnapshot = {
      rows: rows.map((r) => ({ id: r.id, norm: normalise(r.label) })),
    }
    caches.set(key, { snapshot, expiresAt: Date.now() + TTL_MS })
    inflight.delete(key)
    return snapshot
  })()
  inflight.set(key, promise)
  return promise
}

/** Subcontractors — small table, exact catalog. The searchable label
 *  concatenates the sst name AND its type label (Ennoblisseur / Tricoteur
 *  / Confectionneur / …) so typing a type fragment ("enn", "tric") matches
 *  every sst of that category, not just the few whose name happens to
 *  contain the type word. type_sst is loaded with a separate flat query
 *  (no JOIN) and merged in JS — the Linux iODBC bridge collapses result
 *  sets when CONVERT is combined with a JOIN. */
async function loadSousTraitants(): Promise<CacheSnapshot> {
  return loadCatalog('sous_traitant', async () => {
    const decode = (v: unknown): string => {
      if (v instanceof ArrayBuffer) return Buffer.from(v).toString('utf8')
      if (typeof v === 'string') return v
      return ''
    }
    const sstRows = await query<{ IDsous_traitant: number; nom: unknown; IDtype_sst: number | null }>(
      `SELECT IDsous_traitant, CONVERT(nom USING 'UTF-8') AS nom, IDtype_sst FROM sous_traitant`,
    )
    // `type` is an HFSQL reserved word — even when aliased back to `type`
    // the column comes back as `TYPE` in the row dict (see CLAUDE.md HFSQL
    // rules). Alias to a non-reserved name to avoid the casing flip.
    const typeRows = await query<{ IDtype_sst: number; type_label: unknown }>(
      `SELECT IDtype_sst, CONVERT(type USING 'UTF-8') AS type_label FROM type_sst`,
    )
    const typeMap = new Map<number, string>()
    for (const t of typeRows) typeMap.set(Number(t.IDtype_sst), decode(t.type_label))
    return sstRows.map((r) => {
      const nom = decode(r.nom)
      const typeLabel = typeMap.get(Number(r.IDtype_sst) || 0) ?? ''
      return {
        id: Number(r.IDsous_traitant),
        // `nom + ' ' + type` — both contribute to the normalised
        // substring index used by matchAll.
        label: typeLabel ? `${nom} ${typeLabel}` : nom,
      }
    })
  })
}

async function loadRefTable(
  table: 'ref_ecru' | 'ref_fini' | 'ref_fil',
  idCol: string,
): Promise<CacheSnapshot> {
  return loadCatalog(table, async () => {
    const rows = await query<Record<string, unknown>>(
      `SELECT ${idCol}, reference FROM ${table}`,
    )
    const fixed = await fixEncoding(rows, table, idCol, ['reference'])
    return fixed.map((r) => ({
      id: Number((r as any)[idCol]),
      label: String((r as any).reference ?? ''),
    }))
  })
}

async function loadColorisTable(
  table: 'colori_ecru' | 'ref_fini_colori',
  idCol: string,
): Promise<CacheSnapshot> {
  return loadCatalog(table, async () => {
    const rows = await query<Record<string, unknown>>(
      `SELECT ${idCol}, reference FROM ${table}`,
    )
    const fixed = await fixEncoding(rows, table, idCol, ['reference'])
    return fixed.map((r) => ({
      id: Number((r as any)[idCol]),
      label: String((r as any).reference ?? ''),
    }))
  })
}

export interface SearchHits {
  sstIds: number[]
  refEcruIds: number[]
  refFiniIds: number[]
  refFilIds: number[]
  coloriEcruIds: number[]
  refFiniColoriIds: number[]
}

const MAX_IDS_PER_CATALOG = 1000

function matchAll(rows: { id: number; norm: string }[], tokens: string[]): number[] {
  if (tokens.length === 0) return []
  const out: number[] = []
  for (const r of rows) {
    let ok = true
    for (const t of tokens) {
      if (!r.norm.includes(t)) { ok = false; break }
    }
    if (ok) {
      out.push(r.id)
      if (out.length >= MAX_IDS_PER_CATALOG) break
    }
  }
  return out
}

/** Resolve a search query against every catalog in parallel. Returns the
 *  IDs matching ALL tokens (whitespace-split). The caller folds these into
 *  the SQL `WHERE` of the main list query. */
export async function resolveSearch(q: string): Promise<SearchHits> {
  const tokens = normalise(q).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return { sstIds: [], refEcruIds: [], refFiniIds: [], refFilIds: [], coloriEcruIds: [], refFiniColoriIds: [] }
  }
  const [sst, rEcru, rFini, rFil, cEcru, cFini] = await Promise.all([
    loadSousTraitants(),
    loadRefTable('ref_ecru', 'IDref_ecru'),
    loadRefTable('ref_fini', 'IDref_fini'),
    loadRefTable('ref_fil', 'IDref_fil'),
    loadColorisTable('colori_ecru', 'IDcolori_ecru'),
    loadColorisTable('ref_fini_colori', 'IDref_fini_colori'),
  ])
  return {
    sstIds: matchAll(sst.rows, tokens),
    refEcruIds: matchAll(rEcru.rows, tokens),
    refFiniIds: matchAll(rFini.rows, tokens),
    refFilIds: matchAll(rFil.rows, tokens),
    coloriEcruIds: matchAll(cEcru.rows, tokens),
    refFiniColoriIds: matchAll(cFini.rows, tokens),
  }
}

/** Force a refresh on next read. Useful after mutations on the catalog
 *  tables (new ref, new sst, etc.) — though the 5-min TTL is forgiving
 *  enough that wiring this in is optional. */
export function invalidateSearchCache(key?: string): void {
  if (key) caches.delete(key)
  else caches.clear()
}

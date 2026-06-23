import { Router, type Request, type Response, type Router as RouterType } from 'express'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { query, fixEncoding } from '../lib/hfsql-auto.js'
import { userHasPermission } from '../lib/permissions.js'
import { isEffectiveAdmin } from '../lib/auth.js'
import { StockFiniLabelPdf, type StockFiniLabelData } from '../lib/pdf/StockFiniLabelPdf.js'

export const stockFiniRouter: RouterType = Router()

type StockFini = Record<string, unknown>

/** Escape a string for use in SQL (single quotes doubled). */
function esc(value: string): string {
  return value.replace(/'/g, "''")
}

const IS_WINDOWS = process.platform === 'win32'

/** ref_fini.archivé is accented — on Linux SELECT * returns a mangled key. */
function isArchive(row: Record<string, unknown>): boolean {
  const v = row.archivé ?? row.archiv ?? 0
  return Number(v) === 1
}

/** Emit a text value as a bridge-safe SQL literal: plain quoted for ASCII,
 *  Latin-1 hex literal for accented text (raw multi-byte UTF-8 in a SQL
 *  string corrupts the Linux bridge → [HY090]). Ported from
 *  commandes-sous-traitant.ts. */
function sqlText(value: string | null | undefined): string {
  const v = (value ?? '').toString()
  if (v === '') return "''"
  if (/^[\x09\x0A\x0D\x20-\x7E]*$/.test(v)) return `'${esc(v)}'`
  const ascii = v
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
  const bytes = Buffer.from(
    Array.from(ascii, (ch) => {
      const c = ch.codePointAt(0) ?? 0x3f
      return c <= 0xff ? c : 0x3f
    }),
  )
  return `x'${bytes.toString('hex')}'`
}

// stock_fini and all the tables we join (ref_fini, ref_fini_colori,
// etat_stock_fini, sous_traitant) have NO accented columns in the fields we
// read, so the IS_WINDOWS branching dance from stock.ts is not needed here.
// coloris is polymorphic by ref_fini.avec_teinture: 0 = wash only → the
// IDColoris is a colori_ecru id (joined as `ce`); 1/2 = dyed → it's a
// ref_fini_colori id (joined as `rfc`). The id spaces collide numerically, so
// we select BOTH labels + avec_teinture and pick the right one in repairAllJoins.
const STOCK_FINI_SELECT = `sf.IDstock_fini, sf.IDref_fini, sf.IDColoris, sf.IDetat_stock_fini, sf.IDligne_commande_client, sf.IDref_commande_source, sf.IDstock_ecru, sf.IDmagasin, sf.IDligne_expedition, sf.IDProprietaire, sf.IDcommande_donation, sf.poids, sf.metrage, sf.lot, sf.numero, sf.observations, sf.observation_sst, sf.second_choix, sf.date_saisie, sf.destockage, sf.don, sf.pointage, sf.emplacement, sf.conteneur, rf.reference AS ref_fini, rf.designation, rf.avec_teinture, rfc.reference AS coloris_dyed, ce.reference AS coloris_wash, esf.libelle AS etat_libelle, st.nom AS magasin_nom`

const STOCK_FINI_JOINS = `FROM stock_fini sf LEFT JOIN ref_fini rf ON sf.IDref_fini = rf.IDref_fini LEFT JOIN ref_fini_colori rfc ON sf.IDColoris = rfc.IDref_fini_colori LEFT JOIN colori_ecru ce ON sf.IDColoris = ce.IDcolori_ecru LEFT JOIN etat_stock_fini esf ON sf.IDetat_stock_fini = esf.IDetat_stock_fini LEFT JOIN sous_traitant st ON sf.IDmagasin = st.IDsous_traitant`

const TEXT_FIELDS = ['lot', 'numero', 'observations', 'observation_sst', 'emplacement', 'conteneur']

/**
 * Lazy CONVERT() repair for aliased columns that came back with U+FFFD glyphs.
 * Mirrors stock.ts:402.
 */
// Repair U+FFFD-corrupted accents on aliased columns coming back from a join.
// BATCHED: instead of one CONVERT query per row (an N+1 explosion that, on the
// Linux bridge, turned a single list load into hundreds of serialized round
// trips — état labels like "Réservé"/"Expédié" corrupt on *every* row), we issue
// at most one CONVERT query per source column, fetching every distinct id at
// once with `WHERE keyCol IN (...)`. Only ids whose value actually has a U+FFFD
// are requested, so empty values never enter the CONVERT (which would otherwise
// collapse the result set — see CLAUDE.md).
export async function repairAliased<T extends Record<string, unknown>>(
  rows: T[],
  table: string,
  idField: string,
  aliasMap: Record<string, string>,
  // Column to match in the target `table`. Defaults to idField (used when the
  // row's id property and the target table's PK share a name). When they differ
  // — e.g. stock_fini.IDColoris → ref_fini_colori.IDref_fini_colori, or
  // stock_fini.IDmagasin → sous_traitant.IDsous_traitant — pass the target PK
  // explicitly. Getting this wrong issues a query against a non-existent column,
  // which on the Linux HFSQL bridge triggers a connection-respawn storm.
  keyCol: string = idField,
): Promise<T[]> {
  const aliasNames = Object.keys(aliasMap)

  // Collect, per alias, the distinct ids whose value is corrupted.
  const idsByAlias: Record<string, Set<number>> = {}
  for (const alias of aliasNames) idsByAlias[alias] = new Set<number>()
  let anyNeedsFix = false
  for (const row of rows) {
    const idNum = Number(row[idField])
    // Only finite integer ids are usable in the `WHERE key IN (…)` below — a NaN
    // in that list makes HFSQL reject the whole query ([01000]) and, on the Linux
    // bridge, triggers a connection-respawn storm against the shared server.
    if (!Number.isInteger(idNum)) continue
    for (const alias of aliasNames) {
      const v = row[alias]
      if (typeof v === 'string' && v.includes('�')) {
        idsByAlias[alias].add(idNum)
        anyNeedsFix = true
      }
    }
  }
  if (!anyNeedsFix) return rows

  // One batched CONVERT query per source column, over all distinct ids.
  const valueByAlias: Record<string, Map<number, string>> = {}
  for (const alias of aliasNames) {
    valueByAlias[alias] = new Map<number, string>()
    const ids = idsByAlias[alias]
    if (ids.size === 0) continue
    const sourceCol = aliasMap[alias]
    try {
      const r = await query<{ id: number; v: unknown }>(
        `SELECT ${keyCol} AS id, CONVERT(${sourceCol} USING 'UTF-8') AS v FROM ${table} WHERE ${keyCol} IN (${Array.from(ids).join(',')})`,
      )
      for (const rec of r) {
        if (rec.v == null) continue
        const val = rec.v
        valueByAlias[alias].set(
          Number(rec.id),
          val instanceof ArrayBuffer ? Buffer.from(val).toString('utf8') : String(val),
        )
      }
    } catch {
      // keep originals on failure
    }
  }

  // Apply the fetched values back onto every corrupted row.
  return rows.map((row) => {
    const id = row[idField]
    if (id == null) return row
    let fixed: T | null = null
    for (const alias of aliasNames) {
      const v = row[alias]
      if (typeof v === 'string' && v.includes('�')) {
        const nv = valueByAlias[alias].get(Number(id))
        if (nv != null) {
          if (!fixed) fixed = { ...row }
          ;(fixed as Record<string, unknown>)[alias] = nv
        }
      }
    }
    return fixed ?? row
  })
}

export async function repairAllJoins(rows: StockFini[]): Promise<StockFini[]> {
  let fixed = rows
  fixed = await repairAliased(fixed, 'ref_fini', 'IDref_fini', { ref_fini: 'reference', designation: 'designation' })
  fixed = await repairAliased(fixed, 'ref_fini_colori', 'IDColoris', { coloris_dyed: 'reference' }, 'IDref_fini_colori')
  fixed = await repairAliased(fixed, 'colori_ecru', 'IDColoris', { coloris_wash: 'reference' }, 'IDcolori_ecru')
  fixed = await repairAliased(fixed, 'etat_stock_fini', 'IDetat_stock_fini', { etat_libelle: 'libelle' })
  fixed = await repairAliased(fixed, 'sous_traitant', 'IDmagasin', { magasin_nom: 'nom' }, 'IDsous_traitant')
  // Pick the coloris label dictated by avec_teinture (0 = wash → colori_ecru,
  // 1/2 = dyed → ref_fini_colori). Unknown ref (null) defaults to dyed to keep
  // the previous behaviour. Collapse to the single `coloris_reference` field
  // the frontend expects and drop the internal helpers.
  for (const r of fixed) {
    const av = (r as any).avec_teinture
    const dyed = av == null ? true : Number(av) !== 0
    ;(r as any).coloris_reference = (dyed ? (r as any).coloris_dyed : (r as any).coloris_wash) ?? null
    delete (r as any).coloris_dyed
    delete (r as any).coloris_wash
    delete (r as any).avec_teinture
  }
  return fixed
}

// GET /api/stock/fini - List stock_fini rows with joined display columns.
//   ?q=<text>        — fuzzy search across ref/coloris/lot/numero/emplacement/observations/conteneur
//   ?expedie=all     — include rolls already shipped (default hides them)
stockFiniRouter.get('/fini', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const showShipped = req.query.expedie === 'all'

    const where: string[] = []
    // HFSQL stores "no FK" as 0 (not NULL). Hide rolls that have shipped:
    //   - IDligne_expedition = 0 means not on a shipment slip
    //   - IDetat_stock_fini = 4 means "Expédié" état (manual flag)
    if (!showShipped) where.push(`(sf.IDligne_expedition IS NULL OR sf.IDligne_expedition = 0) AND (sf.IDetat_stock_fini IS NULL OR sf.IDetat_stock_fini <> 4)`)
    if (q) {
      const e = esc(q)
      where.push(
        `(sf.lot LIKE '%${e}%' OR sf.numero LIKE '%${e}%' OR sf.emplacement LIKE '%${e}%' OR sf.conteneur LIKE '%${e}%' OR sf.observations LIKE '%${e}%' OR rf.reference LIKE '%${e}%' OR rfc.reference LIKE '%${e}%' OR ce.reference LIKE '%${e}%')`,
      )
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const sql = `SELECT ${STOCK_FINI_SELECT} ${STOCK_FINI_JOINS} ${whereSql} ORDER BY sf.date_saisie DESC, sf.IDstock_fini DESC`
    const rows = await query<StockFini>(sql)

    // Batched accent repair for the base table's own text columns, then the
    // joined columns — both via the batched repairAliased (no per-row N+1).
    let fixed = await repairAliased(rows, 'stock_fini', 'IDstock_fini', {
      lot: 'lot',
      numero: 'numero',
      observations: 'observations',
      observation_sst: 'observation_sst',
      emplacement: 'emplacement',
      conteneur: 'conteneur',
    })
    fixed = await repairAllJoins(fixed)

    res.json(fixed)
  } catch (err) {
    console.error('Error fetching stock_fini:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/fini/lookups/etats - état_stock_fini rows for the drawer dropdown.
stockFiniRouter.get('/fini/lookups/etats', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDetat_stock_fini: number; libelle: string }>(
      `SELECT IDetat_stock_fini, libelle FROM etat_stock_fini ORDER BY IDetat_stock_fini ASC`,
    )
    const fixed = await fixEncoding(rows, 'etat_stock_fini', 'IDetat_stock_fini', ['libelle'])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching etat_stock_fini:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/fini/lookups/refs - ref_fini list for the "Nouveau" form.
//   Carries avec_teinture so the coloris lookup can pick the right catalog.
stockFiniRouter.get('/fini/lookups/refs', async (_req: Request, res: Response) => {
  try {
    // ref_fini.archivé is accented: name it only on Windows; on Linux SELECT *
    // and filter in JS (naming the accented column storms the bridge).
    const sql = IS_WINDOWS
      ? `SELECT IDref_fini, reference, designation, avec_teinture FROM ref_fini WHERE archivé = 0 ORDER BY reference`
      : `SELECT * FROM ref_fini ORDER BY reference`
    const rows = await query<Record<string, unknown>>(sql)
    const visible = IS_WINDOWS ? rows : rows.filter((r) => !isArchive(r))
    const shaped = visible.map((r) => ({
      IDref_fini: Number(r.IDref_fini),
      reference: (r.reference ?? null) as string | null,
      designation: (r.designation ?? null) as string | null,
      avec_teinture: Number(r.avec_teinture) || 0,
    }))
    const fixed = (await fixEncoding(shaped, 'ref_fini', 'IDref_fini', ['reference', 'designation'])) as any[]
    res.json(fixed.filter((r) => r.reference && String(r.reference).trim().length > 0))
  } catch (err) {
    console.error('Error fetching refs-fini lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/fini/lookups/coloris?ref_fini=X - coloris options for a ref,
//   polymorphic by ref_fini.avec_teinture (memory project_avec_teinture_coloris_rule):
//     0 (wash)   → colori_ecru of the ref's écru base (IDref_ecru)
//     1/2 (dyed) → ref_fini_colori of the ref. The returned `id` is the value
//   to store in stock_fini.IDColoris (a colori_ecru id or a ref_fini_colori id).
stockFiniRouter.get('/fini/lookups/coloris', async (req: Request, res: Response) => {
  try {
    const refFini = parseInt(String(req.query.ref_fini ?? ''), 10)
    if (isNaN(refFini) || refFini <= 0) { res.json([]); return }
    // avec_teinture and IDref_ecru are ASCII column names — safe to name on
    // both platforms in a single-table SELECT.
    const refRows = await query<{ avec_teinture: number | null; IDref_ecru: number | null }>(
      `SELECT avec_teinture, IDref_ecru FROM ref_fini WHERE IDref_fini = ${refFini}`,
    )
    if (refRows.length === 0) { res.json([]); return }
    const dyed = Number(refRows[0].avec_teinture) !== 0
    let out: Array<{ id: number; reference: string | null }>
    if (dyed) {
      const rows = await query<{ IDref_fini_colori: number; reference: string | null }>(
        `SELECT IDref_fini_colori, reference FROM ref_fini_colori WHERE IDref_fini = ${refFini} ORDER BY reference`,
      )
      const fixed = (await fixEncoding(rows, 'ref_fini_colori', 'IDref_fini_colori', ['reference'])) as any[]
      out = fixed.map((r) => ({ id: Number(r.IDref_fini_colori), reference: r.reference }))
    } else {
      const idRefEcru = Number(refRows[0].IDref_ecru) || 0
      if (idRefEcru <= 0) { res.json([]); return }
      const rows = await query<{ IDcolori_ecru: number; reference: string | null }>(
        `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDref_ecru = ${idRefEcru} ORDER BY reference`,
      )
      const fixed = (await fixEncoding(rows, 'colori_ecru', 'IDcolori_ecru', ['reference'])) as any[]
      out = fixed.map((r) => ({ id: Number(r.IDcolori_ecru), reference: r.reference }))
    }
    res.json(out.filter((r) => r.reference && String(r.reference).trim().length > 0))
  } catch (err) {
    console.error('Error fetching coloris lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/fini/lookups/magasins - sous_traitant rows used as depots for
//   the "Nouveau" form's Magasin dropdown (stock_fini.IDmagasin → sous_traitant).
stockFiniRouter.get('/fini/lookups/magasins', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDsous_traitant: number; nom: string | null }>(
      `SELECT IDsous_traitant, nom FROM sous_traitant ORDER BY nom`,
    )
    const fixed = (await fixEncoding(rows, 'sous_traitant', 'IDsous_traitant', ['nom'])) as any[]
    res.json(
      fixed
        .filter((r) => r.nom && String(r.nom).trim().length > 0)
        .map((r) => ({ IDsous_traitant: Number(r.IDsous_traitant), nom: r.nom })),
    )
  } catch (err) {
    console.error('Error fetching magasins lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/stock/fini - manually create a finished roll. Gated by the
//   create_stock_fini permission (effective admins bypass; impersonation does
//   not). All columns are ASCII; text values go through sqlText() for bridge
//   safety. IDColoris must be the catalog id matching the ref's avec_teinture
//   (the /lookups/coloris endpoint already returns the correct id space).
stockFiniRouter.post('/fini', async (req: Request, res: Response) => {
  try {
    if (req.userId === undefined) {
      res.status(401).json({ error: 'not authenticated' })
      return
    }
    const allowed = await userHasPermission(req.userId, isEffectiveAdmin(req), 'create_stock_fini')
    if (!allowed) {
      res.status(403).json({ error: 'permission denied: create_stock_fini' })
      return
    }

    const b = req.body ?? {}
    const IDref_fini = parseInt(String(b.IDref_fini), 10)
    const IDColoris = parseInt(String(b.IDColoris), 10)
    const poids = Number(b.poids)
    const metrage = Number(b.metrage)
    if (!Number.isInteger(IDref_fini) || IDref_fini <= 0) {
      res.status(400).json({ error: 'IDref_fini required' })
      return
    }
    if (!Number.isInteger(IDColoris) || IDColoris <= 0) {
      res.status(400).json({ error: 'IDColoris required' })
      return
    }
    if (!Number.isFinite(poids) || poids < 0 || !Number.isFinite(metrage) || metrage < 0) {
      res.status(400).json({ error: 'poids and metrage must be non-negative numbers' })
      return
    }
    const r2 = (v: number) => Math.round(v * 100) / 100
    const IDetat = Number.isInteger(parseInt(String(b.IDetat_stock_fini), 10))
      ? parseInt(String(b.IDetat_stock_fini), 10)
      : 1 // default "En Contrôle"
    const IDmagasin = Number.isInteger(parseInt(String(b.IDmagasin), 10)) && parseInt(String(b.IDmagasin), 10) > 0
      ? parseInt(String(b.IDmagasin), 10)
      : 0
    const secondChoix = b.second_choix ? 1 : 0
    const lot = (b.lot ?? '').toString()
    const numero = (b.numero ?? '').toString()
    const emplacement = (b.emplacement ?? '').toString()
    const observations = (b.observations ?? '').toString()
    const now = new Date()
    const dateSaisie = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

    await query(
      `INSERT INTO stock_fini
       (numero, lot, poids, metrage, IDref_fini, IDColoris, IDstock_ecru,
        IDmagasin, IDref_commande_source, observations, observation_sst, emplacement, date_saisie,
        second_choix, destockage, don, IDProprietaire, IDcommande_donation, IDligne_commande_client,
        IDligne_expedition, IDetat_stock_fini)
       VALUES (${sqlText(numero)}, ${sqlText(lot)}, ${r2(poids)}, ${r2(metrage)}, ${IDref_fini}, ${IDColoris}, 0,
               ${IDmagasin}, 0, ${sqlText(observations)}, '', ${sqlText(emplacement)}, '${dateSaisie}',
               ${secondChoix}, 0, 0, 0, 0, 0,
               0, ${IDetat})`,
    )
    const idRows = await query<{ id: number }>(`SELECT MAX(IDstock_fini) AS id FROM stock_fini`)
    const newId = Number(idRows[0]?.id) || null
    res.status(201).json({ IDstock_fini: newId })
  } catch (err) {
    console.error('Error creating stock_fini:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/fini/:id - Single stock_fini row by id.
stockFiniRouter.get('/fini/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const rows = await query<StockFini>(
      `SELECT ${STOCK_FINI_SELECT} ${STOCK_FINI_JOINS} WHERE sf.IDstock_fini = ${id}`,
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Stock fini not found' })
      return
    }

    let fixed = await fixEncoding(rows, 'stock_fini', 'IDstock_fini', TEXT_FIELDS)
    fixed = await repairAllJoins(fixed)

    res.json(fixed[0])
  } catch (err) {
    console.error('Error fetching stock_fini detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/fini/:id/label - Dymo étiquette PDF (89 × 36 mm) for one roll.
// Read-only, not permission-gated. Reuses the same SELECT/JOINs/repair as the
// detail endpoint so coloris_reference is resolved identically.
stockFiniRouter.get('/fini/:id/label', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const rows = await query<StockFini>(
      `SELECT ${STOCK_FINI_SELECT} ${STOCK_FINI_JOINS} WHERE sf.IDstock_fini = ${id}`,
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Stock fini not found' })
      return
    }

    let fixed = await fixEncoding(rows, 'stock_fini', 'IDstock_fini', TEXT_FIELDS)
    fixed = await repairAllJoins(fixed)
    const row = fixed[0] as Record<string, unknown>

    const data: StockFiniLabelData = {
      numero: (row.numero as string | null) ?? null,
      ref_fini: (row.ref_fini as string | null) ?? null,
      coloris_reference: (row.coloris_reference as string | null) ?? null,
      poids: (row.poids as number | null) ?? null,
      metrage: (row.metrage as number | null) ?? null,
      lot: (row.lot as string | null) ?? null,
    }

    const buffer = await renderToBuffer(
      React.createElement(StockFiniLabelPdf, { data }) as unknown as React.ReactElement<
        import('@react-pdf/renderer').DocumentProps
      >,
    )

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="etiquette-${id}.pdf"`)
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.send(buffer)
  } catch (err) {
    console.error('Error rendering stock_fini label PDF:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/stock/fini/batch - batch-edit ("Édition groupée") emplacement
//   and/or observations across many rolls at once. Body:
//     { ids: number[], emplacement?: string, observations?: string }
//   Only the provided fields are written (an empty string clears the field);
//   omit a field to leave it untouched. Accented values are emitted via
//   sqlText() so French observations don't corrupt the Linux bridge.
//   MUST be registered before PATCH /fini/:id, otherwise "batch" is parsed as
//   the :id param.
stockFiniRouter.patch('/fini/batch', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {}
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .map((x: unknown) => parseInt(String(x), 10))
      .filter((n: number) => Number.isInteger(n) && n > 0)
    if (ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array of roll ids' })
      return
    }
    if (ids.length > 1000) {
      res.status(400).json({ error: 'too many ids (max 1000)' })
      return
    }

    const sets: string[] = []
    if (typeof body.emplacement === 'string') sets.push(`emplacement = ${sqlText(body.emplacement)}`)
    if (typeof body.observations === 'string') sets.push(`observations = ${sqlText(body.observations)}`)
    if (sets.length === 0) {
      res.status(400).json({ error: 'No editable fields provided' })
      return
    }

    await query(`UPDATE stock_fini SET ${sets.join(', ')} WHERE IDstock_fini IN (${ids.join(',')})`)

    res.json({ updated: ids.length })
  } catch (err) {
    console.error('Error batch-updating stock_fini:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/stock/fini/:id - whitelist edit
//   poids, metrage, IDref_fini, IDColoris, IDref_commande_source, IDstock_ecru,
//   IDligne_expedition, IDligne_commande_client are NOT editable here — they
//   belong to the sst reception / shipment flows.
stockFiniRouter.patch('/fini/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const body = req.body ?? {}
    const sets: string[] = []

    if (typeof body.observations === 'string') sets.push(`observations = '${esc(body.observations)}'`)
    if (typeof body.observation_sst === 'string') sets.push(`observation_sst = '${esc(body.observation_sst)}'`)
    if (typeof body.emplacement === 'string') sets.push(`emplacement = '${esc(body.emplacement)}'`)
    if (typeof body.conteneur === 'string') sets.push(`conteneur = '${esc(body.conteneur)}'`)
    if (body.second_choix !== undefined) sets.push(`second_choix = ${body.second_choix ? 1 : 0}`)
    if (body.destockage !== undefined) sets.push(`destockage = ${body.destockage ? 1 : 0}`)
    if (body.don !== undefined) sets.push(`don = ${body.don ? 1 : 0}`)
    if (body.IDetat_stock_fini !== undefined) {
      const v = parseInt(String(body.IDetat_stock_fini), 10)
      if (!isNaN(v)) sets.push(`IDetat_stock_fini = ${v}`)
    }
    if (typeof body.pointage === 'string') {
      const d = body.pointage
      // stock_fini.pointage is a NOT NULL date column — an empty date must be
      // written as '' (HFSQL's empty-date sentinel), never NULL. Writing NULL
      // is rejected server-side ("item does not allow Null values"), which the
      // bridge mis-reads as a lost connection and respawns, wedging the queue.
      if (d === '') sets.push(`pointage = ''`)
      else sets.push(`pointage = '${esc(d)}'`)
    }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No editable fields provided' })
      return
    }

    await query(`UPDATE stock_fini SET ${sets.join(', ')} WHERE IDstock_fini = ${id}`)

    // Fetch fresh row in the same shape as GET /fini/:id
    const rows = await query<StockFini>(
      `SELECT ${STOCK_FINI_SELECT} ${STOCK_FINI_JOINS} WHERE sf.IDstock_fini = ${id}`,
    )
    let fixed = await fixEncoding(rows, 'stock_fini', 'IDstock_fini', TEXT_FIELDS)
    fixed = await repairAllJoins(fixed)

    res.json(fixed[0])
  } catch (err) {
    console.error('Error updating stock_fini:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Resolve a set of IDligne_commande_client → client display name, via the
// flat chain ligne_commande_client → commande_client → client. Flat queries
// only (a JOIN + CONVERT collapses the result set on the Linux bridge — see
// CLAUDE.md). Returns a Map keyed by IDligne_commande_client; missing/empty
// links are simply absent.
async function resolveClientNames(lccIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const ids = Array.from(new Set(lccIds.filter((x) => Number.isInteger(x) && x > 0)))
  if (ids.length === 0) return out
  const lccRows = await query<{ IDligne_commande_client: number; IDcommande_client: number }>(
    `SELECT IDligne_commande_client, IDcommande_client FROM ligne_commande_client WHERE IDligne_commande_client IN (${ids.join(',')})`,
  )
  const lccToCc = new Map<number, number>()
  for (const r of lccRows) lccToCc.set(Number(r.IDligne_commande_client), Number(r.IDcommande_client) || 0)
  const ccIds = Array.from(new Set(Array.from(lccToCc.values()))).filter((x) => x > 0)
  const ccToClient = new Map<number, number>()
  if (ccIds.length > 0) {
    const ccRows = await query<{ IDcommande_client: number; IDclient: number }>(
      `SELECT IDcommande_client, IDclient FROM commande_client WHERE IDcommande_client IN (${ccIds.join(',')})`,
    )
    for (const r of ccRows) ccToClient.set(Number(r.IDcommande_client), Number(r.IDclient) || 0)
  }
  const clientIds = Array.from(new Set(Array.from(ccToClient.values()))).filter((x) => x > 0)
  const clientName = new Map<number, string>()
  if (clientIds.length > 0) {
    const cRows = await query<{ IDclient: number; nom: string | null }>(
      `SELECT IDclient, nom FROM client WHERE IDclient IN (${clientIds.join(',')})`,
    )
    const fixedC = (await fixEncoding(cRows, 'client', 'IDclient', ['nom'])) as any[]
    for (const r of fixedC) clientName.set(Number(r.IDclient), (r.nom ?? '').toString().trim())
  }
  for (const [lccId, ccId] of lccToCc) {
    const name = clientName.get(ccToClient.get(ccId) ?? 0) ?? ''
    if (name) out.set(lccId, name)
  }
  return out
}

// Build the surteinture trace observation for a finished roll being sent back
// to dyeing: "<lot> - <ref> - <coloris> a surteindre". Built server-side so the
// modal preview and the actual write can never drift.
function surteintObservation(lot: string, ref: string, coloris: string): string {
  return [lot, ref, coloris].map((s) => (s ?? '').toString().trim()).filter(Boolean).join(' - ') + ' a surteindre'
}

interface SurteintFiniRow {
  IDstock_fini: number
  IDstock_ecru: number
  IDligne_expedition: number
  lot: string
  ref_fini: string
  coloris_reference: string
  numero: string
  poids: number
  metrage: number
  IDligne_commande_client: number
}

// Load the selected finished rolls with the fields surteinture needs, resolving
// coloris via the same SELECT/JOIN/repair path as the list so labels match.
async function loadSurteintFiniRows(ids: number[]): Promise<SurteintFiniRow[]> {
  const rows = await query<StockFini>(
    `SELECT ${STOCK_FINI_SELECT} ${STOCK_FINI_JOINS} WHERE sf.IDstock_fini IN (${ids.join(',')})`,
  )
  let fixed = await fixEncoding(rows, 'stock_fini', 'IDstock_fini', TEXT_FIELDS)
  fixed = await repairAllJoins(fixed)
  return (fixed as any[]).map((r) => ({
    IDstock_fini: Number(r.IDstock_fini),
    IDstock_ecru: Number(r.IDstock_ecru) || 0,
    IDligne_expedition: Number(r.IDligne_expedition) || 0,
    lot: (r.lot ?? '').toString().trim(),
    ref_fini: (r.ref_fini ?? '').toString().trim(),
    coloris_reference: (r.coloris_reference ?? '').toString().trim(),
    numero: (r.numero ?? '').toString().trim(),
    poids: Number(r.poids) || 0,
    metrage: Number(r.metrage) || 0,
    IDligne_commande_client: Number(r.IDligne_commande_client) || 0,
  }))
}

// POST /api/stock/fini/surteindre/preview - drive the Surteinture modal.
//   Body: { ids: number[] }. Returns, per selected roll, the fini fields (left
//   table) + the linked tombé-de-métier écru fields (right table) + the trace
//   observation that will be written. Also returns the colori_ecru catalog for
//   the rolls' écru base + the current (default) écru coloris. Rolls with no
//   linked écru are flagged `skipped` so the UI can warn.
//   MUST be registered before POST /fini/:id-style routes (none today, but keep
//   it above /fini/:id/cut for clarity).
stockFiniRouter.post('/fini/surteindre/preview', async (req: Request, res: Response) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map((x: unknown) => parseInt(String(x), 10))
      .filter((n: number) => Number.isInteger(n) && n > 0)
    if (ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array of roll ids' })
      return
    }
    if (ids.length > 200) {
      res.status(400).json({ error: 'too many ids (max 200)' })
      return
    }

    const finiRows = await loadSurteintFiniRows(ids)

    // Linked écru rows (skip rolls with no source écru).
    const ecruIds = Array.from(new Set(finiRows.map((r) => r.IDstock_ecru).filter((x) => x > 0)))
    const ecruById = new Map<number, any>()
    if (ecruIds.length > 0) {
      const ecruRows = await query<Record<string, unknown>>(
        `SELECT IDstock_ecru, numero, IDref_ecru, IDcolori_ecru, poids, IDmagasin, observations, IDligne_commande_client
         FROM stock_ecru WHERE IDstock_ecru IN (${ecruIds.join(',')})`,
      )
      const fixedEcru = await fixEncoding(ecruRows, 'stock_ecru', 'IDstock_ecru', ['numero', 'observations'])
      for (const r of fixedEcru as any[]) ecruById.set(Number(r.IDstock_ecru), r)
    }

    // Resolve display lookups: ref_ecru.reference, colori_ecru.reference,
    // magasin (sous_traitant.nom), and client names for both fini + écru lines.
    const refEcruIds = Array.from(new Set(Array.from(ecruById.values()).map((r) => Number(r.IDref_ecru)).filter((x) => x > 0)))
    const refEcruLabel = new Map<number, string>()
    if (refEcruIds.length > 0) {
      const rr = await query<{ IDref_ecru: number; reference: string | null }>(
        `SELECT IDref_ecru, reference FROM ref_ecru WHERE IDref_ecru IN (${refEcruIds.join(',')})`,
      )
      for (const r of (await fixEncoding(rr, 'ref_ecru', 'IDref_ecru', ['reference'])) as any[])
        refEcruLabel.set(Number(r.IDref_ecru), (r.reference ?? '').toString().trim())
    }

    // colori_ecru labels for the écru rows (read-only display in the right table).
    const coloriLabel = new Map<number, string>()
    if (refEcruIds.length > 0) {
      const cr = await query<{ IDcolori_ecru: number; IDref_ecru: number; reference: string | null }>(
        `SELECT IDcolori_ecru, IDref_ecru, reference FROM colori_ecru WHERE IDref_ecru IN (${refEcruIds.join(',')}) ORDER BY reference`,
      )
      for (const r of (await fixEncoding(cr, 'colori_ecru', 'IDcolori_ecru', ['reference'])) as any[]) {
        coloriLabel.set(Number(r.IDcolori_ecru), (r.reference ?? '').toString().trim())
      }
    }

    const magasinIds = Array.from(new Set(Array.from(ecruById.values()).map((r) => Number(r.IDmagasin)).filter((x) => x > 0)))
    const magasinLabel = new Map<number, string>()
    if (magasinIds.length > 0) {
      const mr = await query<{ IDsous_traitant: number; nom: string | null }>(
        `SELECT IDsous_traitant, nom FROM sous_traitant WHERE IDsous_traitant IN (${magasinIds.join(',')})`,
      )
      for (const r of (await fixEncoding(mr, 'sous_traitant', 'IDsous_traitant', ['nom'])) as any[])
        magasinLabel.set(Number(r.IDsous_traitant), (r.nom ?? '').toString().trim())
    }

    const allLcc = [
      ...finiRows.map((r) => r.IDligne_commande_client),
      ...Array.from(ecruById.values()).map((r) => Number(r.IDligne_commande_client) || 0),
    ]
    const clientByLcc = await resolveClientNames(allLcc)

    const rows = finiRows.map((f) => {
      const ecru = f.IDstock_ecru > 0 ? ecruById.get(f.IDstock_ecru) : undefined
      const ecruColoris = ecru ? coloriLabel.get(Number(ecru.IDcolori_ecru)) ?? '' : ''
      return {
        IDstock_fini: f.IDstock_fini,
        skipped: !ecru,
        fini: {
          numero: f.numero,
          poids: f.poids,
          metrage: f.metrage,
          lot: f.lot,
          client: clientByLcc.get(f.IDligne_commande_client) ?? '',
        },
        ecru: ecru
          ? {
              IDstock_ecru: Number(ecru.IDstock_ecru),
              numero: (ecru.numero ?? '').toString().trim(),
              ref_ecru: refEcruLabel.get(Number(ecru.IDref_ecru)) ?? '',
              coloris: ecruColoris,
              poids: Number(ecru.poids) || 0,
              magasin_nom: magasinLabel.get(Number(ecru.IDmagasin)) ?? '',
              client: clientByLcc.get(Number(ecru.IDligne_commande_client) || 0) ?? '',
            }
          : null,
        computedObservation: surteintObservation(f.lot, f.ref_fini, f.coloris_reference),
      }
    })

    res.json({ rows })
  } catch (err) {
    console.error('Error building surteinture preview:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/stock/fini/surteindre - execute the surteinture.
//   Body: { ids: number[] }.
//   Gated by surteindre_stock_fini. For each selected roll that has a linked
//   écru and is not shipped: append the trace observation to its tombé-de-métier
//   (stock_ecru) row, then DELETE the finished roll. The écru thus returns to
//   available stock for a fresh dyeing cycle, keeping a record of where it came
//   from. The écru's coloris and magasin are left untouched. Accented text via
//   sqlText().
stockFiniRouter.post('/fini/surteindre', async (req: Request, res: Response) => {
  try {
    if (req.userId === undefined) {
      res.status(401).json({ error: 'not authenticated' })
      return
    }
    const allowed = await userHasPermission(req.userId, isEffectiveAdmin(req), 'surteindre_stock_fini')
    if (!allowed) {
      res.status(403).json({ error: 'permission denied: surteindre_stock_fini' })
      return
    }

    const b = req.body ?? {}
    const ids = (Array.isArray(b.ids) ? b.ids : [])
      .map((x: unknown) => parseInt(String(x), 10))
      .filter((n: number) => Number.isInteger(n) && n > 0)
    if (ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array of roll ids' })
      return
    }
    if (ids.length > 200) {
      res.status(400).json({ error: 'too many ids (max 200)' })
      return
    }

    const finiRows = await loadSurteintFiniRows(ids)

    // Existing écru observations (to append, not overwrite).
    const ecruIds = Array.from(new Set(finiRows.map((r) => r.IDstock_ecru).filter((x) => x > 0)))
    const ecruObs = new Map<number, string>()
    if (ecruIds.length > 0) {
      const ecruRows = await query<{ IDstock_ecru: number; observations: string | null }>(
        `SELECT IDstock_ecru, observations FROM stock_ecru WHERE IDstock_ecru IN (${ecruIds.join(',')})`,
      )
      for (const r of (await fixEncoding(ecruRows, 'stock_ecru', 'IDstock_ecru', ['observations'])) as any[])
        ecruObs.set(Number(r.IDstock_ecru), (r.observations ?? '').toString())
    }

    let deleted = 0
    let updated = 0
    let skipped = 0
    for (const f of finiRows) {
      // Skip rolls with no source écru or already shipped — nothing to send back.
      if (f.IDstock_ecru <= 0 || f.IDligne_expedition > 0) {
        skipped++
        continue
      }
      const trace = surteintObservation(f.lot, f.ref_fini, f.coloris_reference)
      const existing = (ecruObs.get(f.IDstock_ecru) ?? '').trim()
      const obs = existing ? `${existing}\n${trace}` : trace

      await query(`UPDATE stock_ecru SET observations = ${sqlText(obs)} WHERE IDstock_ecru = ${f.IDstock_ecru}`)
      updated++
      await query(`DELETE FROM stock_fini WHERE IDstock_fini = ${f.IDstock_fini}`)
      deleted++
    }

    res.json({ deleted, updated, skipped })
  } catch (err) {
    console.error('Error executing surteinture:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/stock/fini/:id/cut - cut one physical roll into N rolls.
//   Body: { pieces: Array<{ poids: number; metrage: number }> } (length 2..10).
//   Piece 0 is the original row (updated in place, numero kept); pieces 1..N-1
//   are new rows that inherit EVERY other column from the original (ref, coloris,
//   lot, état, magasin, emplacement, client-line link, …) with numero suffixed
//   -2, -3, … The poids/metrage of the pieces must sum to the original (value
//   conservation), re-validated here regardless of what the client sent.
//
//   New rows are created with INSERT ... SELECT so accented text columns
//   (observations, …) are copied inside the DB — no encoding round-trip through
//   the SQL string, which keeps the Linux bridge happy.
stockFiniRouter.post('/fini/:id/cut', async (req: Request, res: Response) => {
  try {
    // Permission gate: must have cut_stock_fini (effective admins bypass; an
    // admin impersonating another user sees exactly what that user sees).
    if (req.userId === undefined) {
      res.status(401).json({ error: 'not authenticated' })
      return
    }
    const allowed = await userHasPermission(req.userId, isEffectiveAdmin(req), 'cut_stock_fini')
    if (!allowed) {
      res.status(403).json({ error: 'permission denied: cut_stock_fini' })
      return
    }

    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const pieces = (req.body?.pieces ?? []) as Array<{ poids?: unknown; metrage?: unknown }>
    if (!Array.isArray(pieces) || pieces.length < 2 || pieces.length > 10) {
      res.status(400).json({ error: 'pieces must be an array of length 2..10' })
      return
    }
    const norm = pieces.map((p) => ({
      poids: Number(p?.poids),
      metrage: Number(p?.metrage),
    }))
    if (norm.some((p) => !Number.isFinite(p.poids) || !Number.isFinite(p.metrage) || p.poids < 0 || p.metrage < 0)) {
      res.status(400).json({ error: 'each piece needs a non-negative poids and metrage' })
      return
    }

    const origRows = await query<{ poids: number | null; metrage: number | null; numero: string | null; IDligne_expedition: number | null }>(
      `SELECT poids, metrage, numero, IDligne_expedition FROM stock_fini WHERE IDstock_fini = ${id}`,
    )
    if (origRows.length === 0) {
      res.status(404).json({ error: 'Stock fini not found' })
      return
    }
    const orig = origRows[0]
    if (Number(orig.IDligne_expedition) > 0) {
      res.status(400).json({ error: 'Roll already shipped' })
      return
    }

    const origPoids = Number(orig.poids) || 0
    const origMetrage = Number(orig.metrage) || 0
    const sumPoids = norm.reduce((s, p) => s + p.poids, 0)
    const sumMetrage = norm.reduce((s, p) => s + p.metrage, 0)
    if (Math.abs(sumPoids - origPoids) > 0.01 || Math.abs(sumMetrage - origMetrage) > 0.1) {
      res.status(400).json({ error: 'Sum mismatch: pieces must total the original poids and metrage' })
      return
    }

    // Round to avoid float artefacts in the stored values.
    const r2 = (v: number) => Math.round(v * 100) / 100
    const base = (orig.numero ?? '').trim() || `#${id}`

    // Piece 0 -> update the original row in place (numero unchanged).
    await query(
      `UPDATE stock_fini SET poids = ${r2(norm[0].poids)}, metrage = ${r2(norm[0].metrage)} WHERE IDstock_fini = ${id}`,
    )

    // Pieces 1..N-1 -> new rows copying every other column from the original.
    const COPY_COLS =
      'numero, IDstock_ecru, poids, metrage, lot, observations, second_choix, IDref_commande_source, IDmagasin, IDref_fini, IDColoris, date_saisie, IDetat_stock_fini, destockage, IDligne_commande_client, IDProprietaire, IDcommande_donation, conteneur, emplacement, don, pointage, observation_sst, IDligne_expedition'
    for (let i = 1; i < norm.length; i++) {
      const suffix = `-${i + 1}`
      const child = base.slice(0, 20 - suffix.length) + suffix
      await query(
        `INSERT INTO stock_fini (${COPY_COLS})
         SELECT '${esc(child)}', IDstock_ecru, ${r2(norm[i].poids)}, ${r2(norm[i].metrage)}, lot, observations, second_choix, IDref_commande_source, IDmagasin, IDref_fini, IDColoris, date_saisie, IDetat_stock_fini, destockage, IDligne_commande_client, IDProprietaire, IDcommande_donation, conteneur, emplacement, don, pointage, observation_sst, IDligne_expedition
         FROM stock_fini WHERE IDstock_fini = ${id}`,
      )
    }

    res.json({ ok: true, created: norm.length - 1 })
  } catch (err) {
    console.error('Error cutting stock_fini:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

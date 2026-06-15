import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { query, fixEncoding } from '../lib/hfsql-auto.js'

export const stockFiniRouter: RouterType = Router()

type StockFini = Record<string, unknown>

/** Escape a string for use in SQL (single quotes doubled). */
function esc(value: string): string {
  return value.replace(/'/g, "''")
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
async function repairAliased<T extends Record<string, unknown>>(
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

async function repairAllJoins(rows: StockFini[]): Promise<StockFini[]> {
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
      if (d === '') sets.push(`pointage = NULL`)
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

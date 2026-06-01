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
async function repairAliased<T extends Record<string, unknown>>(
  rows: T[],
  table: string,
  idField: string,
  aliasMap: Record<string, string>,
): Promise<T[]> {
  const aliasNames = Object.keys(aliasMap)
  const out: T[] = []
  for (const row of rows) {
    const needsFix = aliasNames.some((alias) => {
      const v = row[alias]
      return typeof v === 'string' && v.includes('�')
    })
    if (!needsFix) {
      out.push(row)
      continue
    }
    const id = row[idField]
    if (id == null) {
      out.push(row)
      continue
    }
    const fixed = { ...row }
    for (const alias of aliasNames) {
      const v = row[alias]
      if (typeof v === 'string' && v.includes('�')) {
        const sourceCol = aliasMap[alias]
        try {
          const r = await query<{ v: unknown }>(
            `SELECT CONVERT(${sourceCol} USING 'UTF-8') AS v FROM ${table} WHERE ${idField} = ${Number(id)}`,
          )
          if (r.length > 0 && r[0].v != null) {
            const val = r[0].v
            ;(fixed as Record<string, unknown>)[alias] =
              val instanceof ArrayBuffer ? Buffer.from(val).toString('utf8') : val
          }
        } catch {
          // keep original
        }
      }
    }
    out.push(fixed)
  }
  return out
}

async function repairAllJoins(rows: StockFini[]): Promise<StockFini[]> {
  let fixed = rows
  fixed = await repairAliased(fixed, 'ref_fini', 'IDref_fini', { ref_fini: 'reference', designation: 'designation' })
  fixed = await repairAliased(fixed, 'ref_fini_colori', 'IDColoris', { coloris_dyed: 'reference' })
  fixed = await repairAliased(fixed, 'colori_ecru', 'IDColoris', { coloris_wash: 'reference' })
  fixed = await repairAliased(fixed, 'etat_stock_fini', 'IDetat_stock_fini', { etat_libelle: 'libelle' })
  fixed = await repairAliased(fixed, 'sous_traitant', 'IDmagasin', { magasin_nom: 'nom' })
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

    let fixed = await fixEncoding(rows, 'stock_fini', 'IDstock_fini', TEXT_FIELDS)
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

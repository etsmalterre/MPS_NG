import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { query, queryRaw, fixEncoding } from '../lib/hfsql-auto.js'

export const stockRouter: RouterType = Router()

type StockFil = Record<string, unknown>

/** Escape a string for use in SQL (single quotes doubled) */
function esc(value: string): string {
  return value.replace(/'/g, "''")
}

// Common SELECT used by list and detail. Aliases accented columns so the
// bridge cannot mangle them downstream (terminé→termine, controlé→controle).
const STOCK_SELECT = `
  sf.IDstock_fil,
  sf.IDfournisseur,
  sf.IDref_fil,
  sf.IDcolori_fil,
  sf.IDref_fil_commande,
  sf.IDMagasin,
  sf.stock,
  sf.stock_initial,
  sf.lot,
  sf.lot_frs,
  sf.emplacement,
  sf.date_entree,
  sf.dernier_mouvement,
  sf.dernier_pointage,
  sf.niveau,
  sf.terminé AS termine,
  sf.controlé AS controle,
  sf.commentaire,
  sf.observation_freinte,
  rf.reference AS ref_fil,
  rf.titrage,
  rf.bio,
  rf.recyclé AS recycle,
  cf.reference AS colori_reference,
  f.nom AS fournisseur_nom
`

const STOCK_JOINS = `
  FROM stock_fil sf
  LEFT JOIN ref_fil rf ON sf.IDref_fil = rf.IDref_fil
  LEFT JOIN colori_fil cf ON sf.IDcolori_fil = cf.IDcolori_fil
  LEFT JOIN fournisseur f ON sf.IDfournisseur = f.IDfournisseur
`

// GET /api/stock/fil - List stock_fil rows with joined display columns
stockRouter.get('/fil', async (req: Request, res: Response) => {
  try {
    const fournisseur = req.query.fournisseur ? parseInt(String(req.query.fournisseur), 10) : null
    const showAll = req.query.terminé === 'all' || req.query.termine === 'all'
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''

    const where: string[] = []
    if (!showAll) where.push(`(sf.terminé = 0 OR sf.terminé IS NULL)`)
    if (fournisseur && !isNaN(fournisseur)) where.push(`sf.IDfournisseur = ${fournisseur}`)
    if (q) {
      const e = esc(q)
      where.push(`(
        sf.lot LIKE '%${e}%'
        OR sf.lot_frs LIKE '%${e}%'
        OR sf.emplacement LIKE '%${e}%'
        OR rf.reference LIKE '%${e}%'
        OR cf.reference LIKE '%${e}%'
        OR f.nom LIKE '%${e}%'
      )`)
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const sql = `SELECT ${STOCK_SELECT} ${STOCK_JOINS} ${whereSql} ORDER BY sf.date_entree DESC, sf.IDstock_fil DESC`
    const rows = await query<StockFil>(sql)

    // Repair accented text fields per source table
    let fixed: StockFil[] = await fixEncoding(
      rows,
      'stock_fil',
      'IDstock_fil',
      ['lot', 'lot_frs', 'emplacement', 'commentaire', 'observation_freinte']
    )
    // ref_fil.reference came in aliased — repair via the source ID
    fixed = await fixEncoding(fixed, 'ref_fil', 'IDref_fil', [])
    // For aliased fields fixEncoding can't auto-detect; do a targeted scan
    fixed = await repairAliased(fixed, 'ref_fil', 'IDref_fil', { ref_fil: 'reference' })
    fixed = await repairAliased(fixed, 'colori_fil', 'IDcolori_fil', { colori_reference: 'reference' })
    fixed = await repairAliased(fixed, 'fournisseur', 'IDfournisseur', { fournisseur_nom: 'nom' })

    res.json(fixed)
  } catch (err) {
    console.error('Error fetching stock_fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/fil/:id - Single stock_fil row + has_certif flags
stockRouter.get('/fil/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const rows = await query<StockFil>(
      `SELECT ${STOCK_SELECT} ${STOCK_JOINS} WHERE sf.IDstock_fil = ${id}`
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Stock fil not found' })
      return
    }

    let fixed: StockFil[] = await fixEncoding(
      rows,
      'stock_fil',
      'IDstock_fil',
      ['lot', 'lot_frs', 'emplacement', 'commentaire', 'observation_freinte']
    )
    fixed = await repairAliased(fixed, 'ref_fil', 'IDref_fil', { ref_fil: 'reference' })
    fixed = await repairAliased(fixed, 'colori_fil', 'IDcolori_fil', { colori_reference: 'reference' })
    fixed = await repairAliased(fixed, 'fournisseur', 'IDfournisseur', { fournisseur_nom: 'nom' })

    // Has-certif flags via separate IS NOT NULL queries (cannot fetch blob just to check)
    let has_certif_bio = false
    let has_certif_recycle = false
    try {
      const bioRows = await query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM stock_fil WHERE IDstock_fil = ${id} AND certif_bio IS NOT NULL`
      )
      has_certif_bio = !!(bioRows[0] && Number(bioRows[0].n) > 0)
    } catch {
      // ignore
    }
    try {
      const recRows = await query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM stock_fil WHERE IDstock_fil = ${id} AND certif_recyclé IS NOT NULL`
      )
      has_certif_recycle = !!(recRows[0] && Number(recRows[0].n) > 0)
    } catch {
      // ignore
    }

    res.json({ ...fixed[0], has_certif_bio, has_certif_recycle })
  } catch (err) {
    console.error('Error fetching stock_fil detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/stock/fil - Create a new lot de fil
stockRouter.post('/fil', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {}
    const IDfournisseur = parseInt(String(body.IDfournisseur), 10)
    const IDref_fil = parseInt(String(body.IDref_fil), 10)
    const IDcolori_fil = parseInt(String(body.IDcolori_fil), 10)
    const stock_initial = Number(body.stock_initial)

    if (isNaN(IDfournisseur) || isNaN(IDref_fil) || isNaN(IDcolori_fil)) {
      res.status(400).json({ error: 'IDfournisseur, IDref_fil and IDcolori_fil are required' })
      return
    }
    if (isNaN(stock_initial) || stock_initial < 0) {
      res.status(400).json({ error: 'stock_initial must be a positive number' })
      return
    }

    const lot = typeof body.lot === 'string' ? body.lot : ''
    const lot_frs = typeof body.lot_frs === 'string' ? body.lot_frs : ''
    const emplacement = typeof body.emplacement === 'string' ? body.emplacement : ''
    const commentaire = typeof body.commentaire === 'string' ? body.commentaire : ''
    const niveau = typeof body.niveau === 'number' ? body.niveau : 1

    // Default date_entree to today if not provided
    let date_entree = typeof body.date_entree === 'string' && body.date_entree.length === 8 ? body.date_entree : ''
    if (!date_entree) {
      const d = new Date()
      date_entree = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    }

    await query(
      `INSERT INTO stock_fil (IDfournisseur, IDref_fil, IDcolori_fil, stock, stock_initial, lot, lot_frs, emplacement, date_entree, commentaire, niveau, terminé, controlé) VALUES (${IDfournisseur}, ${IDref_fil}, ${IDcolori_fil}, ${stock_initial}, ${stock_initial}, '${esc(lot)}', '${esc(lot_frs)}', '${esc(emplacement)}', '${esc(date_entree)}', '${esc(commentaire)}', ${parseInt(String(niveau), 10) || 1}, 0, 0)`
    )

    // HFSQL does not support RETURNING — fetch the newly inserted row by max ID
    const newRows = await query<{ IDstock_fil: number }>(
      `SELECT IDstock_fil FROM stock_fil WHERE IDfournisseur = ${IDfournisseur} AND IDref_fil = ${IDref_fil} AND IDcolori_fil = ${IDcolori_fil} ORDER BY IDstock_fil DESC`
    )
    const newId = newRows[0]?.IDstock_fil ?? null

    res.status(201).json({ IDstock_fil: newId })
  } catch (err) {
    console.error('Error creating stock_fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/stock/fil/:id - Light edit (whitelisted fields only)
stockRouter.patch('/fil/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const body = req.body ?? {}
    const sets: string[] = []

    if (typeof body.commentaire === 'string') sets.push(`commentaire = '${esc(body.commentaire)}'`)
    if (typeof body.observation_freinte === 'string') sets.push(`observation_freinte = '${esc(body.observation_freinte)}'`)
    if (typeof body.emplacement === 'string') sets.push(`emplacement = '${esc(body.emplacement)}'`)
    if (typeof body.niveau === 'number') sets.push(`niveau = ${parseInt(String(body.niveau), 10)}`)
    if (body.termine !== undefined) sets.push(`terminé = ${body.termine ? 1 : 0}`)
    if (body.controle !== undefined) sets.push(`controlé = ${body.controle ? 1 : 0}`)
    if (typeof body.dernier_pointage === 'string') {
      const d = body.dernier_pointage
      if (d === '') {
        sets.push(`dernier_pointage = NULL`)
      } else {
        sets.push(`dernier_pointage = '${esc(d)}'`)
      }
    }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No editable fields provided' })
      return
    }

    await query(`UPDATE stock_fil SET ${sets.join(', ')} WHERE IDstock_fil = ${id}`)

    // Fetch fresh row in the same shape as GET /fil/:id
    const rows = await query<StockFil>(
      `SELECT ${STOCK_SELECT} ${STOCK_JOINS} WHERE sf.IDstock_fil = ${id}`
    )
    let fixed: StockFil[] = await fixEncoding(
      rows,
      'stock_fil',
      'IDstock_fil',
      ['lot', 'lot_frs', 'emplacement', 'commentaire', 'observation_freinte']
    )
    fixed = await repairAliased(fixed, 'ref_fil', 'IDref_fil', { ref_fil: 'reference' })
    fixed = await repairAliased(fixed, 'colori_fil', 'IDcolori_fil', { colori_reference: 'reference' })
    fixed = await repairAliased(fixed, 'fournisseur', 'IDfournisseur', { fournisseur_nom: 'nom' })

    res.json(fixed[0] ?? null)
  } catch (err) {
    console.error('Error updating stock_fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/fil/:id/certif/:type - Serve bio or recycle certificate blob
stockRouter.get('/fil/:id/certif/:type', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const type = req.params.type
    const column = type === 'bio' ? 'certif_bio' : type === 'recycle' ? 'certif_recyclé' : null
    if (!column) { res.status(400).json({ error: 'Invalid type' }); return }

    const rows = await queryRaw(`SELECT ${column} AS f FROM stock_fil WHERE IDstock_fil = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return }

    const fichier = rows[0].f
    if (fichier == null) { res.status(404).json({ error: 'No document' }); return }

    let buf: Buffer
    if (fichier instanceof ArrayBuffer) buf = Buffer.from(fichier)
    else if (Buffer.isBuffer(fichier)) buf = fichier
    else { res.status(404).json({ error: 'No document' }); return }

    if (buf.length === 0 || (buf.length === 1 && buf[0] === 0)) {
      res.status(404).json({ error: 'No document' })
      return
    }

    let contentType = 'application/octet-stream'
    if (buf.length >= 4) {
      const head = buf.subarray(0, 4)
      if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) contentType = 'application/pdf'
      else if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) contentType = 'image/png'
      else if (head[0] === 0xFF && head[1] === 0xD8) contentType = 'image/jpeg'
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', 'inline')
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.end(buf)
  } catch (err) {
    console.error('Error serving stock certif:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * Repair aliased text fields that came from a joined table.
 * For each row whose alias contains U+FFFD, run a targeted CONVERT() against
 * the source table+column.
 */
async function repairAliased<T extends Record<string, unknown>>(
  rows: T[],
  table: string,
  idField: string,
  aliasMap: Record<string, string>
): Promise<T[]> {
  const aliasNames = Object.keys(aliasMap)
  const out: T[] = []
  for (const row of rows) {
    const needsFix = aliasNames.some((alias) => {
      const v = row[alias]
      return typeof v === 'string' && v.includes('\ufffd')
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
      if (typeof v === 'string' && v.includes('\ufffd')) {
        const sourceCol = aliasMap[alias]
        try {
          const r = await query<{ v: unknown }>(
            `SELECT CONVERT(${sourceCol} USING 'UTF-8') AS v FROM ${table} WHERE ${idField} = ${Number(id)}`
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

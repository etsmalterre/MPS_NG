import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import { query, fixEncoding } from '../lib/hfsql-auto.js'

export const referencesFilRouter: RouterType = Router()

// ref_fil.recyclé and every asso_fil_matiere column is accented. Follow the
// stock.ts pattern: branch on platform for writes, normalise reads via a
// post-processor so HTTP payloads only ever contain ASCII keys.
const IS_WINDOWS = process.platform === 'win32'

/** Escape a string for use in SQL (single quotes doubled) */
function esc(value: string): string {
  return value.replace(/'/g, "''")
}

/** Coerce a possibly-nullable numeric value (string | number | null) to number | null. */
function toNumOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Normalise a ref_fil row: map recyclé (any shape) → recycle. */
function normalizeRefFilRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  if (out.recycle === undefined) {
    out.recycle = (row as any)['recyclé'] ?? (row as any).recycl ?? 0
  }
  delete out['recyclé']
  delete out.recycl
  out.recycle = Number(out.recycle) || 0
  out.bio = Number(out.bio) || 0
  return out
}

/**
 * Normalise an asso_fil_matiere row. Maps:
 *   IDasso_fil_matière / any mangled variant → IDasso_fil_matiere
 *   IDMatière           / any mangled variant → IDmatiere
 *   recyclé             / recycl              → recycle
 */
function normalizeAssoFilMatiereRow(row: Record<string, unknown>): Record<string, unknown> {
  const r = row as any
  return {
    IDasso_fil_matiere: Number(
      r.IDasso_fil_matiere ?? r['IDasso_fil_matière'] ?? r.IDasso_fil_matir ?? r.IDasso_fil_mati ?? 0,
    ),
    IDRef_fil: Number(r.IDRef_fil ?? 0),
    IDmatiere: Number(r.IDmatiere ?? r['IDMatière'] ?? r.IDMatir ?? r.IDMati ?? 0),
    pourcentage: toNumOrNull(r.pourcentage),
    bio: Number(r.bio) || 0,
    recycle: Number(r.recycle ?? r['recyclé'] ?? r.recycl ?? 0) || 0,
  }
}

/** Normalise a matiere_premiere row: IDmatière_première → IDmatiere_premiere. */
function normalizeMatiereRow(row: Record<string, unknown>): Record<string, unknown> {
  const r = row as any
  return {
    IDmatiere_premiere: Number(
      r.IDmatiere_premiere ?? r['IDmatière_première'] ?? r.IDmatire_premire ?? r.IDmati_premi ?? 0,
    ),
    libelle: r.libelle ?? null,
  }
}

// ──────────────────────────────────────────────────────────
// LOOKUPS
// ──────────────────────────────────────────────────────────

// GET /api/references-fil/lookups/matieres
referencesFilRouter.get('/lookups/matieres', async (_req: Request, res: Response) => {
  try {
    const rows = await query(`SELECT * FROM matiere_premiere`)
    let normalised = rows.map((r) => normalizeMatiereRow(r as Record<string, unknown>))
    // encoding fix on libelle via the ASCII id we just assigned
    normalised = await fixEncoding(
      normalised as any,
      'matiere_premiere',
      // NOTE: fixEncoding's CONVERT uses the id field literally. On Linux the
      // accented PK is unreachable — but CONVERT only runs when a row already
      // contains U+FFFD, and libelle values like "coton", "polyester" are
      // ASCII so we typically skip the fix path entirely. When a broken value
      // does appear on Windows, fixEncoding will use the ASCII key we set.
      'IDmatiere_premiere' as any,
      ['libelle'],
    ) as any
    // Sort by libelle
    normalised.sort((a: any, b: any) => String(a.libelle ?? '').localeCompare(String(b.libelle ?? '')))
    res.json(normalised)
  } catch (err) {
    console.error('Error fetching matieres lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/references-fil/lookups/unites-titrage
referencesFilRouter.get('/lookups/unites-titrage', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDunite_titrage: number; nomenclature: string | null }>(
      `SELECT IDunite_titrage, nomenclature FROM unite_titrage ORDER BY IDunite_titrage`,
    )
    const fixed = await fixEncoding(rows, 'unite_titrage', 'IDunite_titrage', ['nomenclature'])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching unites-titrage lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ──────────────────────────────────────────────────────────
// LIST
// ──────────────────────────────────────────────────────────

// GET /api/references-fil — list of ref_fil with summary columns
referencesFilRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const refRows = await query(`SELECT * FROM ref_fil ORDER BY reference`)
    let refs = refRows.map((r) => normalizeRefFilRow(r as Record<string, unknown>))
    refs = await fixEncoding(refs as any, 'ref_fil', 'IDref_fil', ['reference', 'commentaire']) as any

    if (refs.length === 0) {
      res.json([])
      return
    }

    // Batched summary: variant count + distinct supplier count per ref_fil
    const variantCountRows = await query<{ IDref_fil: number; n: number }>(
      `SELECT IDref_fil, COUNT(*) AS n FROM colori_fil GROUP BY IDref_fil`,
    )
    const variantsByRef = new Map<number, number>()
    for (const r of variantCountRows) variantsByRef.set(Number(r.IDref_fil), Number(r.n))

    const supplierCountRows = await query<{ IDref_fil: number; n: number }>(
      `SELECT cf.IDref_fil AS IDref_fil, COUNT(DISTINCT a.IDfournisseur) AS n FROM asso_colorisfil_frs a JOIN colori_fil cf ON a.IDcolori_fil = cf.IDcolori_fil GROUP BY cf.IDref_fil`,
    )
    const suppliersByRef = new Map<number, number>()
    for (const r of supplierCountRows) suppliersByRef.set(Number(r.IDref_fil), Number(r.n))

    const out = refs.map((r: any) => ({
      ...r,
      variantes_count: variantsByRef.get(Number(r.IDref_fil)) ?? 0,
      fournisseurs_count: suppliersByRef.get(Number(r.IDref_fil)) ?? 0,
    }))

    res.json(out)
  } catch (err) {
    console.error('Error fetching ref_fil list:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ──────────────────────────────────────────────────────────
// DETAIL
// ──────────────────────────────────────────────────────────

// GET /api/references-fil/:id
referencesFilRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    // Base row
    const rows = await query(`SELECT * FROM ref_fil WHERE IDref_fil = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Ref fil not found' }); return }
    let refNormalised = normalizeRefFilRow(rows[0] as Record<string, unknown>)
    const refFixed = await fixEncoding(
      [refNormalised] as any,
      'ref_fil',
      'IDref_fil',
      ['reference', 'commentaire'],
    ) as any
    refNormalised = refFixed[0]

    // Variantes — colori_fil is all ASCII. NB: colori_fil.IDfournisseur is
    // misleading legacy data (see project memory). Real fournisseur↔coloris
    // links live in asso_colorisfil_frs and are loaded below.
    const varianteRows = await query(
      `SELECT IDcolori_fil, IDref_fil, reference, prix_kg, stock_mini, commentaire FROM colori_fil WHERE IDref_fil = ${id} ORDER BY reference`,
    )
    const variantesFixed = await fixEncoding(
      varianteRows as any,
      'colori_fil',
      'IDcolori_fil',
      ['reference', 'commentaire'],
    )

    // For each variante, load the linked fournisseurs via asso_colorisfil_frs
    // (one batched query joined against fournisseur for the names).
    const coloriIds = variantesFixed.map((v: any) => Number(v.IDcolori_fil)).filter(Boolean)
    const fournisseursByVariante = new Map<
      number,
      Array<{ IDfournisseur: number; nom: string | null }>
    >()
    if (coloriIds.length > 0) {
      const linkRows = await query<{
        IDcolori_fil: number
        IDfournisseur: number
        nom: string | null
      }>(
        `SELECT a.IDcolori_fil, a.IDfournisseur, f.nom
           FROM asso_colorisfil_frs a
           JOIN fournisseur f ON a.IDfournisseur = f.IDfournisseur
          WHERE a.IDcolori_fil IN (${coloriIds.join(',')})
          ORDER BY f.nom`,
      )
      const fixedLinks = await fixEncoding(linkRows as any, 'fournisseur', 'IDfournisseur', ['nom'])
      for (const r of fixedLinks as any[]) {
        const key = Number(r.IDcolori_fil)
        const arr = fournisseursByVariante.get(key) ?? []
        arr.push({ IDfournisseur: Number(r.IDfournisseur), nom: r.nom ?? null })
        fournisseursByVariante.set(key, arr)
      }
    }
    const variantes = variantesFixed.map((v: any) => {
      const frs = fournisseursByVariante.get(Number(v.IDcolori_fil)) ?? []
      return {
        IDcolori_fil: Number(v.IDcolori_fil),
        IDref_fil: Number(v.IDref_fil),
        reference: v.reference ?? null,
        prix_kg: toNumOrNull(v.prix_kg),
        stock_mini: toNumOrNull(v.stock_mini),
        commentaire: v.commentaire ?? null,
        fournisseurs_count: frs.length,
        fournisseurs: frs,
      }
    })

    // Composition — asso_fil_matiere (accented columns). SELECT * and normalise.
    const assoRows = await query(`SELECT * FROM asso_fil_matiere WHERE IDRef_fil = ${id}`)
    const assoNormalised = assoRows.map((r) => normalizeAssoFilMatiereRow(r as Record<string, unknown>))

    // Enrich each composition row with the matiere libelle
    const matiereIds = Array.from(new Set(assoNormalised.map((a: any) => a.IDmatiere).filter((n: number) => n > 0)))
    const matiereLabelByld = new Map<number, string>()
    if (matiereIds.length > 0) {
      // SELECT * + normalise because the PK is accented on Linux
      const matRows = await query(`SELECT * FROM matiere_premiere`)
      let matNormalised = matRows.map((r) => normalizeMatiereRow(r as Record<string, unknown>))
      matNormalised = (await fixEncoding(
        matNormalised as any,
        'matiere_premiere',
        'IDmatiere_premiere' as any,
        ['libelle'],
      )) as any
      for (const m of matNormalised as any[]) {
        matiereLabelByld.set(Number(m.IDmatiere_premiere), String(m.libelle ?? ''))
      }
    }
    const composition = assoNormalised.map((a: any) => ({
      ...a,
      matiere_libelle: matiereLabelByld.get(Number(a.IDmatiere)) ?? null,
    }))

    // Aggregated stock (kg) across all variants, in-progress lots only
    // stock_fil.terminé is accented — we can safely SELECT all stock rows for
    // this ref_fil and filter termine in JS (same approach as stock.ts list).
    let stockTotalKg = 0
    let stockLots = 0
    const stockPerVariante = new Map<number, { total_kg: number; lots: number }>()
    if (coloriIds.length > 0) {
      const stockRows = await query(`SELECT * FROM stock_fil WHERE IDref_fil = ${id}`)
      for (const sr of stockRows) {
        const r = sr as any
        const termine = Number(r['terminé'] ?? r.termin ?? 0)
        if (termine !== 0) continue
        const coloriId = Number(r.IDcolori_fil)
        const kg = Number(r.stock) || 0
        stockTotalKg += kg
        stockLots += 1
        if (coloriId > 0) {
          const cur = stockPerVariante.get(coloriId) ?? { total_kg: 0, lots: 0 }
          cur.total_kg += kg
          cur.lots += 1
          stockPerVariante.set(coloriId, cur)
        }
      }
    }

    // Commande history: every ref_fil_commande line for this ref, joined to
    // its parent commande_fil (no etat filter — both en cours and terminée
    // appear), to fournisseur for display, and to colori_fil for the
    // ordered variant. Ordered most-recent-first.
    const orderRows = await query<{
      IDref_fil_commande: number
      IDcommande_fil: number
      quantite: number
      prix_unitaire: number | null
      IDcolori_fil: number
      colori_reference: string | null
      date_commande: string | null
      etat_cmd: number
      IDfournisseur: number
      fournisseur_nom: string | null
    }>(
      `SELECT rfc.IDref_fil_commande, rfc.IDcommande_fil, rfc.quantite, rfc.prix_unitaire, rfc.IDcolori_fil, col.reference AS colori_reference, cmd.date_commande, cmd.etat AS etat_cmd, cmd.IDfournisseur, f.nom AS fournisseur_nom
       FROM ref_fil_commande rfc
       JOIN commande_fil cmd ON rfc.IDcommande_fil = cmd.IDcommande_fil
       LEFT JOIN fournisseur f ON cmd.IDfournisseur = f.IDfournisseur
       LEFT JOIN colori_fil col ON rfc.IDcolori_fil = col.IDcolori_fil
       WHERE rfc.IDref_fil = ${id}
       ORDER BY cmd.date_commande DESC, rfc.IDref_fil_commande DESC`,
    )
    const orderRowsFournisseurFixed = await fixEncoding(orderRows, 'fournisseur', 'IDfournisseur', ['fournisseur_nom'])
    const orderRowsFixed = await fixEncoding(orderRowsFournisseurFixed, 'colori_fil', 'IDcolori_fil', ['colori_reference'])
    const commandeHistory = orderRowsFixed.map((r) => ({
      IDref_fil_commande: Number(r.IDref_fil_commande),
      IDcommande_fil: Number(r.IDcommande_fil),
      quantite: Number(r.quantite) || 0,
      prix_unitaire: toNumOrNull(r.prix_unitaire),
      IDcolori_fil: Number(r.IDcolori_fil) || 0,
      colori_reference: r.colori_reference ?? null,
      date_commande: r.date_commande ?? null,
      etat: Number(r.etat_cmd) || 0,
      IDfournisseur: Number(r.IDfournisseur) || 0,
      fournisseur_nom: r.fournisseur_nom ?? null,
    }))
    const commandeTotalKg = commandeHistory.reduce((sum, r) => sum + r.quantite, 0)
    const commandeLignes = commandeHistory.length

    // Distinct fournisseurs across all variants (read-only list for sidebar)
    let fournisseurs: Array<{ IDfournisseur: number; nom: string | null }> = []
    if (coloriIds.length > 0) {
      const frsRows = await query<{ IDfournisseur: number; nom: string | null }>(
        `SELECT DISTINCT f.IDfournisseur, f.nom FROM asso_colorisfil_frs a JOIN fournisseur f ON a.IDfournisseur = f.IDfournisseur WHERE a.IDcolori_fil IN (${coloriIds.join(',')}) ORDER BY f.nom`,
      )
      fournisseurs = await fixEncoding(frsRows, 'fournisseur', 'IDfournisseur', ['nom'])
    }

    const stockPerVarianteArr = Array.from(stockPerVariante.entries()).map(([IDcolori_fil, v]) => ({
      IDcolori_fil,
      total_kg: v.total_kg,
      lots: v.lots,
    }))

    res.json({
      ...refNormalised,
      variantes,
      composition,
      stock_total_kg: stockTotalKg,
      stock_lots: stockLots,
      stock_per_variante: stockPerVarianteArr,
      commande_total_kg: commandeTotalKg,
      commande_lignes: commandeLignes,
      commande_history: commandeHistory,
      fournisseurs,
    })
  } catch (err) {
    console.error('Error fetching ref_fil detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ──────────────────────────────────────────────────────────
// REF_FIL CRUD
// ──────────────────────────────────────────────────────────

const refFilBody = z.object({
  reference: z.string().min(1).max(100),
  commentaire: z.string().optional().nullable(),
  prix_kg: z.number().optional().nullable(),
  titrage: z.number().optional().nullable(),
  nb_fil: z.number().optional().nullable(),
  nb_brin: z.number().optional().nullable(),
  IDunite_titrage: z.number().optional().nullable(),
  bio: z.boolean().optional(),
  recycle: z.boolean().optional(),
})

function buildRefFilSets(body: z.infer<typeof refFilBody>): string[] {
  const sets: string[] = []
  sets.push(`reference = '${esc(body.reference)}'`)
  sets.push(`commentaire = '${esc(body.commentaire ?? '')}'`)
  sets.push(`prix_kg = ${body.prix_kg ?? 0}`)
  sets.push(`titrage = ${body.titrage ?? 0}`)
  sets.push(`nb_fil = ${body.nb_fil ?? 0}`)
  sets.push(`nb_brin = ${body.nb_brin ?? 0}`)
  sets.push(`IDunite_titrage = ${body.IDunite_titrage ?? 0}`)
  sets.push(`bio = ${body.bio ? 1 : 0}`)
  // recyclé is accented — Windows only. On Linux the set is skipped.
  if (IS_WINDOWS) sets.push(`recyclé = ${body.recycle ? 1 : 0}`)
  return sets
}

// POST /api/references-fil
referencesFilRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = refFilBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const b = parsed.data

    // Build column list — exclude recyclé on Linux
    const cols = ['reference', 'commentaire', 'prix_kg', 'titrage', 'nb_fil', 'nb_brin', 'IDunite_titrage', 'bio']
    const vals: string[] = [
      `'${esc(b.reference)}'`,
      `'${esc(b.commentaire ?? '')}'`,
      String(b.prix_kg ?? 0),
      String(b.titrage ?? 0),
      String(b.nb_fil ?? 0),
      String(b.nb_brin ?? 0),
      String(b.IDunite_titrage ?? 0),
      String(b.bio ? 1 : 0),
    ]
    if (IS_WINDOWS) {
      cols.push('recyclé')
      vals.push(String(b.recycle ? 1 : 0))
    }
    await query(`INSERT INTO ref_fil (${cols.join(', ')}) VALUES (${vals.join(', ')})`)

    // HFSQL has no RETURNING — fetch back by reference + latest id
    const rows = await query<{ IDref_fil: number }>(
      `SELECT IDref_fil FROM ref_fil WHERE reference = '${esc(b.reference)}' ORDER BY IDref_fil DESC`,
    )
    const newId = rows[0]?.IDref_fil ?? null
    res.status(201).json({ IDref_fil: newId })
  } catch (err) {
    console.error('Error creating ref_fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/references-fil/:id
referencesFilRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = refFilBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const sets = buildRefFilSets(parsed.data)
    await query(`UPDATE ref_fil SET ${sets.join(', ')} WHERE IDref_fil = ${id}`)
    res.json({ ok: true, _linux_recycle_skipped: !IS_WINDOWS })
  } catch (err) {
    console.error('Error updating ref_fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/references-fil/:id — guarded
referencesFilRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    // Guard: no variantes
    const variantes = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM colori_fil WHERE IDref_fil = ${id}`,
    )
    if (Number(variantes[0]?.n ?? 0) > 0) {
      res.status(409).json({ error: 'Cette référence possède encore des variantes de coloris.' })
      return
    }
    // Guard: no stock_fil rows
    const stock = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM stock_fil WHERE IDref_fil = ${id}`,
    )
    if (Number(stock[0]?.n ?? 0) > 0) {
      res.status(409).json({ error: 'Cette référence est utilisée par des lots de stock.' })
      return
    }
    // Guard: no ref_fil_commande rows
    const orders = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ref_fil_commande WHERE IDref_fil = ${id}`,
    )
    if (Number(orders[0]?.n ?? 0) > 0) {
      res.status(409).json({ error: 'Cette référence est utilisée par des commandes en cours ou passées.' })
      return
    }
    await query(`DELETE FROM ref_fil WHERE IDref_fil = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting ref_fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ──────────────────────────────────────────────────────────
// VARIANTES (colori_fil) — all ASCII columns
// ──────────────────────────────────────────────────────────

const varianteBody = z.object({
  reference: z.string().min(1).max(100),
  prix_kg: z.number().optional().nullable(),
  stock_mini: z.number().optional().nullable(),
  commentaire: z.string().optional().nullable(),
})

// POST /api/references-fil/:id/variantes
referencesFilRouter.post('/:id/variantes', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = varianteBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const b = parsed.data
    // NB: colori_fil.IDfournisseur is deprecated legacy metadata — fournisseur
    // links go into asso_colorisfil_frs via /:id/variantes/:coloriId/fournisseurs.
    await query(
      `INSERT INTO colori_fil (IDref_fil, reference, prix_kg, stock_mini, commentaire) VALUES (${id}, '${esc(b.reference)}', ${b.prix_kg ?? 0}, ${b.stock_mini ?? 0}, '${esc(b.commentaire ?? '')}')`,
    )
    // Fetch the new id — match by (IDref_fil, reference) and take the latest
    const rows = await query<{ IDcolori_fil: number }>(
      `SELECT IDcolori_fil FROM colori_fil WHERE IDref_fil = ${id} AND reference = '${esc(b.reference)}' ORDER BY IDcolori_fil DESC`,
    )
    const newId = rows[0]?.IDcolori_fil ?? null
    res.status(201).json({ IDcolori_fil: newId })
  } catch (err) {
    console.error('Error creating colori_fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/references-fil/:id/variantes/:coloriId
referencesFilRouter.put('/:id/variantes/:coloriId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    const coloriId = parseInt(req.params.coloriId, 10)
    if (isNaN(id) || isNaN(coloriId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    // Scope guard: the variante must belong to this ref
    const scope = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM colori_fil WHERE IDcolori_fil = ${coloriId} AND IDref_fil = ${id}`,
    )
    if (Number(scope[0]?.n ?? 0) === 0) {
      res.status(404).json({ error: 'Variante not found for this reference' })
      return
    }

    const parsed = varianteBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const b = parsed.data
    await query(
      `UPDATE colori_fil SET reference = '${esc(b.reference)}', prix_kg = ${b.prix_kg ?? 0}, stock_mini = ${b.stock_mini ?? 0}, commentaire = '${esc(b.commentaire ?? '')}' WHERE IDcolori_fil = ${coloriId}`,
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating colori_fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/references-fil/:id/variantes/:coloriId — guarded
referencesFilRouter.delete('/:id/variantes/:coloriId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    const coloriId = parseInt(req.params.coloriId, 10)
    if (isNaN(id) || isNaN(coloriId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    // Scope guard
    const scope = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM colori_fil WHERE IDcolori_fil = ${coloriId} AND IDref_fil = ${id}`,
    )
    if (Number(scope[0]?.n ?? 0) === 0) {
      res.status(404).json({ error: 'Variante not found for this reference' })
      return
    }
    // Guard: no stock_fil
    const stock = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM stock_fil WHERE IDcolori_fil = ${coloriId}`,
    )
    if (Number(stock[0]?.n ?? 0) > 0) {
      res.status(409).json({ error: 'Cette variante est utilisée par des lots de stock.' })
      return
    }
    // Guard: no ref_fil_commande
    const orders = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ref_fil_commande WHERE IDcolori_fil = ${coloriId}`,
    )
    if (Number(orders[0]?.n ?? 0) > 0) {
      res.status(409).json({ error: 'Cette variante est utilisée par des commandes.' })
      return
    }
    // Guard: no asso_colorisfil_frs
    const linked = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM asso_colorisfil_frs WHERE IDcolori_fil = ${coloriId}`,
    )
    if (Number(linked[0]?.n ?? 0) > 0) {
      res.status(409).json({ error: 'Cette variante est encore liée à un ou plusieurs fournisseurs.' })
      return
    }
    await query(`DELETE FROM colori_fil WHERE IDcolori_fil = ${coloriId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting colori_fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ──────────────────────────────────────────────────────────
// VARIANTE ↔ FOURNISSEUR links (asso_colorisfil_frs)
// ──────────────────────────────────────────────────────────
// The M:N join between colori_fil and fournisseur. POST is idempotent
// (skips if already linked). DELETE is scoped to the parent ref so a
// stray coloriId from another reference can't be touched via this URL.

// Helper: validate that the coloris belongs to the ref AND the fournisseur
// exists. Returns null on success, or an Express response error on failure.
async function verifyVarianteFournisseurScope(
  refId: number,
  coloriId: number,
  fournisseurId: number,
): Promise<{ status: number; error: string } | null> {
  if (!Number.isFinite(refId) || refId <= 0) return { status: 400, error: 'Invalid ref id' }
  if (!Number.isFinite(coloriId) || coloriId <= 0) return { status: 400, error: 'Invalid coloris id' }
  if (!Number.isFinite(fournisseurId) || fournisseurId <= 0) {
    return { status: 400, error: 'Invalid fournisseur id' }
  }
  const variante = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM colori_fil WHERE IDcolori_fil = ${coloriId} AND IDref_fil = ${refId}`,
  )
  if (Number(variante[0]?.n ?? 0) === 0) {
    return { status: 404, error: 'Variante not found for this reference' }
  }
  const frs = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM fournisseur WHERE IDfournisseur = ${fournisseurId}`,
  )
  if (Number(frs[0]?.n ?? 0) === 0) {
    return { status: 404, error: 'Fournisseur not found' }
  }
  return null
}

// POST /api/references-fil/:id/variantes/:coloriId/fournisseurs/:fournisseurId
referencesFilRouter.post(
  '/:id/variantes/:coloriId/fournisseurs/:fournisseurId',
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10)
      const coloriId = parseInt(req.params.coloriId, 10)
      const fournisseurId = parseInt(req.params.fournisseurId, 10)

      const scopeError = await verifyVarianteFournisseurScope(id, coloriId, fournisseurId)
      if (scopeError) {
        res.status(scopeError.status).json({ error: scopeError.error })
        return
      }

      // Idempotent — skip if the link already exists
      const existing = await query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM asso_colorisfil_frs WHERE IDcolori_fil = ${coloriId} AND IDfournisseur = ${fournisseurId}`,
      )
      if (Number(existing[0]?.n ?? 0) === 0) {
        await query(
          `INSERT INTO asso_colorisfil_frs (IDfournisseur, IDcolori_fil) VALUES (${fournisseurId}, ${coloriId})`,
        )
      }
      res.status(201).json({ ok: true })
    } catch (err) {
      console.error('Error linking fournisseur to variante:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

// DELETE /api/references-fil/:id/variantes/:coloriId/fournisseurs/:fournisseurId
referencesFilRouter.delete(
  '/:id/variantes/:coloriId/fournisseurs/:fournisseurId',
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10)
      const coloriId = parseInt(req.params.coloriId, 10)
      const fournisseurId = parseInt(req.params.fournisseurId, 10)

      const scopeError = await verifyVarianteFournisseurScope(id, coloriId, fournisseurId)
      if (scopeError) {
        res.status(scopeError.status).json({ error: scopeError.error })
        return
      }

      await query(
        `DELETE FROM asso_colorisfil_frs WHERE IDcolori_fil = ${coloriId} AND IDfournisseur = ${fournisseurId}`,
      )
      res.json({ ok: true })
    } catch (err) {
      console.error('Error unlinking fournisseur from variante:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

// ──────────────────────────────────────────────────────────
// COMPOSITION (asso_fil_matiere) — Windows-only writes
// ──────────────────────────────────────────────────────────

const compositionBody = z.object({
  IDmatiere: z.number().int().positive(),
  pourcentage: z.number().min(0).max(100),
  bio: z.boolean().optional(),
  recycle: z.boolean().optional(),
})

function linuxGuard(res: Response): boolean {
  if (!IS_WINDOWS) {
    res.status(501).json({
      error:
        "L'édition de la composition n'est pas disponible sur cet environnement. Utilisez l'application WinDev pour modifier les matières.",
    })
    return true
  }
  return false
}

// POST /api/references-fil/:id/compositions
referencesFilRouter.post('/:id/compositions', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    if (linuxGuard(res)) return

    const parsed = compositionBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const b = parsed.data
    // Accented column names work directly on Windows
    await query(
      `INSERT INTO asso_fil_matiere (IDRef_fil, IDMatière, pourcentage, bio, recyclé) VALUES (${id}, ${b.IDmatiere}, ${b.pourcentage}, ${b.bio ? 1 : 0}, ${b.recycle ? 1 : 0})`,
    )
    // Fetch newest id in this ref
    const rows = await query(
      `SELECT * FROM asso_fil_matiere WHERE IDRef_fil = ${id}`,
    )
    const normalised = rows.map((r) => normalizeAssoFilMatiereRow(r as Record<string, unknown>))
    // Latest by id
    normalised.sort((a: any, b: any) => Number(b.IDasso_fil_matiere) - Number(a.IDasso_fil_matiere))
    res.status(201).json({ IDasso_fil_matiere: Number((normalised[0] as any)?.IDasso_fil_matiere) || null })
  } catch (err) {
    console.error('Error creating asso_fil_matiere:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/references-fil/:id/compositions/:assoId
referencesFilRouter.put('/:id/compositions/:assoId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    const assoId = parseInt(req.params.assoId, 10)
    if (isNaN(id) || isNaN(assoId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    if (linuxGuard(res)) return

    const parsed = compositionBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const b = parsed.data
    // Scope guard: the asso row must belong to this ref
    const scopeRows = await query(
      `SELECT IDRef_fil FROM asso_fil_matiere WHERE IDasso_fil_matière = ${assoId}`,
    )
    if (scopeRows.length === 0 || Number((scopeRows[0] as any).IDRef_fil) !== id) {
      res.status(404).json({ error: 'Composition row not found for this reference' })
      return
    }
    await query(
      `UPDATE asso_fil_matiere SET IDMatière = ${b.IDmatiere}, pourcentage = ${b.pourcentage}, bio = ${b.bio ? 1 : 0}, recyclé = ${b.recycle ? 1 : 0} WHERE IDasso_fil_matière = ${assoId}`,
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating asso_fil_matiere:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/references-fil/:id/compositions/:assoId
referencesFilRouter.delete('/:id/compositions/:assoId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    const assoId = parseInt(req.params.assoId, 10)
    if (isNaN(id) || isNaN(assoId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    if (linuxGuard(res)) return

    // Scope guard
    const scopeRows = await query(
      `SELECT IDRef_fil FROM asso_fil_matiere WHERE IDasso_fil_matière = ${assoId}`,
    )
    if (scopeRows.length === 0 || Number((scopeRows[0] as any).IDRef_fil) !== id) {
      res.status(404).json({ error: 'Composition row not found for this reference' })
      return
    }
    await query(`DELETE FROM asso_fil_matiere WHERE IDasso_fil_matière = ${assoId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting asso_fil_matiere:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

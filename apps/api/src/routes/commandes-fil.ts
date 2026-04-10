import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import { query, fixEncoding } from '../lib/hfsql-auto.js'

export const commandesFilRouter: RouterType = Router()

// ── Types ────────────────────────────────────────────────

interface CommandeFil {
  IDcommande_fil: number
  IDfournisseur: number
  date_commande: string | null
  etat: number | null
  commentaire: string | null
  journal: string | null
  IDadresse_fournisseur: number | null
  IDadresse_livraison: number | null
  IDmode_paiement: number | null
  IDecheance: number | null
}

interface RefFilCommande {
  IDref_fil_commande: number
  IDcommande_fil: number
  IDref_fil: number
  IDcolori_fil: number
  quantite: number | null
  unite: number | null
  prix_unitaire: number | null
  date_livraison: string | null
  etat: number | null
  date_notif: string | null
}

// ── Helpers ──────────────────────────────────────────────

function esc(value: string): string {
  return value.replace(/'/g, "''")
}

function n(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(value)
  return isNaN(parsed) ? 0 : parsed
}

/** Keep only digits from a YYYYMMDD-ish input. Accepts 'YYYY-MM-DD' or 'YYYYMMDD' or ''. */
function dateStr(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value).replace(/-/g, '')
  return /^\d{8}$/.test(s) ? s : ''
}

// ── Validation schemas ───────────────────────────────────

const commandeBody = z.object({
  IDfournisseur: z.number().int().positive(),
  date_commande: z.string().optional(), // YYYYMMDD or YYYY-MM-DD
  IDadresse_fournisseur: z.number().int().nonnegative().optional(),
  IDadresse_livraison: z.number().int().nonnegative().optional(),
  IDmode_paiement: z.number().int().nonnegative().optional(),
  IDecheance: z.number().int().nonnegative().optional(),
  commentaire: z.string().optional(),
  journal: z.string().optional(),
  etat: z.number().int().min(0).max(1).optional(),
})

const ligneBody = z.object({
  IDref_fil: z.number().int().positive(),
  IDcolori_fil: z.number().int().positive(),
  quantite: z.number().optional(),
  unite: z.number().int().optional(),
  prix_unitaire: z.number().optional(),
  date_livraison: z.string().optional(),
  etat: z.number().int().min(0).max(1).optional(),
})

// ── Lookups ──────────────────────────────────────────────

commandesFilRouter.get('/lookups/modes-paiement', async (_req: Request, res: Response) => {
  try {
    const rows = await query('SELECT IDmode_paiement, libelle FROM mode_paiement ORDER BY libelle')
    const fixed = await fixEncoding(rows, 'mode_paiement', 'IDmode_paiement', ['libelle'])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching mode_paiement:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesFilRouter.get('/lookups/echeances', async (_req: Request, res: Response) => {
  try {
    const rows = await query('SELECT IDecheance, libelle, nb_jours FROM echeance ORDER BY libelle')
    const fixed = await fixEncoding(rows, 'echeance', 'IDecheance', ['libelle'])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching echeance:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesFilRouter.get('/lookups/refs-fil', async (req: Request, res: Response) => {
  try {
    const fid = parseInt(String(req.query.fournisseur ?? ''), 10)
    if (isNaN(fid)) { res.status(400).json({ error: 'fournisseur query parameter required' }); return }

    const rows = await query(
      `SELECT cf.IDcolori_fil, cf.reference as colori_reference, cf.prix_kg as colori_prix_kg, rf.IDref_fil, rf.reference as ref_fil_reference, rf.bio, rf.titrage FROM asso_colorisfil_frs a JOIN colori_fil cf ON a.IDcolori_fil = cf.IDcolori_fil JOIN ref_fil rf ON cf.IDref_fil = rf.IDref_fil WHERE a.IDfournisseur = ${fid} ORDER BY rf.reference, cf.reference`
    )
    const fixed = await fixEncoding(rows, 'colori_fil', 'IDcolori_fil', ['colori_reference', 'ref_fil_reference'])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching refs-fil lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesFilRouter.get('/lookups/adresses', async (req: Request, res: Response) => {
  try {
    const fid = parseInt(String(req.query.fournisseur ?? ''), 10)
    if (isNaN(fid)) { res.status(400).json({ error: 'fournisseur query parameter required' }); return }

    const rows = await query(`SELECT * FROM adresse WHERE IDfournisseur = ${fid} ORDER BY est_defaut DESC, IDadresse`)
    const fixed = await fixEncoding(rows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays', 'commentaire'])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching adresses lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── List all commandes ───────────────────────────────────

commandesFilRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim()
    const fournisseurFilter = parseInt(String(req.query.fournisseur ?? ''), 10)
    const etatFilter = String(req.query.etat ?? 'all')

    const whereParts: string[] = []
    if (!isNaN(fournisseurFilter)) whereParts.push(`cf.IDfournisseur = ${fournisseurFilter}`)
    if (etatFilter === 'en_cours') whereParts.push(`cf.etat = 0`)
    else if (etatFilter === 'terminee') whereParts.push(`cf.etat = 1`)
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

    const commandes = await query<any>(
      `SELECT cf.IDcommande_fil, cf.IDfournisseur, cf.date_commande, cf.etat, cf.commentaire FROM commande_fil cf ${whereSql} ORDER BY cf.date_commande DESC, cf.IDcommande_fil DESC`
    )
    const fixedCommandes = await fixEncoding(commandes, 'commande_fil', 'IDcommande_fil', ['commentaire'])

    // Fetch supplier names in a bulk query and merge in JS (avoid aliased CONVERT mismatch in fixEncoding)
    const fournisseurIds = Array.from(new Set(fixedCommandes.map((c: any) => Number(c.IDfournisseur)).filter((x) => !isNaN(x) && x > 0)))
    const fournisseurNomMap = new Map<number, string>()
    if (fournisseurIds.length > 0) {
      const frs = await query<{ IDfournisseur: number; nom: string }>(
        `SELECT IDfournisseur, nom FROM fournisseur WHERE IDfournisseur IN (${fournisseurIds.join(',')})`
      )
      const fixedFrs = await fixEncoding(frs, 'fournisseur', 'IDfournisseur', ['nom'])
      for (const f of fixedFrs) fournisseurNomMap.set(Number(f.IDfournisseur), f.nom ?? '')
    }
    const fixedWithFournisseurNom = fixedCommandes.map((c: any) => ({
      ...c,
      fournisseur_nom: fournisseurNomMap.get(Number(c.IDfournisseur)) ?? '',
    }))

    // Fetch line totals in one bulk query
    const ids = fixedWithFournisseurNom.map((c: any) => c.IDcommande_fil).filter(Boolean)
    const totalsMap = new Map<number, { total_kg: number; total_eur: number; nb_lignes: number }>()
    if (ids.length > 0) {
      const lignes = await query<any>(
        `SELECT IDcommande_fil, quantite, prix_unitaire FROM ref_fil_commande WHERE IDcommande_fil IN (${ids.join(',')})`
      )
      for (const l of lignes) {
        const id = Number(l.IDcommande_fil)
        const acc = totalsMap.get(id) ?? { total_kg: 0, total_eur: 0, nb_lignes: 0 }
        const qty = Number(l.quantite) || 0
        const price = Number(l.prix_unitaire) || 0
        acc.total_kg += qty
        acc.total_eur += qty * price
        acc.nb_lignes += 1
        totalsMap.set(id, acc)
      }
    }

    // Filter by search query (supplier name, id, or commentaire)
    const qLower = q.toLowerCase()
    const result = fixedWithFournisseurNom
      .map((c: any) => {
        const totals = totalsMap.get(Number(c.IDcommande_fil)) ?? { total_kg: 0, total_eur: 0, nb_lignes: 0 }
        return { ...c, ...totals }
      })
      .filter((c: any) => {
        if (!q) return true
        const hay = `${c.IDcommande_fil} ${c.fournisseur_nom ?? ''} ${c.commentaire ?? ''}`.toLowerCase()
        return hay.includes(qLower)
      })

    res.json(result)
  } catch (err) {
    console.error('Error fetching commandes-fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Get one commande with full detail ───────────────────

commandesFilRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const rows = await query<CommandeFil>(`SELECT * FROM commande_fil WHERE IDcommande_fil = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Commande not found' }); return }

    const fixedHeader = await fixEncoding(rows, 'commande_fil', 'IDcommande_fil', ['commentaire', 'journal'])
    const header = fixedHeader[0] as any

    // Fetch related data in parallel
    const [fournisseurRows, modePaiementRows, echeanceRows, adresseFactRows, adresseLivRows, lignes] = await Promise.all([
      query(`SELECT IDfournisseur, nom FROM fournisseur WHERE IDfournisseur = ${n(header.IDfournisseur)}`),
      header.IDmode_paiement ? query(`SELECT IDmode_paiement, libelle FROM mode_paiement WHERE IDmode_paiement = ${n(header.IDmode_paiement)}`) : Promise.resolve([]),
      header.IDecheance ? query(`SELECT IDecheance, libelle, nb_jours FROM echeance WHERE IDecheance = ${n(header.IDecheance)}`) : Promise.resolve([]),
      header.IDadresse_fournisseur ? query(`SELECT * FROM adresse WHERE IDadresse = ${n(header.IDadresse_fournisseur)}`) : Promise.resolve([]),
      header.IDadresse_livraison ? query(`SELECT * FROM adresse WHERE IDadresse = ${n(header.IDadresse_livraison)}`) : Promise.resolve([]),
      query(
        `SELECT rfc.IDref_fil_commande, rfc.IDcommande_fil, rfc.IDref_fil, rfc.IDcolori_fil, rfc.quantite, rfc.unite, rfc.prix_unitaire, rfc.date_livraison, rfc.etat, rf.reference as ref_fil, rf.bio as ref_fil_bio, cf.reference as colori_reference FROM ref_fil_commande rfc LEFT JOIN ref_fil rf ON rfc.IDref_fil = rf.IDref_fil LEFT JOIN colori_fil cf ON rfc.IDcolori_fil = cf.IDcolori_fil WHERE rfc.IDcommande_fil = ${id} ORDER BY rfc.IDref_fil_commande`
      ),
    ])

    const fixedFournisseur = await fixEncoding(fournisseurRows, 'fournisseur', 'IDfournisseur', ['nom'])
    const fixedModePaiement = await fixEncoding(modePaiementRows, 'mode_paiement', 'IDmode_paiement', ['libelle'])
    const fixedEcheance = await fixEncoding(echeanceRows, 'echeance', 'IDecheance', ['libelle'])
    const fixedAdresseFact = await fixEncoding(adresseFactRows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays'])
    const fixedAdresseLiv = await fixEncoding(adresseLivRows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays'])
    const fixedLignes = await fixEncoding(lignes, 'ref_fil_commande', 'IDref_fil_commande', ['ref_fil', 'colori_reference'])

    res.json({
      ...header,
      fournisseur_nom: (fixedFournisseur[0] as any)?.nom ?? null,
      mode_paiement_libelle: (fixedModePaiement[0] as any)?.libelle ?? null,
      echeance_libelle: (fixedEcheance[0] as any)?.libelle ?? null,
      adresse_facturation: fixedAdresseFact[0] ?? null,
      adresse_livraison: fixedAdresseLiv[0] ?? null,
      lignes: fixedLignes,
    })
  } catch (err) {
    console.error('Error fetching commande-fil detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Create commande ──────────────────────────────────────

commandesFilRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = commandeBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data
    const dateCmd = dateStr(d.date_commande)

    await query(
      `INSERT INTO commande_fil (IDfournisseur, date_commande, etat, commentaire, journal, IDadresse_fournisseur, IDadresse_livraison, IDmode_paiement, IDecheance) VALUES (${d.IDfournisseur}, '${dateCmd}', 0, '${esc(d.commentaire ?? '')}', '${esc(d.journal ?? '')}', ${d.IDadresse_fournisseur ?? 0}, ${d.IDadresse_livraison ?? 0}, ${d.IDmode_paiement ?? 0}, ${d.IDecheance ?? 0})`
    )

    // Fetch the newly inserted row
    const rows = await query<CommandeFil>(
      `SELECT * FROM commande_fil WHERE IDfournisseur = ${d.IDfournisseur} ORDER BY IDcommande_fil DESC`
    )
    const fixed = await fixEncoding(rows.slice(0, 1), 'commande_fil', 'IDcommande_fil', ['commentaire', 'journal'])
    res.status(201).json(fixed[0] ?? {})
  } catch (err) {
    console.error('Error creating commande-fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Update commande header ───────────────────────────────

commandesFilRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = commandeBody.partial().safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data

    const sets: string[] = []
    if (d.date_commande !== undefined) sets.push(`date_commande = '${dateStr(d.date_commande)}'`)
    if (d.etat !== undefined) sets.push(`etat = ${d.etat}`)
    if (d.commentaire !== undefined) sets.push(`commentaire = '${esc(d.commentaire)}'`)
    if (d.journal !== undefined) sets.push(`journal = '${esc(d.journal)}'`)
    if (d.IDadresse_fournisseur !== undefined) sets.push(`IDadresse_fournisseur = ${d.IDadresse_fournisseur}`)
    if (d.IDadresse_livraison !== undefined) sets.push(`IDadresse_livraison = ${d.IDadresse_livraison}`)
    if (d.IDmode_paiement !== undefined) sets.push(`IDmode_paiement = ${d.IDmode_paiement}`)
    if (d.IDecheance !== undefined) sets.push(`IDecheance = ${d.IDecheance}`)

    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    await query(`UPDATE commande_fil SET ${sets.join(', ')} WHERE IDcommande_fil = ${id}`)

    const rows = await query<CommandeFil>(`SELECT * FROM commande_fil WHERE IDcommande_fil = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Commande not found' }); return }
    const fixed = await fixEncoding(rows, 'commande_fil', 'IDcommande_fil', ['commentaire', 'journal'])
    res.json(fixed[0])
  } catch (err) {
    console.error('Error updating commande-fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Delete commande (cascades to lines) ──────────────────

commandesFilRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM ref_fil_commande WHERE IDcommande_fil = ${id}`)
    await query(`DELETE FROM commande_fil WHERE IDcommande_fil = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting commande-fil:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Create line ──────────────────────────────────────────

commandesFilRouter.post('/:id/lignes', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = ligneBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data
    const dateLiv = dateStr(d.date_livraison)

    await query(
      `INSERT INTO ref_fil_commande (IDcommande_fil, IDref_fil, IDcolori_fil, quantite, unite, prix_unitaire, date_livraison, etat, date_notif) VALUES (${id}, ${d.IDref_fil}, ${d.IDcolori_fil}, ${n(d.quantite)}, ${d.unite ?? 1}, ${n(d.prix_unitaire)}, '${dateLiv}', ${d.etat ?? 0}, '')`
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Error creating ref_fil_commande:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Update line ──────────────────────────────────────────

commandesFilRouter.put('/lignes/:lineId', async (req: Request, res: Response) => {
  try {
    const lineId = parseInt(req.params.lineId, 10)
    if (isNaN(lineId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = ligneBody.partial().safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data

    const sets: string[] = []
    if (d.IDref_fil !== undefined) sets.push(`IDref_fil = ${d.IDref_fil}`)
    if (d.IDcolori_fil !== undefined) sets.push(`IDcolori_fil = ${d.IDcolori_fil}`)
    if (d.quantite !== undefined) sets.push(`quantite = ${n(d.quantite)}`)
    if (d.unite !== undefined) sets.push(`unite = ${d.unite}`)
    if (d.prix_unitaire !== undefined) sets.push(`prix_unitaire = ${n(d.prix_unitaire)}`)
    if (d.date_livraison !== undefined) sets.push(`date_livraison = '${dateStr(d.date_livraison)}'`)
    if (d.etat !== undefined) sets.push(`etat = ${d.etat}`)

    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    await query(`UPDATE ref_fil_commande SET ${sets.join(', ')} WHERE IDref_fil_commande = ${lineId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating ref_fil_commande:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Delete line ──────────────────────────────────────────

commandesFilRouter.delete('/lignes/:lineId', async (req: Request, res: Response) => {
  try {
    const lineId = parseInt(req.params.lineId, 10)
    if (isNaN(lineId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM ref_fil_commande WHERE IDref_fil_commande = ${lineId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting ref_fil_commande:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

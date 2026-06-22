import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import { query, fixEncoding } from '../lib/hfsql-auto.js'
import { repairAliased, repairAllJoins } from './stock-fini.js'

// Gestion route for the `sous_traitant` entity (subcontractor management).
// Mirrors fournisseurs.ts (identical contacts/adresses sub-resource shape) with
// two differences: the domain-specific `IDtype_sst` (Tricoteur / Ennoblisseur /
// Autre / Confectionneur, catalog `type_sst`) and an editable `est_visible` flag.
// NOTE: `commande_sous_traitant` orders live on /api/commandes-sous-traitant.

export const sousTraitantsRouter: RouterType = Router()

interface SousTraitant {
  IDsous_traitant: number
  nom: string
  tel: string | null
  fax: string | null
  commentaire: string | null
  est_visible: number
  IDtype_sst: number | null
}

const TEXT_FIELDS = ['nom', 'tel', 'fax', 'commentaire']

const stBody = z.object({
  nom: z.string().min(1).max(100),
  tel: z.string().optional(),
  fax: z.string().optional(),
  commentaire: z.string().optional(),
  IDtype_sst: z.number().int().optional(),
  est_visible: z.union([z.boolean(), z.number()]).optional(),
})

/** Escape a string for use in SQL (single quotes doubled). ASCII-only path. */
function esc(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * Emit a text value as a SQL literal that is safe on BOTH the Windows `odbc`
 * driver and the Linux iODBC bridge. Raw multi-byte UTF-8 in a SQL string
 * desyncs the bridge ("string without end" → 500); HFSQL text columns are
 * Latin-1, so accented values are emitted as a hex literal of their Latin-1
 * bytes. ASCII values keep the normal quoted literal. (Canonical impl:
 * commandes-sous-traitant.ts → CLAUDE.md §"Encoding (writes)".)
 */
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

function intParam(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

/** Map IDtype_sst → label. `type` is a reserved word (returns uppercased) so we
 * qualify + alias it; single-table CONVERT is bridge-safe (no JOIN collapse). */
async function loadTypeMap(): Promise<Map<number, string>> {
  const rows = await query<{ IDtype_sst: number; type_label: string | null }>(
    `SELECT ts.IDtype_sst, CONVERT(ts.type USING 'UTF-8') AS type_label FROM type_sst ts ORDER BY ts.IDtype_sst`,
  )
  const map = new Map<number, string>()
  for (const r of rows) map.set(Number(r.IDtype_sst), (r.type_label ?? '').toString().trim())
  return map
}

// GET /api/sous-traitants/type-sst — type catalog (declared before /:id)
sousTraitantsRouter.get('/type-sst', async (_req: Request, res: Response) => {
  try {
    const map = await loadTypeMap()
    res.json(Array.from(map.entries()).map(([IDtype_sst, type_label]) => ({ IDtype_sst, type_label })))
  } catch (err) {
    console.error('Error fetching type_sst:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sous-traitants — list all (ordered by name, with type label)
sousTraitantsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query<SousTraitant>('SELECT * FROM sous_traitant ORDER BY nom')
    const fixed = await fixEncoding(rows, 'sous_traitant', 'IDsous_traitant', TEXT_FIELDS)
    const types = await loadTypeMap()
    res.json(fixed.map((r: any) => ({ ...r, type_label: types.get(Number(r.IDtype_sst)) ?? null })))
  } catch (err) {
    console.error('Error fetching sous-traitants:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sous-traitants/:id — detail with contacts + adresses
sousTraitantsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const rows = await query<SousTraitant>(`SELECT * FROM sous_traitant WHERE IDsous_traitant = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Sous-traitant not found' }); return }
    const fixed = await fixEncoding(rows, 'sous_traitant', 'IDsous_traitant', TEXT_FIELDS)

    const [adresses, contacts] = await Promise.all([
      query(`SELECT * FROM adresse WHERE IDsous_traitant = ${id} ORDER BY est_defaut DESC, IDadresse`),
      query(`SELECT * FROM contact WHERE IDsous_traitant = ${id} ORDER BY est_defaut DESC, IDcontact`),
    ])
    const fixedAdresses = await fixEncoding(adresses, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays', 'commentaire'])
    const fixedContacts = await fixEncoding(contacts, 'contact', 'IDcontact', ['nom', 'prenom', 'tel', 'mail', 'commentaire'])

    const types = await loadTypeMap()
    res.json({
      ...fixed[0],
      type_label: types.get(Number((fixed[0] as any).IDtype_sst)) ?? null,
      adresses: fixedAdresses,
      contacts: fixedContacts,
    })
  } catch (err) {
    console.error('Error fetching sous-traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sous-traitants/:id/rolls — fabric rolls physically located at this
// sous-traitant's site (its "magasin"). Used by the Gestion screen for
// ennoblisseur ssts to show what's on site: "tombé métier" (écru) rolls awaiting
// dyeing + finished (fini) rolls already produced and not yet shipped back.
//
// Location model: stock_ecru.IDmagasin / stock_fini.IDmagasin → sous_traitant.
// IDsous_traitant (same id space). IDmagasin is updated on physical transfer, so
// "= this sst" means "currently here".
//
//   - écru: stock_ecru.IDmagasin = sst, MINUS rolls already dyed into a fini (a
//     dyed roll keeps its écru row but also spawns a stock_fini row at the same
//     magasin — counting both would double-count it, so consumed écru are dropped).
//   - fini: stock_fini.IDmagasin = sst, hiding rolls already shipped
//     (IDligne_expedition set, or état 4 "Expédié").
sousTraitantsRouter.get('/:id/rolls', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    // ── Écru ("tombé métier") rolls on site ──────────────
    // Explicit columns only (never `se.*` — Windows ODBC returns 0 rows for
    // alias.* in some shapes, and we keep all column names ASCII for the Linux
    // bridge). ref_ecru/colori_ecru references resolve via separate flat
    // queries + maps (avoids the JOIN+CONVERT result-set collapse footgun).
    const ecruRows = await query<{
      IDstock_ecru: number; numero: string | null; lot: string | null
      poids: number | null; metrage: number | null
      IDref_ecru: number | null; IDcolori_ecru: number | null
      date_saisie: string | null; second_choix: number | null
    }>(
      `SELECT IDstock_ecru, numero, lot, poids, metrage, IDref_ecru, IDcolori_ecru, date_saisie, second_choix
       FROM stock_ecru
       WHERE IDmagasin = ${id}
       ORDER BY date_saisie DESC, IDstock_ecru DESC`,
    )
    const ecruFixed = await fixEncoding(ecruRows, 'stock_ecru', 'IDstock_ecru', ['numero', 'lot'])

    // Drop écru already consumed into a fini (dedup against the fini list).
    const ecruIds = ecruFixed.map((r) => Number(r.IDstock_ecru)).filter((n) => n > 0)
    const consumed = new Set<number>()
    if (ecruIds.length > 0) {
      const consumedRows = await query<{ IDstock_ecru: number }>(
        `SELECT IDstock_ecru FROM stock_fini WHERE IDstock_ecru IN (${ecruIds.join(',')})`,
      )
      for (const r of consumedRows) consumed.add(Number(r.IDstock_ecru))
    }
    const ecruLive = ecruFixed.filter((r) => !consumed.has(Number(r.IDstock_ecru)))

    // Resolve ref_ecru + colori_ecru labels (ASCII columns; batched lookups).
    const refEcruIds = Array.from(new Set(ecruLive.map((r) => Number(r.IDref_ecru)).filter((n) => n > 0)))
    const colEcruIds = Array.from(new Set(ecruLive.map((r) => Number(r.IDcolori_ecru)).filter((n) => n > 0)))
    const refEcruMap = new Map<number, string>()
    const colEcruMap = new Map<number, string>()
    if (refEcruIds.length > 0) {
      const r = await query<{ IDref_ecru: number; reference: string | null }>(
        `SELECT IDref_ecru, reference FROM ref_ecru WHERE IDref_ecru IN (${refEcruIds.join(',')})`,
      )
      for (const x of await fixEncoding(r, 'ref_ecru', 'IDref_ecru', ['reference'])) refEcruMap.set(Number(x.IDref_ecru), (x.reference ?? '').toString().trim())
    }
    if (colEcruIds.length > 0) {
      const r = await query<{ IDcolori_ecru: number; reference: string | null }>(
        `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDcolori_ecru IN (${colEcruIds.join(',')})`,
      )
      for (const x of await fixEncoding(r, 'colori_ecru', 'IDcolori_ecru', ['reference'])) colEcruMap.set(Number(x.IDcolori_ecru), (x.reference ?? '').toString().trim())
    }

    const ecru = ecruLive.map((r) => ({
      id: Number(r.IDstock_ecru),
      reference: refEcruMap.get(Number(r.IDref_ecru)) || null,
      coloris: colEcruMap.get(Number(r.IDcolori_ecru)) || null,
      lot: (r.lot ?? '').toString().trim() || null,
      numero: (r.numero ?? '').toString().trim() || null,
      poids: r.poids == null ? null : Number(r.poids),
      metrage: r.metrage == null ? null : Number(r.metrage),
      date_saisie: r.date_saisie ?? null,
      second_choix: Number(r.second_choix) || 0,
    }))

    // ── Fini rolls on site (not shipped) ─────────────────
    // Reuse the canonical stock_fini joins + accent repair so coloris obeys the
    // ref_fini.avec_teinture rule (0 = wash colori_ecru / 1·2 = dyed ref_fini_colori).
    const finiRows = await query<Record<string, unknown>>(
      `SELECT sf.IDstock_fini, sf.poids, sf.metrage, sf.lot, sf.numero, sf.date_saisie, sf.second_choix,
              sf.IDref_fini, sf.IDColoris, sf.IDetat_stock_fini,
              rf.reference AS ref_fini, rf.designation, rf.avec_teinture,
              rfc.reference AS coloris_dyed, ce.reference AS coloris_wash,
              esf.libelle AS etat_libelle
       FROM stock_fini sf
       LEFT JOIN ref_fini rf ON sf.IDref_fini = rf.IDref_fini
       LEFT JOIN ref_fini_colori rfc ON sf.IDColoris = rfc.IDref_fini_colori
       LEFT JOIN colori_ecru ce ON sf.IDColoris = ce.IDcolori_ecru
       LEFT JOIN etat_stock_fini esf ON sf.IDetat_stock_fini = esf.IDetat_stock_fini
       WHERE sf.IDmagasin = ${id}
         AND (sf.IDligne_expedition IS NULL OR sf.IDligne_expedition = 0)
         AND (sf.IDetat_stock_fini IS NULL OR sf.IDetat_stock_fini <> 4)
       ORDER BY sf.date_saisie DESC, sf.IDstock_fini DESC`,
    )
    let finiFixed = await repairAliased(finiRows, 'stock_fini', 'IDstock_fini', { lot: 'lot', numero: 'numero' })
    finiFixed = await repairAllJoins(finiFixed)

    const fini = finiFixed.map((r) => ({
      id: Number(r.IDstock_fini),
      reference: ((r as any).ref_fini ?? '').toString().trim() || null,
      designation: ((r as any).designation ?? '').toString().trim() || null,
      coloris: ((r as any).coloris_reference ?? '').toString().trim() || null,
      lot: ((r as any).lot ?? '').toString().trim() || null,
      numero: ((r as any).numero ?? '').toString().trim() || null,
      poids: (r as any).poids == null ? null : Number((r as any).poids),
      metrage: (r as any).metrage == null ? null : Number((r as any).metrage),
      date_saisie: (r as any).date_saisie ?? null,
      second_choix: Number((r as any).second_choix) || 0,
      etat_libelle: ((r as any).etat_libelle ?? '').toString().trim() || null,
    }))

    res.json({ ecru, fini })
  } catch (err) {
    console.error('Error fetching sous-traitant rolls:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/sous-traitants — create (placeholder row, then auto-edit on the client)
sousTraitantsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = stBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const { nom, tel, fax, commentaire, IDtype_sst } = parsed.data
    await query(
      `INSERT INTO sous_traitant (nom, tel, fax, commentaire, est_visible, IDtype_sst) VALUES (${sqlText(nom)}, ${sqlText(tel ?? '')}, ${sqlText(fax ?? '')}, ${sqlText(commentaire ?? '')}, 1, ${intParam(IDtype_sst)})`,
    )
    // HFSQL has no RETURNING — fetch the just-inserted row back by name.
    const rows = await query<SousTraitant>(`SELECT * FROM sous_traitant WHERE nom = ${sqlText(nom)} ORDER BY IDsous_traitant DESC`)
    const fixed = await fixEncoding(rows, 'sous_traitant', 'IDsous_traitant', TEXT_FIELDS)
    res.status(201).json(fixed[0] ?? { nom, tel: tel ?? null, fax: fax ?? null, commentaire: commentaire ?? null })
  } catch (err) {
    console.error('Error creating sous-traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/sous-traitants/:id — update header (name, coordonnées, type, visibility, notes)
sousTraitantsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const parsed = stBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const { nom, tel, fax, commentaire, IDtype_sst, est_visible } = parsed.data
    const visible = est_visible === undefined ? 1 : est_visible ? 1 : 0
    await query(
      `UPDATE sous_traitant SET nom = ${sqlText(nom)}, tel = ${sqlText(tel ?? '')}, fax = ${sqlText(fax ?? '')}, commentaire = ${sqlText(commentaire ?? '')}, IDtype_sst = ${intParam(IDtype_sst)}, est_visible = ${visible} WHERE IDsous_traitant = ${id}`,
    )
    const rows = await query<SousTraitant>(`SELECT * FROM sous_traitant WHERE IDsous_traitant = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Sous-traitant not found' }); return }
    const fixed = await fixEncoding(rows, 'sous_traitant', 'IDsous_traitant', TEXT_FIELDS)
    res.json(fixed[0])
  } catch (err) {
    console.error('Error updating sous-traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/sous-traitants/:id
sousTraitantsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const rows = await query<SousTraitant>(`SELECT * FROM sous_traitant WHERE IDsous_traitant = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Sous-traitant not found' }); return }
    await query(`DELETE FROM sous_traitant WHERE IDsous_traitant = ${id}`)
    res.json({ message: 'Deleted', data: rows[0] })
  } catch (err) {
    console.error('Error deleting sous-traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Contacts CRUD (FK contact.IDsous_traitant) ───────────

sousTraitantsRouter.post('/:id/contacts', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, prenom, tel, mail, envoi_bl, envoi_facture, envoi_commande, envoi_soumission } = req.body
    await query(
      `INSERT INTO contact (IDsous_traitant, nom, prenom, tel, mail, envoi_bl, envoi_facture, envoi_commande, envoi_soumission, est_defaut, est_visible) VALUES (${id}, ${sqlText(nom ?? '')}, ${sqlText(prenom ?? '')}, ${sqlText(tel ?? '')}, ${sqlText(mail ?? '')}, ${envoi_bl ? 1 : 0}, ${envoi_facture ? 1 : 0}, ${envoi_commande ? 1 : 0}, ${envoi_soumission ? 1 : 0}, 0, 1)`,
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Error creating contact:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

sousTraitantsRouter.put('/:id/contacts/:cid', async (req: Request, res: Response) => {
  try {
    const cid = parseInt(req.params.cid, 10)
    if (isNaN(cid)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, prenom, tel, mail, envoi_bl, envoi_facture, envoi_commande, envoi_soumission } = req.body
    await query(
      `UPDATE contact SET nom = ${sqlText(nom ?? '')}, prenom = ${sqlText(prenom ?? '')}, tel = ${sqlText(tel ?? '')}, mail = ${sqlText(mail ?? '')}, envoi_bl = ${envoi_bl ? 1 : 0}, envoi_facture = ${envoi_facture ? 1 : 0}, envoi_commande = ${envoi_commande ? 1 : 0}, envoi_soumission = ${envoi_soumission ? 1 : 0} WHERE IDcontact = ${cid}`,
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating contact:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

sousTraitantsRouter.delete('/:id/contacts/:cid', async (req: Request, res: Response) => {
  try {
    const cid = parseInt(req.params.cid, 10)
    if (isNaN(cid)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM contact WHERE IDcontact = ${cid}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting contact:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Adresses CRUD (FK adresse.IDsous_traitant) ───────────

sousTraitantsRouter.post('/:id/adresses', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, adresse1, adresse2, adresse3, cp, ville, pays, commentaire, est_defaut_facturation, est_defaut_livraison } = req.body
    await query(
      `INSERT INTO adresse (IDsous_traitant, nom, adresse1, adresse2, adresse3, cp, ville, pays, commentaire, est_defaut, est_defaut_facturation, est_defaut_livraison, est_visible) VALUES (${id}, ${sqlText(nom ?? '')}, ${sqlText(adresse1 ?? '')}, ${sqlText(adresse2 ?? '')}, ${sqlText(adresse3 ?? '')}, ${sqlText(cp ?? '')}, ${sqlText(ville ?? '')}, ${sqlText(pays ?? '')}, ${sqlText(commentaire ?? '')}, 0, ${est_defaut_facturation ? 1 : 0}, ${est_defaut_livraison ? 1 : 0}, 1)`,
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Error creating adresse:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

sousTraitantsRouter.put('/:id/adresses/:aid', async (req: Request, res: Response) => {
  try {
    const aid = parseInt(req.params.aid, 10)
    if (isNaN(aid)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, adresse1, adresse2, adresse3, cp, ville, pays, commentaire, est_defaut_facturation, est_defaut_livraison } = req.body
    await query(
      `UPDATE adresse SET nom = ${sqlText(nom ?? '')}, adresse1 = ${sqlText(adresse1 ?? '')}, adresse2 = ${sqlText(adresse2 ?? '')}, adresse3 = ${sqlText(adresse3 ?? '')}, cp = ${sqlText(cp ?? '')}, ville = ${sqlText(ville ?? '')}, pays = ${sqlText(pays ?? '')}, commentaire = ${sqlText(commentaire ?? '')}, est_defaut_facturation = ${est_defaut_facturation ? 1 : 0}, est_defaut_livraison = ${est_defaut_livraison ? 1 : 0} WHERE IDadresse = ${aid}`,
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating adresse:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

sousTraitantsRouter.delete('/:id/adresses/:aid', async (req: Request, res: Response) => {
  try {
    const aid = parseInt(req.params.aid, 10)
    if (isNaN(aid)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM adresse WHERE IDadresse = ${aid}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting adresse:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { query, fixEncoding } from '../lib/hfsql-auto.js'
import { CommandeFournisseurPdf, type CommandeFournisseurPdfData } from '../lib/pdf/CommandeFournisseurPdf.js'

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

// ── Stock lookup helpers (used by /lignes/:ligneId/stock endpoints) ─────
//
// stock_fil has accented columns (terminé, controlé). On Linux the iODBC
// bridge rejects any accented identifier token in the SQL text, so we use
// `sf.*` and accept truncated names (terminé→termin, controlé→control). On
// Windows we must list columns explicitly because `alias.*` returns empty
// rows in a JOIN. Both paths are post-processed via `normStockLot` to emit
// the same ASCII-only keys. See CLAUDE.md "Accented column names through
// bridge" for the full picture.

const IS_WINDOWS = process.platform === 'win32'

const STOCK_LOT_SELECT = IS_WINDOWS
  ? `sf.IDstock_fil, sf.IDfournisseur, sf.IDref_fil, sf.IDcolori_fil, sf.IDref_fil_commande, sf.stock, sf.stock_initial, sf.lot, sf.lot_frs, sf.emplacement, sf.date_entree, sf.niveau, sf.terminé AS termine, sf.controlé AS controle, rf.reference AS ref_fil, rf.bio, cf.reference AS colori_reference, f.nom AS fournisseur_nom`
  : `sf.*, rf.reference AS ref_fil, rf.bio, cf.reference AS colori_reference, f.nom AS fournisseur_nom`

const STOCK_LOT_JOINS = `FROM stock_fil sf LEFT JOIN ref_fil rf ON sf.IDref_fil = rf.IDref_fil LEFT JOIN colori_fil cf ON sf.IDcolori_fil = cf.IDcolori_fil LEFT JOIN fournisseur f ON sf.IDfournisseur = f.IDfournisseur`

/** Map the two platform-specific row shapes to stable ASCII keys, and drop
 *  binary blobs so JSON serialization doesn't crash. */
function normStockLot(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  out.termine = (row as any).termine ?? (row as any)['terminé'] ?? (row as any).termin ?? 0
  delete out['terminé']
  delete out.termin
  out.controle = (row as any).controle ?? (row as any)['controlé'] ?? (row as any).control ?? 0
  delete out['controlé']
  delete out.control
  // stock_fil carries certificate blobs we never want in this response
  delete out.certif_bio
  delete out['certif_recyclé']
  delete out.certif_recycl
  delete out.commentaire
  delete out.observation_freinte
  return out
}

async function fetchStockLots(whereSql: string): Promise<Record<string, unknown>[]> {
  const sql = `SELECT ${STOCK_LOT_SELECT} ${STOCK_LOT_JOINS} ${whereSql} ORDER BY sf.date_entree DESC, sf.IDstock_fil DESC`
  const rows = await query<Record<string, unknown>>(sql)
  const fixed = await fixEncoding(rows, 'stock_fil', 'IDstock_fil', ['lot', 'lot_frs', 'emplacement'])
  return fixed.map((r) => normStockLot(r as Record<string, unknown>))
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

    // Fetch line totals + earliest delivery date in one bulk query
    const ids = fixedWithFournisseurNom.map((c: any) => c.IDcommande_fil).filter(Boolean)
    const totalsMap = new Map<number, { total_kg: number; total_eur: number; nb_lignes: number; earliest_delivery: string | null }>()
    if (ids.length > 0) {
      const lignes = await query<any>(
        `SELECT IDcommande_fil, quantite, prix_unitaire, date_livraison FROM ref_fil_commande WHERE IDcommande_fil IN (${ids.join(',')})`
      )
      for (const l of lignes) {
        const id = Number(l.IDcommande_fil)
        const acc = totalsMap.get(id) ?? { total_kg: 0, total_eur: 0, nb_lignes: 0, earliest_delivery: null }
        const qty = Number(l.quantite) || 0
        const price = Number(l.prix_unitaire) || 0
        acc.total_kg += qty
        acc.total_eur += qty * price
        acc.nb_lignes += 1
        // Earliest non-empty YYYYMMDD across lines — zero-padded strings compare lexicographically
        const dl = typeof l.date_livraison === 'string' ? l.date_livraison : ''
        if (/^\d{8}$/.test(dl) && (acc.earliest_delivery === null || dl < acc.earliest_delivery)) {
          acc.earliest_delivery = dl
        }
        totalsMap.set(id, acc)
      }
    }

    // Filter by search query (supplier name, id, or commentaire)
    const qLower = q.toLowerCase()
    const result = fixedWithFournisseurNom
      .map((c: any) => {
        const totals = totalsMap.get(Number(c.IDcommande_fil)) ?? { total_kg: 0, total_eur: 0, nb_lignes: 0, earliest_delivery: null }
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

    // Linked-stock aggregates per line: count + sum of stock_initial from
    // every stock_fil row whose IDref_fil_commande points at each line.
    const lineIds = (fixedLignes as any[]).map((l) => Number(l.IDref_fil_commande)).filter((x) => !isNaN(x) && x > 0)
    const linkedMap = new Map<number, { nb_lots_lies: number; total_kg_lie: number }>()
    if (lineIds.length > 0) {
      const linkedRows = await query<{ IDref_fil_commande: number; stock_initial: number }>(
        `SELECT IDref_fil_commande, stock_initial FROM stock_fil WHERE IDref_fil_commande IN (${lineIds.join(',')})`
      )
      for (const lr of linkedRows) {
        const lid = Number(lr.IDref_fil_commande)
        const acc = linkedMap.get(lid) ?? { nb_lots_lies: 0, total_kg_lie: 0 }
        acc.nb_lots_lies += 1
        acc.total_kg_lie += Number(lr.stock_initial) || 0
        linkedMap.set(lid, acc)
      }
    }
    const lignesWithLinked = (fixedLignes as any[]).map((l) => {
      const agg = linkedMap.get(Number(l.IDref_fil_commande)) ?? { nb_lots_lies: 0, total_kg_lie: 0 }
      return { ...l, ...agg }
    })

    res.json({
      ...header,
      fournisseur_nom: (fixedFournisseur[0] as any)?.nom ?? null,
      mode_paiement_libelle: (fixedModePaiement[0] as any)?.libelle ?? null,
      echeance_libelle: (fixedEcheance[0] as any)?.libelle ?? null,
      adresse_facturation: fixedAdresseFact[0] ?? null,
      adresse_livraison: fixedAdresseLiv[0] ?? null,
      lignes: lignesWithLinked,
    })
  } catch (err) {
    console.error('Error fetching commande-fil detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── PDF export ──────────────────────────────────────────
//
// Renders a Malterre-branded PDF for a single commande fournisseur using
// @react-pdf/renderer. The React component trees live in src/lib/pdf/.

/** Format a HFSQL YYYYMMDD string as dd/mm/yyyy (French locale). */
function formatHfsqlDateFr(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw)
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
  }
  return ''
}

const FRENCH_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const

/** Format a HFSQL YYYYMMDD string as the long-form French "14 avril 2026". */
function formatHfsqlDateLongFr(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw)
  if (!/^\d{8}$/.test(s)) return ''
  const day = parseInt(s.slice(6, 8), 10)
  const month = parseInt(s.slice(4, 6), 10)
  const year = s.slice(0, 4)
  if (month < 1 || month > 12) return ''
  return `${day} ${FRENCH_MONTHS[month - 1]} ${year}`
}

/** Strip HFSQL placeholder values (dots, dashes, underscores, single chars).
 *  Many legacy records have ".", " . ", "-", "" etc. in unset address fields. */
function cleanAddrField(s: string | null | undefined): string | null {
  if (!s) return null
  const t = String(s).trim()
  if (!t) return null
  if (/^[.\-_·•\s]+$/.test(t)) return null
  return t
}

/** Clean a full address record into the shape the PDF expects. */
function cleanAddress(a: any | null): {
  nom: string | null
  adresse1: string | null
  adresse2: string | null
  adresse3: string | null
  cp: string | null
  ville: string | null
  pays: string | null
} | null {
  if (!a) return null
  return {
    nom: cleanAddrField(a.nom),
    adresse1: cleanAddrField(a.adresse1),
    adresse2: cleanAddrField(a.adresse2),
    adresse3: cleanAddrField(a.adresse3),
    cp: cleanAddrField(a.cp),
    ville: cleanAddrField(a.ville),
    pays: cleanAddrField(a.pays),
  }
}

commandesFilRouter.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const rows = await query<CommandeFil>(`SELECT * FROM commande_fil WHERE IDcommande_fil = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Commande not found' }); return }
    const fixedHeader = await fixEncoding(rows, 'commande_fil', 'IDcommande_fil', ['commentaire', 'journal'])
    const header = fixedHeader[0] as any

    const [fournisseurRows, modePaiementRows, echeanceRows, adresseFournisseurRows, adresseLivRows, lignes] = await Promise.all([
      query(`SELECT IDfournisseur, nom FROM fournisseur WHERE IDfournisseur = ${n(header.IDfournisseur)}`),
      header.IDmode_paiement ? query(`SELECT IDmode_paiement, libelle FROM mode_paiement WHERE IDmode_paiement = ${n(header.IDmode_paiement)}`) : Promise.resolve([]),
      header.IDecheance ? query(`SELECT IDecheance, libelle FROM echeance WHERE IDecheance = ${n(header.IDecheance)}`) : Promise.resolve([]),
      header.IDadresse_fournisseur ? query(`SELECT * FROM adresse WHERE IDadresse = ${n(header.IDadresse_fournisseur)}`) : Promise.resolve([]),
      header.IDadresse_livraison ? query(`SELECT * FROM adresse WHERE IDadresse = ${n(header.IDadresse_livraison)}`) : Promise.resolve([]),
      query(
        `SELECT rfc.IDref_fil_commande, rfc.quantite, rfc.unite, rfc.prix_unitaire, rfc.date_livraison, rfc.etat, rf.reference as ref_fil, rf.bio as ref_fil_bio, cf.reference as colori_reference FROM ref_fil_commande rfc LEFT JOIN ref_fil rf ON rfc.IDref_fil = rf.IDref_fil LEFT JOIN colori_fil cf ON rfc.IDcolori_fil = cf.IDcolori_fil WHERE rfc.IDcommande_fil = ${id} ORDER BY rfc.IDref_fil_commande`
      ),
    ])

    const fixedFournisseur = await fixEncoding(fournisseurRows, 'fournisseur', 'IDfournisseur', ['nom'])
    const fixedModePaiement = await fixEncoding(modePaiementRows, 'mode_paiement', 'IDmode_paiement', ['libelle'])
    const fixedEcheance = await fixEncoding(echeanceRows, 'echeance', 'IDecheance', ['libelle'])
    const fixedAdresseFrs = await fixEncoding(adresseFournisseurRows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays'])
    const fixedAdresseLiv = await fixEncoding(adresseLivRows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays'])
    const fixedLignes = await fixEncoding(lignes, 'ref_fil_commande', 'IDref_fil_commande', ['ref_fil', 'colori_reference'])

    // Earliest line delivery date — drives the "Délai de livraison" metadata.
    const earliestDelivery = ((fixedLignes as any[])
      .map((l) => (typeof l.date_livraison === 'string' ? l.date_livraison : ''))
      .filter((s) => /^\d{8}$/.test(s)) as string[])
      .sort()[0] ?? null

    const data: CommandeFournisseurPdfData = {
      numero: String(header.IDcommande_fil),
      dateCommande: formatHfsqlDateLongFr(header.date_commande),
      fournisseurNom: ((fixedFournisseur[0] as any)?.nom ?? '').toString() || '—',
      fournisseurAdresse: cleanAddress(fixedAdresseFrs[0] as any),
      adresseLivraison: cleanAddress(fixedAdresseLiv[0] as any),
      modePaiement: ((fixedModePaiement[0] as any)?.libelle ?? null) as string | null,
      echeance: ((fixedEcheance[0] as any)?.libelle ?? null) as string | null,
      delaiLivraison: earliestDelivery ? formatHfsqlDateLongFr(earliestDelivery) : null,
      commentaire: (header.commentaire ?? null) as string | null,
      lignes: (fixedLignes as any[]).map((l) => ({
        ref_fil: l.ref_fil ?? null,
        colori_reference: l.colori_reference ?? null,
        bio: Number(l.ref_fil_bio) === 1,
        quantite: l.quantite == null ? null : Number(l.quantite),
        prix_unitaire: l.prix_unitaire == null ? null : Number(l.prix_unitaire),
        date_livraison: formatHfsqlDateFr(l.date_livraison) || null,
      })),
    }

    // CommandeFournisseurPdf returns a <Document> tree via MalterreDocument;
    // renderToBuffer's type demands a DocumentProps element explicitly, so cast.
    const buffer = await renderToBuffer(
      React.createElement(CommandeFournisseurPdf, { data }) as unknown as React.ReactElement<
        import('@react-pdf/renderer').DocumentProps
      >
    )

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="commande-fournisseur-${data.numero}.pdf"`
    )
    res.send(buffer)
  } catch (err) {
    console.error('Error rendering commande-fil PDF:', err)
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

// ── Stock linkage for a commande line ─────────────────────
//
// The reception clerk creates stock_fil lots via the Fournisseurs > Stock
// screen. The orders clerk then links those lots to a specific
// ref_fil_commande line from Fournisseurs > Commandes so everyone can see
// which lot fulfills which order line. The FK is stock_fil.IDref_fil_commande;
// a value of 0 (or NULL) means "not yet assigned to any line".

/** Load the context of a line + its commande header. Used to validate
 *  cross-commande access, and to derive the filter keys for "available"
 *  lots. Returns null if the line or commande does not exist / does not
 *  belong together. */
async function loadLineContext(commandeId: number, ligneId: number): Promise<{
  IDfournisseur: number
  IDref_fil: number
  IDcolori_fil: number
} | null> {
  const lineRows = await query<any>(
    `SELECT IDref_fil_commande, IDcommande_fil, IDref_fil, IDcolori_fil FROM ref_fil_commande WHERE IDref_fil_commande = ${ligneId}`
  )
  if (lineRows.length === 0) return null
  const line = lineRows[0]
  if (Number(line.IDcommande_fil) !== commandeId) return null

  const headerRows = await query<any>(
    `SELECT IDfournisseur FROM commande_fil WHERE IDcommande_fil = ${commandeId}`
  )
  if (headerRows.length === 0) return null

  return {
    IDfournisseur: Number(headerRows[0].IDfournisseur) || 0,
    IDref_fil: Number(line.IDref_fil) || 0,
    IDcolori_fil: Number(line.IDcolori_fil) || 0,
  }
}

/** Fetch both {linked, available} lot lists for a line. */
async function fetchLinkedAndAvailable(
  ctx: { IDfournisseur: number; IDref_fil: number; IDcolori_fil: number },
  ligneId: number,
): Promise<{ linked: Record<string, unknown>[]; available: Record<string, unknown>[] }> {
  const linked = await fetchStockLots(`WHERE sf.IDref_fil_commande = ${ligneId}`)
  const available = await fetchStockLots(
    `WHERE sf.IDref_fil = ${ctx.IDref_fil} AND sf.IDcolori_fil = ${ctx.IDcolori_fil} AND sf.IDfournisseur = ${ctx.IDfournisseur} AND (sf.IDref_fil_commande IS NULL OR sf.IDref_fil_commande = 0) AND sf.stock > 0`
  )
  return { linked, available }
}

// GET lots linked to a line + lots available to link
commandesFilRouter.get('/:commandeId/lignes/:ligneId/stock', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.commandeId, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    if (isNaN(commandeId) || isNaN(ligneId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const ctx = await loadLineContext(commandeId, ligneId)
    if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }

    const payload = await fetchLinkedAndAvailable(ctx, ligneId)
    res.json(payload)
  } catch (err) {
    console.error('Error fetching line stock:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT link a stock lot to a line
commandesFilRouter.put('/:commandeId/lignes/:ligneId/stock/:stockId', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.commandeId, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    const stockId = parseInt(req.params.stockId, 10)
    if (isNaN(commandeId) || isNaN(ligneId) || isNaN(stockId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const ctx = await loadLineContext(commandeId, ligneId)
    if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }

    // Verify the stock row matches the line's (ref_fil, colori_fil, fournisseur)
    // and is currently unassigned. Defensive — the UI already filters.
    const stockRows = await query<any>(
      `SELECT IDstock_fil, IDfournisseur, IDref_fil, IDcolori_fil, IDref_fil_commande FROM stock_fil WHERE IDstock_fil = ${stockId}`
    )
    if (stockRows.length === 0) { res.status(404).json({ error: 'Stock lot not found' }); return }
    const s = stockRows[0]
    if (Number(s.IDref_fil) !== ctx.IDref_fil
      || Number(s.IDcolori_fil) !== ctx.IDcolori_fil
      || Number(s.IDfournisseur) !== ctx.IDfournisseur) {
      res.status(400).json({ error: 'Stock lot does not match line (ref_fil / colori_fil / fournisseur)' })
      return
    }
    const current = Number(s.IDref_fil_commande) || 0
    if (current !== 0 && current !== ligneId) {
      res.status(409).json({ error: 'Stock lot is already linked to another line' })
      return
    }

    await query(`UPDATE stock_fil SET IDref_fil_commande = ${ligneId} WHERE IDstock_fil = ${stockId}`)

    const payload = await fetchLinkedAndAvailable(ctx, ligneId)
    res.json(payload)
  } catch (err) {
    console.error('Error linking stock to line:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE unlink a stock lot from a line
commandesFilRouter.delete('/:commandeId/lignes/:ligneId/stock/:stockId', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.commandeId, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    const stockId = parseInt(req.params.stockId, 10)
    if (isNaN(commandeId) || isNaN(ligneId) || isNaN(stockId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const ctx = await loadLineContext(commandeId, ligneId)
    if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }

    // Only unlink if the stock row is currently linked to THIS line — guards
    // against racing with a re-assignment from another screen.
    await query(`UPDATE stock_fil SET IDref_fil_commande = 0 WHERE IDstock_fil = ${stockId} AND IDref_fil_commande = ${ligneId}`)

    const payload = await fetchLinkedAndAvailable(ctx, ligneId)
    res.json(payload)
  } catch (err) {
    console.error('Error unlinking stock from line:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

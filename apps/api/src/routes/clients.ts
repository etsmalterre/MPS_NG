// Clients — customer master data (the legacy "Gestion Client" screen).
// Master-detail over the `client` table + polymorphic contact/adresse, plus the
// commercial sub-views (Références catalogue, Historique des commandes,
// Marchandise/expéditions, Tarifs/PrixDeVente). Mirrors fournisseurs.ts for the
// CRUD + contacts/adresses, and reuses the proven HFSQL client-read pattern from
// etudes-coloris.ts / commandes-client.ts.
//
// Hard rules baked in (verified against CLAUDE.md HFSQL section + live code):
//  - `SELECT * FROM client` returns 0 rows on the WINDOWS ODBC driver — name
//    explicit columns there. On the LINUX bridge SELECT * works but accented
//    column NAMES (`archivé`, `bloqué`) are rejected/truncated (→ `archiv`,
//    `bloqu`). So we NEVER name an accented column in a SELECT list:
//      • Windows  → explicit non-accented column list; read the archive flag via
//                   a separate `WHERE archivé = 1` query (WHERE tolerates it).
//      • Linux    → `SELECT *` and read the truncated key off the row.
//  - Accented text VALUES are written as Latin-1 hex literals via sqlText()
//    (raw multi-byte UTF-8 corrupts the Linux bridge). Client names carry
//    accents ("Amalthée", "37 Degrés"…), so this matters here.
//  - INSERT sets IDsociete = 1 (ETM). archivé/bloqué are left to HFSQL defaults.
//  - contact/adresse are polymorphic (IDclient / IDsous_traitant / IDfournisseur
//    / IDentreprise discriminators); SELECT * works on those two tables.

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { query, fixEncoding } from '../lib/hfsql-auto.js'
import { IS_WINDOWS, esc } from '../lib/sst-shared.js'
import { calcTarifRefFini } from '../lib/pricing-fini-tarif.js'
import { TarifsClientPdf, type TarifsClientPdfData, type TarifsSectionData } from '../lib/pdf/TarifsClientPdf.js'
import { sendMail } from '../lib/gmail.js'
import { getUserEmail } from '../lib/user-emails.js'

export const clientsRouter: RouterType = Router()

// ── Small SQL/format helpers ───────────────────────────

/** SQL literal for a user-supplied text value. Pure ASCII → quoted literal;
 *  anything with accents → Latin-1 hex literal (the Linux iODBC bridge corrupts
 *  raw multi-byte UTF-8 embedded in a SQL line). Copied from commandes-client.ts. */
function sqlText(value: string | null | undefined): string {
  const v = (value ?? '').toString()
  if (v === '') return "''"
  if (/^[\x09\x0A\x0D\x20-\x7E]*$/.test(v)) return `'${esc(v)}'`
  const ascii = v
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
  const bytes = Buffer.from(
    Array.from(ascii, (ch) => {
      const c = ch.codePointAt(0) ?? 0x3f
      return c <= 0xff ? c : 0x3f
    }),
  )
  return `x'${bytes.toString('hex')}'`
}

const numOf = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const strOf = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v)
  return s
}
/** Read a value off a row by trying several candidate keys (covers the
 *  platform-specific accented-name truncation: `archivé` vs `archiv`). */
function pick(r: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in r && r[k] != null) return r[k]
  }
  return undefined
}

function todayDigits(): string {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/** Date input from the FE arrives as 8 digits (YYYYMMDD) or ''. Keep digits only. */
function dateDigitsOnly(v: unknown): string {
  const s = String(v ?? '').replace(/[^0-9]/g, '')
  return s.length === 8 ? s : ''
}

// ── Detail column list (Windows path — no accented names) ──

const CLIENT_DETAIL_COLS = [
  'IDclient', 'nom', 'tel', 'fax', 'num_tva', 'IDtva', 'IDmode_paiement', 'IDecheance',
  'IDtransporteur', 'compte', 'IDcode_comptable', 'pct_ajeol', 'pct_remise', 'est_visible',
  'IDsociete', 'date_creation', 'client_interne', 'dernier_contact', 'journal_commercial',
  'IDsecteur_activite', 'IDactivite', 'inclureRapportQualite', 'commentaire',
].join(', ')

const CLIENT_TEXT_FIELDS = ['nom', 'tel', 'fax', 'num_tva', 'compte', 'commentaire', 'journal_commercial']

function shapeClient(r: Record<string, unknown>) {
  return {
    IDclient: numOf(r.IDclient),
    nom: strOf(r.nom),
    tel: strOf(r.tel),
    fax: strOf(r.fax),
    num_tva: strOf(r.num_tva),
    compte: strOf(r.compte),
    commentaire: strOf(r.commentaire),
    journal_commercial: strOf(pick(r, 'journal_commercial')),
    pct_remise: numOf(r.pct_remise),
    pct_ajeol: numOf(r.pct_ajeol),
    IDtva: numOf(r.IDtva),
    IDmode_paiement: numOf(r.IDmode_paiement),
    IDecheance: numOf(r.IDecheance),
    IDcode_comptable: numOf(r.IDcode_comptable),
    IDsecteur_activite: numOf(pick(r, 'IDsecteur_activite')),
    IDactivite: numOf(r.IDactivite),
    IDtransporteur: numOf(r.IDtransporteur),
    client_interne: numOf(r.client_interne),
    inclureRapportQualite: numOf(pick(r, 'inclureRapportQualite', 'inclureRapportQualit')),
    dernier_contact: strOf(pick(r, 'dernier_contact')),
    date_creation: strOf(pick(r, 'date_creation')),
    est_visible: numOf(r.est_visible),
    IDsociete: numOf(r.IDsociete),
  }
}

// ════════════════════════════════════════════════════════
//  LIST  — GET /api/clients
// ════════════════════════════════════════════════════════
// Returns every visible client + an `archive` flag so the FE can offer the
// En cours / Archivé / Tous filter without ever naming `archivé` in a SELECT.
clientsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    let rows: Record<string, unknown>[]
    const archivedSet = new Set<number>()
    if (IS_WINDOWS) {
      rows = await query<Record<string, unknown>>(
        `SELECT IDclient, nom, tel, est_visible, client_interne FROM client WHERE est_visible = 1 ORDER BY nom`,
      )
      // WHERE tolerates the accented name on Windows ODBC (unlike a SELECT list).
      const arch = await query<{ IDclient: number }>(
        `SELECT IDclient FROM client WHERE est_visible = 1 AND archivé = 1`,
      )
      for (const a of arch) archivedSet.add(Number(a.IDclient))
    } else {
      rows = await query<Record<string, unknown>>(
        `SELECT * FROM client WHERE est_visible = 1 ORDER BY nom`,
      )
    }
    const shaped = rows.map((r) => ({
      IDclient: numOf(r.IDclient),
      nom: strOf(r.nom),
      tel: strOf(r.tel),
      client_interne: numOf(r.client_interne),
      archive: IS_WINDOWS
        ? (archivedSet.has(numOf(r.IDclient)) ? 1 : 0)
        : numOf(pick(r, 'archivé', 'archiv')),
    }))
    await repairNames(shaped)
    res.json(shaped.filter((r) => r.nom != null && String(r.nom).trim().length > 0))
  } catch (err) {
    console.error('Error fetching clients:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/** Batched accent repair for the client list: one CONVERT query for all rows
 *  whose `nom` came back with U+FFFD, instead of per-row (avoids an N+1 flood
 *  of the shared Linux bridge — CLAUDE.md "batch the repair" rule). */
async function repairNames(rows: { IDclient: number; nom: string | null }[]): Promise<void> {
  const broken = rows
    .filter((r) => typeof r.nom === 'string' && r.nom.includes('�'))
    .map((r) => r.IDclient)
    .filter((id) => Number.isInteger(id))
  if (broken.length === 0) return
  try {
    const conv = await query<{ IDclient: number; nom: string | null }>(
      `SELECT IDclient, CONVERT(nom USING 'UTF-8') AS nom FROM client WHERE IDclient IN (${broken.join(',')})`,
    )
    const m = new Map<number, string>()
    for (const c of conv) if (c.nom != null) m.set(Number(c.IDclient), String(c.nom))
    for (const r of rows) {
      const f = m.get(r.IDclient)
      if (f != null) r.nom = f
    }
  } catch {
    // keep original (a leftover U+FFFD glyph is cosmetic)
  }
}

// ════════════════════════════════════════════════════════
//  LOOKUPS  (literal paths — must register before /:id)
// ════════════════════════════════════════════════════════

clientsRouter.get('/lookups/secteurs', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDsecteur_activite: number; nom: string | null }>(
      `SELECT IDsecteur_activite, nom FROM secteur_activite ORDER BY nom`,
    )
    const fixed = await fixEncoding(rows, 'secteur_activite', 'IDsecteur_activite', ['nom'])
    res.json(fixed.map((r) => ({ IDsecteur_activite: Number(r.IDsecteur_activite), nom: r.nom ?? '' })))
  } catch (err) {
    console.error('Error fetching secteurs lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

clientsRouter.get('/lookups/activites', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDactivite: number; nom: string | null }>(
      `SELECT IDactivite, nom FROM activite ORDER BY nom`,
    )
    const fixed = await fixEncoding(rows, 'activite', 'IDactivite', ['nom'])
    res.json(fixed.map((r) => ({ IDactivite: Number(r.IDactivite), nom: r.nom ?? '' })))
  } catch (err) {
    console.error('Error fetching activites lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

clientsRouter.get('/lookups/modes-paiement', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDmode_paiement: number; libelle: string | null }>(
      `SELECT IDmode_paiement, libelle FROM mode_paiement WHERE est_visible = 1 ORDER BY libelle`,
    )
    const fixed = await fixEncoding(rows, 'mode_paiement', 'IDmode_paiement', ['libelle'])
    res.json(fixed.map((r) => ({ IDmode_paiement: Number(r.IDmode_paiement), libelle: r.libelle ?? '' })))
  } catch (err) {
    console.error('Error fetching modes-paiement lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

clientsRouter.get('/lookups/echeances', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDecheance: number; libelle: string | null }>(
      `SELECT IDecheance, libelle FROM echeance WHERE est_visible = 1 ORDER BY IDecheance`,
    )
    const fixed = await fixEncoding(rows, 'echeance', 'IDecheance', ['libelle'])
    res.json(fixed.map((r) => ({ IDecheance: Number(r.IDecheance), libelle: r.libelle ?? '' })))
  } catch (err) {
    console.error('Error fetching echeances lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

clientsRouter.get('/lookups/tva', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDtva: number; libelle_compte: string | null; valeur: number | null }>(
      `SELECT IDtva, libelle_compte, valeur FROM tva WHERE IDsociete = 1 AND est_visible = 1 ORDER BY valeur`,
    )
    const fixed = await fixEncoding(rows, 'tva', 'IDtva', ['libelle_compte'])
    res.json(fixed.map((r) => ({
      IDtva: Number(r.IDtva),
      libelle: r.libelle_compte ?? '',
      valeur: Number(r.valeur) || 0,
    })))
  } catch (err) {
    console.error('Error fetching tva lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

clientsRouter.get('/lookups/codes-comptables', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDcode_comptable: number; libelle: string | null; numero: string | null }>(
      `SELECT IDcode_comptable, libelle, numero FROM code_comptable WHERE IDsociete = 1 AND est_visible = 1 ORDER BY libelle`,
    )
    const fixed = await fixEncoding(rows, 'code_comptable', 'IDcode_comptable', ['libelle'])
    res.json(fixed.map((r) => ({
      IDcode_comptable: Number(r.IDcode_comptable),
      libelle: r.libelle ?? '',
      numero: r.numero ?? '',
    })))
  } catch (err) {
    console.error('Error fetching codes-comptables lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  DETAIL  — GET /api/clients/:id
// ════════════════════════════════════════════════════════
clientsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const sql = IS_WINDOWS
      ? `SELECT ${CLIENT_DETAIL_COLS} FROM client WHERE IDclient = ${id}`
      : `SELECT * FROM client WHERE IDclient = ${id}`
    const rawRows = await query<Record<string, unknown>>(sql)
    if (rawRows.length === 0) { res.status(404).json({ error: 'Client not found' }); return }
    const fixed = await fixEncoding(rawRows, 'client', 'IDclient', CLIENT_TEXT_FIELDS)
    const client = shapeClient(fixed[0])

    // contact / adresse — SELECT * works on these two tables (no accented names).
    const [adresses, contacts] = await Promise.all([
      query(`SELECT * FROM adresse WHERE IDclient = ${id} ORDER BY est_defaut DESC, IDadresse`),
      query(`SELECT * FROM contact WHERE IDclient = ${id} ORDER BY est_defaut DESC, IDcontact`),
    ])
    const fixedAdresses = await fixEncoding(adresses, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays', 'commentaire'])
    const fixedContacts = await fixEncoding(contacts, 'contact', 'IDcontact', ['nom', 'prenom', 'tel', 'mail', 'commentaire'])

    res.json({
      ...client,
      adresses: fixedAdresses,
      contacts: fixedContacts,
    })
  } catch (err) {
    console.error('Error fetching client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  CREATE / UPDATE / DELETE
// ════════════════════════════════════════════════════════

const clientBody = z.object({
  nom: z.string().min(1).max(100),
  tel: z.string().optional(),
  fax: z.string().optional(),
  num_tva: z.string().optional(),
  compte: z.string().optional(),
  commentaire: z.string().optional(),
  journal_commercial: z.string().optional(),
  pct_remise: z.number().optional(),
  pct_ajeol: z.number().optional(),
  IDtva: z.number().int().optional(),
  IDmode_paiement: z.number().int().optional(),
  IDecheance: z.number().int().optional(),
  IDcode_comptable: z.number().int().optional(),
  IDsecteur_activite: z.number().int().optional(),
  IDactivite: z.number().int().optional(),
  client_interne: z.union([z.boolean(), z.number()]).optional(),
  inclureRapportQualite: z.union([z.boolean(), z.number()]).optional(),
  dernier_contact: z.string().optional(),
})

const flag = (v: unknown): number => (v === true || v === 1 || v === '1' ? 1 : 0)
const intOf = (v: unknown): number => { const x = parseInt(String(v ?? ''), 10); return Number.isFinite(x) ? x : 0 }
const floatOf = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

// POST /api/clients — create a bare client (ETM scope), name only.
clientsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const nom = typeof req.body?.nom === 'string' && req.body.nom.trim() ? req.body.nom.trim() : 'Nouveau client'
    await query(
      `INSERT INTO client (nom, est_visible, client_interne, IDsociete, date_creation) ` +
        `VALUES (${sqlText(nom)}, 1, 0, 1, '${todayDigits()}')`,
    )
    const rows = await query<{ IDclient: number }>(`SELECT IDclient FROM client ORDER BY IDclient DESC`)
    const newId = rows.length > 0 ? Number(rows[0].IDclient) : 0
    res.status(201).json({ IDclient: newId, nom })
  } catch (err) {
    console.error('Error creating client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/clients/:id — update master-data fields. Never names archivé/bloqué.
clientsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const parsed = clientBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const b = parsed.data

    const sets = [
      `nom = ${sqlText(b.nom)}`,
      `tel = ${sqlText(b.tel)}`,
      `fax = ${sqlText(b.fax)}`,
      `num_tva = ${sqlText(b.num_tva)}`,
      `compte = ${sqlText(b.compte)}`,
      `commentaire = ${sqlText(b.commentaire)}`,
      `journal_commercial = ${sqlText(b.journal_commercial)}`,
      `pct_remise = ${floatOf(b.pct_remise)}`,
      `pct_ajeol = ${floatOf(b.pct_ajeol)}`,
      `IDtva = ${intOf(b.IDtva)}`,
      `IDmode_paiement = ${intOf(b.IDmode_paiement)}`,
      `IDecheance = ${intOf(b.IDecheance)}`,
      `IDcode_comptable = ${intOf(b.IDcode_comptable)}`,
      `IDsecteur_activite = ${intOf(b.IDsecteur_activite)}`,
      `IDactivite = ${intOf(b.IDactivite)}`,
      `client_interne = ${flag(b.client_interne)}`,
      `inclureRapportQualite = ${flag(b.inclureRapportQualite)}`,
      `dernier_contact = '${dateDigitsOnly(b.dernier_contact)}'`,
    ]
    await query(`UPDATE client SET ${sets.join(', ')} WHERE IDclient = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/clients/:id
clientsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM client WHERE IDclient = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  COMMERCIAL SUB-VIEWS  (read-only: historique / références / marchandise)
// ════════════════════════════════════════════════════════

// Shared label resolvers. colori_ecru / ref_fini_colori reject SELECT * — use
// explicit columns. ref_fini / ref_ecru tolerate explicit columns too.
async function mapRefFini(ids: number[]): Promise<Map<number, { reference: string; avec_teinture: number }>> {
  const m = new Map<number, { reference: string; avec_teinture: number }>()
  const uniq = [...new Set(ids.filter((x) => Number.isInteger(x) && x > 0))]
  if (!uniq.length) return m
  const rows = await query<Record<string, unknown>>(`SELECT IDref_fini, reference, avec_teinture FROM ref_fini WHERE IDref_fini IN (${uniq.join(',')})`)
  const fixed = await fixEncoding(rows, 'ref_fini', 'IDref_fini', ['reference'])
  for (const r of fixed) m.set(numOf(r.IDref_fini), { reference: strOf(r.reference) ?? '', avec_teinture: numOf(r.avec_teinture) })
  return m
}
async function mapSimpleRef(table: string, idCol: string, ids: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>()
  const uniq = [...new Set(ids.filter((x) => Number.isInteger(x) && x > 0))]
  if (!uniq.length) return m
  const rows = await query<Record<string, unknown>>(`SELECT ${idCol}, reference FROM ${table} WHERE ${idCol} IN (${uniq.join(',')})`)
  const fixed = await fixEncoding(rows, table, idCol, ['reference'])
  for (const r of fixed) m.set(numOf(r[idCol]), strOf(r.reference) ?? '')
  return m
}
/** Resolve a polymorphic coloris id to its label, preferring the dye catalog
 *  when avec_teinture != 0, the wash catalog otherwise (project_avec_teinture_coloris_rule). */
function coloriLabel(id: number, avecTeinture: number, ce: Map<number, string>, rfc: Map<number, string>): string {
  if (!id) return ''
  return (avecTeinture !== 0 ? (rfc.get(id) ?? ce.get(id)) : (ce.get(id) ?? rfc.get(id))) ?? ''
}

// GET /api/clients/:id/historique — recent order lines (Date, n° cmd, ref, coloris, qté, prix).
clientsRouter.get('/:id/historique', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const heads = await query<Record<string, unknown>>(
      `SELECT TOP 120 IDcommande_client, numero, date_commande FROM commande_client ` +
        `WHERE IDsociete = 1 AND IDcommande_ETM = 0 AND IDclient = ${id} ORDER BY IDcommande_client DESC`,
    )
    if (heads.length === 0) { res.json({ lignes: [], capped: false }); return }
    const cids = heads.map((h) => numOf(h.IDcommande_client))
    const headMap = new Map(heads.map((h) => [numOf(h.IDcommande_client), h]))
    const lines = await query<Record<string, unknown>>(
      `SELECT IDligne_commande_client, IDcommande_client, TYPE AS type_kind, IDreference, IDcolori, quantite, unite, prix ` +
        `FROM ligne_commande_client WHERE IDcommande_client IN (${cids.join(',')}) ORDER BY IDcommande_client DESC, IDligne_commande_client`,
    )
    const finiMap = await mapRefFini(lines.filter((l) => numOf(l.type_kind) === 2).map((l) => numOf(l.IDreference)))
    const ecruMap = await mapSimpleRef('ref_ecru', 'IDref_ecru', lines.filter((l) => numOf(l.type_kind) === 1).map((l) => numOf(l.IDreference)))
    const colIds = lines.map((l) => numOf(l.IDcolori))
    const ceMap = await mapSimpleRef('colori_ecru', 'IDcolori_ecru', colIds)
    const rfcMap = await mapSimpleRef('ref_fini_colori', 'IDref_fini_colori', colIds)

    const lignes = lines.map((l) => {
      const type = numOf(l.type_kind)
      let ref = ''
      let avec = 0
      if (type === 2) { const r = finiMap.get(numOf(l.IDreference)); ref = r?.reference ?? ''; avec = r?.avec_teinture ?? 0 }
      else if (type === 1) { ref = ecruMap.get(numOf(l.IDreference)) ?? '' }
      else { ref = 'Divers' }
      const h = headMap.get(numOf(l.IDcommande_client))
      return {
        IDligne: numOf(l.IDligne_commande_client),
        IDcommande_client: numOf(l.IDcommande_client),
        numero: numOf(h?.numero),
        date_commande: strOf(h?.date_commande),
        type_kind: type,
        ref,
        coloris: coloriLabel(numOf(l.IDcolori), avec, ceMap, rfcMap),
        quantite: numOf(l.quantite),
        unite: numOf(l.unite),
        prix: numOf(l.prix),
      }
    })
    res.json({ lignes, capped: heads.length >= 120 })
  } catch (err) {
    console.error('Error fetching client historique:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/clients/:id/references — client product catalogue
// (Ref client = designation, Ref interne = ref_fini/ref_ecru, Coloris = ref_client_colori).
clientsRouter.get('/:id/references', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    // designation_client tolerates SELECT * (verified). archivé is accented → prune in JS.
    const dRows = await query<Record<string, unknown>>(`SELECT * FROM designation_client WHERE IDclient = ${id} ORDER BY designation`)
    const dFixed = await fixEncoding(dRows, 'designation_client', 'IDdesignation_client', ['designation'])
    const desigs = dFixed.filter((r) => !numOf(pick(r, 'archivé', 'archiv')))
    if (desigs.length === 0) { res.json([]); return }

    const finiMap = await mapRefFini(desigs.map((r) => numOf(r.IDref_fini)))
    const ecruMap = await mapSimpleRef('ref_ecru', 'IDref_ecru', desigs.map((r) => numOf(r.IDref_ecru)))

    const dIds = desigs.map((r) => numOf(r.IDdesignation_client))
    const rccRows = await query<Record<string, unknown>>(`SELECT * FROM ref_client_colori WHERE IDdesignation_client IN (${dIds.join(',')})`)
    const rcc = rccRows.filter((r) => !numOf(pick(r, 'archivé', 'archiv')))
    const ceMap = await mapSimpleRef('colori_ecru', 'IDcolori_ecru', rcc.map((r) => numOf(r.IDcolori_ecru)))
    const rfcMap = await mapSimpleRef('ref_fini_colori', 'IDref_fini_colori', rcc.map((r) => numOf(r.IDref_fini_colori)))

    const colorisByDesig = new Map<number, any[]>()
    for (const r of rcc) {
      const did = numOf(r.IDdesignation_client)
      const finiColId = numOf(r.IDref_fini_colori)
      const ecruColId = numOf(r.IDcolori_ecru)
      const label = finiColId > 0 ? (rfcMap.get(finiColId) ?? '') : (ceMap.get(ecruColId) ?? '')
      const arr = colorisByDesig.get(did) ?? []
      arr.push({
        IDref_client_colori: numOf(r.IDref_client_colori),
        label,
        // coloris id to feed the Tarif endpoint (dye → ref_fini_colori, wash → colori_ecru)
        coloris_id: finiColId > 0 ? finiColId : ecruColId,
        lst_tranche: strOf(r.lst_tranche) ?? '',
        contrat: numOf(r.contrat),
      })
      colorisByDesig.set(did, arr)
    }

    const out = desigs.map((r) => {
      const idFini = numOf(r.IDref_fini)
      const idEcru = numOf(r.IDref_ecru)
      const rf = finiMap.get(idFini)
      return {
        IDdesignation_client: numOf(r.IDdesignation_client),
        client_ref: strOf(r.designation) ?? '',
        IDref_fini: idFini,
        IDref_ecru: idEcru,
        ref_interne: idFini > 0 ? (rf?.reference ?? '') : (ecruMap.get(idEcru) ?? ''),
        avec_teinture: rf?.avec_teinture ?? 0,
        soumettre: numOf(r.soumettre),
        unite: numOf(r.unite),
        coloris: colorisByDesig.get(numOf(r.IDdesignation_client)) ?? [],
      }
    })
    res.json(out)
  } catch (err) {
    console.error('Error fetching client references:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/clients/:id/marchandise — shipped rolls (Expédié le, Expé N°, Ref, Pièce, Poids, Métrage).
clientsRouter.get('/:id/marchandise', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    // DATE is a reserved word (alias to dexp); never name expedition's accented
    // envoyé_client/envoyé_sst. Scope to client via commande_client, ETM only.
    const rows = await query<Record<string, unknown>>(
      `SELECT TOP 400 e.IDexpedition, e.DATE AS dexp, sf.numero AS piece, sf.poids, sf.metrage, sf.lot, sf.second_choix, sf.IDref_fini, sf.IDColoris ` +
        `FROM expedition e ` +
        `INNER JOIN ligne_expedition le ON le.IDexpedition = e.IDexpedition ` +
        `INNER JOIN stock_fini sf ON sf.IDligne_expedition = le.IDligne_expedition ` +
        `INNER JOIN commande_client cc ON e.IDcommande_client = cc.IDcommande_client ` +
        `WHERE e.IDsociete = 1 AND cc.IDclient = ${id} ORDER BY e.IDexpedition DESC, sf.numero`,
    )
    const finiMap = await mapRefFini(rows.map((r) => numOf(r.IDref_fini)))
    const colIds = rows.map((r) => numOf(r.IDColoris))
    const ceMap = await mapSimpleRef('colori_ecru', 'IDcolori_ecru', colIds)
    const rfcMap = await mapSimpleRef('ref_fini_colori', 'IDref_fini_colori', colIds)
    const lignes = rows.map((r) => {
      const rf = finiMap.get(numOf(r.IDref_fini))
      return {
        IDexpedition: numOf(r.IDexpedition),
        date: strOf(r.dexp),
        piece: strOf(r.piece) ?? '',
        lot: strOf(r.lot) ?? '',
        ref: rf?.reference ?? '',
        coloris: coloriLabel(numOf(r.IDColoris), rf?.avec_teinture ?? 0, ceMap, rfcMap),
        poids: numOf(r.poids),
        metrage: numOf(r.metrage),
        second_choix: numOf(r.second_choix),
      }
    })
    res.json({ lignes, capped: rows.length >= 400 })
  } catch (err) {
    console.error('Error fetching client marchandise:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Contacts CRUD (polymorphic: IDclient set, others 0) ──

clientsRouter.post('/:id/contacts', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, prenom, tel, mail, envoi_bl, envoi_facture, envoi_commande, envoi_soumission } = req.body
    await query(
      `INSERT INTO contact (IDclient, nom, prenom, tel, mail, envoi_bl, envoi_facture, envoi_commande, envoi_soumission, est_defaut, est_visible) ` +
        `VALUES (${id}, ${sqlText(nom)}, ${sqlText(prenom)}, ${sqlText(tel)}, ${sqlText(mail)}, ${flag(envoi_bl)}, ${flag(envoi_facture)}, ${flag(envoi_commande)}, ${flag(envoi_soumission)}, 0, 1)`,
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Error creating contact:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

clientsRouter.put('/:id/contacts/:cid', async (req: Request, res: Response) => {
  try {
    const cid = parseInt(req.params.cid, 10)
    if (isNaN(cid)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, prenom, tel, mail, envoi_bl, envoi_facture, envoi_commande, envoi_soumission } = req.body
    await query(
      `UPDATE contact SET nom = ${sqlText(nom)}, prenom = ${sqlText(prenom)}, tel = ${sqlText(tel)}, mail = ${sqlText(mail)}, ` +
        `envoi_bl = ${flag(envoi_bl)}, envoi_facture = ${flag(envoi_facture)}, envoi_commande = ${flag(envoi_commande)}, envoi_soumission = ${flag(envoi_soumission)} ` +
        `WHERE IDcontact = ${cid}`,
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating contact:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

clientsRouter.delete('/:id/contacts/:cid', async (req: Request, res: Response) => {
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

// ── Adresses CRUD (polymorphic: IDclient set, others 0) ──

clientsRouter.post('/:id/adresses', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, adresse1, adresse2, adresse3, cp, ville, pays, commentaire, est_defaut_facturation, est_defaut_livraison } = req.body
    await query(
      `INSERT INTO adresse (IDclient, nom, adresse1, adresse2, adresse3, cp, ville, pays, commentaire, est_defaut, est_defaut_facturation, est_defaut_livraison, est_visible) ` +
        `VALUES (${id}, ${sqlText(nom)}, ${sqlText(adresse1)}, ${sqlText(adresse2)}, ${sqlText(adresse3)}, ${sqlText(cp)}, ${sqlText(ville)}, ${sqlText(pays)}, ${sqlText(commentaire)}, 0, ${flag(est_defaut_facturation)}, ${flag(est_defaut_livraison)}, 1)`,
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Error creating adresse:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

clientsRouter.put('/:id/adresses/:aid', async (req: Request, res: Response) => {
  try {
    const aid = parseInt(req.params.aid, 10)
    if (isNaN(aid)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const { nom, adresse1, adresse2, adresse3, cp, ville, pays, commentaire, est_defaut_facturation, est_defaut_livraison } = req.body
    await query(
      `UPDATE adresse SET nom = ${sqlText(nom)}, adresse1 = ${sqlText(adresse1)}, adresse2 = ${sqlText(adresse2)}, adresse3 = ${sqlText(adresse3)}, ` +
        `cp = ${sqlText(cp)}, ville = ${sqlText(ville)}, pays = ${sqlText(pays)}, commentaire = ${sqlText(commentaire)}, ` +
        `est_defaut_facturation = ${flag(est_defaut_facturation)}, est_defaut_livraison = ${flag(est_defaut_livraison)} ` +
        `WHERE IDadresse = ${aid}`,
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating adresse:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

clientsRouter.delete('/:id/adresses/:aid', async (req: Request, res: Response) => {
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

// ════════════════════════════════════════════════════════
//  FICHE TARIFS  — selection-driven PDF + email
// ════════════════════════════════════════════════════════
// Port of the legacy Choix_Matiere_Tarif → "Fiche Tarif" report. The client
// picks (référence × coloris) pairs (= ref_client_colori rows); each pair's
// €/Ml prices come from calcTarifRefFini (PrixDeVenteV4), keeping only the
// tranches listed in ref_client_colori.lst_tranche ("0,1,2,3,4,5,6" = indices
// into the 9-tranche array: <1,1,2,3,4,5,10,15,30 rolls).
//
//   GET  /:id/tarifs/pdf?items=<IDref_client_colori,...>   — inline PDF
//   GET  /:id/tarifs/email-defaults                        — recipients + subject/body
//   POST /:id/tarifs/email?items=...                       — send with PDF attached
//
// The selection travels as a query param in all cases (the email POST body is
// the shared SendPayload shape, which has no room for screen-specific fields).

/** Parse the ?items= query into a bounded list of ref_client_colori ids. */
function parseTarifItems(raw: unknown): number[] {
  const ids = String(raw ?? '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
  return [...new Set(ids)].slice(0, 80)
}

function formatDateShortFr(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
function formatDateLongFr(d: Date): string {
  return `${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
}

/** Fetch the client's display name (nom is ASCII-named — safe on both
 *  platforms; accent repair via fixEncoding). Returns null if not found. */
async function fetchClientNom(id: number): Promise<string | null> {
  const rows = await query<Record<string, unknown>>(`SELECT IDclient, nom FROM client WHERE IDclient = ${id}`)
  if (rows.length === 0) return null
  const fixed = await fixEncoding(rows, 'client', 'IDclient', ['nom'])
  return (strOf(fixed[0]?.nom) ?? '').trim() || `Client ${id}`
}

/** Build the Fiche Tarifs PDF data for a client + a ref_client_colori
 *  selection. Returns null when the client doesn't exist; sections may be
 *  empty when nothing in the selection is priceable (caller decides). */
async function buildTarifsPdfData(clientId: number, rccIds: number[]): Promise<TarifsClientPdfData | null> {
  const clientNom = await fetchClientNom(clientId)
  if (clientNom === null) return null

  // Selected coloris rows → their designations (scope-checked to the client).
  const rccRows = await query<Record<string, unknown>>(
    `SELECT * FROM ref_client_colori WHERE IDref_client_colori IN (${rccIds.join(',')})`,
  )
  const desigIds = [...new Set(rccRows.map((r) => numOf(r.IDdesignation_client)).filter((n) => n > 0))]
  if (desigIds.length === 0) return { clientNom, dateDocument: '', validUntil: '', sections: [] }

  const dRows = await query<Record<string, unknown>>(
    `SELECT * FROM designation_client WHERE IDdesignation_client IN (${desigIds.join(',')})`,
  )
  const dFixed = await fixEncoding(dRows, 'designation_client', 'IDdesignation_client', ['designation'])
  // Scope guard: drop any selection row whose designation belongs to another client.
  const desigById = new Map<number, Record<string, unknown>>()
  for (const d of dFixed) {
    if (numOf(d.IDclient) === clientId) desigById.set(numOf(d.IDdesignation_client), d)
  }

  // ref_fini context (laize / poids / écru) + ref_ecru (contexture / bio).
  const finiIds = [...new Set([...desigById.values()].map((d) => numOf(d.IDref_fini)).filter((n) => n > 0))]
  const finiById = new Map<number, { IDref_ecru: number; avec_teinture: number; laize: number | null; poids: number | null }>()
  if (finiIds.length > 0) {
    const fRows = await query<Record<string, unknown>>(
      `SELECT IDref_fini, IDref_ecru, avec_teinture, laizeHT_Moy, poids_Moy FROM ref_fini WHERE IDref_fini IN (${finiIds.join(',')})`,
    )
    for (const f of fRows) {
      finiById.set(numOf(f.IDref_fini), {
        IDref_ecru: numOf(f.IDref_ecru),
        avec_teinture: numOf(f.avec_teinture),
        laize: f.laizeHT_Moy == null ? null : Math.round(numOf(f.laizeHT_Moy)),
        poids: f.poids_Moy == null ? null : Math.round(numOf(f.poids_Moy)),
      })
    }
  }
  const ecruIds = [...new Set([...finiById.values()].map((f) => f.IDref_ecru).filter((n) => n > 0))]
  const ecruById = new Map<number, { IDcontexture: number; bio: boolean }>()
  if (ecruIds.length > 0) {
    const eRows = await query<Record<string, unknown>>(
      `SELECT IDref_ecru, IDcontexture, bio FROM ref_ecru WHERE IDref_ecru IN (${ecruIds.join(',')})`,
    )
    for (const e of eRows) {
      ecruById.set(numOf(e.IDref_ecru), { IDcontexture: numOf(e.IDcontexture), bio: numOf(e.bio) === 1 })
    }
  }
  const ctxIds = [...new Set([...ecruById.values()].map((e) => e.IDcontexture).filter((n) => n > 0))]
  const ctxById = new Map<number, string>()
  if (ctxIds.length > 0) {
    const cRows = await query<Record<string, unknown>>(
      `SELECT IDcontexture, nom FROM contexture WHERE IDcontexture IN (${ctxIds.join(',')})`,
    )
    const cFixed = await fixEncoding(cRows, 'contexture', 'IDcontexture', ['nom'])
    for (const c of cFixed) ctxById.set(numOf(c.IDcontexture), strOf(c.nom) ?? '')
  }

  // Coloris labels (dye vs wash catalog per avec_teinture).
  const ceMap = await mapSimpleRef('colori_ecru', 'IDcolori_ecru', rccRows.map((r) => numOf(r.IDcolori_ecru)))
  const rfcMap = await mapSimpleRef('ref_fini_colori', 'IDref_fini_colori', rccRows.map((r) => numOf(r.IDref_fini_colori)))

  // Group the selection by designation, keeping the request's item order for
  // columns and ordering sections by ref label.
  interface ColSel { rccId: number; colorisId: number; label: string; trancheIdx: number[] }
  const colsByDesig = new Map<number, ColSel[]>()
  const rccById = new Map<number, Record<string, unknown>>(rccRows.map((r) => [numOf(r.IDref_client_colori), r]))
  for (const rccId of rccIds) {
    const r = rccById.get(rccId)
    if (!r) continue
    const did = numOf(r.IDdesignation_client)
    const desig = desigById.get(did)
    if (!desig) continue
    if (numOf(pick(r, 'archivé', 'archiv'))) continue
    const finiId = numOf(desig.IDref_fini)
    if (!(finiId > 0)) continue // écru-only designations have no fini tarif
    const fini = finiById.get(finiId)
    if (!fini) continue
    const finiColId = numOf(r.IDref_fini_colori)
    const ecruColId = numOf(r.IDcolori_ecru)
    const colorisId = fini.avec_teinture !== 0 ? finiColId : ecruColId
    if (!(colorisId > 0)) continue
    const label = (finiColId > 0 ? rfcMap.get(finiColId) : ceMap.get(ecruColId)) ?? ''
    const trancheIdx = [...new Set(
      (strOf(r.lst_tranche) ?? '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 8),
    )].sort((a, b) => a - b)
    const arr = colsByDesig.get(did) ?? []
    arr.push({ rccId, colorisId, label, trancheIdx: trancheIdx.length > 0 ? trancheIdx : [0, 1, 2, 3, 4, 5, 6] })
    colsByDesig.set(did, arr)
  }

  // Price every (fini, coloris) pair.
  const sections: TarifsSectionData[] = []
  const sortedDesigs = [...colsByDesig.keys()].sort((a, b) => {
    const ra = strOf(desigById.get(a)?.designation) ?? ''
    const rb = strOf(desigById.get(b)?.designation) ?? ''
    return ra.localeCompare(rb, 'fr')
  })
  for (const did of sortedDesigs) {
    const desig = desigById.get(did)!
    const cols = colsByDesig.get(did)!
    const finiId = numOf(desig.IDref_fini)
    const fini = finiById.get(finiId)!
    const ecru = ecruById.get(fini.IDref_ecru)

    const tarifs = await Promise.all(cols.map((c) => calcTarifRefFini(finiId, c.colorisId)))

    // Union of the selected coloris' tranche indices, ascending.
    const idxUnion = [...new Set(cols.flatMap((c) => c.trancheIdx))].sort((a, b) => a - b)
    const rows: TarifsSectionData['rows'] = []
    for (const i of idxUnion) {
      // qte_ml / rolls come from any tarif that actually has tranches (same
      // ref → identical quantities across coloris).
      const anyTranche = tarifs.find((t) => t.tranches.length > i)?.tranches[i]
      if (!anyTranche) continue
      rows.push({
        rlx: anyTranche.isMetrage ? '< 1' : String(anyTranche.rolls),
        ml: anyTranche.isMetrage ? `< ${anyTranche.qte_ml}` : String(anyTranche.qte_ml),
        prices: cols.map((c, ci) => {
          if (!c.trancheIdx.includes(i)) return null
          const t = tarifs[ci].tranches[i]
          return t && t.moPrixDeVenteAuMl > 0 ? t.moPrixDeVenteAuMl : null
        }),
      })
    }
    if (rows.length === 0) continue

    sections.push({
      ref: strOf(desig.designation) ?? '',
      contexture: ecru ? (ctxById.get(ecru.IDcontexture) ?? null) : null,
      laize: fini.laize,
      poids: fini.poids,
      bio: ecru?.bio ?? false,
      colorisLabels: cols.map((c) => c.label),
      rows,
    })
  }

  const now = new Date()
  const validUntil = new Date(now)
  validUntil.setFullYear(validUntil.getFullYear() + 1)

  return {
    clientNom,
    dateDocument: formatDateLongFr(now),
    validUntil: formatDateShortFr(validUntil),
    sections,
  }
}

async function renderTarifsPdfBuffer(data: TarifsClientPdfData): Promise<Buffer> {
  return renderToBuffer(
    React.createElement(TarifsClientPdf, { data }) as unknown as React.ReactElement<
      import('@react-pdf/renderer').DocumentProps
    >,
  )
}

/** ASCII-safe filename chunk from the client name. */
function tarifsFilename(clientNom: string): string {
  const slug = clientNom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `tarifs-${slug || 'client'}.pdf`
}

clientsRouter.get('/:id/tarifs/pdf', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const items = parseTarifItems(req.query.items)
    if (items.length === 0) { res.status(400).json({ error: 'No items selected' }); return }

    const data = await buildTarifsPdfData(id, items)
    if (!data) { res.status(404).json({ error: 'Client not found' }); return }
    if (data.sections.length === 0) { res.status(400).json({ error: 'No priceable reference in the selection' }); return }

    const buffer = await renderTarifsPdfBuffer(data)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${tarifsFilename(data.clientNom)}"`)
    // Strip helmet's restrictive headers so the web app can iframe the PDF.
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.send(buffer)
  } catch (err) {
    console.error('Error rendering tarifs PDF:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

clientsRouter.get('/:id/tarifs/email-defaults', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const clientNom = await fetchClientNom(id)
    if (clientNom === null) { res.status(404).json({ error: 'Client not found' }); return }

    const contactRows = await query<Record<string, unknown>>(
      `SELECT IDcontact, nom, prenom, mail, envoi_soumission, est_defaut, est_visible FROM contact WHERE IDclient = ${id}`,
    )
    const fixed = await fixEncoding(contactRows, 'contact', 'IDcontact', ['nom', 'prenom', 'mail'])

    interface Recipient { email: string; name?: string; source: 'contact'; contactId: number }
    const flagged: Recipient[] = []
    const defaults: Recipient[] = []
    const others: Recipient[] = []
    const seen = new Set<string>()
    for (const c of fixed) {
      if (numOf(c.est_visible) === 0 && c.est_visible != null) continue
      const raw = (strOf(c.mail) ?? '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) continue
      const key = raw.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const displayName = [strOf(c.prenom), strOf(c.nom)]
        .map((s) => (s ?? '').trim())
        .filter((s) => s.length > 0)
        .join(' ')
      const r: Recipient = { email: raw, source: 'contact', contactId: numOf(c.IDcontact) }
      if (displayName) r.name = displayName
      if (numOf(c.envoi_soumission) === 1) flagged.push(r)
      else if (numOf(c.est_defaut) === 1) defaults.push(r)
      else others.push(r)
    }
    // Pre-check the soumission-flagged contacts; fall back to the default
    // contact when nobody carries the flag (tarifs ≈ commercial/soumission).
    const selected = flagged.length > 0 ? flagged : defaults
    const suggestions = flagged.length > 0 ? [...defaults, ...others] : others

    const subject = `Fiche tarifs — ETS Malterre`
    const body =
      `Bonjour,\n\n` +
      `Veuillez trouver ci-joint notre fiche tarifs.\n\n` +
      `Nous restons à votre disposition pour toute information complémentaire.\n\n` +
      `Cordialement,\n` +
      `ETS Malterre`

    res.json({ recipients: { selected, suggestions }, subject, body, clientNom })
  } catch (err) {
    console.error('Error building tarifs email defaults:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const tarifExtraAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1),
  content_type: z.string().min(1).max(100),
})

const tarifEmailBody = z.object({
  to: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
  attach_pdf: z.boolean().optional(),
  extra_attachments: z.array(tarifExtraAttachmentSchema).optional(),
})

clientsRouter.post('/:id/tarifs/email', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    if (req.userId === undefined) {
      res.status(401).json({ error: 'not authenticated' })
      return
    }

    const parsed = tarifEmailBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }

    const senderEmail = await getUserEmail(req.userId)
    if (!senderEmail) {
      res.status(400).json({
        error: 'no_sender_email',
        message:
          "Aucune adresse email n'est associée à votre compte. Un administrateur doit en définir une dans Paramètres › Utilisateurs.",
      })
      return
    }

    const userRows = await query<Record<string, unknown>>(
      `SELECT IDutilisateur, prenom, nom FROM utilisateur WHERE IDutilisateur = ${req.userId}`,
    )
    const fixedUser = await fixEncoding(userRows, 'utilisateur', 'IDutilisateur', ['prenom', 'nom'])
    const u = fixedUser[0] ?? null
    const displayName = u
      ? [strOf(u.prenom), strOf(u.nom)].map((s) => (s ?? '').trim()).filter((s) => s.length > 0).join(' ')
      : ''
    const fromName = displayName ? `${displayName} — ETS Malterre` : 'ETS Malterre'

    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
    if (parsed.data.attach_pdf !== false) {
      const items = parseTarifItems(req.query.items)
      if (items.length === 0) { res.status(400).json({ error: 'No items selected' }); return }
      const data = await buildTarifsPdfData(id, items)
      if (!data) { res.status(404).json({ error: 'Client not found' }); return }
      if (data.sections.length === 0) { res.status(400).json({ error: 'No priceable reference in the selection' }); return }
      const buffer = await renderTarifsPdfBuffer(data)
      attachments.push({
        filename: tarifsFilename(data.clientNom),
        content: buffer,
        contentType: 'application/pdf',
      })
    }
    for (const a of parsed.data.extra_attachments ?? []) {
      attachments.push({
        filename: a.filename,
        content: Buffer.from(a.content_base64, 'base64'),
        contentType: a.content_type,
      })
    }

    const messageId = await sendMail({
      from: senderEmail,
      fromName,
      to: parsed.data.to,
      cc: parsed.data.cc,
      subject: parsed.data.subject,
      body: parsed.data.body,
      attachments: attachments.length > 0 ? attachments : undefined,
    })

    res.json({ ok: true, messageId })
  } catch (err) {
    console.error('Error sending tarifs email:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: 'send_failed', message })
  }
})

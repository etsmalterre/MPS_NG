// Factures — client invoices & credit notes (facture / ligne_facture).
// Mirrors commandes-client.ts but for the ETM invoicing ledger. This is the
// MANUAL invoicing screen (legacy "Détail facture" / "Nouvelle facture"): an
// invoice header + free-text lines, with computed HT / TVA / TTC totals.
//
// Hard rules baked in (verified against live data + the XDD + CLAUDE.md):
//  - ETM scope: every read/write is IDsociete = 1 (IDsociete=2 rows are TRM).
//  - numero allocator: MAX(numero)+1 WHERE IDsociete=1, with a retry loop.
//  - `facture` has NO accented columns; `date` and `type` are reserved words →
//    SELECT/INSERT/UPDATE them as uppercase DATE / TYPE (same trick as
//    envoi_email.DATE and ligne_commande_client.TYPE). SELECT * is safe here.
//  - `ligne_facture.designation` is corrupted on read (ODBC) → fixEncoding it.
//    `unite` is FREE TEXT ("Ml"/"Kg"/"Pièce"…), not the numeric enum used by
//    ligne_commande_client.
//  - No stored totals: HT = Σ(quantite×prix), TVA = HT×tva.valeur/100, TTC=HT+TVA.
//  - TYPE 1 = Facture, 2 = Avoir (credit note). Amounts are stored positive;
//    the Avoir's "credit" sign is a presentation concern (the list shows it
//    negative). This API returns magnitudes + type; callers apply the sign.
//  - `SELECT * FROM client` returns 0 rows on this driver — explicit columns only.
//  - On create, billing defaults are auto-filled from the client row
//    (num_tva, IDtva, IDmode_paiement, IDecheance, IDcode_comptable + the
//    est_defaut_facturation address), matching the legacy auto-fill.

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { query, fixEncoding } from '../lib/hfsql-auto.js'
import { FacturePdf, type FacturePdfData } from '../lib/pdf/FacturePdf.js'
import { sendMail } from '../lib/gmail.js'
import { getUserEmail } from '../lib/user-emails.js'
import { IS_WINDOWS, esc, n, dateDigits as dateStr } from '../lib/sst-shared.js'

export const facturesRouter: RouterType = Router()

// type_doc 19 = "facture definitve" (sic — validated invoice). Used for the
// envoi_email audit log when a facture/avoir is emailed.
const TYPE_DOC_FACTURE = 19

// ── Small SQL/format helpers (same as commandes-client.ts) ──

/** SQL literal for a user-supplied text value. Pure ASCII → quoted literal;
 *  anything with accents → Latin-1 hex literal (the Linux iODBC bridge
 *  corrupts raw multi-byte UTF-8 embedded in a SQL line). Newlines (\r\n) are
 *  preserved by both branches. */
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

function nowHfsqlDatetime(): string {
  const d = new Date()
  const pad = (x: number, w = 2) => String(x).padStart(w, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
    `${pad(d.getMilliseconds(), 3)}`
  )
}

const FRENCH_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const

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

function cleanAddrField(s: string | null | undefined): string | null {
  if (!s) return null
  const t = String(s).trim()
  if (!t) return null
  if (/^[.\-_·•\s]+$/.test(t)) return null
  return t
}

/** Normalise for accent-insensitive contains-matching (search). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function todayDigits(): string {
  const t = new Date()
  return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`
}

/** Next numero for the ETM invoice ledger (IDsociete=1). MAX+1 matches the
 *  legacy allocator; concurrent POSTs retry on collision. */
async function nextNumero(): Promise<number> {
  const r = await query<{ m: number | null }>(
    `SELECT MAX(numero) AS m FROM facture WHERE IDsociete = 1`,
  )
  return (Number(r[0]?.m) || 0) + 1
}

// ── Reference-data resolvers (batched, flat — never SELECT * on client) ──

async function resolveClientNames(clientIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const ids = Array.from(new Set(clientIds.filter((x) => x > 0)))
  if (ids.length === 0) return out
  const rows = await query<{ IDclient: number; nom: string | null }>(
    `SELECT IDclient, nom FROM client WHERE IDclient IN (${ids.join(',')})`,
  )
  const fixed = await fixEncoding(rows, 'client', 'IDclient', ['nom'])
  for (const r of fixed) out.set(Number(r.IDclient), (r.nom ?? '').toString().trim())
  return out
}

/** Map of IDtva → { valeur (rate %), libelle }. Loads every société's rows so
 *  any facture's IDtva resolves. */
async function loadTvaMap(): Promise<Map<number, { valeur: number; libelle: string }>> {
  const out = new Map<number, { valeur: number; libelle: string }>()
  const rows = await query<{ IDtva: number; valeur: number | null; libelle_compte: string | null }>(
    `SELECT IDtva, valeur, libelle_compte FROM tva`,
  )
  const fixed = await fixEncoding(rows, 'tva', 'IDtva', ['libelle_compte'])
  for (const r of fixed) {
    out.set(Number(r.IDtva), { valeur: Number(r.valeur) || 0, libelle: (r.libelle_compte ?? '').toString() })
  }
  return out
}

async function loadModePaiementLabel(id: number): Promise<string | null> {
  if (!(id > 0)) return null
  const rows = await query<{ libelle: string | null }>(`SELECT libelle FROM mode_paiement WHERE IDmode_paiement = ${id}`)
  const fixed = await fixEncoding(rows, 'mode_paiement', 'IDmode_paiement', ['libelle'])
  return (fixed[0]?.libelle ?? null) as string | null
}

async function loadEcheanceLabel(id: number): Promise<string | null> {
  if (!(id > 0)) return null
  const rows = await query<{ libelle: string | null }>(`SELECT libelle FROM echeance WHERE IDecheance = ${id}`)
  const fixed = await fixEncoding(rows, 'echeance', 'IDecheance', ['libelle'])
  return (fixed[0]?.libelle ?? null) as string | null
}

async function loadAdresse(id: number): Promise<Record<string, unknown> | null> {
  if (!(id > 0)) return null
  const rows = await query(
    `SELECT IDadresse, nom, adresse1, adresse2, adresse3, cp, ville, pays FROM adresse WHERE IDadresse = ${id}`,
  )
  const fixed = await fixEncoding(rows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays'])
  return (fixed[0] as Record<string, unknown>) ?? null
}

/** Per-facture line totals (Σ qty×prix, count). Batched over a set of ids. */
async function lineTotals(factureIds: number[]): Promise<Map<number, { total_ht: number; nb_lignes: number }>> {
  const out = new Map<number, { total_ht: number; nb_lignes: number }>()
  const ids = factureIds.filter((x) => x > 0)
  if (ids.length === 0) return out
  const rows = await query<{ IDfacture: number; quantite: number | null; prix: number | null }>(
    `SELECT IDfacture, quantite, prix FROM ligne_facture WHERE IDfacture IN (${ids.join(',')})`,
  )
  for (const r of rows) {
    const id = Number(r.IDfacture)
    const acc = out.get(id) ?? { total_ht: 0, nb_lignes: 0 }
    acc.total_ht += (Number(r.quantite) || 0) * (Number(r.prix) || 0)
    acc.nb_lignes += 1
    out.set(id, acc)
  }
  return out
}

// ── Validation schemas ───────────────────────────────────

const factureBody = z.object({
  IDclient: z.number().int().positive().optional(),
  date: z.string().optional(),
  type: z.number().int().min(1).max(2).optional(),
  IDadresse: z.number().int().nonnegative().optional(),
  IDmode_paiement: z.number().int().nonnegative().optional(),
  IDecheance: z.number().int().nonnegative().optional(),
  IDtva: z.number().int().nonnegative().optional(),
  num_tva: z.string().optional(),
})

const ligneBody = z.object({
  designation: z.string().optional(),
  quantite: z.number().optional(),
  unite: z.string().optional(),
  prix: z.number().optional(),
})

// ════════════════════════════════════════════════════════
//  LOOKUPS  (literal paths — must register before /:id)
// ════════════════════════════════════════════════════════

facturesRouter.get('/lookups/clients', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDclient: number; nom: string | null }>(
      `SELECT IDclient, nom FROM client WHERE est_visible = 1 ORDER BY nom`,
    )
    const fixed = await fixEncoding(rows, 'client', 'IDclient', ['nom'])
    res.json(fixed.map((r) => ({ IDclient: Number(r.IDclient), nom: (r.nom ?? '').toString() })))
  } catch (err) {
    console.error('Error fetching clients lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

facturesRouter.get('/lookups/adresses', async (req: Request, res: Response) => {
  try {
    const cid = parseInt(String(req.query.client ?? ''), 10)
    if (isNaN(cid)) { res.status(400).json({ error: 'client query parameter required' }); return }
    const rows = await query(
      `SELECT IDadresse, nom, adresse1, adresse2, adresse3, cp, ville, pays,
              est_defaut, est_defaut_facturation, est_defaut_livraison
       FROM adresse
       WHERE IDclient = ${cid} AND (est_visible IS NULL OR est_visible = 1)
       ORDER BY est_defaut DESC, IDadresse`,
    )
    const fixed = await fixEncoding(rows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays'])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching adresses lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

facturesRouter.get('/lookups/modes-paiement', async (_req: Request, res: Response) => {
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

facturesRouter.get('/lookups/echeances', async (_req: Request, res: Response) => {
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

// TVA options for the ETM société (the detail dropdown). Returns the rate so
// the FE can label them "20 %", "0 % (Exonération)", "5,5 %".
facturesRouter.get('/lookups/tva', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDtva: number; valeur: number | null; libelle_compte: string | null }>(
      `SELECT IDtva, valeur, libelle_compte FROM tva WHERE IDsociete = 1 AND est_visible = 1 ORDER BY valeur DESC`,
    )
    const fixed = await fixEncoding(rows, 'tva', 'IDtva', ['libelle_compte'])
    res.json(fixed.map((r) => ({ IDtva: Number(r.IDtva), valeur: Number(r.valeur) || 0, libelle: r.libelle_compte ?? '' })))
  } catch (err) {
    console.error('Error fetching tva lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  LIST
// ════════════════════════════════════════════════════════

facturesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim()
    const typeFilter = String(req.query.type ?? 'all') // 'facture' | 'avoir' | 'all'
    const limitRaw = parseInt(String(req.query.limit ?? ''), 10)
    const limit = isNaN(limitRaw) ? 200 : Math.min(Math.max(limitRaw, 1), 500)
    const isSearching = q.length > 0

    const whereParts: string[] = ['f.IDsociete = 1']
    if (typeFilter === 'facture') whereParts.push('f.TYPE = 1')
    else if (typeFilter === 'avoir') whereParts.push('f.TYPE = 2')

    if (isSearching) {
      const orParts: string[] = []
      if (/^\d+$/.test(q)) orParts.push(`f.numero = ${parseInt(q, 10)}`)
      const clientRows = await query<{ IDclient: number; nom: string | null }>(
        `SELECT IDclient, nom FROM client WHERE est_visible = 1`,
      )
      const fixedClients = await fixEncoding(clientRows, 'client', 'IDclient', ['nom'])
      const nq = norm(q)
      const matchIds = fixedClients
        .filter((c) => norm((c.nom ?? '').toString()).includes(nq))
        .map((c) => Number(c.IDclient))
        .filter((x) => x > 0)
      if (matchIds.length > 0) orParts.push(`f.IDclient IN (${matchIds.join(',')})`)
      if (orParts.length === 0) { res.json([]); return }
      whereParts.push(`(${orParts.join(' OR ')})`)
    }

    const whereSql = `WHERE ${whereParts.join(' AND ')}`
    // SELECT * is safe on facture (no accented columns). DATE/TYPE come back
    // uppercase (reserved words).
    const factures = await query<any>(
      `SELECT TOP ${limit} * FROM facture f ${whereSql} ORDER BY f.IDfacture DESC`,
    )

    const ids = factures.map((f: any) => Number(f.IDfacture)).filter(Boolean)
    const clientIds = factures.map((f: any) => Number(f.IDclient)).filter(Boolean)
    const [clientNames, tvaMap, totalsMap] = await Promise.all([
      resolveClientNames(clientIds),
      loadTvaMap(),
      lineTotals(ids),
    ])

    const result = factures.map((f: any) => {
      const id = Number(f.IDfacture)
      const totals = totalsMap.get(id) ?? { total_ht: 0, nb_lignes: 0 }
      const tva = tvaMap.get(Number(f.IDtva)) ?? { valeur: 0, libelle: '' }
      const tvaAmount = totals.total_ht * (tva.valeur / 100)
      return {
        IDfacture: id,
        numero: f.numero != null ? Number(f.numero) : null,
        date: f.DATE ?? null,
        IDclient: Number(f.IDclient) || 0,
        client_nom: clientNames.get(Number(f.IDclient)) ?? '',
        type: Number(f.TYPE) || 1,
        tva_rate: tva.valeur,
        total_ht: totals.total_ht,
        total_tva: tvaAmount,
        total_ttc: totals.total_ht + tvaAmount,
        nb_lignes: totals.nb_lignes,
      }
    })
    res.json(result)
  } catch (err) {
    console.error('Error fetching factures:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  DETAIL
// ════════════════════════════════════════════════════════

async function loadFactureLines(id: number): Promise<Array<{
  IDligne_facture: number; IDligne_expedition: number; designation: string | null
  quantite: number; unite: string; prix: number; montant: number
}>> {
  const rows = await query<any>(
    `SELECT IDligne_facture, IDfacture, IDligne_expedition, designation, quantite, unite, prix
     FROM ligne_facture WHERE IDfacture = ${id} ORDER BY IDligne_facture`,
  )
  const fixed = await fixEncoding(rows, 'ligne_facture', 'IDligne_facture', ['designation', 'unite'])
  return fixed.map((l: any) => {
    const qty = Number(l.quantite) || 0
    const prix = Number(l.prix) || 0
    return {
      IDligne_facture: Number(l.IDligne_facture),
      IDligne_expedition: Number(l.IDligne_expedition) || 0,
      designation: (l.designation ?? '') as string,
      quantite: qty,
      unite: (l.unite ?? '').toString(),
      prix,
      montant: qty * prix,
    }
  })
}

facturesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const rows = await query<any>(`SELECT * FROM facture WHERE IDfacture = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Facture not found' }); return }
    const h = rows[0]
    const IDclient = Number(h.IDclient) || 0

    const [clientNames, adr, lignes, tvaMap, modePaiement, echeance] = await Promise.all([
      resolveClientNames([IDclient]),
      loadAdresse(Number(h.IDadresse) || 0),
      loadFactureLines(id),
      loadTvaMap(),
      loadModePaiementLabel(Number(h.IDmode_paiement) || 0),
      loadEcheanceLabel(Number(h.IDecheance) || 0),
    ])

    const tva = tvaMap.get(Number(h.IDtva)) ?? { valeur: 0, libelle: '' }
    const totalHt = lignes.reduce((s, l) => s + l.montant, 0)
    const tvaAmount = totalHt * (tva.valeur / 100)

    res.json({
      IDfacture: id,
      IDclient,
      client_nom: clientNames.get(IDclient) ?? '',
      numero: h.numero != null ? Number(h.numero) : null,
      date: h.DATE ?? null,
      type: Number(h.TYPE) || 1,
      IDadresse: Number(h.IDadresse) || 0,
      IDmode_paiement: Number(h.IDmode_paiement) || 0,
      mode_paiement_label: modePaiement,
      IDecheance: Number(h.IDecheance) || 0,
      echeance_label: echeance,
      IDtva: Number(h.IDtva) || 0,
      tva_rate: tva.valeur,
      tva_label: tva.libelle,
      num_tva: (h.num_tva ?? '').toString(),
      IDcode_comptable: Number(h.IDcode_comptable) || 0,
      adresse_facturation: adr,
      lignes,
      total_ht: totalHt,
      total_tva: tvaAmount,
      total_ttc: totalHt + tvaAmount,
    })
  } catch (err) {
    console.error('Error fetching facture detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  HEADER CRUD
// ════════════════════════════════════════════════════════

facturesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = factureBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const d = parsed.data
    if (!d.IDclient) { res.status(400).json({ error: 'IDclient is required' }); return }
    const type = d.type === 2 ? 2 : 1
    const date = d.date ? dateStr(d.date) || todayDigits() : todayDigits()

    // Auto-fill billing defaults from the client row (explicit cols — SELECT *
    // fails on client). The société TVA/code default backstops a blank client.
    const clientRows = await query<{
      num_tva: string | null; IDtva: number | null; IDmode_paiement: number | null
      IDecheance: number | null; IDcode_comptable: number | null
    }>(
      `SELECT num_tva, IDtva, IDmode_paiement, IDecheance, IDcode_comptable FROM client WHERE IDclient = ${n(d.IDclient)}`,
    )
    const c = clientRows[0] ?? {}
    const adrRows = await query<{ IDadresse: number }>(
      `SELECT IDadresse FROM adresse
       WHERE IDclient = ${n(d.IDclient)} AND (est_visible IS NULL OR est_visible = 1)
       ORDER BY est_defaut_facturation DESC, est_defaut DESC, IDadresse`,
    )
    const tvaDefaultRows = await query<{ IDtva: number }>(
      `SELECT IDtva FROM tva WHERE IDsociete = 1 AND est_defaut = 1`,
    )
    const codeDefaultRows = await query<{ IDcode_comptable: number }>(
      `SELECT IDcode_comptable FROM code_comptable WHERE IDsociete = 1 AND est_defaut = 1`,
    )

    const idAdresse = d.IDadresse ?? (Number(adrRows[0]?.IDadresse) || 0)
    const idTva = d.IDtva ?? (Number(c.IDtva) || Number(tvaDefaultRows[0]?.IDtva) || 0)
    const idMode = d.IDmode_paiement ?? (Number(c.IDmode_paiement) || 0)
    const idEcheance = d.IDecheance ?? (Number(c.IDecheance) || 0)
    const idCode = Number(c.IDcode_comptable) || Number(codeDefaultRows[0]?.IDcode_comptable) || 0
    const numTva = d.num_tva ?? (c.num_tva ?? '').toString()

    // numero allocator with collision retry. DATE / TYPE written uppercase
    // (reserved words). IDexpedition_divers / IDcommande_client default to 0.
    let newNumero = 0
    let inserted = false
    let lastErr: unknown = null
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      newNumero = await nextNumero()
      try {
        await query(
          `INSERT INTO facture
             (IDsociete, numero, IDclient, IDadresse, IDmode_paiement, IDecheance,
              DATE, IDtva, num_tva, TYPE, IDcode_comptable, IDexpedition_divers, IDcommande_client)
           VALUES
             (1, ${newNumero}, ${n(d.IDclient)}, ${n(idAdresse)}, ${n(idMode)}, ${n(idEcheance)},
              '${date}', ${n(idTva)}, ${sqlText(numTva)}, ${type}, ${n(idCode)}, 0, 0)`,
        )
        inserted = true
      } catch (e) { lastErr = e }
    }
    if (!inserted) throw lastErr ?? new Error('insert failed after 3 attempts')

    const newRows = await query<{ IDfacture: number }>(
      `SELECT IDfacture FROM facture WHERE IDsociete = 1 AND numero = ${newNumero} ORDER BY IDfacture DESC`,
    )
    res.status(201).json({ IDfacture: Number(newRows[0]?.IDfacture) || 0 })
  } catch (err) {
    console.error('Error creating facture:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

facturesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const parsed = factureBody.partial().safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const d = parsed.data

    const sets: string[] = []
    if (d.date !== undefined) sets.push(`DATE = '${dateStr(d.date)}'`)
    if (d.type !== undefined) sets.push(`TYPE = ${d.type === 2 ? 2 : 1}`)
    if (d.IDadresse !== undefined) sets.push(`IDadresse = ${n(d.IDadresse)}`)
    if (d.IDmode_paiement !== undefined) sets.push(`IDmode_paiement = ${n(d.IDmode_paiement)}`)
    if (d.IDecheance !== undefined) sets.push(`IDecheance = ${n(d.IDecheance)}`)
    if (d.IDtva !== undefined) sets.push(`IDtva = ${n(d.IDtva)}`)
    if (d.num_tva !== undefined) sets.push(`num_tva = ${sqlText(d.num_tva)}`)
    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    await query(`UPDATE facture SET ${sets.join(', ')} WHERE IDfacture = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating facture:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

facturesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM ligne_facture WHERE IDfacture = ${id}`)
    await query(`DELETE FROM facture WHERE IDfacture = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting facture:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  LINE CRUD
// ════════════════════════════════════════════════════════

facturesRouter.post('/:id/lignes', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const parsed = ligneBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const d = parsed.data
    await query(
      `INSERT INTO ligne_facture (IDfacture, IDligne_expedition, designation, quantite, unite, prix)
       VALUES (${id}, 0, ${sqlText(d.designation ?? '')}, ${Number(d.quantite) || 0}, ${sqlText(d.unite ?? '')}, ${Number(d.prix) || 0})`,
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Error adding facture line:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

facturesRouter.put('/lignes/:lineId', async (req: Request, res: Response) => {
  try {
    const lineId = parseInt(req.params.lineId, 10)
    if (isNaN(lineId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const parsed = ligneBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const d = parsed.data
    const sets: string[] = []
    if (d.designation !== undefined) sets.push(`designation = ${sqlText(d.designation)}`)
    if (d.quantite !== undefined) sets.push(`quantite = ${Number(d.quantite) || 0}`)
    if (d.unite !== undefined) sets.push(`unite = ${sqlText(d.unite)}`)
    if (d.prix !== undefined) sets.push(`prix = ${Number(d.prix) || 0}`)
    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }
    await query(`UPDATE ligne_facture SET ${sets.join(', ')} WHERE IDligne_facture = ${lineId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating facture line:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

facturesRouter.delete('/lignes/:lineId', async (req: Request, res: Response) => {
  try {
    const lineId = parseInt(req.params.lineId, 10)
    if (isNaN(lineId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM ligne_facture WHERE IDligne_facture = ${lineId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting facture line:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  PDF
// ════════════════════════════════════════════════════════

export async function buildFacturePdfData(id: number): Promise<FacturePdfData | null> {
  const rows = await query<any>(`SELECT * FROM facture WHERE IDfacture = ${id}`)
  if (rows.length === 0) return null
  const h = rows[0]
  const IDclient = Number(h.IDclient) || 0

  const [clientNames, adr, lignes, tvaMap, modePaiement, echeance] = await Promise.all([
    resolveClientNames([IDclient]),
    loadAdresse(Number(h.IDadresse) || 0),
    loadFactureLines(id),
    loadTvaMap(),
    loadModePaiementLabel(Number(h.IDmode_paiement) || 0),
    loadEcheanceLabel(Number(h.IDecheance) || 0),
  ])
  const tva = tvaMap.get(Number(h.IDtva)) ?? { valeur: 0, libelle: '' }

  const a = adr as any
  const cleanAddr = a ? {
    nom: cleanAddrField(a.nom), adresse1: cleanAddrField(a.adresse1), adresse2: cleanAddrField(a.adresse2),
    adresse3: cleanAddrField(a.adresse3), cp: cleanAddrField(a.cp), ville: cleanAddrField(a.ville), pays: cleanAddrField(a.pays),
  } : null

  return {
    numero: String(h.numero ?? id),
    type: Number(h.TYPE) || 1,
    dateFacture: formatHfsqlDateLongFr(h.DATE),
    clientNom: clientNames.get(IDclient) ?? '',
    numTva: (h.num_tva ?? '').toString() || null,
    adresseFacturation: cleanAddr,
    modePaiement,
    echeance,
    tvaRate: tva.valeur,
    lignes: lignes.map((l) => ({ designation: l.designation ?? '', quantite: l.quantite, unite: l.unite, prix: l.prix, montant: l.montant })),
  }
}

async function renderFacturePdfBuffer(data: FacturePdfData): Promise<Buffer> {
  return renderToBuffer(
    React.createElement(FacturePdf, { data }) as unknown as React.ReactElement<
      import('@react-pdf/renderer').DocumentProps
    >,
  )
}

facturesRouter.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const data = await buildFacturePdfData(id)
    if (!data) { res.status(404).json({ error: 'Facture not found' }); return }
    const buffer = await renderFacturePdfBuffer(data)
    const word = data.type === 2 ? 'avoir' : 'facture'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${word}-${data.numero}.pdf"`)
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.send(buffer)
  } catch (err) {
    console.error('Error rendering facture PDF:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  EMAIL
// ════════════════════════════════════════════════════════

interface EmailRecipientPayload { email: string; name?: string; source: 'contact'; contactId: number }

async function buildEmailDefaults(id: number): Promise<{
  recipients: { selected: EmailRecipientPayload[]; suggestions: EmailRecipientPayload[] }
  subject: string; body: string; clientNom: string; numero: string
} | null> {
  const rows = await query<{ IDclient: number; numero: number | null; TYPE: number | null }>(
    `SELECT IDclient, numero, TYPE FROM facture WHERE IDfacture = ${id}`,
  )
  if (rows.length === 0) return null
  const IDclient = Number(rows[0].IDclient) || 0
  const numero = String(rows[0].numero ?? id)
  const isAvoir = Number(rows[0].TYPE) === 2
  const docWord = isAvoir ? 'avoir' : 'facture'

  const [clientNames, contactRows] = await Promise.all([
    resolveClientNames([IDclient]),
    query<{ IDcontact: number; nom: string | null; prenom: string | null; mail: string | null; envoi_facture: number | null; est_visible: number | null }>(
      `SELECT IDcontact, nom, prenom, mail, envoi_facture, est_visible FROM contact WHERE IDclient = ${IDclient}`,
    ),
  ])
  const clientNom = clientNames.get(IDclient) ?? ''
  const fixedContacts = await fixEncoding(contactRows, 'contact', 'IDcontact', ['nom', 'prenom', 'mail'])

  const selected: EmailRecipientPayload[] = []
  const suggestions: EmailRecipientPayload[] = []
  const seen = new Set<string>()
  for (const c of fixedContacts as any[]) {
    if (c.est_visible === 0) continue
    const raw = (c.mail ?? '').toString().trim()
    if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) continue
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const displayName = [c.prenom, c.nom].map((s: string | null) => (s ?? '').toString().trim()).filter((s: string) => s.length > 0).join(' ')
    const recipient: EmailRecipientPayload = { email: raw, source: 'contact', contactId: Number(c.IDcontact) }
    if (displayName) recipient.name = displayName
    if (c.envoi_facture === 1) selected.push(recipient)
    else suggestions.push(recipient)
  }

  const docCap = isAvoir ? 'Avoir' : 'Facture'
  const subject = `${docCap} N°${numero} — ETS Malterre`
  const body =
    `Bonjour,\n\n` +
    `Veuillez trouver ci-joint notre ${docWord} N°${numero}.\n\n` +
    `Nous restons à votre disposition pour toute information complémentaire.\n\n` +
    `Cordialement,\n` +
    `ETS Malterre`
  return { recipients: { selected, suggestions }, subject, body, clientNom, numero }
}

facturesRouter.get('/:id/email-defaults', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const defaults = await buildEmailDefaults(id)
    if (!defaults) { res.status(404).json({ error: 'Facture not found' }); return }
    res.json(defaults)
  } catch (err) {
    console.error('Error building facture email defaults:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const extraAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1),
  content_type: z.string().min(1).max(100),
})
const emailBody = z.object({
  to: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
  attach_pdf: z.boolean().optional(),
  extra_attachments: z.array(extraAttachmentSchema).optional(),
  dev_skip_send: z.boolean().optional(),
})
const ALLOW_DEV_SKIP_SEND = process.env.NODE_ENV !== 'production'

async function logEnvoiEmails(idReference: number, recipients: string[], societe: string): Promise<void> {
  if (recipients.length === 0) return
  const ts = nowHfsqlDatetime()
  for (const raw of recipients) {
    const addr = String(raw).trim()
    if (!addr) continue
    try {
      if (IS_WINDOWS) {
        await query(
          `INSERT INTO envoi_email (DATE, adresse, société, IDreference, invalidé, notes, IDtype_doc)
           VALUES ('${ts}', ${sqlText(addr)}, ${sqlText(societe || '')}, ${idReference}, 0, '', ${TYPE_DOC_FACTURE})`,
        )
      } else {
        await query(
          `INSERT INTO envoi_email (DATE, adresse, IDreference, notes, IDtype_doc)
           VALUES ('${ts}', ${sqlText(addr)}, ${idReference}, '', ${TYPE_DOC_FACTURE})`,
        )
      }
    } catch (e) {
      console.error(`envoi_email log failed (facture/${idReference}/${addr}):`, (e as Error).message)
    }
  }
}

facturesRouter.post('/:id/email', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    if (req.userId === undefined) { res.status(401).json({ error: 'not authenticated' }); return }
    const parsed = emailBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const devSkip = parsed.data.dev_skip_send === true && ALLOW_DEV_SKIP_SEND

    let messageId: string
    if (devSkip) {
      messageId = `dev-skip-${Date.now()}`
      console.log(`[dev-skip-send] facture #${id} — fake send to ${parsed.data.to.join(', ')}`)
    } else {
      const senderEmail = await getUserEmail(req.userId)
      if (!senderEmail) {
        res.status(400).json({
          error: 'no_sender_email',
          message: "Aucune adresse email n'est associée à votre compte. Un administrateur doit en définir une dans Paramètres › Utilisateurs.",
        })
        return
      }
      const userRows = await query<{ prenom: string | null; nom: string | null }>(
        `SELECT prenom, nom FROM utilisateur WHERE IDutilisateur = ${req.userId}`,
      )
      const fixedUser = await fixEncoding(userRows, 'utilisateur', 'IDutilisateur', ['prenom', 'nom'])
      const u = (fixedUser[0] as any) ?? null
      const displayName = u ? [u.prenom, u.nom].filter((s: string | null) => s && s.trim()).map((s: string) => s.trim()).join(' ') : ''
      const fromName = displayName ? `${displayName} — ETS Malterre` : 'ETS Malterre'

      const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
      if (parsed.data.attach_pdf !== false) {
        const data = await buildFacturePdfData(id)
        if (!data) { res.status(404).json({ error: 'Facture not found' }); return }
        const buffer = await renderFacturePdfBuffer(data)
        const word = data.type === 2 ? 'avoir' : 'facture'
        attachments.push({ filename: `${word}-${data.numero}.pdf`, content: buffer, contentType: 'application/pdf' })
      }
      for (const a of parsed.data.extra_attachments ?? []) {
        attachments.push({ filename: a.filename, content: Buffer.from(a.content_base64, 'base64'), contentType: a.content_type })
      }
      messageId = await sendMail({
        from: senderEmail, fromName, to: parsed.data.to, cc: parsed.data.cc,
        subject: parsed.data.subject, body: parsed.data.body,
        attachments: attachments.length > 0 ? attachments : undefined,
      })
    }

    const allRecipients = [...parsed.data.to, ...(parsed.data.cc ?? [])]
    let societe = ''
    try {
      const cr = await query<{ IDclient: number }>(`SELECT IDclient FROM facture WHERE IDfacture = ${id}`)
      const names = await resolveClientNames([Number(cr[0]?.IDclient) || 0])
      societe = names.get(Number(cr[0]?.IDclient) || 0) ?? ''
    } catch { /* informational */ }
    await logEnvoiEmails(id, allRecipients, societe)

    res.json({ ok: true, messageId })
  } catch (err) {
    console.error('Error sending facture email:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: 'send_failed', message })
  }
})

// ════════════════════════════════════════════════════════
//  HISTORIQUE  (envoi_email timeline for this facture)
// ════════════════════════════════════════════════════════

facturesRouter.get('/:id/historique', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const rows = await query<{ adresse: string | null; DATE: string | null }>(
      `SELECT adresse, DATE FROM envoi_email WHERE IDreference = ${id} AND IDtype_doc = ${TYPE_DOC_FACTURE}`,
    )
    const byDate = new Map<string, { DATE: string; recipients: string[] }>()
    for (const r of rows as any[]) {
      const dt = (r.DATE ?? '').toString()
      const acc = byDate.get(dt) ?? { DATE: dt, recipients: [] as string[] }
      const addr = (r.adresse ?? '').toString().trim()
      if (addr) acc.recipients.push(addr)
      byDate.set(dt, acc)
    }
    const events = Array.from(byDate.values())
      .map((e) => ({ kind: 'email' as const, type_label: 'Document envoyé', recipients: e.recipients, DATE: e.DATE }))
      .sort((a, b) => (a.DATE < b.DATE ? 1 : -1))
    res.json(events)
  } catch (err) {
    console.error('Error fetching facture historique:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

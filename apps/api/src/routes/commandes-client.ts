// Commandes client — customer orders (commande_client / ligne_commande_client).
// The central client-facing screen: manage orders and RESERVE finished/écru
// stock rolls to each order line (the "Stock Affecté à la commande" ↔ "Stock
// disponible" affectation). Mirrors the structure of commandes-sous-traitant.ts
// but for the ETM client ledger — there is NO TRM cross-ledger mirror here
// (the sst route writes INTO commande_client; this route IS that table).
//
// Hard rules baked in (verified against live data + CLAUDE.md HFSQL section):
//  - ETM scope: every read/write is IDsociete = 1 AND IDcommande_ETM = 0
//    (IDsociete=2 rows are TRM mirrors, owned by the sister-company view).
//  - numero allocator: MAX(numero)+1 WHERE IDsociete=1, with a retry loop.
//  - Accented commande_client columns (archivé/expedié/envoyé_client) and
//    ligne columns (delai_annoncé/déverrouiller) are NEVER named in SQL — the
//    Linux iODBC bridge can't tokenize them. SELECT * + prune for reads;
//    omit on writes (HFSQL zero-fills).
//  - `SELECT * FROM client` returns 0 rows on this driver — explicit columns only.
//  - ligne_commande_client.TYPE is a reserved word (alias `TYPE AS type_kind`,
//    write uppercase) and IDcolori is lowercase (not IDColoris).
//  - Line polymorphism: type 1 = écru (ref_ecru + colori_ecru), 2 = fini
//    (ref_fini + coloris by avec_teinture), 3 = divers (ref_divers, display-only).
//  - unite enum: 1 = Kg (poids), 3 = Ml (metrage), 4 = U, 5 = m². The
//    affectation gauge sums poids for Kg lines, metrage for Ml lines.
//  - Reservation pointer: stock_ecru.IDligne_commande_client /
//    stock_fini.IDligne_commande_client (distinct from the sst affectation).

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { query, queryRaw, fixEncoding } from '../lib/hfsql-auto.js'
import { CommandeClientPdf, type CommandeClientPdfData } from '../lib/pdf/CommandeClientPdf.js'
import { calcLignePriceClient } from '../lib/pricing-ligne-client.js'
import { calcTarifSST } from '../lib/pricing-sst.js'
import { sendMail } from '../lib/gmail.js'
import { getUserEmail } from '../lib/user-emails.js'
import { stripRtf } from '../lib/rtf-utils.js'
import { IS_WINDOWS, esc, n, dateDigits as dateStr, addWorkingDays } from '../lib/sst-shared.js'

const upload = multer({ storage: multer.memoryStorage() })
export const commandesClientRouter: RouterType = Router()

// type_doc 7 = "commande client" — the bon de commande type for the
// envoi_email audit log and the ged document allowlist (verified live).
const TYPE_DOC_COMMANDE_CLIENT = 7

// ── Small SQL/format helpers (copied from commandes-sous-traitant.ts) ──

/** SQL literal for a user-supplied text value. Pure ASCII → quoted literal;
 *  anything with accents → Latin-1 hex literal (the Linux iODBC bridge
 *  corrupts raw multi-byte UTF-8 embedded in a SQL line). */
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

function formatHfsqlDateFr(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw)
  if (/^\d{8}$/.test(s)) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
  return ''
}

function cleanAddrField(s: string | null | undefined): string | null {
  if (!s) return null
  const t = String(s).trim()
  if (!t) return null
  if (/^[.\-_·•\s]+$/.test(t)) return null
  return t
}

/** Decode an ODBC value (ArrayBuffer / string) to a JS string. */
function decode(v: unknown): string | null {
  if (v instanceof ArrayBuffer) return Buffer.from(v).toString('utf8')
  if (typeof v === 'string') return v
  return null
}

/** Normalise for accent-insensitive contains-matching (search). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// ── Line unit + dimension semantics ──────────────────────
// unite enum (hardcoded WinDev combo; no lookup table). Verified empirically:
// Kg lines track stock poids, Ml lines track stock metrage.

function uniteLabel(u: number | null | undefined): string {
  switch (Number(u)) {
    case 1: return 'Kg'
    case 3: return 'Ml'
    case 4: return 'unité'
    case 5: return 'm²'
    default: return ''
  }
}

/** Which roll dimension a line's quantite is measured in. */
function lineDim(unite: number | null | undefined): 'metrage' | 'poids' {
  return Number(unite) === 3 ? 'metrage' : 'poids'
}

/** Roll kind a line reserves: type 1 → écru, type 2 → fini, else none. */
function lineStockKind(typeKind: number): 'ecru' | 'fini' | 'none' {
  if (typeKind === 1) return 'ecru'
  if (typeKind === 2) return 'fini'
  return 'none'
}

// ── Lifecycle helpers ────────────────────────────────────

async function loadCommandeSoldee(commandeId: number): Promise<number | null> {
  const rows = await query<{ est_soldee: number | null }>(
    `SELECT est_soldee FROM commande_client WHERE IDcommande_client = ${commandeId}`,
  )
  if (rows.length === 0) return null
  return rows[0].est_soldee ?? 0
}

async function loadCommandeIdForLine(lineId: number): Promise<number | null> {
  const rows = await query<{ IDcommande_client: number }>(
    `SELECT IDcommande_client FROM ligne_commande_client WHERE IDligne_commande_client = ${lineId}`,
  )
  if (rows.length === 0) return null
  return Number(rows[0].IDcommande_client) || null
}

function refuseIfSoldee(res: Response, est_soldee: number | null): boolean {
  if (est_soldee === 1) {
    res.status(409).json({
      error: 'commande_soldee',
      message: 'Commande soldée — rouvrir la commande pour la modifier.',
    })
    return true
  }
  return false
}

/** Next numero for the ETM client ledger (IDsociete=1). Legacy data has gaps,
 *  so MAX+1 matches the allocator; concurrent POSTs retry on collision. */
async function nextNumero(): Promise<number> {
  const r = await query<{ m: number | null }>(
    `SELECT MAX(numero) AS m FROM commande_client WHERE IDsociete = 1`,
  )
  return (Number(r[0]?.m) || 0) + 1
}

// ── Phase model ──────────────────────────────────────────
// A client order is simpler than the sst computed phase (no per-line sstatut):
//   terminee   — est_soldee = 1 (the sidebar footer pill flips this)
//   partielle  — open AND at least one line has rolls reserved to it
//   a_affecter — open AND no rolls reserved yet
// `est_soldee` remains the sole write gate (refuseIfSoldee).

export type ClientPhase = 'a_affecter' | 'partielle' | 'terminee'

/** Set of commande ids that have at least one reserved roll on any line. */
async function ordersWithReservedRolls(commandeIds: number[]): Promise<Set<number>> {
  const out = new Set<number>()
  const ids = commandeIds.filter((x) => x > 0)
  if (ids.length === 0) return out
  // Map every line → its commande, then check both stock tables for rolls
  // reserved to those lines (IDligne_commande_client). Flat queries only.
  const lineRows = await query<{ IDligne_commande_client: number; IDcommande_client: number }>(
    `SELECT IDligne_commande_client, IDcommande_client FROM ligne_commande_client
     WHERE IDcommande_client IN (${ids.join(',')})`,
  )
  const cmdByLine = new Map<number, number>()
  for (const r of lineRows) cmdByLine.set(Number(r.IDligne_commande_client), Number(r.IDcommande_client))
  const lineIds = Array.from(cmdByLine.keys()).filter((x) => x > 0)
  if (lineIds.length === 0) return out
  const inList = lineIds.join(',')
  const [ecru, fini] = await Promise.all([
    query<{ IDligne_commande_client: number }>(
      `SELECT DISTINCT IDligne_commande_client FROM stock_ecru WHERE IDligne_commande_client IN (${inList})`,
    ),
    query<{ IDligne_commande_client: number }>(
      `SELECT DISTINCT IDligne_commande_client FROM stock_fini WHERE IDligne_commande_client IN (${inList})`,
    ),
  ])
  for (const r of [...ecru, ...fini]) {
    const cmd = cmdByLine.get(Number(r.IDligne_commande_client))
    if (cmd && cmd > 0) out.add(cmd)
  }
  return out
}

async function computePhasesBatch(
  orders: Array<{ id: number; est_soldee: number }>,
): Promise<Map<number, ClientPhase>> {
  const out = new Map<number, ClientPhase>()
  const openIds = orders.filter((o) => o.est_soldee !== 1).map((o) => o.id)
  const reserved = await ordersWithReservedRolls(openIds)
  for (const o of orders) {
    if (o.est_soldee === 1) out.set(o.id, 'terminee')
    else out.set(o.id, reserved.has(o.id) ? 'partielle' : 'a_affecter')
  }
  return out
}

// ── Client name resolution (batched, flat — never SELECT *) ──

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

// ── Validation schemas ───────────────────────────────────

const commandeBody = z.object({
  IDclient: z.number().int().positive().optional(),
  date_commande: z.string().optional(),
  ref_client: z.string().optional(),
  IDadresse_livraison: z.number().int().nonnegative().optional(),
  IDadresse_facturation: z.number().int().nonnegative().optional(),
  IDmode_paiement: z.number().int().nonnegative().optional(),
  IDecheance: z.number().int().nonnegative().optional(),
  commentaire: z.string().optional(),
  commentaire_interne: z.string().optional(),
  remise: z.number().optional(),
  frais_port: z.number().optional(),
  est_soldee: z.number().int().min(0).max(1).optional(),
})

const ligneBody = z.object({
  type: z.number().int().optional(),
  IDreference: z.number().int().nonnegative().optional(),
  IDcolori: z.number().int().nonnegative().optional(),
  quantite: z.number().optional(),
  unite: z.number().int().optional(),
  prix: z.number().optional(),
  poids: z.number().optional(),
  date_livraison: z.string().optional(),
  commentaire: z.string().optional(),
})

// ════════════════════════════════════════════════════════
//  LOOKUPS  (literal paths — must register before /:id)
// ════════════════════════════════════════════════════════

// Clients — explicit columns (SELECT * fails on this table), est_visible only
// (the IDsociete partition is not used to filter clients — verified live).
commandesClientRouter.get('/lookups/clients', async (_req: Request, res: Response) => {
  try {
    // ETM scope — client is partitioned by IDsociete (1=ETM, 2=TRM, 3=Confection);
    // without this the picker leaks the sister companies' clients into the ETM list.
    const rows = await query<{ IDclient: number; nom: string | null; IDmode_paiement: number | null; IDecheance: number | null }>(
      `SELECT IDclient, nom, IDmode_paiement, IDecheance FROM client WHERE est_visible = 1 AND IDsociete = 1 ORDER BY nom`,
    )
    const fixed = await fixEncoding(rows, 'client', 'IDclient', ['nom'])
    res.json(fixed.map((r) => ({
      IDclient: Number(r.IDclient),
      nom: (r.nom ?? '').toString(),
      // Client-sheet defaults — prefill the new-order modal's payment fields.
      IDmode_paiement: Number(r.IDmode_paiement) || 0,
      IDecheance: Number(r.IDecheance) || 0,
    })))
  } catch (err) {
    console.error('Error fetching clients lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Addresses for a client (delivery + billing pickers).
commandesClientRouter.get('/lookups/adresses', async (req: Request, res: Response) => {
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
    const fixed = await fixEncoding(rows, 'adresse', 'IDadresse', [
      'nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays',
    ])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching adresses lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Resolve the set of references a client is allowed to order, from
// designation_client (the legacy per-client product catalog). Each row ties a
// client to EITHER an IDref_fini OR an IDref_ecru. `archivé`/`caché` are accented
// columns — never name them in SQL (the Linux bridge storms on accented
// identifiers); SELECT * + prune in JS via pickKey (case-insensitive prefix).
function pickKey(row: Record<string, unknown>, re: RegExp): unknown {
  const k = Object.keys(row).find((key) => re.test(key))
  return k ? row[k] : undefined
}
async function assignedRefIds(clientId: number, col: 'IDref_fini' | 'IDref_ecru'): Promise<number[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM designation_client WHERE IDclient = ${clientId} AND ${col} > 0`,
  )
  const ids = new Set<number>()
  for (const r of rows) {
    if (Number(pickKey(r, /^archiv/i)) === 1) continue // archivé
    if (Number(pickKey(r, /^cach/i)) === 1) continue   // caché
    const id = Number(r[col])
    if (id > 0) ids.add(id)
  }
  return [...ids]
}

// Écru references (type-1 lines). When `client` is given, restrict to the refs
// assigned to that client in designation_client (the buyable catalogue).
commandesClientRouter.get('/lookups/refs-ecru', async (req: Request, res: Response) => {
  try {
    const cid = parseInt(String(req.query.client ?? ''), 10)
    let idFilter = ''
    if (!isNaN(cid) && cid > 0) {
      const ids = await assignedRefIds(cid, 'IDref_ecru')
      if (ids.length === 0) { res.json([]); return }
      idFilter = `WHERE IDref_ecru IN (${ids.join(',')})`
    }
    const rows = await query<{ IDref_ecru: number; reference: string | null }>(
      `SELECT IDref_ecru, reference FROM ref_ecru ${idFilter} ORDER BY reference`,
    )
    const fixed = await fixEncoding(rows, 'ref_ecru', 'IDref_ecru', ['reference'])
    res.json(fixed.map((r) => ({ IDref_ecru: Number(r.IDref_ecru), reference: r.reference ?? '' })))
  } catch (err) {
    console.error('Error fetching refs-ecru lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.get('/lookups/colori-ecru', async (req: Request, res: Response) => {
  try {
    const refEcru = parseInt(String(req.query.ref_ecru ?? ''), 10)
    // colori_ecru fails on SELECT *; explicit columns. Filter by ref when given.
    const where = !isNaN(refEcru) && refEcru > 0 ? `WHERE IDref_ecru = ${refEcru}` : ''
    const rows = await query<{ IDcolori_ecru: number; reference: string | null }>(
      `SELECT IDcolori_ecru, reference FROM colori_ecru ${where} ORDER BY reference`,
    )
    const fixed = await fixEncoding(rows, 'colori_ecru', 'IDcolori_ecru', ['reference'])
    res.json(fixed.map((r) => ({ IDcolori_ecru: Number(r.IDcolori_ecru), reference: r.reference ?? '' })))
  } catch (err) {
    console.error('Error fetching colori-ecru lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Finished references (type-2 lines) — carry avec_teinture so the FE picks the
// correct coloris catalog.
commandesClientRouter.get('/lookups/refs-fini', async (req: Request, res: Response) => {
  try {
    // ref_fini supports SELECT of explicit columns; archivé is accented so we
    // never name it — prune archived rows in JS via a SELECT *-free read.
    // When `client` is given, restrict to the refs assigned to that client in
    // designation_client (the buyable catalogue).
    const cid = parseInt(String(req.query.client ?? ''), 10)
    let idFilter = ''
    if (!isNaN(cid) && cid > 0) {
      const ids = await assignedRefIds(cid, 'IDref_fini')
      if (ids.length === 0) { res.json([]); return }
      idFilter = `WHERE IDref_fini IN (${ids.join(',')})`
    }
    const rows = await query<{
      IDref_fini: number; reference: string | null; designation: string | null; avec_teinture: number | null
    }>(
      `SELECT IDref_fini, reference, designation, avec_teinture FROM ref_fini ${idFilter} ORDER BY reference`,
    )
    const fixed = await fixEncoding(rows, 'ref_fini', 'IDref_fini', ['reference', 'designation'])
    res.json(fixed.map((r) => ({
      IDref_fini: Number(r.IDref_fini),
      reference: r.reference ?? '',
      designation: r.designation ?? '',
      avec_teinture: Number(r.avec_teinture) || 0,
    })))
  } catch (err) {
    console.error('Error fetching refs-fini lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Coloris for a ref_fini — branch on avec_teinture (0 = colori_ecru of the
// ref's IDref_ecru, 1/2 = ref_fini_colori). Returned id goes into IDcolori.
commandesClientRouter.get('/lookups/colori-fini', async (req: Request, res: Response) => {
  try {
    const refFini = parseInt(String(req.query.ref_fini ?? ''), 10)
    if (isNaN(refFini) || refFini <= 0) { res.status(400).json({ error: 'ref_fini query parameter required' }); return }
    const refRows = await query<{ avec_teinture: number | null; IDref_ecru: number | null }>(
      `SELECT avec_teinture, IDref_ecru FROM ref_fini WHERE IDref_fini = ${refFini}`,
    )
    const avecTeinture = Number(refRows[0]?.avec_teinture) || 0
    if (avecTeinture === 0) {
      const idEcru = Number(refRows[0]?.IDref_ecru) || 0
      const rows = await query<{ IDcolori_ecru: number; reference: string | null }>(
        `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDref_ecru = ${idEcru} ORDER BY reference`,
      )
      const fixed = await fixEncoding(rows, 'colori_ecru', 'IDcolori_ecru', ['reference'])
      res.json(fixed.map((r) => ({ id: Number(r.IDcolori_ecru), reference: r.reference ?? '' })))
    } else {
      const rows = await query<{ IDref_fini_colori: number; reference: string | null }>(
        `SELECT IDref_fini_colori, reference FROM ref_fini_colori WHERE IDref_fini = ${refFini} ORDER BY reference`,
      )
      const fixed = await fixEncoding(rows, 'ref_fini_colori', 'IDref_fini_colori', ['reference'])
      res.json(fixed.map((r) => ({ id: Number(r.IDref_fini_colori), reference: r.reference ?? '' })))
    }
  } catch (err) {
    console.error('Error fetching colori-fini lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Divers references (type-3 lines).
commandesClientRouter.get('/lookups/refs-divers', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDref_divers: number; designation: string | null; unite: number | null }>(
      `SELECT IDref_divers, designation, unite FROM ref_divers ORDER BY designation`,
    )
    const fixed = await fixEncoding(rows, 'ref_divers', 'IDref_divers', ['designation'])
    res.json(fixed.map((r) => ({
      IDref_divers: Number(r.IDref_divers),
      designation: r.designation ?? '',
      unite: Number(r.unite) || 0,
    })))
  } catch (err) {
    console.error('Error fetching refs-divers lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.get('/lookups/modes-paiement', async (_req: Request, res: Response) => {
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

commandesClientRouter.get('/lookups/echeances', async (_req: Request, res: Response) => {
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

// Auto-price + roll-count note for a line being entered (PrixDeVenteV4 port).
// Returns the suggested unit price and the roll geometry so the form can show the
// "N Rouleaux (X Ml)" indicator. Never throws — unpriceable inputs come back with
// priceable=false so the UI just falls back to manual entry.
commandesClientRouter.get('/lookups/line-price', async (req: Request, res: Response) => {
  try {
    const type = parseInt(String(req.query.type ?? ''), 10) || 0
    const IDreference = parseInt(String(req.query.ref ?? ''), 10) || 0
    const IDcolori = parseInt(String(req.query.coloris ?? ''), 10) || 0
    const quantite = Number(req.query.quantite ?? 0) || 0
    const unite = parseInt(String(req.query.unite ?? ''), 10) || 0
    const result = await calcLignePriceClient({ type, IDreference, IDcolori, quantite, unite })
    res.json({ ...result, unite_label: uniteLabel(unite) })
  } catch (err) {
    console.error('Error computing line price:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  URGENCY  (header pills: late / soon, deadline = earliest open-line date)
// ════════════════════════════════════════════════════════

async function computeUrgencyBuckets(): Promise<{ late: Set<number>; soon: Set<number> }> {
  const late = new Set<number>()
  const soon = new Set<number>()
  const openRows = await query<{ IDcommande_client: number }>(
    `SELECT IDcommande_client FROM commande_client
     WHERE IDsociete = 1 AND IDcommande_ETM = 0 AND est_soldee = 0`,
  )
  const openIds = openRows.map((r) => Number(r.IDcommande_client)).filter((x) => x > 0)
  if (openIds.length === 0) return { late, soon }

  // Earliest line delivery deadline per open commande.
  const lineRows = await query<{ IDcommande_client: number; date_livraison: string | null }>(
    `SELECT IDcommande_client, date_livraison FROM ligne_commande_client
     WHERE IDcommande_client IN (${openIds.join(',')})`,
  )
  const earliest = new Map<number, string | null>()
  for (const id of openIds) earliest.set(id, null)
  for (const l of lineRows) {
    const cid = Number(l.IDcommande_client)
    const dl = typeof l.date_livraison === 'string' ? l.date_livraison : ''
    if (!/^\d{8}$/.test(dl)) continue
    const prev = earliest.get(cid) ?? null
    if (prev === null || dl < prev) earliest.set(cid, dl)
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  for (const id of openIds) {
    const e = earliest.get(id) ?? null
    if (!e) { late.add(id); continue } // no valid deadline = data problem → red
    const target = new Date(Number(e.slice(0, 4)), Number(e.slice(4, 6)) - 1, Number(e.slice(6, 8)))
    target.setHours(0, 0, 0, 0)
    const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
    if (diff <= 0) late.add(id)
    else if (diff <= 3) soon.add(id)
  }
  return { late, soon }
}

commandesClientRouter.get('/urgency-counts', async (_req: Request, res: Response) => {
  try {
    const { late, soon } = await computeUrgencyBuckets()
    res.json({ late: late.size, soon: soon.size })
  } catch (err) {
    console.error('Error fetching urgency counts:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  LIST
// ════════════════════════════════════════════════════════

commandesClientRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim()
    const statusFilter = String(req.query.status ?? 'all')
    const limitRaw = parseInt(String(req.query.limit ?? ''), 10)
    const limit = isNaN(limitRaw) ? 100 : Math.min(Math.max(limitRaw, 1), 500)
    const beforeIdRaw = parseInt(String(req.query.before_id ?? ''), 10)
    const beforeId = isNaN(beforeIdRaw) || beforeIdRaw <= 0 ? null : beforeIdRaw
    const isSearching = q.length > 0

    const whereParts: string[] = ['cc.IDsociete = 1', 'cc.IDcommande_ETM = 0']
    if (statusFilter === 'terminee') whereParts.push('cc.est_soldee = 1')
    else if (statusFilter === 'open') whereParts.push('cc.est_soldee = 0')

    // Search: numero exact (digits) OR client-name contains. Client list is
    // small (~650 visible) so we resolve name matches in JS to dodge LIKE
    // accent issues, then push the matching IDclient set as an IN-list.
    if (isSearching) {
      const orParts: string[] = []
      if (/^\d+$/.test(q)) orParts.push(`cc.numero = ${parseInt(q, 10)}`)
      const clientRows = await query<{ IDclient: number; nom: string | null }>(
        `SELECT IDclient, nom FROM client WHERE est_visible = 1`,
      )
      const fixedClients = await fixEncoding(clientRows, 'client', 'IDclient', ['nom'])
      const nq = norm(q)
      const matchIds = fixedClients
        .filter((c) => norm((c.nom ?? '').toString()).includes(nq))
        .map((c) => Number(c.IDclient))
        .filter((x) => x > 0)
      if (matchIds.length > 0) orParts.push(`cc.IDclient IN (${matchIds.join(',')})`)
      if (orParts.length === 0) { res.json([]); return }
      whereParts.push(`(${orParts.join(' OR ')})`)
    }

    // Urgency narrowing (urgency_in=late,soon).
    const urgencyTokens = String(req.query.urgency_in ?? '')
      .split(',').map((s) => s.trim()).filter((s) => s === 'late' || s === 'soon')
    if (urgencyTokens.length > 0) {
      const buckets = await computeUrgencyBuckets()
      const merged = new Set<number>()
      if (urgencyTokens.includes('late')) for (const id of buckets.late) merged.add(id)
      if (urgencyTokens.includes('soon')) for (const id of buckets.soon) merged.add(id)
      if (merged.size === 0) { res.json([]); return }
      whereParts.push(`cc.IDcommande_client IN (${Array.from(merged).join(',')})`)
    }
    if (!isSearching && beforeId !== null) whereParts.push(`cc.IDcommande_client < ${beforeId}`)

    const whereSql = `WHERE ${whereParts.join(' AND ')}`
    const commandes = await query<any>(
      `SELECT TOP ${limit} cc.IDcommande_client, cc.IDclient, cc.numero, cc.date_commande, cc.est_soldee
       FROM commande_client cc
       ${whereSql}
       ORDER BY cc.IDcommande_client DESC`,
    )

    const ids = commandes.map((c: any) => Number(c.IDcommande_client)).filter(Boolean)
    const clientIds = commandes.map((c: any) => Number(c.IDclient)).filter(Boolean)
    const [clientNames, phaseMap] = await Promise.all([
      resolveClientNames(clientIds),
      computePhasesBatch(commandes.map((c: any) => ({
        id: Number(c.IDcommande_client),
        est_soldee: Number(c.est_soldee) || 0,
      }))),
    ])

    // Line aggregates: nb_lignes, total_qte, total_eur (Σ qty×prix), earliest.
    const totalsMap = new Map<number, { total_eur: number; total_qte: number; nb_lignes: number; earliest_delivery: string | null }>()
    if (ids.length > 0) {
      const lignes = await query<any>(
        `SELECT IDcommande_client, quantite, prix, date_livraison
         FROM ligne_commande_client WHERE IDcommande_client IN (${ids.join(',')})`,
      )
      for (const l of lignes) {
        const id = Number(l.IDcommande_client)
        const acc = totalsMap.get(id) ?? { total_eur: 0, total_qte: 0, nb_lignes: 0, earliest_delivery: null }
        const qty = Number(l.quantite) || 0
        const price = Number(l.prix) || 0
        acc.total_qte += qty
        acc.total_eur += qty * price
        acc.nb_lignes += 1
        const dl = typeof l.date_livraison === 'string' ? l.date_livraison : ''
        if (/^\d{8}$/.test(dl) && (acc.earliest_delivery === null || dl < acc.earliest_delivery)) {
          acc.earliest_delivery = dl
        }
        totalsMap.set(id, acc)
      }
    }

    const result = commandes.map((c: any) => {
      const cid = Number(c.IDcommande_client)
      const totals = totalsMap.get(cid) ?? { total_eur: 0, total_qte: 0, nb_lignes: 0, earliest_delivery: null }
      return {
        IDcommande_client: cid,
        IDclient: Number(c.IDclient) || 0,
        numero: c.numero != null ? Number(c.numero) : null,
        date_commande: c.date_commande ?? null,
        est_soldee: Number(c.est_soldee) || 0,
        client_nom: clientNames.get(Number(c.IDclient)) ?? '',
        phase: phaseMap.get(cid) ?? 'a_affecter',
        ...totals,
      }
    })
    res.json(result)
  } catch (err) {
    console.error('Error fetching commandes-client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  LINE REF / COLORIS RESOLUTION (shared by detail + PDF)
// ════════════════════════════════════════════════════════

interface ResolvedMaps {
  ecru: Map<number, string>
  fini: Map<number, string>
  divers: Map<number, string>
  finiAvecTeinture: Map<number, number>
  colorisFini: Map<number, string>
  colorisEcru: Map<number, string>
}

/** Batch-resolve all ref + coloris labels for a set of lines. */
// Total "tombé de métier" (écru) ordered on a commande, aggregated by écru ref
// AND input coloris. Each line's écru weight: Kg lines (unite=1) count their
// quantite directly; Ml lines (unite=3) convert via rendement (kg = ml /
// rendement). Fini lines (type=2) trace to ref_fini.IDref_ecru +
// ref_fini.rendement; écru lines (type=1) use the ref directly +
// ref_ecru.rendement. Divers lines (type=3) are excluded.
// Input coloris per line: dyed finis (avec_teinture 1/2) consume the natural
// "ecru" base; wash-only finis (avec_teinture 0) and écru lines carry a
// colori_ecru id on the line itself — the écru consumed is knitted in that
// exact coloris (e.g. 040A/gris8985 ← écru 040/gris8985).
interface TombeMetierRow { IDref_ecru: number; ref_label: string; coloris_label: string; poids_kg: number }
async function computeTombeMetier(
  lignes: Array<{ type_kind: number; IDreference: number; IDcolori: number; quantite: number; unite: number }>,
): Promise<TombeMetierRow[]> {
  const finiIds = new Set<number>()
  const ecruLineIds = new Set<number>()
  for (const l of lignes) {
    const ref = Number(l.IDreference) || 0
    if (ref <= 0) continue
    if (Number(l.type_kind) === 2) finiIds.add(ref)
    else if (Number(l.type_kind) === 1) ecruLineIds.add(ref)
  }
  const finiMap = new Map<number, { ecru: number; rdt: number; avecTeinture: number }>()
  if (finiIds.size > 0) {
    const rows = await query<{ IDref_fini: number; IDref_ecru: number | null; rendement: number | null; avec_teinture: number | null }>(
      `SELECT IDref_fini, IDref_ecru, rendement, avec_teinture FROM ref_fini WHERE IDref_fini IN (${[...finiIds].join(',')})`,
    )
    for (const r of rows)
      finiMap.set(Number(r.IDref_fini), {
        ecru: Number(r.IDref_ecru) || 0,
        rdt: Number(r.rendement) || 0,
        avecTeinture: Number(r.avec_teinture) || 0,
      })
  }
  const ecruIds = new Set<number>(ecruLineIds)
  for (const v of finiMap.values()) if (v.ecru > 0) ecruIds.add(v.ecru)
  const ecruMap = new Map<number, { reference: string; rdt: number }>()
  if (ecruIds.size > 0) {
    const rows = await query<{ IDref_ecru: number; reference: string | null; rendement: number | null }>(
      `SELECT IDref_ecru, reference, rendement FROM ref_ecru WHERE IDref_ecru IN (${[...ecruIds].join(',')})`,
    )
    const fixed = await fixEncoding(rows, 'ref_ecru', 'IDref_ecru', ['reference'])
    for (const r of fixed) ecruMap.set(Number(r.IDref_ecru), { reference: (r.reference ?? '').toString(), rdt: Number(r.rendement) || 0 })
  }
  // Lines that carry a colori_ecru id (écru lines + wash-only fini lines) need
  // its label; dyed fini lines use the fixed "ecru" label.
  const coloriEcruIds = new Set<number>()
  for (const l of lignes) {
    const t = Number(l.type_kind) || 0
    const colId = Number(l.IDcolori) || 0
    if (colId <= 0) continue
    if (t === 1 || (t === 2 && finiMap.get(Number(l.IDreference) || 0)?.avecTeinture === 0)) coloriEcruIds.add(colId)
  }
  const coloriEcruLabels = coloriEcruIds.size > 0 ? await resolveEcruColoris([...coloriEcruIds]) : new Map<number, string>()

  const agg = new Map<string, { IDref_ecru: number; ref_label: string; coloris_label: string; kg: number }>()
  for (const l of lignes) {
    const t = Number(l.type_kind) || 0
    const ref = Number(l.IDreference) || 0
    const colId = Number(l.IDcolori) || 0
    const qte = Number(l.quantite) || 0
    const unite = Number(l.unite) || 0
    if (ref <= 0 || qte <= 0) continue
    let ecruRef = 0
    let rdt = 0
    let coloris = ''
    if (t === 2) {
      const f = finiMap.get(ref)
      if (!f) continue
      ecruRef = f.ecru
      rdt = f.rdt
      coloris = f.avecTeinture === 0 ? (coloriEcruLabels.get(colId) ?? '').trim() : 'ecru'
    } else if (t === 1) {
      ecruRef = ref
      rdt = ecruMap.get(ref)?.rdt ?? 0
      coloris = (coloriEcruLabels.get(colId) ?? '').trim()
    } else continue
    if (ecruRef <= 0) continue
    const kg = unite === 1 ? qte : (rdt > 0 ? qte / rdt : 0)
    if (kg <= 0) continue
    const key = `${ecruRef}|${coloris}`
    const a = agg.get(key) ?? { IDref_ecru: ecruRef, ref_label: ecruMap.get(ecruRef)?.reference ?? '', coloris_label: coloris, kg: 0 }
    a.kg += kg
    agg.set(key, a)
  }
  return [...agg.values()]
    .map((a): TombeMetierRow => ({ IDref_ecru: a.IDref_ecru, ref_label: a.ref_label, coloris_label: a.coloris_label, poids_kg: Math.round(a.kg * 100) / 100 }))
    .sort((x, y) => x.ref_label.localeCompare(y.ref_label) || x.coloris_label.localeCompare(y.coloris_label))
}

async function resolveLineLabels(
  lignes: Array<{ IDreference: number | null; IDcolori: number | null; type_kind: number }>,
): Promise<ResolvedMaps> {
  const refIds = Array.from(new Set(lignes.map((l) => Number(l.IDreference) || 0).filter((x) => x > 0)))
  const coloriIds = Array.from(new Set(lignes.map((l) => Number(l.IDcolori) || 0).filter((x) => x > 0)))
  const ecru = new Map<number, string>()
  const fini = new Map<number, string>()
  const divers = new Map<number, string>()
  const finiAvecTeinture = new Map<number, number>()
  const colorisFini = new Map<number, string>()
  const colorisEcru = new Map<number, string>()

  if (refIds.length > 0) {
    const [ecruRows, finiRows, diversRows] = await Promise.all([
      query<{ IDref_ecru: number; reference: string | null }>(
        `SELECT IDref_ecru, reference FROM ref_ecru WHERE IDref_ecru IN (${refIds.join(',')})`,
      ),
      query<{ IDref_fini: number; reference: string | null; avec_teinture: number | null }>(
        `SELECT IDref_fini, reference, avec_teinture FROM ref_fini WHERE IDref_fini IN (${refIds.join(',')})`,
      ),
      query<{ IDref_divers: number; designation: string | null }>(
        `SELECT IDref_divers, designation FROM ref_divers WHERE IDref_divers IN (${refIds.join(',')})`,
      ),
    ])
    for (const r of await fixEncoding(ecruRows, 'ref_ecru', 'IDref_ecru', ['reference']))
      ecru.set(Number(r.IDref_ecru), (r.reference ?? '').toString())
    for (const r of await fixEncoding(finiRows, 'ref_fini', 'IDref_fini', ['reference'])) {
      fini.set(Number(r.IDref_fini), (r.reference ?? '').toString())
      finiAvecTeinture.set(Number(r.IDref_fini), Number((r as any).avec_teinture) || 0)
    }
    for (const r of await fixEncoding(diversRows, 'ref_divers', 'IDref_divers', ['designation']))
      divers.set(Number(r.IDref_divers), (r.designation ?? '').toString())
  }
  if (coloriIds.length > 0) {
    const [finiC, ecruC] = await Promise.all([
      query<{ IDref_fini_colori: number; reference: string | null }>(
        `SELECT IDref_fini_colori, reference FROM ref_fini_colori WHERE IDref_fini_colori IN (${coloriIds.join(',')})`,
      ),
      query<{ IDcolori_ecru: number; reference: string | null }>(
        `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDcolori_ecru IN (${coloriIds.join(',')})`,
      ),
    ])
    for (const c of await fixEncoding(finiC, 'ref_fini_colori', 'IDref_fini_colori', ['reference']))
      colorisFini.set(Number(c.IDref_fini_colori), (c.reference ?? '').toString())
    for (const c of await fixEncoding(ecruC, 'colori_ecru', 'IDcolori_ecru', ['reference']))
      colorisEcru.set(Number(c.IDcolori_ecru), (c.reference ?? '').toString())
  }
  return { ecru, fini, divers, finiAvecTeinture, colorisFini, colorisEcru }
}

function resolveRefLabel(maps: ResolvedMaps, IDref: number, typeKind: number): { label: string; kind: 'ecru' | 'fini' | 'divers' | null } {
  if (IDref <= 0) return { label: '', kind: null }
  if (typeKind === 1) return maps.ecru.has(IDref) ? { label: maps.ecru.get(IDref)!, kind: 'ecru' } : { label: '', kind: 'ecru' }
  if (typeKind === 2) return maps.fini.has(IDref) ? { label: maps.fini.get(IDref)!, kind: 'fini' } : { label: '', kind: 'fini' }
  if (typeKind === 3) return maps.divers.has(IDref) ? { label: maps.divers.get(IDref)!, kind: 'divers' } : { label: '', kind: 'divers' }
  // Unknown type — best effort across catalogs.
  if (maps.fini.has(IDref)) return { label: maps.fini.get(IDref)!, kind: 'fini' }
  if (maps.ecru.has(IDref)) return { label: maps.ecru.get(IDref)!, kind: 'ecru' }
  if (maps.divers.has(IDref)) return { label: maps.divers.get(IDref)!, kind: 'divers' }
  return { label: '', kind: null }
}

function resolveColorisLabel(maps: ResolvedMaps, IDcolori: number, typeKind: number, IDref: number): string {
  if (IDcolori <= 0) return ''
  if (typeKind === 2) {
    const dyed = (maps.finiAvecTeinture.get(IDref) ?? 1) !== 0
    return dyed
      ? (maps.colorisFini.get(IDcolori) ?? maps.colorisEcru.get(IDcolori) ?? '')
      : (maps.colorisEcru.get(IDcolori) ?? maps.colorisFini.get(IDcolori) ?? '')
  }
  // écru (type 1) and fallback
  return maps.colorisEcru.get(IDcolori) ?? maps.colorisFini.get(IDcolori) ?? ''
}

/** Per-line reserved-roll aggregates keyed by IDligne_commande_client. */
async function lineReservationAggregates(lineIds: number[]): Promise<Map<number, { nb_rolls: number; total_metrage: number; total_poids: number }>> {
  const out = new Map<number, { nb_rolls: number; total_metrage: number; total_poids: number }>()
  const ids = lineIds.filter((x) => x > 0)
  if (ids.length === 0) return out
  const inList = ids.join(',')
  const [ecru, fini] = await Promise.all([
    query<{ IDligne_commande_client: number; metrage: number | null; poids: number | null }>(
      `SELECT IDligne_commande_client, metrage, poids FROM stock_ecru WHERE IDligne_commande_client IN (${inList})`,
    ),
    query<{ IDligne_commande_client: number; metrage: number | null; poids: number | null }>(
      `SELECT IDligne_commande_client, metrage, poids FROM stock_fini WHERE IDligne_commande_client IN (${inList})`,
    ),
  ])
  for (const r of [...ecru, ...fini]) {
    const lid = Number(r.IDligne_commande_client) || 0
    if (lid === 0) continue
    const acc = out.get(lid) ?? { nb_rolls: 0, total_metrage: 0, total_poids: 0 }
    acc.nb_rolls += 1
    acc.total_metrage += Number(r.metrage) || 0
    acc.total_poids += Number(r.poids) || 0
    out.set(lid, acc)
  }
  return out
}

// ════════════════════════════════════════════════════════
//  DETAIL
// ════════════════════════════════════════════════════════

commandesClientRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    // SELECT * is safe on commande_client (unlike client); accented keys
    // (archivé/expedié/envoyé_client) come back mangled and are simply ignored.
    const rows = await query<any>(`SELECT * FROM commande_client WHERE IDcommande_client = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Commande not found' }); return }
    const fixedHeader = await fixEncoding(rows, 'commande_client', 'IDcommande_client',
      ['ref_client', 'commentaire', 'commentaire_interne', 'observations_facturation'])
    const h = fixedHeader[0] as any
    // commentaire fields read as plain (legacy reads commande_client.commentaire
    // as plain text); stripRtf defensively in case a row still carries RTF.
    h.commentaire = stripRtf(h.commentaire) || null
    h.commentaire_interne = stripRtf(h.commentaire_interne) || null
    h.observations_facturation = stripRtf(h.observations_facturation) || null

    const IDclient = Number(h.IDclient) || 0
    const [clientNames, ficheRows, adrLivRows, adrFacRows, lignesRaw] = await Promise.all([
      resolveClientNames([IDclient]),
      // "Fiche client" = client.commentaire — customer-specific handling notes
      // the legacy app surfaces on every commande (procedures, contrôle rules…).
      IDclient > 0
        ? query<any>(`SELECT IDclient, commentaire FROM client WHERE IDclient = ${IDclient}`)
        : Promise.resolve([]),
      h.IDadresse_livraison
        ? query(`SELECT IDadresse, nom, adresse1, adresse2, adresse3, cp, ville, pays FROM adresse WHERE IDadresse = ${n(h.IDadresse_livraison)}`)
        : Promise.resolve([]),
      h.IDadresse_facturation
        ? query(`SELECT IDadresse, nom, adresse1, adresse2, adresse3, cp, ville, pays FROM adresse WHERE IDadresse = ${n(h.IDadresse_facturation)}`)
        : Promise.resolve([]),
      // TYPE is a reserved word → alias type_kind. IDcolori is lowercase. Never
      // name the accented delai_annoncé / déverrouiller columns.
      query<any>(
        `SELECT IDligne_commande_client, IDcommande_client, TYPE AS type_kind,
                IDreference, IDcolori, quantite, unite, prix, poids, date_livraison, commentaire
         FROM ligne_commande_client
         WHERE IDcommande_client = ${id}
         ORDER BY IDligne_commande_client`,
      ),
    ])

    const adrLiv = (await fixEncoding(adrLivRows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays']))[0] ?? null
    const adrFac = (await fixEncoding(adrFacRows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays']))[0] ?? null
    const ficheFixed = (await fixEncoding(ficheRows, 'client', 'IDclient', ['commentaire']))[0] as any
    const clientFiche = (stripRtf(ficheFixed?.commentaire) || '').trim() || null
    const lignesFixed = (await fixEncoding(lignesRaw, 'ligne_commande_client', 'IDligne_commande_client', ['commentaire'])) as any[]
    for (const l of lignesFixed) l.commentaire = stripRtf(l.commentaire) || null

    const lignesForResolve = lignesFixed.map((l) => ({
      IDreference: Number(l.IDreference) || 0,
      IDcolori: Number(l.IDcolori) || 0,
      type_kind: Number(l.type_kind) || 0,
    }))
    const maps = await resolveLineLabels(lignesForResolve)
    const lineIds = lignesFixed.map((l) => Number(l.IDligne_commande_client)).filter((x) => x > 0)
    const aggMap = await lineReservationAggregates(lineIds)

    const lignes = lignesFixed.map((l) => {
      const typeKind = Number(l.type_kind) || 0
      const refId = Number(l.IDreference) || 0
      const colId = Number(l.IDcolori) || 0
      const resolved = resolveRefLabel(maps, refId, typeKind)
      const agg = aggMap.get(Number(l.IDligne_commande_client)) ?? { nb_rolls: 0, total_metrage: 0, total_poids: 0 }
      const qty = Number(l.quantite) || 0
      const prix = Number(l.prix) || 0
      return {
        IDligne_commande_client: Number(l.IDligne_commande_client),
        IDcommande_client: Number(l.IDcommande_client),
        type: typeKind,
        IDreference: refId,
        IDcolori: colId,
        quantite: qty,
        unite: Number(l.unite) || 0,
        unite_label: uniteLabel(l.unite),
        prix,
        poids: Number(l.poids) || 0,
        date_livraison: l.date_livraison ?? null,
        commentaire: l.commentaire ?? null,
        ref_label: resolved.label || null,
        ref_kind: resolved.kind,
        colori_reference: resolveColorisLabel(maps, colId, typeKind, refId) || null,
        montant: qty * prix,
        // affectation aggregates + the gauge basis (poids for Kg, metrage for Ml)
        nb_rolls: agg.nb_rolls,
        total_metrage: agg.total_metrage,
        total_poids: agg.total_poids,
        affecte: lineDim(l.unite) === 'metrage' ? agg.total_metrage : agg.total_poids,
      }
    })

    const phase = (await computePhasesBatch([{ id, est_soldee: Number(h.est_soldee) || 0 }])).get(id) ?? 'a_affecter'
    const tombe_metier = await computeTombeMetier(lignesFixed.map((l) => ({
      type_kind: Number(l.type_kind) || 0,
      IDreference: Number(l.IDreference) || 0,
      IDcolori: Number(l.IDcolori) || 0,
      quantite: Number(l.quantite) || 0,
      unite: Number(l.unite) || 0,
    })))

    res.json({
      IDcommande_client: id,
      IDclient,
      client_nom: clientNames.get(IDclient) ?? '',
      client_fiche: clientFiche,
      numero: h.numero != null ? Number(h.numero) : null,
      date_commande: h.date_commande ?? null,
      ref_client: h.ref_client ?? null,
      IDadresse_livraison: Number(h.IDadresse_livraison) || 0,
      IDadresse_facturation: Number(h.IDadresse_facturation) || 0,
      IDmode_paiement: Number(h.IDmode_paiement) || 0,
      IDecheance: Number(h.IDecheance) || 0,
      commentaire: h.commentaire ?? null,
      commentaire_interne: h.commentaire_interne ?? null,
      observations_facturation: h.observations_facturation ?? null,
      est_soldee: Number(h.est_soldee) || 0,
      remise: Number(h.remise) || 0,
      frais_port: Number(h.frais_port) || 0,
      IDdossier: Number(h.IDdossier) || 0,
      adresse_livraison: adrLiv,
      adresse_facturation: adrFac,
      lignes,
      tombe_metier,
      phase,
    })
  } catch (err) {
    console.error('Error fetching commande-client detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  HEADER CRUD
// ════════════════════════════════════════════════════════

commandesClientRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = commandeBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const d = parsed.data
    if (!d.IDclient) { res.status(400).json({ error: 'IDclient is required' }); return }

    const dateCmd = d.date_commande ? dateStr(d.date_commande) : (() => {
      const t = new Date()
      return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`
    })()

    // numero allocator with collision retry. Accented columns omitted (HFSQL
    // zero-fills archivé/expedié/envoyé_client).
    let newNumero = 0
    let inserted = false
    let lastErr: unknown = null
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      newNumero = await nextNumero()
      try {
        await query(
          `INSERT INTO commande_client
             (IDclient, IDsociete, IDcommande_ETM, numero, date_commande,
              IDadresse_livraison, IDadresse_facturation, IDmode_paiement, IDecheance,
              ref_client, commentaire, est_soldee, remise, donation,
              attente_paiement, frais_port, IDdossier)
           VALUES
             (${n(d.IDclient)}, 1, 0, ${newNumero}, '${dateCmd}',
              ${n(d.IDadresse_livraison ?? 0)}, ${n(d.IDadresse_facturation ?? 0)},
              ${n(d.IDmode_paiement ?? 0)}, ${n(d.IDecheance ?? 0)},
              ${sqlText(d.ref_client ?? '')}, ${sqlText(d.commentaire ?? '')}, 0,
              ${Number(d.remise) || 0}, 0, 0, ${Number(d.frais_port) || 0}, 0)`,
        )
        inserted = true
      } catch (e) { lastErr = e }
    }
    if (!inserted) throw lastErr ?? new Error('insert failed after 3 attempts')

    const newRows = await query<{ IDcommande_client: number }>(
      `SELECT IDcommande_client FROM commande_client
       WHERE IDsociete = 1 AND numero = ${newNumero} ORDER BY IDcommande_client DESC`,
    )
    const newId = Number(newRows[0]?.IDcommande_client) || 0
    res.status(201).json({ IDcommande_client: newId })
  } catch (err) {
    console.error('Error creating commande-client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const parsed = commandeBody.partial().safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const d = parsed.data

    const sets: string[] = []
    if (d.IDclient !== undefined) sets.push(`IDclient = ${n(d.IDclient)}`)
    if (d.date_commande !== undefined) sets.push(`date_commande = '${dateStr(d.date_commande)}'`)
    if (d.ref_client !== undefined) sets.push(`ref_client = ${sqlText(d.ref_client)}`)
    if (d.IDadresse_livraison !== undefined) sets.push(`IDadresse_livraison = ${n(d.IDadresse_livraison)}`)
    if (d.IDadresse_facturation !== undefined) sets.push(`IDadresse_facturation = ${n(d.IDadresse_facturation)}`)
    if (d.IDmode_paiement !== undefined) sets.push(`IDmode_paiement = ${n(d.IDmode_paiement)}`)
    if (d.IDecheance !== undefined) sets.push(`IDecheance = ${n(d.IDecheance)}`)
    if (d.commentaire !== undefined) sets.push(`commentaire = ${sqlText(d.commentaire)}`)
    if (d.commentaire_interne !== undefined) sets.push(`commentaire_interne = ${sqlText(d.commentaire_interne)}`)
    if (d.remise !== undefined) sets.push(`remise = ${Number(d.remise) || 0}`)
    if (d.frais_port !== undefined) sets.push(`frais_port = ${Number(d.frais_port) || 0}`)
    if (d.est_soldee !== undefined) sets.push(`est_soldee = ${d.est_soldee}`)
    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    await query(`UPDATE commande_client SET ${sets.join(', ')} WHERE IDcommande_client = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating commande-client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Binary est_soldee toggle (sidebar footer pill).
commandesClientRouter.put('/:id/etat', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const est = Number(req.body?.est_soldee) === 1 ? 1 : 0
    await query(`UPDATE commande_client SET est_soldee = ${est} WHERE IDcommande_client = ${id}`)
    res.json({ ok: true, est_soldee: est })
  } catch (err) {
    console.error('Error toggling commande-client etat:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    // Release every reserved roll, then delete the lines, then the header.
    const lineRows = await query<{ IDligne_commande_client: number }>(
      `SELECT IDligne_commande_client FROM ligne_commande_client WHERE IDcommande_client = ${id}`,
    )
    const lineIds = lineRows.map((r) => Number(r.IDligne_commande_client)).filter((x) => x > 0)
    if (lineIds.length > 0) {
      const inList = lineIds.join(',')
      await query(`UPDATE stock_ecru SET IDligne_commande_client = 0 WHERE IDligne_commande_client IN (${inList})`)
      await query(`UPDATE stock_fini SET IDligne_commande_client = 0 WHERE IDligne_commande_client IN (${inList})`)
    }
    await query(`DELETE FROM ligne_commande_client WHERE IDcommande_client = ${id}`)
    await query(`DELETE FROM commande_client WHERE IDcommande_client = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting commande-client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  LINE CRUD
// ════════════════════════════════════════════════════════

commandesClientRouter.post('/:id/lignes', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    if (refuseIfSoldee(res, await loadCommandeSoldee(id))) return
    const parsed = ligneBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const d = parsed.data
    const typeKind = Number(d.type) || 0
    // TYPE written uppercase (reserved word); IDcolori lowercase; commentaire
    // accent-safe via sqlText. Accented line columns are never named.
    await query(
      `INSERT INTO ligne_commande_client
         (IDcommande_client, IDligne_commande_ETM, TYPE, IDreference, IDcolori,
          quantite, unite, prix, poids, date_livraison, commentaire)
       VALUES
         (${id}, 0, ${typeKind}, ${n(d.IDreference ?? 0)}, ${n(d.IDcolori ?? 0)},
          ${Number(d.quantite) || 0}, ${n(d.unite ?? 0)}, ${Number(d.prix) || 0},
          ${Number(d.poids) || 0}, '${d.date_livraison ? dateStr(d.date_livraison) : ''}',
          ${sqlText(d.commentaire ?? '')})`,
    )
    const newRows = await query<{ IDligne_commande_client: number }>(
      `SELECT IDligne_commande_client FROM ligne_commande_client
       WHERE IDcommande_client = ${id} ORDER BY IDligne_commande_client DESC`,
    )
    res.status(201).json({ IDligne_commande_client: Number(newRows[0]?.IDligne_commande_client) || 0 })
  } catch (err) {
    console.error('Error creating ligne-commande-client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.put('/lignes/:lineId', async (req: Request, res: Response) => {
  try {
    const lineId = parseInt(req.params.lineId, 10)
    if (isNaN(lineId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const commandeId = await loadCommandeIdForLine(lineId)
    if (commandeId == null) { res.status(404).json({ error: 'Line not found' }); return }
    if (refuseIfSoldee(res, await loadCommandeSoldee(commandeId))) return
    const parsed = ligneBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const d = parsed.data

    const sets: string[] = []
    if (d.type !== undefined) sets.push(`TYPE = ${Number(d.type) || 0}`)
    if (d.IDreference !== undefined) sets.push(`IDreference = ${n(d.IDreference)}`)
    if (d.IDcolori !== undefined) sets.push(`IDcolori = ${n(d.IDcolori)}`)
    if (d.quantite !== undefined) sets.push(`quantite = ${Number(d.quantite) || 0}`)
    if (d.unite !== undefined) sets.push(`unite = ${n(d.unite)}`)
    if (d.prix !== undefined) sets.push(`prix = ${Number(d.prix) || 0}`)
    if (d.poids !== undefined) sets.push(`poids = ${Number(d.poids) || 0}`)
    if (d.date_livraison !== undefined) sets.push(`date_livraison = '${dateStr(d.date_livraison)}'`)
    if (d.commentaire !== undefined) sets.push(`commentaire = ${sqlText(d.commentaire)}`)
    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    await query(`UPDATE ligne_commande_client SET ${sets.join(', ')} WHERE IDligne_commande_client = ${lineId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating ligne-commande-client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.delete('/lignes/:lineId', async (req: Request, res: Response) => {
  try {
    const lineId = parseInt(req.params.lineId, 10)
    if (isNaN(lineId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const commandeId = await loadCommandeIdForLine(lineId)
    if (commandeId == null) { res.status(404).json({ error: 'Line not found' }); return }
    if (refuseIfSoldee(res, await loadCommandeSoldee(commandeId))) return
    // Release this line's reserved rolls first.
    await query(`UPDATE stock_ecru SET IDligne_commande_client = 0 WHERE IDligne_commande_client = ${lineId}`)
    await query(`UPDATE stock_fini SET IDligne_commande_client = 0 WHERE IDligne_commande_client = ${lineId}`)
    await query(`DELETE FROM ligne_commande_client WHERE IDligne_commande_client = ${lineId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting ligne-commande-client:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  AFFECTATION  (reserve écru / fini rolls to a line)
// ════════════════════════════════════════════════════════

interface ClientLineContext {
  commandeId: number
  ligneId: number
  typeKind: number
  kind: 'ecru' | 'fini' | 'none'
  refId: number
  coloriId: number
  unite: number
  quantite: number
}

async function loadClientLineContext(commandeId: number, ligneId: number): Promise<ClientLineContext | null> {
  // IDcolori is lowercase on ligne_commande_client (not IDColoris); TYPE is reserved.
  const rows = await query<any>(
    `SELECT IDcommande_client, TYPE AS type_kind, IDreference, IDcolori, unite, quantite
     FROM ligne_commande_client WHERE IDligne_commande_client = ${ligneId}`,
  )
  if (rows.length === 0) return null
  const l = rows[0]
  if (Number(l.IDcommande_client) !== commandeId) return null
  const typeKind = Number(l.type_kind) || 0
  return {
    commandeId,
    ligneId,
    typeKind,
    kind: lineStockKind(typeKind),
    refId: Number(l.IDreference) || 0,
    coloriId: Number(l.IDcolori) || 0,
    unite: Number(l.unite) || 0,
    quantite: Number(l.quantite) || 0,
  }
}

interface RollLite {
  id: number
  numero: string | null
  lot: string | null
  poids: number | null
  metrage: number | null
  coloris_reference: string | null
  magasin_nom: string | null
  second_choix: number | null
  observations: string | null
  etat_label: string | null
}

const ETAT_FINI_LABELS: Record<number, string> = {
  1: 'En Contrôle', 2: 'En Reprise', 3: 'Validé', 4: 'Expédié', 5: 'Attente décision',
}

/** Resolve magasin (sous_traitant) names for a set of IDmagasin. */
async function resolveMagasinNames(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const u = Array.from(new Set(ids.filter((x) => x > 0)))
  if (u.length === 0) return out
  const rows = await query<{ IDsous_traitant: number; nom: unknown }>(
    `SELECT IDsous_traitant, CONVERT(nom USING 'UTF-8') AS nom FROM sous_traitant WHERE IDsous_traitant IN (${u.join(',')})`,
  )
  for (const r of rows) out.set(Number(r.IDsous_traitant), decode(r.nom) ?? '')
  return out
}

/** Resolve company names (IDsociete → societe.nom): 1=Ets Malterre, 2=Tricotage
 *  Malterre, 3=Malterre Confection. Used to label factory ("à l'usine") écru by
 *  its owning company. Names are ASCII so no CONVERT/fixEncoding needed. */
async function resolveSocieteNames(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const u = Array.from(new Set(ids.filter((x) => x > 0)))
  if (u.length === 0) return out
  const rows = await query<{ IDsociete: number; nom: string | null }>(
    `SELECT IDsociete, nom FROM societe WHERE IDsociete IN (${u.join(',')})`,
  )
  for (const r of rows) out.set(Number(r.IDsociete), (r.nom ?? '').toString())
  return out
}

/** Resolve coloris labels for écru rolls (IDcolori_ecru → colori_ecru). */
async function resolveEcruColoris(coloriIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const u = Array.from(new Set(coloriIds.filter((x) => x > 0)))
  if (u.length === 0) return out
  const rows = await query<{ IDcolori_ecru: number; reference: string | null }>(
    `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDcolori_ecru IN (${u.join(',')})`,
  )
  for (const r of await fixEncoding(rows, 'colori_ecru', 'IDcolori_ecru', ['reference']))
    out.set(Number(r.IDcolori_ecru), (r.reference ?? '').toString())
  return out
}

/** Resolve coloris labels for fini rolls — branch by the line ref's avec_teinture. */
async function resolveFiniColoris(coloriIds: number[], avecTeinture: number): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const u = Array.from(new Set(coloriIds.filter((x) => x > 0)))
  if (u.length === 0) return out
  if (avecTeinture === 0) {
    const rows = await query<{ IDcolori_ecru: number; reference: string | null }>(
      `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDcolori_ecru IN (${u.join(',')})`,
    )
    for (const r of await fixEncoding(rows, 'colori_ecru', 'IDcolori_ecru', ['reference']))
      out.set(Number(r.IDcolori_ecru), (r.reference ?? '').toString())
  } else {
    const rows = await query<{ IDref_fini_colori: number; reference: string | null }>(
      `SELECT IDref_fini_colori, reference FROM ref_fini_colori WHERE IDref_fini_colori IN (${u.join(',')})`,
    )
    for (const r of await fixEncoding(rows, 'ref_fini_colori', 'IDref_fini_colori', ['reference']))
      out.set(Number(r.IDref_fini_colori), (r.reference ?? '').toString())
  }
  return out
}

async function fetchAffectationPayload(ctx: ClientLineContext) {
  const base = {
    kind: ctx.kind,
    unite: ctx.unite,
    unite_label: uniteLabel(ctx.unite),
    dim: lineDim(ctx.unite) as 'metrage' | 'poids',
    target_qty: ctx.quantite,
    linked: [] as RollLite[],
    available: [] as RollLite[],
  }
  if (ctx.kind === 'none' || ctx.refId <= 0) return base

  if (ctx.kind === 'ecru') {
    // Linked = rolls reserved to this line. Available = ETM rolls of this ref,
    // not reserved/shipped/at-a-dyer, and not already consumed into a fini roll.
    const [linkedRaw, availRaw] = await Promise.all([
      query<any>(
        `SELECT IDstock_ecru, numero, lot, poids, metrage, IDcolori_ecru, IDmagasin, second_choix, observations
         FROM stock_ecru WHERE IDligne_commande_client = ${ctx.ligneId}
         ORDER BY date_saisie DESC, IDstock_ecru DESC`,
      ),
      query<any>(
        `SELECT IDstock_ecru, numero, lot, poids, metrage, IDcolori_ecru, IDmagasin, second_choix, observations
         FROM stock_ecru
         WHERE IDref_ecru = ${ctx.refId} AND IDsociete = 1
           AND (${ctx.coloriId} = 0 OR IDcolori_ecru = ${ctx.coloriId})
           AND (IDligne_commande_client IS NULL OR IDligne_commande_client = 0)
           AND (IDcommande_donation IS NULL OR IDcommande_donation = 0)
           AND (IDligne_expedition_ETM IS NULL OR IDligne_expedition_ETM = 0)
           AND (IDref_commande_affectation IS NULL OR IDref_commande_affectation = 0)
         ORDER BY date_saisie DESC, IDstock_ecru DESC`,
      ),
    ])
    // Drop available écru rolls already consumed into a stock_fini (dyed).
    const availIds = availRaw.map((r: any) => Number(r.IDstock_ecru)).filter((x: number) => x > 0)
    const consumed = new Set<number>()
    if (availIds.length > 0) {
      const dyed = await query<{ IDstock_ecru: number }>(
        `SELECT DISTINCT IDstock_ecru FROM stock_fini WHERE IDstock_ecru IN (${availIds.join(',')})`,
      )
      for (const r of dyed) consumed.add(Number(r.IDstock_ecru))
    }
    const avail = availRaw.filter((r: any) => !consumed.has(Number(r.IDstock_ecru)))
    const linkedFixed = await fixEncoding(linkedRaw, 'stock_ecru', 'IDstock_ecru', ['numero', 'lot', 'observations'])
    const availFixed = await fixEncoding(avail, 'stock_ecru', 'IDstock_ecru', ['numero', 'lot', 'observations'])
    const magNames = await resolveMagasinNames([...linkedFixed, ...availFixed].map((r: any) => Number(r.IDmagasin)))
    const colNames = await resolveEcruColoris([...linkedFixed, ...availFixed].map((r: any) => Number(r.IDcolori_ecru)))
    const toRoll = (r: any): RollLite => ({
      id: Number(r.IDstock_ecru),
      numero: r.numero ?? null,
      lot: r.lot ?? null,
      poids: Number(r.poids) || 0,
      metrage: Number(r.metrage) || 0,
      coloris_reference: colNames.get(Number(r.IDcolori_ecru)) ?? null,
      magasin_nom: magNames.get(Number(r.IDmagasin)) ?? null,
      second_choix: Number(r.second_choix) || 0,
      observations: r.observations ?? null,
      etat_label: null,
    })
    base.linked = linkedFixed.map(toRoll)
    base.available = availFixed.map(toRoll)
    return base
  }

  // fini
  const refRows = await query<{ avec_teinture: number | null }>(
    `SELECT avec_teinture FROM ref_fini WHERE IDref_fini = ${ctx.refId}`,
  )
  const avecTeinture = Number(refRows[0]?.avec_teinture) || 0
  const [linkedRaw, availRaw] = await Promise.all([
    query<any>(
      `SELECT IDstock_fini, numero, lot, poids, metrage, IDColoris, IDmagasin, second_choix, observations, IDetat_stock_fini
       FROM stock_fini WHERE IDligne_commande_client = ${ctx.ligneId}
       ORDER BY date_saisie DESC, IDstock_fini DESC`,
    ),
    query<any>(
      `SELECT IDstock_fini, numero, lot, poids, metrage, IDColoris, IDmagasin, second_choix, observations, IDetat_stock_fini
       FROM stock_fini
       WHERE IDref_fini = ${ctx.refId}
         AND (${ctx.coloriId} = 0 OR IDColoris = ${ctx.coloriId})
         AND (IDligne_commande_client IS NULL OR IDligne_commande_client = 0)
         AND (IDcommande_donation IS NULL OR IDcommande_donation = 0)
         AND (IDligne_expedition IS NULL OR IDligne_expedition = 0)
         AND (IDetat_stock_fini IS NULL OR IDetat_stock_fini <> 4)
       ORDER BY date_saisie DESC, IDstock_fini DESC`,
    ),
  ])
  const linkedFixed = await fixEncoding(linkedRaw, 'stock_fini', 'IDstock_fini', ['numero', 'lot', 'observations'])
  const availFixed = await fixEncoding(availRaw, 'stock_fini', 'IDstock_fini', ['numero', 'lot', 'observations'])
  const magNames = await resolveMagasinNames([...linkedFixed, ...availFixed].map((r: any) => Number(r.IDmagasin)))
  const colNames = await resolveFiniColoris([...linkedFixed, ...availFixed].map((r: any) => Number(r.IDColoris)), avecTeinture)
  const toRoll = (r: any): RollLite => ({
    id: Number(r.IDstock_fini),
    numero: r.numero ?? null,
    lot: r.lot ?? null,
    poids: Number(r.poids) || 0,
    metrage: Number(r.metrage) || 0,
    coloris_reference: colNames.get(Number(r.IDColoris)) ?? null,
    magasin_nom: magNames.get(Number(r.IDmagasin)) ?? null,
    second_choix: Number(r.second_choix) || 0,
    observations: r.observations ?? null,
    etat_label: ETAT_FINI_LABELS[Number(r.IDetat_stock_fini)] ?? null,
  })
  base.linked = linkedFixed.map(toRoll)
  base.available = availFixed.map(toRoll)
  return base
}

// ════════════════════════════════════════════════════════
//  SUPPLY — in-progress sous-traitant orders feeding a client line
//  (Tricotage = knitting the écru, Ennoblissement = dyeing it to the fini).
//  Read-only planning view. Mirrors the legacy "Gestion ligne de commande"
//  Ennoblissement / Tricotage tabs. Validated against live data (écru 029):
//   - Ennoblissement disponible/affecté = input écru (stock_ecru via
//     IDref_commande_affectation) split by client-affectation × fini rendement.
//   - Tricotage affecté = output écru (IDref_commande_source) committed to a
//     client line; disponible = line quantite − affecté; métrage = dispo × rdt.
// ════════════════════════════════════════════════════════

interface SupplyTricoRow {
  id: number
  commande_id: number
  date_commande: string | null
  sous_traitant_nom: string | null
  date_livraison: string | null
  etat_label: string
  poids_disponible: number
  poids_affecte: number
  metrage_potentiel: number
}
interface SupplyEnnoRow {
  id: number
  commande_id: number
  date_commande: string | null
  sous_traitant_nom: string | null
  date_livraison: string | null
  etat_label: string
  qte_disponible: number
  qte_affecte: number
}
interface SupplyPayload {
  applicable: boolean
  tricotage: SupplyTricoRow[]
  ennoblissement: SupplyEnnoRow[]
}

// Open (in-progress) line statuses — sent to the sous-traitant and awaiting /
// in production. Excludes Non_Envoye (draft) and Terminé (done). ASCII literals
// only, so no accented-identifier hazard on the Linux bridge.
const SUPPLY_OPEN_STATUTS = "'En_Cours','Attente_Delai'"
const SSTATUT_LABELS: Record<string, string> = {
  En_Cours: 'En cours', Attente_Delai: 'Attente délai', Non_Envoye: 'Non envoyé',
}
const round2c = (v: number) => Math.round(v * 100) / 100

async function buildTricotage(ecruRefId: number, rendement: number): Promise<SupplyTricoRow[]> {
  const lines = await query<any>(
    `SELECT lcs.IDligne_commande_sous_traitant AS lid, lcs.quantite AS q, lcs.date_livraison AS dl,
            lcs.sstatut AS st, cst.IDsous_traitant AS sstid,
            cst.IDcommande_sous_traitant AS cid, cst.date_commande AS dc
       FROM ligne_commande_sous_traitant lcs
       JOIN commande_sous_traitant cst ON cst.IDcommande_sous_traitant = lcs.IDcommande_sous_traitant
      WHERE lcs.type = 1 AND lcs.IDreference = ${ecruRefId}
        AND cst.est_soldee = 0 AND lcs.sstatut IN (${SUPPLY_OPEN_STATUTS})`,
  )
  if (lines.length === 0) return []
  const lineIds = lines.map((l: any) => Number(l.lid)).filter((x: number) => x > 0)
  // Output écru committed to a client line = "affecté".
  const affByLine = new Map<number, number>()
  if (lineIds.length > 0) {
    const rows = await query<any>(
      `SELECT IDref_commande_source AS lid, poids FROM stock_ecru
        WHERE IDref_commande_source IN (${lineIds.join(',')}) AND IDligne_commande_client > 0`,
    )
    for (const r of rows) affByLine.set(Number(r.lid), (affByLine.get(Number(r.lid)) ?? 0) + (Number(r.poids) || 0))
  }
  const sstNames = await resolveMagasinNames(lines.map((l: any) => Number(l.sstid)))
  return lines.map((l: any) => {
    const aff = affByLine.get(Number(l.lid)) ?? 0
    const dispo = Math.max(0, (Number(l.q) || 0) - aff)
    return {
      id: Number(l.lid),
      commande_id: Number(l.cid),
      date_commande: l.dc ?? null,
      sous_traitant_nom: sstNames.get(Number(l.sstid)) ?? null,
      date_livraison: l.dl ?? null,
      etat_label: SSTATUT_LABELS[String(l.st)] ?? String(l.st ?? ''),
      poids_disponible: round2c(dispo),
      poids_affecte: round2c(aff),
      metrage_potentiel: round2c(dispo * rendement),
    }
  })
}

async function buildEnnoblissement(finiRefId: number, rendement: number, coloriId: number): Promise<SupplyEnnoRow[]> {
  // Match the client line's coloris too: an ennoblisseur line is keyed on
  // (fini ref, ref_fini_colori) via lcs.IDColoris. Without this filter a dye
  // order for a different coloris of the same ref_fini (e.g. 029A Blanc) leaks
  // into the supply view of an 029A Marine client line. coloriId=0 → no filter.
  const lines = await query<any>(
    `SELECT lcs.IDligne_commande_sous_traitant AS lid, lcs.date_livraison AS dl,
            lcs.sstatut AS st, cst.IDsous_traitant AS sstid,
            cst.IDcommande_sous_traitant AS cid, cst.date_commande AS dc
       FROM ligne_commande_sous_traitant lcs
       JOIN commande_sous_traitant cst ON cst.IDcommande_sous_traitant = lcs.IDcommande_sous_traitant
      WHERE lcs.type = 2 AND lcs.IDreference = ${finiRefId}
        AND (${coloriId} = 0 OR lcs.IDColoris = ${coloriId})
        AND cst.est_soldee = 0 AND lcs.sstatut IN (${SUPPLY_OPEN_STATUTS})`,
  )
  if (lines.length === 0) return []
  const lineIds = lines.map((l: any) => Number(l.lid)).filter((x: number) => x > 0)
  // Input écru affected to each ennoblisseur line, split by client-affectation.
  // A roll reserved to a donation commande (IDcommande_donation > 0) is spoken
  // for exactly like a client-line reservation — count it as affecté, never
  // disponible.
  const affKg = new Map<number, number>()
  const dispoKg = new Map<number, number>()
  if (lineIds.length > 0) {
    const rows = await query<any>(
      `SELECT IDref_commande_affectation AS lid, IDligne_commande_client AS lcc, IDcommande_donation AS don, poids
         FROM stock_ecru WHERE IDref_commande_affectation IN (${lineIds.join(',')})`,
    )
    for (const r of rows) {
      const lid = Number(r.lid)
      const p = Number(r.poids) || 0
      if (Number(r.lcc) > 0 || Number(r.don) > 0) affKg.set(lid, (affKg.get(lid) ?? 0) + p)
      else dispoKg.set(lid, (dispoKg.get(lid) ?? 0) + p)
    }
  }
  const sstNames = await resolveMagasinNames(lines.map((l: any) => Number(l.sstid)))
  return lines.map((l: any) => {
    const lid = Number(l.lid)
    return {
      id: lid,
      commande_id: Number(l.cid),
      date_commande: l.dc ?? null,
      sous_traitant_nom: sstNames.get(Number(l.sstid)) ?? null,
      date_livraison: l.dl ?? null,
      etat_label: SSTATUT_LABELS[String(l.st)] ?? String(l.st ?? ''),
      qte_disponible: round2c((dispoKg.get(lid) ?? 0) * rendement),
      qte_affecte: round2c((affKg.get(lid) ?? 0) * rendement),
    }
  })
}

async function fetchSupplyPayload(ctx: ClientLineContext): Promise<SupplyPayload> {
  const base: SupplyPayload = { applicable: false, tricotage: [], ennoblissement: [] }
  if (ctx.kind === 'none' || ctx.refId <= 0) return base

  let ecruRefId = 0
  let finiRefId = 0
  let rendement = 0
  if (ctx.kind === 'fini') {
    finiRefId = ctx.refId
    const r = await query<{ IDref_ecru: number | null; rendement: number | null }>(
      `SELECT IDref_ecru, rendement FROM ref_fini WHERE IDref_fini = ${finiRefId}`,
    )
    ecruRefId = Number(r[0]?.IDref_ecru) || 0
    rendement = Number(r[0]?.rendement) || 0
  } else {
    ecruRefId = ctx.refId
    const r = await query<{ rendement: number | null }>(
      `SELECT rendement FROM ref_ecru WHERE IDref_ecru = ${ecruRefId}`,
    )
    rendement = Number(r[0]?.rendement) || 0
  }
  // Use the raw rendement (NOT rounded) — the écru→fini métrage must match the
  // legacy exactly (e.g. 240.60 kg × 3.548387 = 853.74 ml, validated).

  const tricotage = ecruRefId > 0 ? await buildTricotage(ecruRefId, rendement) : []
  const ennoblissement = finiRefId > 0 ? await buildEnnoblissement(finiRefId, rendement, ctx.coloriId) : []
  return { applicable: true, tricotage, ennoblissement }
}

commandesClientRouter.get('/:id/lignes/:ligneId/supply', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    if (isNaN(commandeId) || isNaN(ligneId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }
    res.json(await fetchSupplyPayload(ctx))
  } catch (err) {
    console.error('Error fetching line supply:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.get('/:id/lignes/:ligneId/pieces', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    if (isNaN(commandeId) || isNaN(ligneId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }
    res.json(await fetchAffectationPayload(ctx))
  } catch (err) {
    console.error('Error fetching line affectation:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Reserve / release an écru roll.
commandesClientRouter.put('/:id/lignes/:ligneId/pieces/ecru/:stockId', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    const stockId = parseInt(req.params.stockId, 10)
    if (isNaN(commandeId) || isNaN(ligneId) || isNaN(stockId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx || ctx.kind !== 'ecru') { res.status(404).json({ error: 'Écru line not found' }); return }
    if (refuseIfSoldee(res, await loadCommandeSoldee(commandeId))) return
    const rollRows = await query<{ IDref_ecru: number; IDcolori_ecru: number | null; IDligne_commande_client: number | null }>(
      `SELECT IDref_ecru, IDcolori_ecru, IDligne_commande_client FROM stock_ecru WHERE IDstock_ecru = ${stockId}`,
    )
    if (rollRows.length === 0) { res.status(404).json({ error: 'Stock ecru not found' }); return }
    if (Number(rollRows[0].IDref_ecru) !== ctx.refId) { res.status(400).json({ error: 'Roll ref does not match the line' }); return }
    if (ctx.coloriId > 0 && Number(rollRows[0].IDcolori_ecru) !== ctx.coloriId) { res.status(400).json({ error: 'Roll coloris does not match the line' }); return }
    const current = Number(rollRows[0].IDligne_commande_client) || 0
    if (current !== 0 && current !== ligneId) { res.status(409).json({ error: 'Roll already reserved to another line' }); return }
    await query(`UPDATE stock_ecru SET IDligne_commande_client = ${ligneId} WHERE IDstock_ecru = ${stockId}`)
    res.json(await fetchAffectationPayload(ctx))
  } catch (err) {
    console.error('Error linking ecru to client line:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.delete('/:id/lignes/:ligneId/pieces/ecru/:stockId', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    const stockId = parseInt(req.params.stockId, 10)
    if (isNaN(commandeId) || isNaN(ligneId) || isNaN(stockId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx || ctx.kind !== 'ecru') { res.status(404).json({ error: 'Écru line not found' }); return }
    if (refuseIfSoldee(res, await loadCommandeSoldee(commandeId))) return
    await query(`UPDATE stock_ecru SET IDligne_commande_client = 0 WHERE IDstock_ecru = ${stockId} AND IDligne_commande_client = ${ligneId}`)
    res.json(await fetchAffectationPayload(ctx))
  } catch (err) {
    console.error('Error unlinking ecru from client line:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Reserve / release a fini roll.
commandesClientRouter.put('/:id/lignes/:ligneId/pieces/fini/:stockId', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    const stockId = parseInt(req.params.stockId, 10)
    if (isNaN(commandeId) || isNaN(ligneId) || isNaN(stockId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx || ctx.kind !== 'fini') { res.status(404).json({ error: 'Fini line not found' }); return }
    if (refuseIfSoldee(res, await loadCommandeSoldee(commandeId))) return
    const rollRows = await query<{ IDref_fini: number; IDColoris: number | null; IDligne_commande_client: number | null; IDetat_stock_fini: number | null }>(
      `SELECT IDref_fini, IDColoris, IDligne_commande_client, IDetat_stock_fini FROM stock_fini WHERE IDstock_fini = ${stockId}`,
    )
    if (rollRows.length === 0) { res.status(404).json({ error: 'Stock fini not found' }); return }
    if (Number(rollRows[0].IDref_fini) !== ctx.refId) { res.status(400).json({ error: 'Roll ref does not match the line' }); return }
    if (ctx.coloriId > 0 && Number(rollRows[0].IDColoris) !== ctx.coloriId) { res.status(400).json({ error: 'Roll coloris does not match the line' }); return }
    const current = Number(rollRows[0].IDligne_commande_client) || 0
    if (current !== 0 && current !== ligneId) { res.status(409).json({ error: 'Roll already reserved to another line' }); return }
    await query(`UPDATE stock_fini SET IDligne_commande_client = ${ligneId} WHERE IDstock_fini = ${stockId}`)
    res.json(await fetchAffectationPayload(ctx))
  } catch (err) {
    console.error('Error linking fini to client line:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.delete('/:id/lignes/:ligneId/pieces/fini/:stockId', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    const stockId = parseInt(req.params.stockId, 10)
    if (isNaN(commandeId) || isNaN(ligneId) || isNaN(stockId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx || ctx.kind !== 'fini') { res.status(404).json({ error: 'Fini line not found' }); return }
    if (refuseIfSoldee(res, await loadCommandeSoldee(commandeId))) return
    await query(`UPDATE stock_fini SET IDligne_commande_client = 0 WHERE IDstock_fini = ${stockId} AND IDligne_commande_client = ${ligneId}`)
    res.json(await fetchAffectationPayload(ctx))
  } catch (err) {
    console.error('Error unlinking fini from client line:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  ENNOBLISSEMENT roll affectation — reserve a dyer's INPUT écru
//  rolls (stock_ecru via IDref_commande_affectation = the ennoblisseur
//  sst line) to THIS client fini line (stock_ecru.IDligne_commande_client).
//  Mirrors the legacy double-click "transfer" modal on the Ennoblissement
//  tab. Same column buildEnnoblissement reads, so the supply table stays
//  consistent. Roll quantity is reported in the client line's unite
//  (ml = poids × fini rendement when unite=Ml, else raw poids in kg).
// ════════════════════════════════════════════════════════

/** Resolve the fini rendement + ennoblisseur (sous_traitant) name for an sst line. */
async function loadEnnoLineMeta(sstLineId: number, finiRefId: number): Promise<{ rendement: number; sstNom: string | null }> {
  const rRows = await query<{ rendement: number | null }>(
    `SELECT rendement FROM ref_fini WHERE IDref_fini = ${finiRefId}`,
  )
  const rendement = Number(rRows[0]?.rendement) || 0
  const stRows = await query<{ IDsous_traitant: number | null }>(
    `SELECT cst.IDsous_traitant
       FROM ligne_commande_sous_traitant lcs
       JOIN commande_sous_traitant cst ON cst.IDcommande_sous_traitant = lcs.IDcommande_sous_traitant
      WHERE lcs.IDligne_commande_sous_traitant = ${sstLineId}`,
  )
  const sstId = Number(stRows[0]?.IDsous_traitant) || 0
  const sstNom = sstId > 0 ? (await resolveMagasinNames([sstId])).get(sstId) ?? null : null
  return { rendement, sstNom }
}

async function fetchEnnoRollsPayload(ctx: ClientLineContext, sstLineId: number) {
  const { rendement, sstNom } = await loadEnnoLineMeta(sstLineId, ctx.refId)
  const dim = lineDim(ctx.unite)
  const cols = 'IDstock_ecru, numero, lot, poids, metrage, IDcolori_ecru, IDmagasin, second_choix, observations'
  const [linkedRaw, availRaw] = await Promise.all([
    query<any>(
      `SELECT ${cols} FROM stock_ecru
        WHERE IDref_commande_affectation = ${sstLineId} AND IDligne_commande_client = ${ctx.ligneId}
        ORDER BY date_saisie DESC, IDstock_ecru DESC`,
    ),
    query<any>(
      `SELECT ${cols} FROM stock_ecru
        WHERE IDref_commande_affectation = ${sstLineId}
          AND (IDligne_commande_client IS NULL OR IDligne_commande_client = 0)
        ORDER BY date_saisie DESC, IDstock_ecru DESC`,
    ),
  ])
  const linkedFixed = await fixEncoding(linkedRaw, 'stock_ecru', 'IDstock_ecru', ['numero', 'lot', 'observations'])
  const availFixed = await fixEncoding(availRaw, 'stock_ecru', 'IDstock_ecru', ['numero', 'lot', 'observations'])
  const magNames = await resolveMagasinNames([...linkedFixed, ...availFixed].map((r: any) => Number(r.IDmagasin)))
  const colNames = await resolveEcruColoris([...linkedFixed, ...availFixed].map((r: any) => Number(r.IDcolori_ecru)))
  const toRoll = (r: any): RollLite => ({
    id: Number(r.IDstock_ecru),
    numero: r.numero ?? null,
    lot: r.lot ?? null,
    poids: Number(r.poids) || 0,
    metrage: Number(r.metrage) || 0,
    coloris_reference: colNames.get(Number(r.IDcolori_ecru)) ?? null,
    magasin_nom: magNames.get(Number(r.IDmagasin)) ?? null,
    second_choix: Number(r.second_choix) || 0,
    observations: r.observations ?? null,
    etat_label: null,
  })
  const linked = linkedFixed.map(toRoll)
  const available = availFixed.map(toRoll)
  // Reserved contribution toward the client line target, in the line's unite.
  const reserved = linked.reduce((s, r) => s + (dim === 'metrage' ? (r.poids ?? 0) * rendement : (r.poids ?? 0)), 0)
  return {
    kind: 'ecru' as const,
    unite: ctx.unite,
    unite_label: uniteLabel(ctx.unite),
    dim,
    target_qty: ctx.quantite,
    rendement,
    sst_nom: sstNom,
    reserved: Math.round(reserved * 100) / 100,
    linked,
    available,
  }
}

commandesClientRouter.get('/:id/lignes/:ligneId/supply/ennoblissement/:sstLineId/rolls', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    const sstLineId = parseInt(req.params.sstLineId, 10)
    if (isNaN(commandeId) || isNaN(ligneId) || isNaN(sstLineId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx || ctx.kind !== 'fini') { res.status(404).json({ error: 'Fini line not found' }); return }
    res.json(await fetchEnnoRollsPayload(ctx, sstLineId))
  } catch (err) {
    console.error('Error fetching ennoblissement rolls:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Reserve a dyer's input écru roll to this client fini line.
commandesClientRouter.put('/:id/lignes/:ligneId/supply/ennoblissement/:sstLineId/rolls/:stockId', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    const sstLineId = parseInt(req.params.sstLineId, 10)
    const stockId = parseInt(req.params.stockId, 10)
    if (isNaN(commandeId) || isNaN(ligneId) || isNaN(sstLineId) || isNaN(stockId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx || ctx.kind !== 'fini') { res.status(404).json({ error: 'Fini line not found' }); return }
    if (refuseIfSoldee(res, await loadCommandeSoldee(commandeId))) return
    const rollRows = await query<{ IDref_commande_affectation: number | null; IDligne_commande_client: number | null }>(
      `SELECT IDref_commande_affectation, IDligne_commande_client FROM stock_ecru WHERE IDstock_ecru = ${stockId}`,
    )
    if (rollRows.length === 0) { res.status(404).json({ error: 'Stock ecru not found' }); return }
    if (Number(rollRows[0].IDref_commande_affectation) !== sstLineId) { res.status(400).json({ error: 'Roll does not belong to this ennoblisseur order' }); return }
    const current = Number(rollRows[0].IDligne_commande_client) || 0
    if (current !== 0 && current !== ligneId) { res.status(409).json({ error: 'Roll already reserved to another line' }); return }
    await query(`UPDATE stock_ecru SET IDligne_commande_client = ${ligneId} WHERE IDstock_ecru = ${stockId}`)
    res.json(await fetchEnnoRollsPayload(ctx, sstLineId))
  } catch (err) {
    console.error('Error reserving ennoblissement roll:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.delete('/:id/lignes/:ligneId/supply/ennoblissement/:sstLineId/rolls/:stockId', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    const sstLineId = parseInt(req.params.sstLineId, 10)
    const stockId = parseInt(req.params.stockId, 10)
    if (isNaN(commandeId) || isNaN(ligneId) || isNaN(sstLineId) || isNaN(stockId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx || ctx.kind !== 'fini') { res.status(404).json({ error: 'Fini line not found' }); return }
    if (refuseIfSoldee(res, await loadCommandeSoldee(commandeId))) return
    await query(`UPDATE stock_ecru SET IDligne_commande_client = 0 WHERE IDstock_ecru = ${stockId} AND IDligne_commande_client = ${ligneId}`)
    res.json(await fetchEnnoRollsPayload(ctx, sstLineId))
  } catch (err) {
    console.error('Error releasing ennoblissement roll:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  CREATE ENNOBLISSEUR ORDER from a client fini line — the upstream
//  half of the Ennoblissement tab. List the tombé-de-métier (écru)
//  rolls available across every location for this line's écru ref, then
//  commission a NEW commande_sous_traitant whose single type=2 line dyes
//  this line's ref_fini/coloris. The chosen écru rolls are affected to the
//  new sst line (IDref_commande_affectation) and, when free, reserved to
//  this client line (IDligne_commande_client). Affect-only: roll location
//  (IDmagasin) is untouched — physical shipment is a separate step. Ports
//  the legacy "create dyeing order from the line" flow.
// ════════════════════════════════════════════════════════

interface AvailableEcruRoll extends RollLite {
  reserved_elsewhere: boolean
}

/** type_sst per sous-traitant (2 = Ennoblisseur — memory project_type_sst_ids). */
async function resolveSousTraitantTypes(ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  const u = Array.from(new Set(ids.filter((x) => x > 0)))
  if (u.length === 0) return out
  const rows = await query<{ IDsous_traitant: number; IDtype_sst: number | null }>(
    `SELECT IDsous_traitant, IDtype_sst FROM sous_traitant WHERE IDsous_traitant IN (${u.join(',')})`,
  )
  for (const r of rows) out.set(Number(r.IDsous_traitant), Number(r.IDtype_sst) || 0)
  return out
}

// The ennoblisseur dyes the NATURAL écru base only. A ref_ecru carries several
// colori_ecru: the undyed base ("ecru") plus color-knitted variants knitted from
// pre-dyed yarn (e.g. "Gris clair C5010") that physically can't be re-dyed to a
// target fini coloris. Legacy's "écru disponible" panel counts only the "ecru"
// base — so we must too (without this, ref 029A/MATEL showed 485 kg = all coloris
// instead of 256.30 kg = the ecru base). Returns the base colori_ecru ids for a
// ref (normally exactly one); empty ⇒ this ref has no "ecru" coloris, in which
// case callers fall back to the whole pool rather than hide everything.
async function naturalEcruColoriIds(ecruRefId: number): Promise<number[]> {
  if (ecruRefId <= 0) return []
  const rows = await query<{ IDcolori_ecru: number }>(
    `SELECT IDcolori_ecru FROM colori_ecru WHERE IDref_ecru = ${ecruRefId} AND reference = 'ecru'`,
  )
  return rows.map((r) => Number(r.IDcolori_ecru)).filter((x) => x > 0)
}

// Which colori_ecru can feed this client line's ennoblissement? Branches on
// ref_fini.avec_teinture (the coloris-catalog rule):
//  - Dyed finis (avec_teinture 1/2): only the natural "ecru" base — the dyer
//    needs undyed input (naturalEcruColoriIds above).
//  - Wash-only finis (avec_teinture 0): the line's IDColoris IS a colori_ecru
//    id — the fini is built from tombé de métier in that exact coloris (e.g.
//    040A gris8985 ← écru 040 gris8985), NOT from the "ecru" base. Without
//    this branch, a 040A/gris8985 line wrongly showed the 040/ecru pool.
//    Line without a coloris ⇒ empty (callers fall back to the whole pool).
async function ennoInputColoriIds(ecruRefId: number, avecTeinture: number, lineColoriId: number): Promise<number[]> {
  if (avecTeinture === 0) return lineColoriId > 0 ? [lineColoriId] : []
  return naturalEcruColoriIds(ecruRefId)
}

async function fetchEnnoAvailableRolls(ctx: ClientLineContext, magasinId = 0) {
  // The écru a fini line needs is ref_fini.IDref_ecru. Use the RAW rendement
  // (NOT rounded) so the Ml projection matches the legacy / supply table.
  const r = await query<{ IDref_ecru: number | null; rendement: number | null; avec_teinture: number | null }>(
    `SELECT IDref_ecru, rendement, avec_teinture FROM ref_fini WHERE IDref_fini = ${ctx.refId}`,
  )
  const ecruRefId = Number(r[0]?.IDref_ecru) || 0
  const rendement = Number(r[0]?.rendement) || 0
  const avecTeinture = Number(r[0]?.avec_teinture) || 0
  const base = {
    unite: ctx.unite,
    unite_label: uniteLabel(ctx.unite),
    dim: lineDim(ctx.unite) as 'metrage' | 'poids',
    rendement,
    rolls: [] as AvailableEcruRoll[],
  }
  if (ecruRefId <= 0) return base

  // Available = ETM écru of this ref, not yet affected to a dyer, not shipped
  // out, not reserved to a donation commande (IDcommande_donation), not already
  // consumed into a fini roll. Coloris restricted per avec_teinture (see
  // ennoInputColoriIds): natural "ecru" base for dyed finis, the line's own
  // colori_ecru for wash-only finis. We DO surface rolls reserved to another
  // client line (flagged reserved_elsewhere) so the user sees the whole base
  // pool — the create step guards the reservation. When magasinId>0 scope to
  // that location.
  const ecruColoris = await ennoInputColoriIds(ecruRefId, avecTeinture, ctx.coloriId)
  const coloriFilter = ecruColoris.length > 0 ? ` AND IDcolori_ecru IN (${ecruColoris.join(',')})` : ''
  const magFilter = magasinId > 0 ? ` AND IDmagasin = ${magasinId}` : ''
  // IDLigne_Commande_TRM>0: same orphan-roll exclusion as the by-location aggregate
  // (fetchEnnoLocations) so the selectable rolls match the counted poids.
  const rows = await query<any>(
    `SELECT IDstock_ecru, numero, lot, poids, metrage, IDcolori_ecru, IDmagasin,
            IDligne_commande_client, second_choix, observations
     FROM stock_ecru
     WHERE IDref_ecru = ${ecruRefId} AND IDsociete = 1${magFilter}${coloriFilter}
       AND IDLigne_Commande_TRM > 0
       AND (IDcommande_donation IS NULL OR IDcommande_donation = 0)
       AND (IDref_commande_affectation IS NULL OR IDref_commande_affectation = 0)
       AND (IDligne_expedition_ETM IS NULL OR IDligne_expedition_ETM = 0)
     ORDER BY date_saisie DESC, IDstock_ecru DESC`,
  )
  const ids = rows.map((x: any) => Number(x.IDstock_ecru)).filter((x: number) => x > 0)
  const consumed = new Set<number>()
  if (ids.length > 0) {
    const dyed = await query<{ IDstock_ecru: number }>(
      `SELECT DISTINCT IDstock_ecru FROM stock_fini WHERE IDstock_ecru IN (${ids.join(',')})`,
    )
    for (const d of dyed) consumed.add(Number(d.IDstock_ecru))
  }
  const kept = rows.filter((x: any) => !consumed.has(Number(x.IDstock_ecru)))
  const fixed = await fixEncoding(kept, 'stock_ecru', 'IDstock_ecru', ['numero', 'lot', 'observations'])
  const magNames = await resolveMagasinNames(fixed.map((x: any) => Number(x.IDmagasin)))
  const colNames = await resolveEcruColoris(fixed.map((x: any) => Number(x.IDcolori_ecru)))
  base.rolls = fixed.map((x: any): AvailableEcruRoll => ({
    id: Number(x.IDstock_ecru),
    numero: x.numero ?? null,
    lot: x.lot ?? null,
    poids: Number(x.poids) || 0,
    metrage: Number(x.metrage) || 0,
    coloris_reference: colNames.get(Number(x.IDcolori_ecru)) ?? null,
    magasin_nom: magNames.get(Number(x.IDmagasin)) ?? null,
    second_choix: Number(x.second_choix) || 0,
    observations: x.observations ?? null,
    etat_label: null,
    reserved_elsewhere:
      (Number(x.IDligne_commande_client) || 0) > 0 && Number(x.IDligne_commande_client) !== ctx.ligneId,
  }))
  return base
}

commandesClientRouter.get('/:id/lignes/:ligneId/supply/ennoblissement/available-rolls', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    if (isNaN(commandeId) || isNaN(ligneId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx || ctx.kind !== 'fini') { res.status(404).json({ error: 'Fini line not found' }); return }
    const magasinId = parseInt(String(req.query.magasin ?? '0'), 10) || 0
    res.json(await fetchEnnoAvailableRolls(ctx, magasinId))
  } catch (err) {
    console.error('Error fetching ennoblissement available rolls:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Tombé-de-métier (écru) of this fini's écru ref, available and AGGREGATED by
// current location (sous-traitant magasin). Powers the legacy "029 - écru
// disponible" panel: rows grouped into "chez les ennoblisseurs" (IDtype_sst=2)
// vs "à l'usine" (other sous-traitants, e.g. tricoteurs/TRM). Factory-only
// rolls (IDmagasin=0) are excluded — only real sous-traitant locations show.
interface EnnoLocationRow {
  IDsous_traitant: number
  location_nom: string
  is_ennoblisseur: boolean
  group: 'ennoblisseur' | 'usine'
  nb_rolls: number
  poids: number
  metrage_potentiel: number
}

/** ref_ecru.reference for a single id (the écru "029" code), encoding-repaired. */
async function resolveEcruRefLabel(ecruRefId: number): Promise<string> {
  if (ecruRefId <= 0) return ''
  const rows = await query<{ IDref_ecru: number; reference: string | null }>(
    `SELECT IDref_ecru, reference FROM ref_ecru WHERE IDref_ecru = ${ecruRefId}`,
  )
  const fixed = await fixEncoding(rows, 'ref_ecru', 'IDref_ecru', ['reference'])
  return (fixed[0]?.reference ?? '').toString()
}

async function fetchEnnoLocations(ctx: ClientLineContext) {
  const r = await query<{ IDref_ecru: number | null; rendement: number | null; avec_teinture: number | null }>(
    `SELECT IDref_ecru, rendement, avec_teinture FROM ref_fini WHERE IDref_fini = ${ctx.refId}`,
  )
  const ecruRefId = Number(r[0]?.IDref_ecru) || 0
  const rendement = Number(r[0]?.rendement) || 0
  const avecTeinture = Number(r[0]?.avec_teinture) || 0
  const ecruRefLabel = await resolveEcruRefLabel(ecruRefId)
  const base = {
    rendement,
    unite_label: uniteLabel(ctx.unite),
    ecru_ref_label: ecruRefLabel,
    // Coloris the pool is filtered on ("ecru", "gris8985", …) so the UI can
    // title the panel truthfully; '' when the pool is unfiltered.
    ecru_coloris_label: '',
    locations: [] as EnnoLocationRow[],
  }
  if (ecruRefId <= 0) return base

  // Coloris restriction per avec_teinture (see ennoInputColoriIds): dyed finis
  // count only the natural "ecru" base (color-knitted variants aren't dyeable —
  // the per-location totals match legacy); wash-only finis count the line's own
  // colori_ecru (their input tombé de métier is knitted in that coloris).
  const ecruColoris = await ennoInputColoriIds(ecruRefId, avecTeinture, ctx.coloriId)
  if (ecruColoris.length > 0) {
    const names = await resolveEcruColoris(ecruColoris)
    base.ecru_coloris_label = Array.from(new Set(ecruColoris.map((id) => (names.get(id) ?? '').trim()).filter(Boolean))).join(', ')
  }
  const coloriFilter = ecruColoris.length > 0 ? ` AND IDcolori_ecru IN (${ecruColoris.join(',')})` : ''
  // No IDsociete/IDmagasin restriction: legacy's "écru disponible" panel spans the
  // Malterre companies. Écru at a sous-traitant magasin (IDmagasin>0) groups under
  // that location; écru still at the factory (IDmagasin=0) is "à l'usine", grouped
  // by its owning company — that's how the in-house knitter Tricotage Malterre
  // (IDsociete=2, IDmagasin=0) surfaces. IDsociete>0 drops legacy-invisible rows.
  // IDLigne_Commande_TRM>0: only écru traceable to a TRM knitting order counts —
  // legacy excludes orphan rolls (old / 2nd-choix scraps with no TRM line). This
  // is what splits TRM 233.30→198.90 while leaving MATEL 256.30 untouched (all its
  // rolls carry a TRM line); it is NOT a second_choix filter (MATEL's 256.30
  // includes a 2nd-choix roll, so second_choix=0 would wrongly drop it).
  // IDcommande_donation=0: rolls reserved to a donation commande client are
  // already spoken for — legacy never counts them as écru disponible (bug seen
  // on ref 040: 44.7 kg of donation rolls showed as available at the usine).
  const rows = await query<{ IDstock_ecru: number; IDmagasin: number | null; IDsociete: number | null; poids: number | null }>(
    `SELECT IDstock_ecru, IDmagasin, IDsociete, poids FROM stock_ecru
      WHERE IDref_ecru = ${ecruRefId} AND IDsociete > 0${coloriFilter}
        AND IDLigne_Commande_TRM > 0
        AND (IDcommande_donation IS NULL OR IDcommande_donation = 0)
        AND (IDref_commande_affectation IS NULL OR IDref_commande_affectation = 0)
        AND (IDligne_expedition_ETM IS NULL OR IDligne_expedition_ETM = 0)`,
  )
  const ids = rows.map((x) => Number(x.IDstock_ecru)).filter((x) => x > 0)
  const consumed = new Set<number>()
  if (ids.length > 0) {
    const dyed = await query<{ IDstock_ecru: number }>(
      `SELECT DISTINCT IDstock_ecru FROM stock_fini WHERE IDstock_ecru IN (${ids.join(',')})`,
    )
    for (const d of dyed) consumed.add(Number(d.IDstock_ecru))
  }
  // Key by magasin when at a sous-traitant, else by owning company (à l'usine).
  const agg = new Map<string, { magId: number; socId: number; nb: number; poids: number }>()
  for (const x of rows) {
    if (consumed.has(Number(x.IDstock_ecru))) continue
    const mag = Number(x.IDmagasin) || 0
    const soc = Number(x.IDsociete) || 0
    const key = mag > 0 ? `m${mag}` : `s${soc}`
    const a = agg.get(key) ?? { magId: mag, socId: soc, nb: 0, poids: 0 }
    a.nb += 1
    a.poids += Number(x.poids) || 0
    agg.set(key, a)
  }
  const cells = Array.from(agg.values())
  const magIds = cells.filter((a) => a.magId > 0).map((a) => a.magId)
  const socIds = cells.filter((a) => a.magId === 0).map((a) => a.socId)
  const [names, types, socNames] = await Promise.all([
    resolveMagasinNames(magIds),
    resolveSousTraitantTypes(magIds),
    resolveSocieteNames(socIds),
  ])
  base.locations = cells
    .map((a): EnnoLocationRow => {
      if (a.magId > 0) {
        const isEnno = types.get(a.magId) === 2
        return {
          IDsous_traitant: a.magId,
          location_nom: names.get(a.magId) ?? `#${a.magId}`,
          is_ennoblisseur: isEnno,
          group: isEnno ? 'ennoblisseur' : 'usine',
          nb_rolls: a.nb,
          poids: round2c(a.poids),
          metrage_potentiel: round2c(a.poids * rendement),
        }
      }
      // Factory écru (IDmagasin=0): "à l'usine", labelled by owning company. No
      // create button — you only commission a dyer that already holds the écru.
      // Synthetic negative id keeps the React key distinct from any real dyer.
      return {
        IDsous_traitant: -a.socId,
        location_nom: socNames.get(a.socId) ?? `Société #${a.socId}`,
        is_ennoblisseur: false,
        group: 'usine',
        nb_rolls: a.nb,
        poids: round2c(a.poids),
        metrage_potentiel: round2c(a.poids * rendement),
      }
    })
    // Ennoblisseur rows first (they bear the create button), then by name.
    .sort((x, y) => (x.is_ennoblisseur === y.is_ennoblisseur ? x.location_nom.localeCompare(y.location_nom) : x.is_ennoblisseur ? -1 : 1))
  return base
}

commandesClientRouter.get('/:id/lignes/:ligneId/supply/ennoblissement/available-by-location', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    if (isNaN(commandeId) || isNaN(ligneId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx || ctx.kind !== 'fini') { res.status(404).json({ error: 'Fini line not found' }); return }
    res.json(await fetchEnnoLocations(ctx))
  } catch (err) {
    console.error('Error fetching ennoblissement locations:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const ennoOrderBody = z.object({
  IDsous_traitant: z.number().int().positive(),
  date_commande: z.string().optional(),
  date_livraison: z.string().optional(),
  stockEcruIds: z.array(z.number().int().positive()).min(1),
})

commandesClientRouter.post('/:id/lignes/:ligneId/supply/ennoblissement/orders', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.id, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    if (isNaN(commandeId) || isNaN(ligneId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const parsed = ennoOrderBody.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return }
    const d = parsed.data
    const ctx = await loadClientLineContext(commandeId, ligneId)
    if (!ctx || ctx.kind !== 'fini') { res.status(404).json({ error: 'Fini line not found' }); return }
    if (refuseIfSoldee(res, await loadCommandeSoldee(commandeId))) return

    // Resolve the fini's écru ref + rendement (line ↔ dye trace).
    const refRows = await query<{ IDref_ecru: number | null; rendement: number | null }>(
      `SELECT IDref_ecru, rendement FROM ref_fini WHERE IDref_fini = ${ctx.refId}`,
    )
    const ecruRefId = Number(refRows[0]?.IDref_ecru) || 0
    const rendement = Number(refRows[0]?.rendement) || 0
    if (ecruRefId <= 0) { res.status(400).json({ error: 'Fini ref has no écru ref' }); return }

    // Keep only selected rolls that are this écru ref, still free of a dyer
    // affectation, and not reserved to a donation commande (defensive against
    // a stale client cache).
    const rollRows = await query<{
      IDstock_ecru: number; IDref_ecru: number; poids: number | null
      IDref_commande_affectation: number | null; IDcommande_donation: number | null
    }>(
      `SELECT IDstock_ecru, IDref_ecru, poids, IDref_commande_affectation, IDcommande_donation
         FROM stock_ecru WHERE IDstock_ecru IN (${d.stockEcruIds.join(',')})`,
    )
    const usable = rollRows.filter(
      (r) =>
        Number(r.IDref_ecru) === ecruRefId &&
        (Number(r.IDref_commande_affectation) || 0) === 0 &&
        (Number(r.IDcommande_donation) || 0) === 0,
    )
    if (usable.length === 0) { res.status(400).json({ error: 'No usable rolls in selection' }); return }
    const totalPoids = usable.reduce((s, r) => s + (Number(r.poids) || 0), 0)

    // ── Create the dyer order header. Ennoblisseurs are external sous-
    //    traitants → NO TRM cross-ledger mirror (and no bridge-storm risk).
    const dateCmd = dateStr(d.date_commande ?? '')
    await query(
      `INSERT INTO commande_sous_traitant
       (IDsous_traitant, date_commande, est_soldee, commentaire, journal,
        IDadresse_sous_traitant, IDadresse_livraison, IDdossier, IDcommande_client, IDligne_commande_client)
       VALUES (${d.IDsous_traitant}, '${dateCmd}', 0, '', '',
               0, 0, 0, 0, 0)`,
    )
    const hdr = await query<{ IDcommande_sous_traitant: number }>(
      `SELECT IDcommande_sous_traitant FROM commande_sous_traitant
        WHERE IDsous_traitant = ${d.IDsous_traitant} ORDER BY IDcommande_sous_traitant DESC`,
    )
    const newCmdId = Number(hdr[0]?.IDcommande_sous_traitant) || 0
    if (newCmdId <= 0) { res.status(500).json({ error: 'Header insert lookup failed' }); return }

    // ── Create the single ennoblisseur line (type=2). quantite is the metrage
    //    to dye (Ml = Σ écru poids × raw rendement); unite=0 + prix=€/Kg match
    //    how the Sous-traitants screen stores ennoblisseur lines. A fresh order
    //    has not been sent → sstatut starts Non_Envoye.
    const dateLiv = dateStr(d.date_livraison ?? '')
    const quantiteMl = Math.round(totalPoids * rendement * 100) / 100
    await query(
      `INSERT INTO ligne_commande_sous_traitant
       (IDcommande_sous_traitant, type, IDreference, IDColoris, quantite, unite, prix,
        date_livraison, date_delai, sstatut, commentaire)
       VALUES (${newCmdId}, 2, ${ctx.refId}, ${ctx.coloriId}, ${quantiteMl}, 0, 0,
               '${dateLiv}', '${dateLiv}', 'Non_Envoye', '')`,
    )
    const lineRows = await query<{ IDligne_commande_sous_traitant: number }>(
      `SELECT IDligne_commande_sous_traitant FROM ligne_commande_sous_traitant
        WHERE IDcommande_sous_traitant = ${newCmdId} ORDER BY IDligne_commande_sous_traitant DESC`,
    )
    const newLineId = Number(lineRows[0]?.IDligne_commande_sous_traitant) || 0
    if (newLineId <= 0) { res.status(500).json({ error: 'Line insert lookup failed' }); return }

    // ── Affect rolls to the new dyer line; auto-reserve the FREE ones to this
    //    client line (rolls already reserved elsewhere keep their reservation).
    for (const r of usable) {
      const sid = Number(r.IDstock_ecru)
      await query(`UPDATE stock_ecru SET IDref_commande_affectation = ${newLineId} WHERE IDstock_ecru = ${sid}`)
      await query(
        `UPDATE stock_ecru SET IDligne_commande_client = ${ligneId}
          WHERE IDstock_ecru = ${sid} AND (IDligne_commande_client IS NULL OR IDligne_commande_client = 0)`,
      )
    }

    // ── Auto-price (best-effort: stays 0 when the dyer has no tariff data).
    let prix = 0
    try {
      prix = await calcTarifSST({
        xPoids: totalPoids,
        IDsous_traitant: d.IDsous_traitant,
        IDref_fini: ctx.refId,
        IDref_fini_colori: ctx.coloriId,
      })
      if (prix > 0) {
        await query(`UPDATE ligne_commande_sous_traitant SET prix = ${n(prix)} WHERE IDligne_commande_sous_traitant = ${newLineId}`)
      }
    } catch (e) {
      console.error('[enno-order] auto-price failed for line', newLineId, e)
    }

    res.status(201).json({
      ok: true,
      IDcommande_sous_traitant: newCmdId,
      IDligne_commande_sous_traitant: newLineId,
      affected: usable.length,
      prix,
    })
  } catch (err) {
    console.error('Error creating ennoblisseur order from client line:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  PDF  (bon de commande client)
// ════════════════════════════════════════════════════════

/** ETM TVA rate (%) — the est_defaut row for IDsociete = 1 (≈ 20). */
async function loadTvaRate(): Promise<number> {
  try {
    const rows = await query<{ valeur: number | null }>(
      `SELECT valeur FROM tva WHERE IDsociete = 1 AND est_defaut = 1`,
    )
    return Number(rows[0]?.valeur) || 0
  } catch { return 0 }
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

export async function buildClientPdfData(id: number): Promise<CommandeClientPdfData | null> {
  const rows = await query<any>(`SELECT * FROM commande_client WHERE IDcommande_client = ${id}`)
  if (rows.length === 0) return null
  const fixedHeader = await fixEncoding(rows, 'commande_client', 'IDcommande_client', ['ref_client', 'commentaire'])
  const h = fixedHeader[0] as any
  h.commentaire = stripRtf(h.commentaire) || null

  const IDclient = Number(h.IDclient) || 0
  const [clientNames, adrLivRows, adrFacRows, lignesRaw, tvaRate, modePaiement, echeance] = await Promise.all([
    resolveClientNames([IDclient]),
    h.IDadresse_livraison ? query(`SELECT IDadresse, nom, adresse1, adresse2, adresse3, cp, ville, pays FROM adresse WHERE IDadresse = ${n(h.IDadresse_livraison)}`) : Promise.resolve([]),
    h.IDadresse_facturation ? query(`SELECT IDadresse, nom, adresse1, adresse2, adresse3, cp, ville, pays FROM adresse WHERE IDadresse = ${n(h.IDadresse_facturation)}`) : Promise.resolve([]),
    query<any>(
      `SELECT IDligne_commande_client, TYPE AS type_kind, IDreference, IDcolori,
              quantite, unite, prix, date_livraison
       FROM ligne_commande_client WHERE IDcommande_client = ${id} ORDER BY IDligne_commande_client`,
    ),
    loadTvaRate(),
    loadModePaiementLabel(Number(h.IDmode_paiement) || 0),
    loadEcheanceLabel(Number(h.IDecheance) || 0),
  ])

  const adrLiv = (await fixEncoding(adrLivRows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays']))[0] ?? null
  const adrFac = (await fixEncoding(adrFacRows, 'adresse', 'IDadresse', ['nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays']))[0] ?? null
  const lignesFixed = lignesRaw as any[]
  const maps = await resolveLineLabels(lignesFixed.map((l) => ({
    IDreference: Number(l.IDreference) || 0, IDcolori: Number(l.IDcolori) || 0, type_kind: Number(l.type_kind) || 0,
  })))

  const lignes = lignesFixed.map((l) => {
    const typeKind = Number(l.type_kind) || 0
    const refId = Number(l.IDreference) || 0
    const colId = Number(l.IDcolori) || 0
    const resolved = resolveRefLabel(maps, refId, typeKind)
    const qty = Number(l.quantite) || 0
    const prix = Number(l.prix) || 0
    return {
      ref_label: resolved.label || null,
      colori_reference: resolveColorisLabel(maps, colId, typeKind, refId) || null,
      quantite: qty,
      unite_label: uniteLabel(l.unite),
      prix,
      montant: qty * prix,
      date_livraison: formatHfsqlDateFr(l.date_livraison),
    }
  })

  const cleanAddr = (a: any | null) => a ? {
    nom: cleanAddrField(a.nom), adresse1: cleanAddrField(a.adresse1), adresse2: cleanAddrField(a.adresse2),
    adresse3: cleanAddrField(a.adresse3), cp: cleanAddrField(a.cp), ville: cleanAddrField(a.ville), pays: cleanAddrField(a.pays),
  } : null

  return {
    numero: String(h.numero ?? id),
    dateCommande: formatHfsqlDateLongFr(h.date_commande),
    clientNom: clientNames.get(IDclient) ?? '',
    refClient: (h.ref_client ?? null) as string | null,
    adresseFacturation: cleanAddr(adrFac),
    adresseLivraison: cleanAddr(adrLiv),
    modePaiement: modePaiement,
    echeance: echeance,
    commentaire: h.commentaire ?? null,
    remise: Number(h.remise) || 0,
    fraisPort: Number(h.frais_port) || 0,
    tvaRate,
    lignes,
  }
}

async function renderClientPdfBuffer(data: CommandeClientPdfData): Promise<Buffer> {
  return renderToBuffer(
    React.createElement(CommandeClientPdf, { data }) as unknown as React.ReactElement<
      import('@react-pdf/renderer').DocumentProps
    >,
  )
}

commandesClientRouter.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const data = await buildClientPdfData(id)
    if (!data) { res.status(404).json({ error: 'Commande not found' }); return }
    const buffer = await renderClientPdfBuffer(data)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="commande-client-${data.numero}.pdf"`)
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.send(buffer)
  } catch (err) {
    console.error('Error rendering commande-client PDF:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  EMAIL  (bon de commande client → Gmail)
// ════════════════════════════════════════════════════════

interface EmailRecipientPayload { email: string; name?: string; source: 'contact'; contactId: number }
interface EmailDefaultsPayload {
  recipients: { selected: EmailRecipientPayload[]; suggestions: EmailRecipientPayload[] }
  subject: string
  body: string
  clientNom: string
  numero: string
}

async function buildEmailDefaults(id: number): Promise<EmailDefaultsPayload | null> {
  const rows = await query<{ IDclient: number; numero: number | null }>(
    `SELECT IDclient, numero FROM commande_client WHERE IDcommande_client = ${id}`,
  )
  if (rows.length === 0) return null
  const IDclient = Number(rows[0].IDclient) || 0
  const numero = String(rows[0].numero ?? id)

  const [clientNames, contactRows] = await Promise.all([
    resolveClientNames([IDclient]),
    query<{ IDcontact: number; nom: string | null; prenom: string | null; mail: string | null; envoi_commande: number | null; est_visible: number | null }>(
      `SELECT IDcontact, nom, prenom, mail, envoi_commande, est_visible FROM contact WHERE IDclient = ${IDclient}`,
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
    if (c.envoi_commande === 1) selected.push(recipient)
    else suggestions.push(recipient)
  }

  const subject = `Accusé de réception de commande N°${numero} — ETS Malterre`
  const body =
    `Bonjour,\n\n` +
    `Veuillez trouver ci-joint l'accusé de réception de votre commande N°${numero}.\n\n` +
    `Nous restons à votre disposition pour toute information complémentaire.\n\n` +
    `Cordialement,\n` +
    `ETS Malterre`
  return { recipients: { selected, suggestions }, subject, body, clientNom, numero }
}

commandesClientRouter.get('/:id/email-defaults', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const defaults = await buildEmailDefaults(id)
    if (!defaults) { res.status(404).json({ error: 'Commande not found' }); return }
    res.json(defaults)
  } catch (err) {
    console.error('Error building email defaults:', err)
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

async function logEnvoiEmails(idTypeDoc: number, idReference: number, recipients: string[], societe: string): Promise<void> {
  if (recipients.length === 0) return
  const ts = nowHfsqlDatetime()
  for (const raw of recipients) {
    const addr = String(raw).trim()
    if (!addr) continue
    try {
      if (IS_WINDOWS) {
        await query(
          `INSERT INTO envoi_email (DATE, adresse, société, IDreference, invalidé, notes, IDtype_doc)
           VALUES ('${ts}', ${sqlText(addr)}, ${sqlText(societe || '')}, ${idReference}, 0, '', ${idTypeDoc})`,
        )
      } else {
        // Linux bridge can't tokenize accented société/invalidé — omit (HFSQL zero-fills).
        await query(
          `INSERT INTO envoi_email (DATE, adresse, IDreference, notes, IDtype_doc)
           VALUES ('${ts}', ${sqlText(addr)}, ${idReference}, '', ${idTypeDoc})`,
        )
      }
    } catch (e) {
      console.error(`envoi_email log failed (${idTypeDoc}/${idReference}/${addr}):`, (e as Error).message)
    }
  }
}

commandesClientRouter.post('/:id/email', async (req: Request, res: Response) => {
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
      console.log(`[dev-skip-send] commande_client #${id} — fake send to ${parsed.data.to.join(', ')}`)
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
        const data = await buildClientPdfData(id)
        if (!data) { res.status(404).json({ error: 'Commande not found' }); return }
        const buffer = await renderClientPdfBuffer(data)
        attachments.push({ filename: `commande-client-${data.numero}.pdf`, content: buffer, contentType: 'application/pdf' })
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

    // Audit: one envoi_email row per recipient with IDtype_doc=7 (commande client).
    const allRecipients = [...parsed.data.to, ...(parsed.data.cc ?? [])]
    let societe = ''
    try {
      const cr = await query<{ IDclient: number }>(`SELECT IDclient FROM commande_client WHERE IDcommande_client = ${id}`)
      const names = await resolveClientNames([Number(cr[0]?.IDclient) || 0])
      societe = names.get(Number(cr[0]?.IDclient) || 0) ?? ''
    } catch { /* informational */ }
    await logEnvoiEmails(TYPE_DOC_COMMANDE_CLIENT, id, allRecipients, societe)

    res.json({ ok: true, messageId })
  } catch (err) {
    console.error('Error sending commande-client email:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: 'send_failed', message })
  }
})

// ════════════════════════════════════════════════════════
//  HISTORIQUE  (envoi_email timeline for this commande)
// ════════════════════════════════════════════════════════

commandesClientRouter.get('/:id/historique', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    // envoi_email rows keyed on this commande (IDreference = id). société is
    // accented → omit on Linux; read base columns only.
    // adresse is an email (ASCII) so no encoding repair is needed. société is
    // accented → never named. DATE is a reserved word, returned as `DATE`.
    const rows = await query<{ adresse: string | null; DATE: string | null }>(
      `SELECT adresse, DATE FROM envoi_email WHERE IDreference = ${id} AND IDtype_doc = ${TYPE_DOC_COMMANDE_CLIENT}`,
    )
    // Group by send timestamp (one event, possibly multiple recipients).
    const byDate = new Map<string, { DATE: string; recipients: string[] }>()
    for (const r of rows as any[]) {
      const dt = (r.DATE ?? '').toString()
      const acc = byDate.get(dt) ?? { DATE: dt, recipients: [] as string[] }
      const addr = (r.adresse ?? '').toString().trim()
      if (addr) acc.recipients.push(addr)
      byDate.set(dt, acc)
    }
    const events = Array.from(byDate.values())
      .map((e) => ({ kind: 'email' as const, type_label: 'Accusé de réception', recipients: e.recipients, DATE: e.DATE }))
      .sort((a, b) => (a.DATE < b.DATE ? 1 : -1))
    res.json(events)
  } catch (err) {
    console.error('Error fetching commande-client historique:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════
//  DOCUMENTS  (polymorphic GED — discriminator IDcommande_client = id)
// ════════════════════════════════════════════════════════
//
// Client-commande docs: discriminate on IDcommande_client = id AND
// IDcommande_sous_traitant = 0. Show every doc type attached to the order
// (the discriminator already scopes it); the create dialog offers all visible
// type_doc. type_doc 7 = "commande client" is the canonical bon-de-commande type.

commandesClientRouter.get('/:id/documents', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const rows = await query<{ IDged: number; nom: string | null; commentaire: string | null; IDtype_doc: number }>(
      `SELECT g.IDged, g.nom, g.commentaire, g.IDtype_doc
       FROM ged g
       WHERE g.IDcommande_client = ${id} AND g.IDcommande_sous_traitant = 0
       ORDER BY g.IDged DESC`,
    )
    const fixed = await fixEncoding(rows, 'ged', 'IDged', ['nom', 'commentaire'])
    const typeIds = Array.from(new Set(fixed.map((r) => r.IDtype_doc).filter((t) => t > 0)))
    const typeMap = new Map<number, string>()
    if (typeIds.length > 0) {
      const typeRows = await query<{ IDtype_doc: number; nom: string }>(
        `SELECT IDtype_doc, nom FROM type_doc WHERE IDtype_doc IN (${typeIds.join(',')})`,
      )
      const fixedTypes = await fixEncoding(typeRows, 'type_doc', 'IDtype_doc', ['nom'])
      for (const t of fixedTypes) typeMap.set(t.IDtype_doc, t.nom)
    }
    res.json(fixed.map((r) => ({
      IDged: r.IDged, nom: r.nom, commentaire: r.commentaire,
      IDtype_doc: r.IDtype_doc, type_nom: typeMap.get(r.IDtype_doc) ?? null,
    })))
  } catch (err) {
    console.error('Error listing commande-client documents:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.get('/:id/documents/:idged/fichier', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    const idged = parseInt(req.params.idged, 10)
    if (isNaN(id) || isNaN(idged)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const rows = await queryRaw(
      `SELECT fichier FROM ged WHERE IDged = ${idged} AND IDcommande_client = ${id} AND IDcommande_sous_traitant = 0`,
    )
    if (rows.length === 0) { res.status(404).json({ error: 'Document not found' }); return }
    const fichier = (rows[0] as any).fichier
    if (fichier == null) { res.status(404).json({ error: 'No file attached' }); return }
    let buf: Buffer
    if (fichier instanceof ArrayBuffer) buf = Buffer.from(fichier)
    else if (Buffer.isBuffer(fichier)) buf = fichier
    else { res.status(404).json({ error: 'No file attached' }); return }
    if (buf.length === 0 || (buf.length === 1 && buf[0] === 0)) { res.status(404).json({ error: 'No file attached' }); return }
    let contentType = 'application/octet-stream'
    if (buf.length >= 4) {
      const hb = buf.subarray(0, 4)
      if (hb[0] === 0x25 && hb[1] === 0x50 && hb[2] === 0x44 && hb[3] === 0x46) contentType = 'application/pdf'
      else if (hb[0] === 0x89 && hb[1] === 0x50 && hb[2] === 0x4e && hb[3] === 0x47) contentType = 'image/png'
      else if (hb[0] === 0xff && hb[1] === 0xd8) contentType = 'image/jpeg'
    }
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', 'inline')
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.end(buf)
  } catch (err) {
    console.error('Error serving commande-client document:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.post('/:id/documents', upload.single('fichier'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const cf = await query(`SELECT IDcommande_client FROM commande_client WHERE IDcommande_client = ${id}`)
    if (cf.length === 0) { res.status(404).json({ error: 'Commande not found' }); return }
    const nom = (req.body.nom ?? '').toString()
    const commentaire = (req.body.commentaire ?? '').toString()
    const idTypeDoc = parseInt(req.body.IDtype_doc, 10) || TYPE_DOC_COMMANDE_CLIENT
    await query(
      `INSERT INTO ged (nom, commentaire, IDtype_doc, IDreference, IDcommande_client, IDcommande_sous_traitant, IDdossier)
       VALUES (${sqlText(nom)}, ${sqlText(commentaire)}, ${idTypeDoc}, ${id}, ${id}, 0, 0)`,
    )
    const newRows = await query<{ IDged: number }>(
      `SELECT IDged FROM ged WHERE IDcommande_client = ${id} AND IDcommande_sous_traitant = 0 AND IDtype_doc = ${idTypeDoc} ORDER BY IDged DESC`,
    )
    if (newRows.length === 0) { res.status(500).json({ error: 'Insert lookup failed' }); return }
    const newId = newRows[0].IDged
    if (req.file && req.file.buffer.length > 0) {
      await queryRaw(`UPDATE ged SET fichier = x'${req.file.buffer.toString('hex')}' WHERE IDged = ${newId}`)
    }
    res.status(201).json({ IDged: newId })
  } catch (err) {
    console.error('Error creating commande-client document:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.put('/:id/documents/:idged', upload.single('fichier'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    const idged = parseInt(req.params.idged, 10)
    if (isNaN(id) || isNaN(idged)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const scope = await query(`SELECT IDged FROM ged WHERE IDged = ${idged} AND IDcommande_client = ${id} AND IDcommande_sous_traitant = 0`)
    if (scope.length === 0) { res.status(404).json({ error: 'Document not found' }); return }
    const sets: string[] = []
    if (req.body.nom !== undefined) sets.push(`nom = ${sqlText(String(req.body.nom))}`)
    if (req.body.commentaire !== undefined) sets.push(`commentaire = ${sqlText(String(req.body.commentaire))}`)
    if (req.body.IDtype_doc !== undefined) sets.push(`IDtype_doc = ${parseInt(req.body.IDtype_doc, 10) || 0}`)
    if (sets.length > 0) await query(`UPDATE ged SET ${sets.join(', ')} WHERE IDged = ${idged}`)
    if (req.file && req.file.buffer.length > 0) {
      await queryRaw(`UPDATE ged SET fichier = x'${req.file.buffer.toString('hex')}' WHERE IDged = ${idged}`)
    } else if (req.body.remove_fichier === '1') {
      await query(`UPDATE ged SET fichier = NULL WHERE IDged = ${idged}`)
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating commande-client document:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.delete('/:id/documents/:idged', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    const idged = parseInt(req.params.idged, 10)
    if (isNaN(id) || isNaN(idged)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const scope = await query(`SELECT IDged FROM ged WHERE IDged = ${idged} AND IDcommande_client = ${id} AND IDcommande_sous_traitant = 0`)
    if (scope.length === 0) { res.status(404).json({ error: 'Document not found' }); return }
    await query(`DELETE FROM ged WHERE IDged = ${idged}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting commande-client document:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesClientRouter.get('/lookups/type-doc', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDtype_doc: number; nom: string | null }>(
      `SELECT IDtype_doc, nom FROM type_doc ORDER BY nom`,
    )
    const fixed = await fixEncoding(rows, 'type_doc', 'IDtype_doc', ['nom'])
    res.json(fixed.map((r) => ({ IDtype_doc: Number(r.IDtype_doc), nom: r.nom ?? '' })))
  } catch (err) {
    console.error('Error listing client type-doc:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Keep `addWorkingDays` import referenced for future relance use.
void addWorkingDays

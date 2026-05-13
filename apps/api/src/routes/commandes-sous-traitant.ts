// Commandes sous-traitant — orders sent to subcontractors (knitters,
// dyers, makers). Phase 1 focuses on the **Ennoblisseur** (dyeing) flow:
// the order line references a `ref_ecru` greige reference + coloris, and
// the user can attach existing tombé-de-métier rolls (`stock_ecru`) to be
// sent to the dyer, then record the dyed rolls coming back (`stock_fini`).
//
// Mirrors the shape of `commandes-fil.ts` — every public concept here
// (header CRUD, line CRUD, status toggle, polymorphic ged docs, PDF,
// email) follows the same pattern. Differences are domain-specific:
//
// - Header status field is `est_soldee` BOOLEAN (0/1), not `etat` SMALLINT.
// - Per-line status is `sstatut` VARCHAR — Phase 1 maps the binary toggle
//   to the literal values `'En_Cours'` / `'Terminé'`. Other legacy values
//   (`Notification`, `Soumis_Au_Client`, …) are preserved on read but the
//   binary toggle never produces them.
// - `ligne_commande_sous_traitant.date_delai` preserves the **original**
//   delivery date the first time `date_livraison` is rescheduled. After
//   that, `date_delai` is frozen.
// - Yarn allocation (commande_fil's `stock_fil.IDref_fil_commande` pattern)
//   is replaced here by `stock_ecru.IDref_commande_affectation` and
//   `stock_fini.IDref_commande_source` — both pointing at
//   `IDligne_commande_sous_traitant`. Verified empirically against legacy
//   data by `inspect-pieces-flow.ts`.

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { query, queryRaw, fixEncoding } from '../lib/hfsql-auto.js'
import {
  CommandeSoustraitantPdf,
  type CommandeSoustraitantPdfData,
} from '../lib/pdf/CommandeSoustraitantPdf.js'
import {
  SoumissionLotPdf,
  type SoumissionLotPdfData,
} from '../lib/pdf/SoumissionLotPdf.js'
import { sendMail } from '../lib/gmail.js'
import { getUserEmail } from '../lib/user-emails.js'
import { stripRtf, wrapRtf } from '../lib/rtf-utils.js'
import { recalcLignePrix, hasTariffData, calcTarifSSTBreakdown, type PrixBreakdown } from '../lib/pricing-sst.js'
import { resolveSearch, type SearchHits } from '../lib/sst-search-cache.js'

const upload = multer({ storage: multer.memoryStorage() })

// HFSQL ODBC bridge rejects accented identifiers on Linux but accepts
// them on Windows. The suivilot helper (and any other write touching
// columns like `stabL_demandée` / `freinte_demandée`) branches on this.
const IS_WINDOWS = process.platform === 'win32'

export const commandesSousTraitantRouter: RouterType = Router()

// ── Status string conventions ───────────────────────────
//
// Legacy `sstatut` values (count from production HFSQL):
//   "Terminé" 4616, "Notification" 1101, "En_Cours" 859, "Soumis_Au_Client"
//   259, "Non_Affecté" 186, "Attente_Delai" 128, "Delai_Expiré" 46,
//   "Non_Envoye" 18, "En_Contrôle" 15, "En_Création" 11, "A_Soumettre" 6,
//   "En_Reprise" 2.
// The binary toggle in the UI maps to "En_Cours" / "Terminé" only. Any
// other legacy value reads as "in progress" for the toggle (the line is
// not done) but is preserved on save.

const STATUT_DONE = 'Terminé'
const STATUT_OPEN = 'En_Cours'
function isLineDone(sstatut: string | null | undefined): boolean {
  return (sstatut ?? '').trim() === STATUT_DONE
}

// ── Types ────────────────────────────────────────────────

interface CommandeSousTraitantHeader {
  IDcommande_sous_traitant: number
  IDsous_traitant: number
  IDadresse_sous_traitant: number | null
  IDadresse_livraison: number | null
  date_commande: string | null
  commentaire: string | null
  est_soldee: number | null
  IDdossier: number | null
  IDcommande_client: number | null
  date_notif: string | null
  IDligne_commande_client: number | null
  journal: string | null
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

// ── Commande lifecycle helpers ───────────────────────────

async function loadCommandeSoldee(commandeId: number): Promise<number | null> {
  const rows = await query<{ est_soldee: number | null }>(
    `SELECT est_soldee FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${commandeId}`,
  )
  if (rows.length === 0) return null
  return rows[0].est_soldee ?? 0
}

async function loadCommandeIdForLine(lineId: number): Promise<number | null> {
  const rows = await query<{ IDcommande_sous_traitant: number }>(
    `SELECT IDcommande_sous_traitant FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = ${lineId}`,
  )
  if (rows.length === 0) return null
  return Number(rows[0].IDcommande_sous_traitant) || null
}

function refuseIfTerminee(res: Response, est_soldee: number | null): boolean {
  if (est_soldee === 1) {
    res.status(409).json({
      error: 'commande_terminee',
      message: 'Commande terminée — réouvrir la commande pour modifier les lignes.',
    })
    return true
  }
  return false
}

/** Flip est_soldee to 1 when every line is in the done state. */
async function maybeAutoCloseCommande(commandeId: number): Promise<void> {
  const lines = await query<{ sstatut: string | null }>(
    `SELECT sstatut FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = ${commandeId}`,
  )
  if (lines.length === 0) return
  if (!lines.every((l) => isLineDone(l.sstatut))) return
  await query(
    `UPDATE commande_sous_traitant SET est_soldee = 1 WHERE IDcommande_sous_traitant = ${commandeId} AND est_soldee = 0`,
  )
}

/** Look up the type label for a sous-traitant — used to gate ennoblisseur features. */
async function loadSousTraitantType(IDsous_traitant: number): Promise<{ IDtype_sst: number; type: string | null } | null> {
  const rows = await query<{ IDtype_sst: number; type: unknown }>(
    `SELECT st.IDtype_sst, CONVERT(ts.type USING 'UTF-8') AS type
     FROM sous_traitant st
     LEFT JOIN type_sst ts ON st.IDtype_sst = ts.IDtype_sst
     WHERE st.IDsous_traitant = ${IDsous_traitant}`,
  )
  if (rows.length === 0) return null
  const r = rows[0]
  let typeStr: string | null = null
  if (r.type instanceof ArrayBuffer) typeStr = Buffer.from(r.type).toString('utf8')
  else if (typeof r.type === 'string') typeStr = r.type
  return { IDtype_sst: Number(r.IDtype_sst) || 0, type: typeStr }
}

// ── Validation schemas ───────────────────────────────────

const commandeBody = z.object({
  IDsous_traitant: z.number().int().positive(),
  date_commande: z.string().optional(),
  IDadresse_sous_traitant: z.number().int().nonnegative().optional(),
  IDadresse_livraison: z.number().int().nonnegative().optional(),
  commentaire: z.string().optional(),
  journal: z.string().optional(),
  est_soldee: z.number().int().min(0).max(1).optional(),
})

const ligneBody = z.object({
  type: z.number().int().optional(),
  IDreference: z.number().int().nonnegative().optional(),
  IDColoris: z.number().int().nonnegative().optional(),
  quantite: z.number().optional(),
  unite: z.number().int().optional(),
  prix: z.number().optional(),
  date_livraison: z.string().optional(),
  sstatut: z.string().optional(),
  commentaire: z.string().optional(),
})

// ── Lookups ──────────────────────────────────────────────

commandesSousTraitantRouter.get('/lookups/sous-traitants', async (req: Request, res: Response) => {
  try {
    const typeFilter = String(req.query.type ?? '').trim().toLowerCase()
    // Joining sous_traitant with type_sst + CONVERT() in one query collapses
    // the result set to a single row in HFSQL ODBC (likely a quirk with the
    // reserved-word column `type`). Split into two queries and merge in JS.
    // Note: do NOT CONVERT(tel) here — it silently truncates the result
    // set in HFSQL ODBC (suspect: empty/non-text values choke the CONVERT
    // function in this driver). `tel` is plain digits + spaces, no accents,
    // so it doesn't need decoding anyway.
    const rows = await query<{ IDsous_traitant: number; nom: unknown; tel: unknown; IDtype_sst: number | null }>(
      `SELECT IDsous_traitant,
              CONVERT(nom USING 'UTF-8') AS nom,
              tel,
              IDtype_sst
       FROM sous_traitant
       WHERE est_visible = 1
       ORDER BY nom`,
    )
    const decode = (v: unknown): string | null => {
      if (v instanceof ArrayBuffer) return Buffer.from(v).toString('utf8')
      if (typeof v === 'string') return v
      return null
    }
    const typeMap = new Map<number, string>()
    const tsRows = await query<{ IDtype_sst: number; v: unknown }>(
      `SELECT IDtype_sst, CONVERT(type USING 'UTF-8') AS v FROM type_sst`,
    )
    for (const t of tsRows) {
      const lbl = decode((t as any).v)
      if (lbl !== null) typeMap.set(Number(t.IDtype_sst), lbl)
    }
    const decoded = rows.map((r) => ({
      IDsous_traitant: Number(r.IDsous_traitant),
      nom: decode(r.nom),
      tel: decode(r.tel),
      IDtype_sst: r.IDtype_sst,
      type: r.IDtype_sst ? typeMap.get(Number(r.IDtype_sst)) ?? null : null,
    }))
    const filtered = typeFilter
      ? decoded.filter((r) => (r.type ?? '').toLowerCase().includes(typeFilter))
      : decoded
    res.json(filtered)
  } catch (err) {
    console.error('Error fetching sous-traitants lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesSousTraitantRouter.get('/lookups/adresses', async (req: Request, res: Response) => {
  try {
    const sid = parseInt(String(req.query.sous_traitant ?? ''), 10)
    if (isNaN(sid)) { res.status(400).json({ error: 'sous_traitant query parameter required' }); return }

    const rows = await query(
      `SELECT * FROM adresse WHERE IDsous_traitant = ${sid} AND (est_visible IS NULL OR est_visible = 1) ORDER BY est_defaut DESC, IDadresse`,
    )
    const fixed = await fixEncoding(rows, 'adresse', 'IDadresse', [
      'nom',
      'adresse1',
      'adresse2',
      'adresse3',
      'ville',
      'pays',
      'commentaire',
    ])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching adresses lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Phase 1: ref_ecru + colori_ecru pairs for the line picker (ennoblisseur flow).
// Two flat queries are merged in JS — JOINs in HFSQL ODBC sometimes truncate
// the result set (the same quirk we hit on sous_traitant + type_sst).
commandesSousTraitantRouter.get('/lookups/refs-ecru', async (_req: Request, res: Response) => {
  try {
    const refRows = await query<{ IDref_ecru: number; reference: string | null }>(
      `SELECT IDref_ecru, reference FROM ref_ecru ORDER BY reference`,
    )
    const fixedRefs = await fixEncoding(refRows, 'ref_ecru', 'IDref_ecru', ['reference'])

    const coloriRows = await query<{ IDcolori_ecru: number; IDref_ecru: number; reference: string | null }>(
      `SELECT IDcolori_ecru, IDref_ecru, reference FROM colori_ecru ORDER BY reference`,
    )
    const fixedColoris = await fixEncoding(coloriRows, 'colori_ecru', 'IDcolori_ecru', ['reference'])

    const refLabel = new Map<number, string>()
    for (const r of fixedRefs) refLabel.set(r.IDref_ecru, r.reference ?? '')

    res.json(
      fixedColoris.map((c) => ({
        IDref_ecru: Number(c.IDref_ecru),
        IDcolori_ecru: Number(c.IDcolori_ecru),
        ref_ecru: refLabel.get(Number(c.IDref_ecru)) ?? '',
        colori_reference: c.reference ?? '',
      })),
    )
  } catch (err) {
    console.error('Error fetching refs-ecru lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ref_fini list for the line picker / reception form.
commandesSousTraitantRouter.get('/lookups/refs-fini', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDref_fini: number; reference: string | null; designation: string | null }>(
      `SELECT IDref_fini, reference, designation FROM ref_fini ORDER BY reference`,
    )
    const fixed = await fixEncoding(rows, 'ref_fini', 'IDref_fini', ['reference', 'designation'])
    res.json(
      fixed.map((r) => ({
        IDref_fini: Number(r.IDref_fini),
        ref_fini: r.reference ?? '',
        designation: r.designation ?? '',
      })),
    )
  } catch (err) {
    console.error('Error fetching refs-fini lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Coloris options for a given ref_fini. The legacy table is `ref_fini_colori`
// (NOT `colori_fini`, which is a different M:N junction). Each row is one
// (ref_fini, coloris) pair — `IDref_fini_colori` is the ID stored in
// `ligne_commande_sous_traitant.IDColoris` and `stock_fini.IDColoris`.
commandesSousTraitantRouter.get('/lookups/colori-fini', async (req: Request, res: Response) => {
  try {
    const refFiniId = parseInt(String(req.query.ref_fini ?? ''), 10)
    if (isNaN(refFiniId) || refFiniId <= 0) {
      res.status(400).json({ error: 'ref_fini query parameter required' })
      return
    }
    const rows = await query<{ IDref_fini_colori: number; reference: string | null }>(
      `SELECT IDref_fini_colori, reference FROM ref_fini_colori
       WHERE IDref_fini = ${refFiniId}
       ORDER BY reference`,
    )
    const fixed = await fixEncoding(rows, 'ref_fini_colori', 'IDref_fini_colori', ['reference'])
    res.json(
      fixed.map((r) => ({
        IDref_fini_colori: Number(r.IDref_fini_colori),
        reference: r.reference ?? '',
      })),
    )
  } catch (err) {
    console.error('Error fetching colori-fini lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Reuse the same magasin lookup that other screens will need.
commandesSousTraitantRouter.get('/lookups/magasins', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDmagasin: number; nom: string | null }>(
      `SELECT IDmagasin, nom FROM magasin ORDER BY nom`,
    )
    const fixed = await fixEncoding(rows, 'magasin', 'IDmagasin', ['nom'])
    res.json(fixed)
  } catch (err) {
    console.error('Error fetching magasins lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── List all commandes ───────────────────────────────────

commandesSousTraitantRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim()
    const stFilter = parseInt(String(req.query.sous_traitant ?? ''), 10)
    const statusFilter = String(req.query.status ?? 'all')

    // Keyset pagination: the frontend can pass `limit` (default 100, max 500)
    // and `before_id` (the last IDcommande_sous_traitant it has). We sort by
    // ID descending so "before_id" means "give me older commandes". Sorting
    // by ID rather than date_commande is required for keyset to be stable —
    // and IDs are sequential so the visible order barely changes.
    //
    // Search (`q` non-empty) is pushed down to SQL via `resolveSearch()`,
    // which matches the query tokens against in-process caches of the
    // sous_traitant + ref/coloris catalog tables and returns the matching
    // IDs. Those IDs become IN-list predicates on the main commande query
    // (sst match) and on a `ligne_commande_sous_traitant` sub-SELECT (ref +
    // coloris match per polymorphic `type`). We keep `TOP limit` even on
    // search — a typeahead doesn't need 4000 hits. `commentaire` is no
    // longer fetched/stripped because the list card doesn't render it.
    const isSearching = q.length > 0
    const limitRaw = parseInt(String(req.query.limit ?? ''), 10)
    const limit = isNaN(limitRaw) ? 100 : Math.min(Math.max(limitRaw, 1), 500)
    const beforeIdRaw = parseInt(String(req.query.before_id ?? ''), 10)
    const beforeId = isNaN(beforeIdRaw) || beforeIdRaw <= 0 ? null : beforeIdRaw

    let hits: SearchHits | null = null
    if (isSearching) {
      try {
        hits = await resolveSearch(q)
      } catch (err) {
        console.error('Search cache resolve failed:', err)
        hits = null
      }
    }

    const whereParts: string[] = []
    if (!isNaN(stFilter)) whereParts.push(`cst.IDsous_traitant = ${stFilter}`)

    // Status filter — accepts both the legacy binary filter
    // ('en_cours' / 'terminee') and the new richer phase filters
    // ('en_controle' / 'soumis' / 'en_reprise'). Terminée is a pure
    // est_soldee=1 query; the other four are sub-divisions of
    // est_soldee=0 that we pre-resolve via signal sets so the SQL can
    // narrow to IN (...) and infinite-scroll pagination still works.
    const SUB_PHASES: SstPhase[] = ['en_cours', 'en_controle', 'soumis', 'en_reprise']
    if (statusFilter === 'terminee') {
      whereParts.push(`cst.est_soldee = 1`)
    } else if (SUB_PHASES.includes(statusFilter as SstPhase)) {
      whereParts.push(`cst.est_soldee = 0`)
      // Resolve the three signal ID sets — scoped to open commandes for
      // efficiency. We compute the phase priority (reprise > soumis >
      // en_controle > en_cours) by set subtraction.
      const [repriseRows, soumisRows, receptionRows] = await Promise.all([
        query<{ IDcommande_sous_traitant: number }>(
          `SELECT DISTINCT lcs.IDcommande_sous_traitant
           FROM stock_fini sf
           JOIN ligne_commande_sous_traitant lcs
             ON lcs.IDligne_commande_sous_traitant = sf.IDref_commande_source
           JOIN commande_sous_traitant cst
             ON cst.IDcommande_sous_traitant = lcs.IDcommande_sous_traitant
           WHERE sf.IDetat_stock_fini = 2 AND cst.est_soldee = 0`,
        ),
        query<{ IDreference: number }>(
          `SELECT DISTINCT ee.IDreference
           FROM envoi_email ee
           JOIN commande_sous_traitant cst
             ON cst.IDcommande_sous_traitant = ee.IDreference
           WHERE ee.IDtype_doc = ${TYPE_DOC_SOUMISSION_LOT_CLIENT}
             AND (ee.invalidé = 0 OR ee.invalidé IS NULL)
             AND cst.est_soldee = 0`,
        ),
        query<{ IDcommande_sous_traitant: number }>(
          `SELECT DISTINCT lcs.IDcommande_sous_traitant
           FROM stock_fini sf
           JOIN ligne_commande_sous_traitant lcs
             ON lcs.IDligne_commande_sous_traitant = sf.IDref_commande_source
           JOIN commande_sous_traitant cst
             ON cst.IDcommande_sous_traitant = lcs.IDcommande_sous_traitant
           WHERE cst.est_soldee = 0`,
        ),
      ])
      const repriseSet = new Set(repriseRows.map((r) => Number(r.IDcommande_sous_traitant)))
      const soumisSetRaw = new Set(soumisRows.map((r) => Number(r.IDreference)))
      const receptionSetRaw = new Set(receptionRows.map((r) => Number(r.IDcommande_sous_traitant)))
      // Priority-gated sets (each phase excludes higher-priority ones).
      const soumisSet = new Set(Array.from(soumisSetRaw).filter((id) => !repriseSet.has(id)))
      const controleSet = new Set(
        Array.from(receptionSetRaw).filter((id) => !repriseSet.has(id) && !soumisSet.has(id)),
      )
      const excludeFromEnCours = new Set<number>([
        ...repriseSet, ...soumisSet, ...controleSet,
      ])

      const pickSet = (s: Set<number>): string | null => {
        if (s.size === 0) return null
        return Array.from(s).join(',')
      }
      if (statusFilter === 'en_reprise') {
        const list = pickSet(repriseSet)
        if (!list) { res.json([]); return }
        whereParts.push(`cst.IDcommande_sous_traitant IN (${list})`)
      } else if (statusFilter === 'soumis') {
        const list = pickSet(soumisSet)
        if (!list) { res.json([]); return }
        whereParts.push(`cst.IDcommande_sous_traitant IN (${list})`)
      } else if (statusFilter === 'en_controle') {
        const list = pickSet(controleSet)
        if (!list) { res.json([]); return }
        whereParts.push(`cst.IDcommande_sous_traitant IN (${list})`)
      } else if (statusFilter === 'en_cours') {
        // En cours = open AND has no signal yet (no rolls, no soumission, no reprise).
        if (excludeFromEnCours.size > 0) {
          whereParts.push(`cst.IDcommande_sous_traitant NOT IN (${Array.from(excludeFromEnCours).join(',')})`)
        }
      }
    }
    if (!isSearching && beforeId !== null) whereParts.push(`cst.IDcommande_sous_traitant < ${beforeId}`)

    if (isSearching && hits) {
      const orParts: string[] = []
      // Digit-only query → exact commande-id match. Users type the full
      // numero de commande, and HFSQL `CAST(... AS VARCHAR) LIKE` is flaky
      // on some driver versions — exact equality is the safer primitive.
      const qDigits = /^\d+$/.test(q) ? parseInt(q, 10) : NaN
      if (!isNaN(qDigits) && qDigits > 0) orParts.push(`cst.IDcommande_sous_traitant = ${qDigits}`)
      if (hits.sstIds.length > 0) orParts.push(`cst.IDsous_traitant IN (${hits.sstIds.join(',')})`)

      // Ref + coloris match on the lines. Type discriminates the catalog:
      // 0=ecru, 1=fil, 2=fini for refs; 0=colori_ecru, 2=ref_fini_colori
      // for coloris.
      const lineConds: string[] = []
      if (hits.refEcruIds.length) lineConds.push(`(lcs.type = 0 AND lcs.IDreference IN (${hits.refEcruIds.join(',')}))`)
      if (hits.refFiniIds.length) lineConds.push(`(lcs.type = 2 AND lcs.IDreference IN (${hits.refFiniIds.join(',')}))`)
      if (hits.refFilIds.length) lineConds.push(`(lcs.type = 1 AND lcs.IDreference IN (${hits.refFilIds.join(',')}))`)
      if (hits.coloriEcruIds.length) lineConds.push(`(lcs.type = 0 AND lcs.IDColoris IN (${hits.coloriEcruIds.join(',')}))`)
      if (hits.refFiniColoriIds.length) lineConds.push(`(lcs.type = 2 AND lcs.IDColoris IN (${hits.refFiniColoriIds.join(',')}))`)
      if (lineConds.length > 0) {
        orParts.push(
          `cst.IDcommande_sous_traitant IN (SELECT lcs.IDcommande_sous_traitant FROM ligne_commande_sous_traitant lcs WHERE ${lineConds.join(' OR ')})`,
        )
      }

      if (orParts.length === 0) {
        // q didn't match any catalog and isn't a numeric ID. Short-circuit
        // so we don't return the unfiltered list.
        res.json([])
        return
      }
      whereParts.push(`(${orParts.join(' OR ')})`)
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

    const commandes = await query<any>(
      `SELECT TOP ${limit} cst.IDcommande_sous_traitant, cst.IDsous_traitant, cst.date_commande, cst.est_soldee
       FROM commande_sous_traitant cst
       ${whereSql}
       ORDER BY cst.IDcommande_sous_traitant DESC`,
    )

    // Bulk-resolve sous-traitant nom + type label. The JOIN with type_sst
    // truncates results in HFSQL ODBC, so we run two flat queries and merge.
    const stIds = Array.from(
      new Set(commandes.map((c: any) => Number(c.IDsous_traitant)).filter((x) => !isNaN(x) && x > 0)),
    )
    const stInfo = new Map<number, { nom: string; type: string | null }>()
    if (stIds.length > 0) {
      const decode = (v: unknown): string | null => {
        if (v instanceof ArrayBuffer) return Buffer.from(v).toString('utf8')
        if (typeof v === 'string') return v
        return null
      }
      const stRows = await query<{ IDsous_traitant: number; nom: unknown; IDtype_sst: number | null }>(
        `SELECT IDsous_traitant, CONVERT(nom USING 'UTF-8') AS nom, IDtype_sst
         FROM sous_traitant
         WHERE IDsous_traitant IN (${stIds.join(',')})`,
      )
      const typeIdsNeeded = Array.from(new Set(stRows.map((s) => Number(s.IDtype_sst) || 0).filter((x) => x > 0)))
      const typeMap = new Map<number, string>()
      if (typeIdsNeeded.length > 0) {
        const tsRows = await query<{ IDtype_sst: number; v: unknown }>(
          `SELECT IDtype_sst, CONVERT(type USING 'UTF-8') AS v FROM type_sst WHERE IDtype_sst IN (${typeIdsNeeded.join(',')})`,
        )
        for (const t of tsRows) {
          const lbl = decode((t as any).v)
          if (lbl !== null) typeMap.set(Number(t.IDtype_sst), lbl)
        }
      }
      for (const s of stRows) {
        stInfo.set(Number(s.IDsous_traitant), {
          nom: decode(s.nom) ?? '',
          type: s.IDtype_sst ? typeMap.get(Number(s.IDtype_sst)) ?? null : null,
        })
      }
    }

    // Bulk fetch line aggregates only for the rows we're returning.
    // `total_eur` is the **actual** total (sum of attached écru kg × prix),
    // not the nominal qty × prix — for ennoblisseur lines, the user enters
    // qty (Ml) and prix (€/Kg) as *projections*, and the bill comes from
    // the weights of the écru rolls they attach via the pieces drawer.
    const ids = commandes.map((c: any) => c.IDcommande_sous_traitant).filter(Boolean)
    const totalsMap = new Map<number, {
      total_eur: number
      total_qte: number
      nb_lignes: number
      earliest_delivery: string | null
    }>()
    if (ids.length > 0) {
      const [lignes, ecruWeights] = await Promise.all([
        query<any>(
          `SELECT IDligne_commande_sous_traitant, IDcommande_sous_traitant, quantite, prix, date_livraison, sstatut
           FROM ligne_commande_sous_traitant
           WHERE IDcommande_sous_traitant IN (${ids.join(',')})`,
        ),
        query<{ IDref_commande_affectation: number; poids: number | null }>(
          // Sum of écru weight per affected line — joining via the IN list
          // so the planner can use the index on stock_ecru.IDref_commande_affectation.
          `SELECT IDref_commande_affectation, poids
           FROM stock_ecru
           WHERE IDref_commande_affectation IN (
             SELECT IDligne_commande_sous_traitant FROM ligne_commande_sous_traitant
             WHERE IDcommande_sous_traitant IN (${ids.join(',')})
           )`,
        ),
      ])
      const kgByLine = new Map<number, number>()
      for (const e of ecruWeights) {
        const lid = Number(e.IDref_commande_affectation) || 0
        if (lid === 0) continue
        kgByLine.set(lid, (kgByLine.get(lid) ?? 0) + (Number(e.poids) || 0))
      }
      for (const l of lignes) {
        const id = Number(l.IDcommande_sous_traitant)
        const lid = Number(l.IDligne_commande_sous_traitant)
        const acc = totalsMap.get(id) ?? { total_eur: 0, total_qte: 0, nb_lignes: 0, earliest_delivery: null }
        const qty = Number(l.quantite) || 0
        const price = Number(l.prix) || 0
        const affectedKg = kgByLine.get(lid) ?? 0
        acc.total_qte += qty
        acc.total_eur += affectedKg * price
        acc.nb_lignes += 1
        if (!isLineDone(typeof l.sstatut === 'string' ? l.sstatut : null)) {
          const dl = typeof l.date_livraison === 'string' ? l.date_livraison : ''
          if (/^\d{8}$/.test(dl) && (acc.earliest_delivery === null || dl < acc.earliest_delivery)) {
            acc.earliest_delivery = dl
          }
        }
        totalsMap.set(id, acc)
      }
    }

    // Compute the derived phase per returned row in one batched pass so
    // the frontend can render the new colored pill without an extra
    // round-trip. Phase order: terminée > en_reprise > soumis >
    // en_controle > en_cours (see computePhasesBatch).
    const phaseMap = await computePhasesBatch(
      commandes.map((c: any) => ({
        id: Number(c.IDcommande_sous_traitant),
        est_soldee: Number(c.est_soldee) || 0,
      })),
    )

    const result = commandes.map((c: any) => {
      const totals = totalsMap.get(Number(c.IDcommande_sous_traitant)) ?? {
        total_eur: 0,
        total_qte: 0,
        nb_lignes: 0,
        earliest_delivery: null,
      }
      const sst = stInfo.get(Number(c.IDsous_traitant))
      const cid = Number(c.IDcommande_sous_traitant)
      return {
        ...c,
        sous_traitant_nom: sst?.nom ?? '',
        sous_traitant_type: sst?.type ?? null,
        phase: phaseMap.get(cid) ?? 'en_cours',
        ...totals,
      }
    })

    res.json(result)
  } catch (err) {
    console.error('Error fetching commandes-sous-traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Get one commande with full detail ────────────────────

commandesSousTraitantRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const rows = await query<CommandeSousTraitantHeader>(
      `SELECT * FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${id}`,
    )
    if (rows.length === 0) { res.status(404).json({ error: 'Commande not found' }); return }

    const fixedHeader = await fixEncoding(
      rows,
      'commande_sous_traitant',
      'IDcommande_sous_traitant',
      ['commentaire', 'journal'],
    )
    const header = fixedHeader[0] as any
    // commentaire + journal are stored as RTF by the legacy app — strip
    // formatting for the new UI. Round-trip back to RTF on save (PUT).
    if (header) {
      header.commentaire = stripRtf(header.commentaire) || null
      header.journal = stripRtf(header.journal) || null
    }

    const [stRows, adresseStRows, adresseLivRows, lignes] = await Promise.all([
      // Two flat queries are merged below; the JOIN with type_sst truncates
      // result sets in HFSQL ODBC. CONVERT(tel) also truncates so we read
      // it raw — no accents in phone numbers anyway.
      query<{ IDsous_traitant: number; nom: unknown; tel: unknown; IDtype_sst: number }>(
        `SELECT IDsous_traitant,
                CONVERT(nom USING 'UTF-8') AS nom,
                tel,
                IDtype_sst
         FROM sous_traitant
         WHERE IDsous_traitant = ${n(header.IDsous_traitant)}`,
      ),
      header.IDadresse_sous_traitant
        ? query(`SELECT * FROM adresse WHERE IDadresse = ${n(header.IDadresse_sous_traitant)}`)
        : Promise.resolve([]),
      header.IDadresse_livraison
        ? query(`SELECT * FROM adresse WHERE IDadresse = ${n(header.IDadresse_livraison)}`)
        : Promise.resolve([]),
      // `type` is uppercased by HFSQL ODBC (reserved word) — alias to a
      // safe key.
      query(
        `SELECT lcs.IDligne_commande_sous_traitant, lcs.IDcommande_sous_traitant,
                lcs.type AS type_kind, lcs.IDreference, lcs.IDColoris,
                lcs.quantite, lcs.unite, lcs.prix, lcs.date_livraison, lcs.date_delai,
                lcs.date_reception, lcs.commentaire, lcs.sstatut, lcs.num_facture
         FROM ligne_commande_sous_traitant lcs
         WHERE lcs.IDcommande_sous_traitant = ${id}
         ORDER BY lcs.IDligne_commande_sous_traitant`,
      ),
    ])

    const decode = (v: unknown): string | null => {
      if (v instanceof ArrayBuffer) return Buffer.from(v).toString('utf8')
      if (typeof v === 'string') return v
      return null
    }
    const sst = (stRows[0] ?? null) as any
    const sousTraitantNom = decode(sst?.nom) ?? ''
    const sousTraitantTel = decode(sst?.tel) ?? null
    const sousTraitantIDtypeSst = sst ? Number(sst.IDtype_sst) || 0 : 0
    let sousTraitantType: string | null = null
    if (sousTraitantIDtypeSst > 0) {
      const tsRows = await query<{ v: unknown }>(
        `SELECT CONVERT(type USING 'UTF-8') AS v FROM type_sst WHERE IDtype_sst = ${sousTraitantIDtypeSst}`,
      )
      if (tsRows.length > 0) sousTraitantType = decode((tsRows[0] as any).v)
    }

    const fixedAdresseSt = await fixEncoding(adresseStRows, 'adresse', 'IDadresse', [
      'nom',
      'adresse1',
      'adresse2',
      'adresse3',
      'ville',
      'pays',
    ])
    const fixedAdresseLiv = await fixEncoding(adresseLivRows, 'adresse', 'IDadresse', [
      'nom',
      'adresse1',
      'adresse2',
      'adresse3',
      'ville',
      'pays',
    ])
    const fixedLignes = (await fixEncoding(
      lignes,
      'ligne_commande_sous_traitant',
      'IDligne_commande_sous_traitant',
      ['commentaire', 'sstatut', 'num_facture'],
    )) as any[]

    // Resolve ref labels per line — type-aware. The line's `type` SMALLINT
    // (aliased as `type_kind` here) discriminates which catalog IDreference
    // belongs to:
    //   type=2 → ref_fini   (ennoblisseur — Phase 1 default)
    //   type=1 → ref_fil    (yarn — tricoteur)
    //   type=0 → ref_ecru   (greige — confectionneur or legacy)
    // We can't trust a triple-fallback by table because the same numeric ID
    // can exist in two of the three catalogs (e.g. IDref_ecru=294 collides
    // with IDref_fini=294, "Escrime imprimée" vs whatever ref_ecru#294 is) —
    // so the user picks fini and the card surfaces ecru's reference. Always
    // route by type, fall back to the other catalogs only if the chosen
    // table doesn't have the ID (defensive against bad legacy data).
    const refIds = Array.from(new Set(fixedLignes.map((l) => Number(l.IDreference) || 0).filter((x) => x > 0)))
    const colorisIds = Array.from(new Set(fixedLignes.map((l) => Number(l.IDColoris) || 0).filter((x) => x > 0)))
    const ecruMap = new Map<number, string>()
    const finiMap = new Map<number, string>()
    const filMap = new Map<number, string>()
    // ref_fini.rendement (Ml/kg) — used by the frontend LineCard to compute
    // "Ml potentiel" = totalKgEcru × rendement. Only populated for fini refs.
    const finiRendementMap = new Map<number, number>()
    if (refIds.length > 0) {
      // Build all three maps in parallel; we'll pick the right one per line below.
      const [ecruRows, finiRows, filRows] = await Promise.all([
        query<{ IDref_ecru: number; reference: string | null }>(
          `SELECT IDref_ecru, reference FROM ref_ecru WHERE IDref_ecru IN (${refIds.join(',')})`,
        ),
        query<{ IDref_fini: number; reference: string | null; rendement: number | null }>(
          `SELECT IDref_fini, reference, rendement FROM ref_fini WHERE IDref_fini IN (${refIds.join(',')})`,
        ),
        query<{ IDref_fil: number; reference: string | null }>(
          `SELECT IDref_fil, reference FROM ref_fil WHERE IDref_fil IN (${refIds.join(',')})`,
        ),
      ])
      for (const r of await fixEncoding(ecruRows, 'ref_ecru', 'IDref_ecru', ['reference']))
        ecruMap.set(r.IDref_ecru, r.reference ?? '')
      for (const r of await fixEncoding(finiRows, 'ref_fini', 'IDref_fini', ['reference'])) {
        finiMap.set(r.IDref_fini, r.reference ?? '')
        finiRendementMap.set(r.IDref_fini, Number(r.rendement) || 0)
      }
      for (const r of await fixEncoding(filRows, 'ref_fil', 'IDref_fil', ['reference']))
        filMap.set(r.IDref_fil, r.reference ?? '')
    }
    // Per-line resolver: pick the catalog matching `type`, fall back to the
    // others only if the primary catalog doesn't have the ID.
    function resolveRef(IDref: number, typeKind: number): { label: string; kind: 'ecru' | 'fini' | 'fil' | null } {
      if (IDref <= 0) return { label: '', kind: null }
      const tryFini = () => finiMap.has(IDref) ? { label: finiMap.get(IDref)!, kind: 'fini' as const } : null
      const tryEcru = () => ecruMap.has(IDref) ? { label: ecruMap.get(IDref)!, kind: 'ecru' as const } : null
      const tryFil = () => filMap.has(IDref) ? { label: filMap.get(IDref)!, kind: 'fil' as const } : null
      let order: Array<() => { label: string; kind: 'ecru' | 'fini' | 'fil' } | null>
      if (typeKind === 2) order = [tryFini, tryEcru, tryFil]
      else if (typeKind === 1) order = [tryFil, tryEcru, tryFini]
      else order = [tryEcru, tryFini, tryFil]
      for (const fn of order) {
        const hit = fn()
        if (hit) return hit
      }
      return { label: '', kind: null }
    }
    // Per-type coloris resolution. type=2 (fini/ennoblisseur) → ref_fini_colori;
    // type=0 (ecru) → colori_ecru; we also pre-fetch both maps here so a
    // legacy line with a mismatched type still resolves (defensive).
    const colorisFiniMap = new Map<number, string>()
    const colorisEcruMap = new Map<number, string>()
    if (colorisIds.length > 0) {
      const [finiC, ecruC] = await Promise.all([
        query<{ IDref_fini_colori: number; reference: string | null }>(
          `SELECT IDref_fini_colori, reference FROM ref_fini_colori WHERE IDref_fini_colori IN (${colorisIds.join(',')})`,
        ),
        query<{ IDcolori_ecru: number; reference: string | null }>(
          `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDcolori_ecru IN (${colorisIds.join(',')})`,
        ),
      ])
      for (const c of await fixEncoding(finiC, 'ref_fini_colori', 'IDref_fini_colori', ['reference']))
        colorisFiniMap.set(c.IDref_fini_colori, c.reference ?? '')
      for (const c of await fixEncoding(ecruC, 'colori_ecru', 'IDcolori_ecru', ['reference']))
        colorisEcruMap.set(c.IDcolori_ecru, c.reference ?? '')
    }
    function resolveColoris(IDcoloris: number, typeKind: number): string {
      if (IDcoloris <= 0) return ''
      if (typeKind === 2) return colorisFiniMap.get(IDcoloris) ?? colorisEcruMap.get(IDcoloris) ?? ''
      return colorisEcruMap.get(IDcoloris) ?? colorisFiniMap.get(IDcoloris) ?? ''
    }

    // Pieces aggregates per line. The line price math works off these:
    // - `total_kg_ecru_lie` is the sum of poids over écru rolls affected to
    //   the line — multiplied by `prix` it yields the actual € total
    //   (qty × prix is treated as a *nominal* projection, not the bill).
    // - `total_metrage_fini_recu` is the running metrage of dyed rolls
    //   received back, surfaced so the user can see how much of the order
    //   has actually returned.
    const lineIds = fixedLignes.map((l) => Number(l.IDligne_commande_sous_traitant)).filter((x) => x > 0)
    interface LineAgg {
      nb_ecru_lies: number
      total_kg_ecru_lie: number
      nb_fini_recu: number
      total_metrage_fini_recu: number
    }
    const newAgg = (): LineAgg => ({ nb_ecru_lies: 0, total_kg_ecru_lie: 0, nb_fini_recu: 0, total_metrage_fini_recu: 0 })
    const piecesByLine = new Map<number, LineAgg>()
    if (lineIds.length > 0) {
      const [ecruRows, finiRows] = await Promise.all([
        query<{ IDref_commande_affectation: number; poids: number | null }>(
          `SELECT IDref_commande_affectation, poids
           FROM stock_ecru
           WHERE IDref_commande_affectation IN (${lineIds.join(',')})`,
        ),
        query<{ IDref_commande_source: number; metrage: number | null }>(
          `SELECT IDref_commande_source, metrage
           FROM stock_fini
           WHERE IDref_commande_source IN (${lineIds.join(',')})`,
        ),
      ])
      for (const r of ecruRows) {
        const lid = Number(r.IDref_commande_affectation) || 0
        if (lid === 0) continue
        const acc = piecesByLine.get(lid) ?? newAgg()
        acc.nb_ecru_lies += 1
        acc.total_kg_ecru_lie += Number(r.poids) || 0
        piecesByLine.set(lid, acc)
      }
      for (const r of finiRows) {
        const lid = Number(r.IDref_commande_source) || 0
        if (lid === 0) continue
        const acc = piecesByLine.get(lid) ?? newAgg()
        acc.nb_fini_recu += 1
        acc.total_metrage_fini_recu += Number(r.metrage) || 0
        piecesByLine.set(lid, acc)
      }
    }

    const lignesEnriched = fixedLignes.map((l) => {
      const refId = Number(l.IDreference) || 0
      const colId = Number(l.IDColoris) || 0
      const typeKind = Number((l as any).type_kind) || 0
      const resolved = resolveRef(refId, typeKind)
      const agg = piecesByLine.get(Number(l.IDligne_commande_sous_traitant)) ?? newAgg()
      const refRendement = resolved.kind === 'fini' ? (finiRendementMap.get(refId) ?? 0) : 0
      return {
        ...l,
        ref_label: resolved.label || null,
        ref_kind: resolved.kind,
        ref_rendement: refRendement,
        colori_reference: resolveColoris(colId, typeKind) || null,
        ...agg,
      }
    })

    // Whether this commande's sous-traitant has any tariff catalog rows.
    // Drives the frontend's "lock prix input" affordance: only suppliers
    // present in `tranche_tarif_ennoblissement` get the auto-pricing
    // read-only treatment. Suppliers like FRANCE TEINTURE (no catalog)
    // keep manual prix entry. The flag is per-commande, not per-line,
    // because IDsous_traitant is set once at commande creation.
    const autoPricingEnabled = await hasTariffData(Number(header.IDsous_traitant) || 0)
    const phase = await computePhase(id, Number(header.est_soldee) || 0)

    res.json({
      ...header,
      sous_traitant_nom: sousTraitantNom,
      sous_traitant_tel: sousTraitantTel,
      sous_traitant_type: sousTraitantType,
      sous_traitant_IDtype_sst: sousTraitantIDtypeSst,
      adresse_sous_traitant: fixedAdresseSt[0] ?? null,
      adresse_livraison: fixedAdresseLiv[0] ?? null,
      lignes: lignesEnriched,
      auto_pricing_enabled: autoPricingEnabled,
      phase,
    })
  } catch (err) {
    console.error('Error fetching commande-sous-traitant detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── PDF + email helpers ─────────────────────────────────

function formatHfsqlDateFr(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw)
  if (/^\d{8}$/.test(s)) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
  return ''
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

function cleanAddress(a: any | null) {
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

export async function buildCommandePdfData(id: number): Promise<CommandeSoustraitantPdfData | null> {
  const rows = await query<CommandeSousTraitantHeader>(
    `SELECT * FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${id}`,
  )
  if (rows.length === 0) return null
  const fixedHeader = await fixEncoding(
    rows,
    'commande_sous_traitant',
    'IDcommande_sous_traitant',
    ['commentaire', 'journal'],
  )
  const header = fixedHeader[0] as any
  if (header) header.commentaire = stripRtf(header.commentaire) || null

  const [stRows, adresseStRows, adresseLivRows, lignes] = await Promise.all([
    query<{ IDsous_traitant: number; nom: unknown }>(
      `SELECT IDsous_traitant, CONVERT(nom USING 'UTF-8') AS nom FROM sous_traitant WHERE IDsous_traitant = ${n(header.IDsous_traitant)}`,
    ),
    header.IDadresse_sous_traitant
      ? query(`SELECT * FROM adresse WHERE IDadresse = ${n(header.IDadresse_sous_traitant)}`)
      : Promise.resolve([]),
    header.IDadresse_livraison
      ? query(`SELECT * FROM adresse WHERE IDadresse = ${n(header.IDadresse_livraison)}`)
      : Promise.resolve([]),
    query(
      // type aliased — see detail endpoint comment on the HFSQL reserved-word
      // quirk that uppercases `type` otherwise.
      `SELECT lcs.IDligne_commande_sous_traitant, lcs.type AS type_kind, lcs.IDreference,
              lcs.IDColoris, lcs.quantite, lcs.unite, lcs.prix, lcs.date_livraison, lcs.date_delai
       FROM ligne_commande_sous_traitant lcs
       WHERE lcs.IDcommande_sous_traitant = ${id}
       ORDER BY lcs.IDligne_commande_sous_traitant`,
    ),
  ])
  const decode = (v: unknown): string | null => {
    if (v instanceof ArrayBuffer) return Buffer.from(v).toString('utf8')
    if (typeof v === 'string') return v
    return null
  }
  const sousTraitantNom = decode((stRows[0] as any)?.nom) ?? ''

  const fixedAdresseSt = await fixEncoding(adresseStRows, 'adresse', 'IDadresse', [
    'nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays',
  ])
  const fixedAdresseLiv = await fixEncoding(adresseLivRows, 'adresse', 'IDadresse', [
    'nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays',
  ])
  const fixedLignes = lignes as any[]

  // Per-line attached écru weight — needed to compute the actual € total
  // on the bon de commande (Ml × €/Kg is unitless garbage, see the line
  // card refactor on the screen).
  const lineIdsForKg = fixedLignes.map((l) => Number(l.IDligne_commande_sous_traitant)).filter((x) => x > 0)
  const kgByLine = new Map<number, number>()
  if (lineIdsForKg.length > 0) {
    const ecruWeights = await query<{ IDref_commande_affectation: number; poids: number | null }>(
      `SELECT IDref_commande_affectation, poids FROM stock_ecru
       WHERE IDref_commande_affectation IN (${lineIdsForKg.join(',')})`,
    )
    for (const e of ecruWeights) {
      const lid = Number(e.IDref_commande_affectation) || 0
      if (lid === 0) continue
      kgByLine.set(lid, (kgByLine.get(lid) ?? 0) + (Number(e.poids) || 0))
    }
  }

  // Type-aware ref label resolution — see the detail endpoint for the
  // reasoning. Same pattern: build all 3 maps, pick by `type_kind`.
  const refIds = Array.from(new Set(fixedLignes.map((l) => Number(l.IDreference) || 0).filter((x) => x > 0)))
  const colorisIds = Array.from(new Set(fixedLignes.map((l) => Number(l.IDColoris) || 0).filter((x) => x > 0)))
  const ecruMap = new Map<number, string>()
  const finiMap = new Map<number, string>()
  const filMap = new Map<number, string>()
  const colorisFiniMap = new Map<number, string>()
  const colorisEcruMap = new Map<number, string>()
  // Per-fini extras for the PDF: cosmetic + technical specs + IDref_ecru
  // pointer so we can pull the "article initial" block (designation +
  // composition) once we know which ref_ecru each line maps to.
  interface FiniExtra {
    designation: string | null
    conditionnement: string | null
    poids_Moy: number | null
    laizeHT_Moy: number | null
    rendement: number | null
    IDref_ecru: number
  }
  const finiExtrasMap = new Map<number, FiniExtra>()
  if (refIds.length > 0) {
    const [ecru, fini, fil] = await Promise.all([
      query<{ IDref_ecru: number; reference: string | null }>(
        `SELECT IDref_ecru, reference FROM ref_ecru WHERE IDref_ecru IN (${refIds.join(',')})`,
      ),
      query<{
        IDref_fini: number
        reference: string | null
        designation: string | null
        conditionnement: string | null
        poids_Moy: number | null
        laizeHT_Moy: number | null
        rendement: number | null
        IDref_ecru: number | null
      }>(
        `SELECT IDref_fini, reference, designation, conditionnement,
                poids_Moy, laizeHT_Moy, rendement, IDref_ecru
         FROM ref_fini WHERE IDref_fini IN (${refIds.join(',')})`,
      ),
      query<{ IDref_fil: number; reference: string | null }>(
        `SELECT IDref_fil, reference FROM ref_fil WHERE IDref_fil IN (${refIds.join(',')})`,
      ),
    ])
    for (const r of await fixEncoding(ecru, 'ref_ecru', 'IDref_ecru', ['reference']))
      ecruMap.set(r.IDref_ecru, r.reference ?? '')
    for (const r of await fixEncoding(fini, 'ref_fini', 'IDref_fini', ['reference', 'designation', 'conditionnement'])) {
      finiMap.set(r.IDref_fini, r.reference ?? '')
      finiExtrasMap.set(r.IDref_fini, {
        designation: (r.designation ?? null) || null,
        conditionnement: (r.conditionnement ?? null) || null,
        poids_Moy: r.poids_Moy == null ? null : Number(r.poids_Moy),
        laizeHT_Moy: r.laizeHT_Moy == null ? null : Number(r.laizeHT_Moy),
        rendement: r.rendement == null ? null : Number(r.rendement),
        IDref_ecru: Number(r.IDref_ecru) || 0,
      })
    }
    for (const r of await fixEncoding(fil, 'ref_fil', 'IDref_fil', ['reference']))
      filMap.set(r.IDref_fil, r.reference ?? '')
  }

  // Per-fini treatment list. Single batch query; we group by IDref_fini and
  // preserve traitement.ordre. Drives the "Préfixation - Adoucissage - Rame"
  // subscript line in the PDF.
  const treatmentsByFini = new Map<number, string[]>()
  if (refIds.length > 0) {
    const trtRows = await query<{ IDref_fini: number; IDtraitement: number; designation: string | null; ordre: number | null }>(
      `SELECT trf.IDref_fini, t.IDtraitement, t.designation, t.ordre
       FROM traitement_ref_fini trf
       JOIN traitement t ON t.IDtraitement = trf.IDtraitement
       WHERE trf.IDref_fini IN (${refIds.join(',')})
         AND (t.is_deleted = 0 OR t.is_deleted IS NULL)`,
    )
    const trtFixed = await fixEncoding(trtRows, 'traitement', 'IDtraitement', ['designation'])
    interface TrtEntry { ordre: number; designation: string }
    const buckets = new Map<number, TrtEntry[]>()
    for (const r of trtFixed as any[]) {
      const fid = Number(r.IDref_fini) || 0
      const designation = (r.designation ?? '').trim()
      if (fid === 0 || !designation) continue
      const arr = buckets.get(fid) ?? []
      arr.push({ ordre: Number(r.ordre) || 0, designation })
      buckets.set(fid, arr)
    }
    for (const [fid, arr] of buckets) {
      arr.sort((a, b) => a.ordre - b.ordre)
      treatmentsByFini.set(fid, arr.map((e) => e.designation))
    }
  }

  // ref_ecru extras (designation + composition) keyed by IDref_ecru. We
  // gather IDs from both directly-referenced écru lines (type=0) and the
  // IDref_ecru pointer on each fini we just fetched.
  interface EcruExtra {
    reference: string | null
    designation: string | null
    composition: string | null
  }
  const ecruExtrasMap = new Map<number, EcruExtra>()
  const ecruExtraIds = new Set<number>()
  for (const extra of finiExtrasMap.values()) {
    if (extra.IDref_ecru > 0) ecruExtraIds.add(extra.IDref_ecru)
  }
  for (const l of fixedLignes) {
    const tk = Number((l as any).type_kind) || 0
    const rid = Number(l.IDreference) || 0
    if (tk === 0 && rid > 0) ecruExtraIds.add(rid)
  }
  if (ecruExtraIds.size > 0) {
    const ecruExtraRows = await query<{ IDref_ecru: number; reference: string | null; designation: string | null; composition: string | null }>(
      `SELECT IDref_ecru, reference, designation, composition FROM ref_ecru
       WHERE IDref_ecru IN (${Array.from(ecruExtraIds).join(',')})`,
    )
    const fixedEcru = await fixEncoding(ecruExtraRows, 'ref_ecru', 'IDref_ecru', ['reference', 'designation', 'composition'])
    for (const r of fixedEcru as any[]) {
      ecruExtrasMap.set(Number(r.IDref_ecru), {
        reference: (r.reference ?? null) || null,
        designation: (r.designation ?? null) || null,
        composition: (r.composition ?? null) || null,
      })
    }
  }

  // Attached écru rolls per line — Stock à mettre en oeuvre. Single batch
  // SELECT scoped to the lines on this commande; group by line id.
  const piecesByLine = new Map<number, Array<{ numero: string | null; poids_kg: number | null; metrage_m: number | null; observations: string | null }>>()
  if (lineIdsForKg.length > 0) {
    const pieceRows = await query<{
      IDref_commande_affectation: number
      numero: string | null
      lot: string | null
      poids: number | null
      metrage: number | null
      observations: string | null
    }>(
      `SELECT IDref_commande_affectation, numero, lot, poids, metrage, observations
       FROM stock_ecru
       WHERE IDref_commande_affectation IN (${lineIdsForKg.join(',')})
       ORDER BY numero, lot`,
    )
    const piecesFixed = await fixEncoding(pieceRows, 'stock_ecru', 'IDstock_ecru', ['numero', 'lot', 'observations'])
    for (const p of piecesFixed as any[]) {
      const lid = Number(p.IDref_commande_affectation) || 0
      if (lid === 0) continue
      const arr = piecesByLine.get(lid) ?? []
      const numero = (p.numero ?? '').toString().trim() || null
      const obs = (p.observations ?? null) ? String(p.observations).trim() || null : null
      arr.push({
        numero,
        poids_kg: p.poids == null ? null : Number(p.poids),
        metrage_m: p.metrage == null ? null : Number(p.metrage),
        observations: obs,
      })
      piecesByLine.set(lid, arr)
    }
  }
  function resolveRef(IDref: number, typeKind: number): string {
    if (IDref <= 0) return ''
    const tryFini = () => finiMap.get(IDref)
    const tryEcru = () => ecruMap.get(IDref)
    const tryFil = () => filMap.get(IDref)
    let order: Array<() => string | undefined>
    if (typeKind === 2) order = [tryFini, tryEcru, tryFil]
    else if (typeKind === 1) order = [tryFil, tryEcru, tryFini]
    else order = [tryEcru, tryFini, tryFil]
    for (const fn of order) {
      const hit = fn()
      if (hit !== undefined) return hit
    }
    return ''
  }
  if (colorisIds.length > 0) {
    const [finiC, ecruC] = await Promise.all([
      query<{ IDref_fini_colori: number; reference: string | null }>(
        `SELECT IDref_fini_colori, reference FROM ref_fini_colori WHERE IDref_fini_colori IN (${colorisIds.join(',')})`,
      ),
      query<{ IDcolori_ecru: number; reference: string | null }>(
        `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDcolori_ecru IN (${colorisIds.join(',')})`,
      ),
    ])
    for (const c of await fixEncoding(finiC, 'ref_fini_colori', 'IDref_fini_colori', ['reference']))
      colorisFiniMap.set(c.IDref_fini_colori, c.reference ?? '')
    for (const c of await fixEncoding(ecruC, 'colori_ecru', 'IDcolori_ecru', ['reference']))
      colorisEcruMap.set(c.IDcolori_ecru, c.reference ?? '')
  }
  function resolveColoris(IDcoloris: number, typeKind: number): string {
    if (IDcoloris <= 0) return ''
    if (typeKind === 2) return colorisFiniMap.get(IDcoloris) ?? colorisEcruMap.get(IDcoloris) ?? ''
    return colorisEcruMap.get(IDcoloris) ?? colorisFiniMap.get(IDcoloris) ?? ''
  }

  const earliestDelivery = (fixedLignes
    .map((l) => (typeof l.date_livraison === 'string' ? l.date_livraison : ''))
    .filter((s: string) => /^\d{8}$/.test(s)) as string[])
    .sort()[0] ?? null

  return {
    numero: String(header.IDcommande_sous_traitant),
    dateCommande: formatHfsqlDateLongFr(header.date_commande),
    sousTraitantNom: sousTraitantNom || '—',
    sousTraitantAdresse: cleanAddress(fixedAdresseSt[0] as any),
    adresseLivraison: cleanAddress(fixedAdresseLiv[0] as any),
    delaiLivraison: earliestDelivery ? formatHfsqlDateLongFr(earliestDelivery) : null,
    commentaire: (header.commentaire ?? null) as string | null,
    lignes: fixedLignes.map((l) => {
      const refId = Number(l.IDreference) || 0
      const colId = Number(l.IDColoris) || 0
      const typeKind = Number(l.type_kind) || 0
      const lid = Number(l.IDligne_commande_sous_traitant) || 0
      const dl = formatHfsqlDateFr(l.date_livraison) || null
      const ddRaw = typeof l.date_delai === 'string' ? l.date_delai : ''
      const dd = formatHfsqlDateFr(ddRaw) || null

      // Pull the fini extras (only meaningful for type=2 ennoblisseur
      // lines, but we attempt for all and the maps just miss for non-fini).
      const finiExtra = typeKind === 2 ? finiExtrasMap.get(refId) : null

      // Resolve the écru pointed to by the fini (article initial). For
      // ecru lines (type=0), the line's own IDreference IS the écru.
      const ecruId = finiExtra?.IDref_ecru || (typeKind === 0 ? refId : 0)
      const ecruExtra = ecruId > 0 ? ecruExtrasMap.get(ecruId) : null

      return {
        ref_label: resolveRef(refId, typeKind) || null,
        colori_reference: resolveColoris(colId, typeKind) || null,
        ref_designation: finiExtra?.designation ?? null,
        ref_presentation: derivePresentation(finiExtra?.conditionnement ?? null),
        traitements: treatmentsByFini.get(refId) ?? [],
        poids_gm2: finiExtra?.poids_Moy ?? null,
        laize_cm: finiExtra?.laizeHT_Moy ?? null,
        rendement_ml_kg: finiExtra?.rendement ?? null,
        ecru_label: buildEcruLabel(ecruExtra),
        quantite: l.quantite == null ? null : Number(l.quantite),
        prix: l.prix == null ? null : Number(l.prix),
        total_kg_ecru_lie: kgByLine.get(lid) ?? 0,
        date_livraison: dl,
        date_delai: dd && dl && dd !== dl ? dd : null,
        pieces: piecesByLine.get(lid) ?? [],
      }
    }),
  }
}

// "OUVERT AU LARGE" / "TUBULAIRE" / "PLIÉ" distilled from the long
// ref_fini.conditionnement free-text (multi-line description). Returns
// null when no recognized keyword is present so the PDF skips the row
// entirely.
function derivePresentation(conditionnement: string | null): string | null {
  if (!conditionnement) return null
  const s = conditionnement.toLowerCase()
  if (s.includes('au large')) return 'OUVERT AU LARGE'
  if (s.includes('tubulaire')) return 'TUBULAIRE'
  if (s.includes('plié') || s.includes('plie ')) return 'PLIÉ'
  return null
}

function buildEcruLabel(e: { reference: string | null; designation: string | null; composition: string | null } | null | undefined): string | null {
  if (!e) return null
  const parts: string[] = []
  if (e.reference) parts.push(e.reference)
  // The legacy report renders "ARTICLE INITIAL : DF85/55 - ecru : <desc>" —
  // we keep the "ecru" hint inline so the bilingual row reads cleanly.
  if (e.designation) parts.push(`écru : ${e.designation}`)
  else parts.push('écru')
  if (e.composition) parts.push(e.composition)
  return parts.join(' — ')
}

async function renderCommandePdfBuffer(data: CommandeSoustraitantPdfData): Promise<Buffer> {
  return renderToBuffer(
    React.createElement(CommandeSoustraitantPdf, { data }) as unknown as React.ReactElement<
      import('@react-pdf/renderer').DocumentProps
    >,
  )
}

commandesSousTraitantRouter.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const data = await buildCommandePdfData(id)
    if (!data) { res.status(404).json({ error: 'Commande not found' }); return }

    const buffer = await renderCommandePdfBuffer(data)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="commande-sous-traitant-${data.numero}.pdf"`,
    )
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.send(buffer)
  } catch (err) {
    console.error('Error rendering commande-sous-traitant PDF:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Email defaults + send ────────────────────────────────

interface EmailRecipientPayload {
  email: string
  name?: string
  source: 'contact'
  contactId: number
}

interface EmailDefaultsPayload {
  recipients: { selected: EmailRecipientPayload[]; suggestions: EmailRecipientPayload[] }
  subject: string
  body: string
  sousTraitantNom: string
  numero: string
}

async function buildEmailDefaults(id: number): Promise<EmailDefaultsPayload | null> {
  const rows = await query<{ IDsous_traitant: number }>(
    `SELECT IDsous_traitant FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${id}`,
  )
  if (rows.length === 0) return null
  const idSt = n((rows[0] as any).IDsous_traitant)

  const [stRows, contactRows] = await Promise.all([
    query<{ IDsous_traitant: number; nom: unknown }>(
      `SELECT IDsous_traitant, CONVERT(nom USING 'UTF-8') AS nom FROM sous_traitant WHERE IDsous_traitant = ${idSt}`,
    ),
    query<{
      IDcontact: number
      nom: string | null
      prenom: string | null
      mail: string | null
      envoi_commande: number | null
      est_visible: number | null
    }>(
      `SELECT IDcontact, nom, prenom, mail, envoi_commande, est_visible
       FROM contact
       WHERE IDsous_traitant = ${idSt}`,
    ),
  ])
  const decode = (v: unknown): string | null => {
    if (v instanceof ArrayBuffer) return Buffer.from(v).toString('utf8')
    if (typeof v === 'string') return v
    return null
  }
  const sousTraitantNom = decode((stRows[0] as any)?.nom) ?? ''
  const fixedContacts = await fixEncoding(contactRows, 'contact', 'IDcontact', ['nom', 'prenom', 'mail'])

  const selected: EmailRecipientPayload[] = []
  const suggestions: EmailRecipientPayload[] = []
  const seen = new Set<string>()
  for (const c of fixedContacts as any[]) {
    if (c.est_visible === 0) continue
    const raw = (c.mail ?? '').toString().trim()
    if (!raw) continue
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) continue
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const displayName = [c.prenom, c.nom]
      .map((s: string | null) => (s ?? '').toString().trim())
      .filter((s: string) => s.length > 0)
      .join(' ')
    const recipient: EmailRecipientPayload = {
      email: raw,
      source: 'contact',
      contactId: n(c.IDcontact),
    }
    if (displayName) recipient.name = displayName
    if (c.envoi_commande === 1) selected.push(recipient)
    else suggestions.push(recipient)
  }

  const numero = String(id)
  const subject = `Bon de commande sous-traitant N°${numero} — ETS Malterre`
  const body =
    `Bonjour,\n\n` +
    `Veuillez trouver ci-joint notre bon de commande N°${numero}${sousTraitantNom ? ` à destination de ${sousTraitantNom}` : ''}.\n\n` +
    `Merci de bien vouloir nous confirmer la bonne réception de cette commande.\n\n` +
    `Cordialement,\n` +
    `ETS Malterre`

  return { recipients: { selected, suggestions }, subject, body, sousTraitantNom, numero }
}

commandesSousTraitantRouter.get('/:id/email-defaults', async (req: Request, res: Response) => {
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
})

commandesSousTraitantRouter.post('/:id/email', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    if (req.userId === undefined) { res.status(401).json({ error: 'not authenticated' }); return }

    const parsed = emailBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return
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

    const userRows = await query<{ prenom: string | null; nom: string | null }>(
      `SELECT prenom, nom FROM utilisateur WHERE IDutilisateur = ${req.userId}`,
    )
    const fixedUser = await fixEncoding(userRows, 'utilisateur', 'IDutilisateur', ['prenom', 'nom'])
    const u = (fixedUser[0] as any) ?? null
    const displayName = u
      ? [u.prenom, u.nom].filter((s: string | null) => s && s.trim()).map((s: string) => s.trim()).join(' ')
      : ''
    const fromName = displayName ? `${displayName} — ETS Malterre` : 'ETS Malterre'

    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
    if (parsed.data.attach_pdf !== false) {
      const data = await buildCommandePdfData(id)
      if (!data) { res.status(404).json({ error: 'Commande not found' }); return }
      const buffer = await renderCommandePdfBuffer(data)
      attachments.push({
        filename: `commande-sous-traitant-${data.numero}.pdf`,
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
    console.error('Error sending commande-sous-traitant email:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: 'send_failed', message })
  }
})

// ── Computed phase — replaces the binary "en cours / terminée" pill ───
//
// The legacy header status (`est_soldee` 0/1) only tells us whether the
// commande is open or closed. The actual workflow phase is much richer —
// the operator wants to see "Soumis au client" / "En reprise" / "En
// contrôle" / "En cours" at a glance. We derive that phase on read from:
//
//   - `est_soldee`                   → "terminée" (overrides everything)
//   - `stock_fini.IDetat_stock_fini` → "en reprise" / "en contrôle"
//   - `envoi_email.IDtype_doc=28`    → "soumis au client"
//
// Priority (top-down, first match wins): terminée > en_reprise > soumis
// > en_controle > en_cours. The phase is informational only — `est_soldee`
// remains the sole write gate (`refuseIfTerminee` is unchanged).

export type SstPhase = 'en_cours' | 'en_controle' | 'soumis' | 'en_reprise' | 'terminee'

/** Compute the phase for a single commande. Used by the detail endpoint. */
async function computePhase(commandeId: number, est_soldee: number): Promise<SstPhase> {
  if (est_soldee === 1) return 'terminee'

  // Reprise — any received roll currently flagged for redo.
  const reprise = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM stock_fini sf
     JOIN ligne_commande_sous_traitant lcs
       ON lcs.IDligne_commande_sous_traitant = sf.IDref_commande_source
     WHERE lcs.IDcommande_sous_traitant = ${commandeId}
       AND sf.IDetat_stock_fini = 2`,
  )
  if (Number(reprise[0]?.n) > 0) return 'en_reprise'

  // Soumis au client — at least one envoi_email row was logged for this
  // commande (TYPE_DOC_SOUMISSION_LOT_CLIENT = 15).
  const soumis = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM envoi_email
     WHERE IDtype_doc = ${TYPE_DOC_SOUMISSION_LOT_CLIENT}
       AND IDreference = ${commandeId}
       AND (invalidé = 0 OR invalidé IS NULL)`,
  )
  if (Number(soumis[0]?.n) > 0) return 'soumis'

  // En contrôle — at least one roll has been received.
  const reception = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM stock_fini sf
     JOIN ligne_commande_sous_traitant lcs
       ON lcs.IDligne_commande_sous_traitant = sf.IDref_commande_source
     WHERE lcs.IDcommande_sous_traitant = ${commandeId}`,
  )
  if (Number(reception[0]?.n) > 0) return 'en_controle'

  return 'en_cours'
}

/** Batched variant for the list endpoint — runs three flat IN-queries
 *  and merges signals in JS. Returns a Map<commandeId, phase>. */
async function computePhasesBatch(
  rows: Array<{ id: number; est_soldee: number }>,
): Promise<Map<number, SstPhase>> {
  const out = new Map<number, SstPhase>()
  if (rows.length === 0) return out

  const openIds: number[] = []
  for (const r of rows) {
    if (r.est_soldee === 1) {
      out.set(r.id, 'terminee')
    } else {
      openIds.push(r.id)
    }
  }
  if (openIds.length === 0) return out

  const idList = openIds.join(',')

  // 1) Reprise — group reprise rolls by commande.
  const repriseRows = await query<{ IDcommande_sous_traitant: number }>(
    `SELECT DISTINCT lcs.IDcommande_sous_traitant
     FROM stock_fini sf
     JOIN ligne_commande_sous_traitant lcs
       ON lcs.IDligne_commande_sous_traitant = sf.IDref_commande_source
     WHERE lcs.IDcommande_sous_traitant IN (${idList})
       AND sf.IDetat_stock_fini = 2`,
  )
  const repriseSet = new Set(repriseRows.map((r) => Number(r.IDcommande_sous_traitant)))

  // 2) Soumis au client.
  const soumisRows = await query<{ IDreference: number }>(
    `SELECT DISTINCT IDreference FROM envoi_email
     WHERE IDtype_doc = ${TYPE_DOC_SOUMISSION_LOT_CLIENT}
       AND IDreference IN (${idList})
       AND (invalidé = 0 OR invalidé IS NULL)`,
  )
  const soumisSet = new Set(soumisRows.map((r) => Number(r.IDreference)))

  // 3) Any reception at all.
  const receptionRows = await query<{ IDcommande_sous_traitant: number }>(
    `SELECT DISTINCT lcs.IDcommande_sous_traitant
     FROM stock_fini sf
     JOIN ligne_commande_sous_traitant lcs
       ON lcs.IDligne_commande_sous_traitant = sf.IDref_commande_source
     WHERE lcs.IDcommande_sous_traitant IN (${idList})`,
  )
  const receptionSet = new Set(receptionRows.map((r) => Number(r.IDcommande_sous_traitant)))

  for (const id of openIds) {
    if (repriseSet.has(id)) out.set(id, 'en_reprise')
    else if (soumisSet.has(id)) out.set(id, 'soumis')
    else if (receptionSet.has(id)) out.set(id, 'en_controle')
    else out.set(id, 'en_cours')
  }
  return out
}

// ── envoi_email logging — shared with the étude-coloris path ─────
//
// `envoi_email` is the legacy WinDev audit log of every recipient an email
// has been sent to. We use it server-side as the canonical "this commande
// has been soumis to the client" signal — the new computed phase reads
// from this table.
//
// The `IDtype_doc` values are a small global enum keyed off the legacy
// `type_doc` lookup. The sst Soumission-Lot-Client flow uses `15`
// (`type_doc.nom = 'soumission'`) to stay legacy-compatible — the
// WinDev app has been logging sst soumissions with this code since
// 2021 (3 279 rows of type=15 all reference a real commande_sous_-
// traitant, with `notes` carrying the lot identifier like "MA105741").
// We mirror the same convention on send so the legacy app can read our
// outgoing soumissions out of envoi_email alongside its own.
const TYPE_DOC_SOUMISSION_LOT_CLIENT = 15

function nowHfsqlDatetime(): string {
  const d = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.`
    + `${pad(d.getMilliseconds(), 3)}`
}

/** Insert one envoi_email row per recipient. Mirrors the helper in
 *  `etudes-coloris.ts` plus an optional `notes` field — the legacy
 *  sst-soumission convention stores the lot identifier there
 *  ("MA105741", "MA107896 (reprise)", …) so the WinDev app surfaces
 *  it in its UI. Failures are swallowed (logged) so the send response
 *  path isn't affected. */
async function logEnvoiEmails(
  idTypeDoc: number,
  idReference: number,
  recipients: string[],
  societe: string,
  notes: string = '',
): Promise<void> {
  if (recipients.length === 0) return
  const ts = nowHfsqlDatetime()
  const soc = esc(societe || '')
  const notesEsc = esc(notes || '')
  for (const raw of recipients) {
    const addr = esc(String(raw).trim())
    if (!addr) continue
    try {
      await query(
        `INSERT INTO envoi_email
           (DATE, adresse, société, IDreference, invalidé, notes, IDtype_doc)
         VALUES
           ('${ts}', '${addr}', '${soc}', ${idReference}, 0, '${notesEsc}', ${idTypeDoc})`,
      )
    } catch (e) {
      console.error(`envoi_email log failed (${idTypeDoc}/${idReference}/${addr}):`, (e as Error).message)
    }
  }
}

// ── Soumission Lot — feature ─────────────────────────────
//
// Eligibility: a sous-traitant commande can be "soumis au client" when at
// least one received fini roll (stock_fini back-linked via
// IDref_commande_source) is reserved to a client (stock_fini.IDligne_-
// commande_client → ligne_commande_client → commande_client.IDclient)
// AND that (IDclient, IDref_fini) tuple has a designation_client row with
// soumettre = 1 AND archivé = 0.
//
// Lot key: a single "lot" for the picker is the tuple
//   (IDref_fini, IDColoris, lot string, IDcommande_client)
// — we include IDcommande_client because the same physical batch can be
// split across distinct client orders and the soumission PDF has a single
// "N° Commande" cell.

interface EligibleLot {
  // Composite key parts (drive the PDF/email URL)
  IDref_fini: number
  IDColoris: number
  lot: string
  IDcommande_client: number
  // Resolved display fields
  IDclient: number
  client_nom: string
  ref_malterre: string         // ref_fini.reference
  client_designation: string   // designation_client.designation (= ref client)
  coloris_reference: string
  nb_rolls: number
  total_metrage: number
  // React-friendly key
  key: string
}

export async function findEligibleLots(commandeId: number): Promise<EligibleLot[]> {
  // 1) Lines belonging to this commande_sous_traitant.
  const lineRows = await query<{ IDligne_commande_sous_traitant: number }>(
    `SELECT IDligne_commande_sous_traitant FROM ligne_commande_sous_traitant
     WHERE IDcommande_sous_traitant = ${commandeId}`,
  )
  const lineIds = lineRows.map((r) => Number(r.IDligne_commande_sous_traitant)).filter((x) => x > 0)
  if (lineIds.length === 0) return []

  // 2) Fini rolls produced from those lines, with the client-order link.
  const finiRows = await query<{
    IDref_fini: number
    IDColoris: number
    lot: string | null
    IDligne_commande_client: number
    metrage: number | null
  }>(
    `SELECT IDref_fini, IDColoris, lot, IDligne_commande_client, metrage
     FROM stock_fini
     WHERE IDref_commande_source IN (${lineIds.join(',')})
       AND IDligne_commande_client > 0`,
  )
  const fixedFini = await fixEncoding(finiRows as any[], 'stock_fini', 'IDstock_fini', ['lot'])
  if (fixedFini.length === 0) return []

  // 3) Resolve IDligne_commande_client → IDcommande_client.
  const lccIds = Array.from(new Set(fixedFini.map((r: any) => n(r.IDligne_commande_client))))
    .filter((x) => x > 0)
  const lccToCc = new Map<number, number>()
  if (lccIds.length > 0) {
    const lccRows = await query<{ IDligne_commande_client: number; IDcommande_client: number }>(
      `SELECT IDligne_commande_client, IDcommande_client FROM ligne_commande_client
       WHERE IDligne_commande_client IN (${lccIds.join(',')})`,
    )
    for (const r of lccRows) lccToCc.set(n(r.IDligne_commande_client), n(r.IDcommande_client))
  }

  // 4) Resolve IDcommande_client → IDclient.
  const ccIds = Array.from(new Set(Array.from(lccToCc.values()))).filter((x) => x > 0)
  const ccToClient = new Map<number, number>()
  if (ccIds.length > 0) {
    const ccRows = await query<{ IDcommande_client: number; IDclient: number }>(
      `SELECT IDcommande_client, IDclient FROM commande_client
       WHERE IDcommande_client IN (${ccIds.join(',')})`,
    )
    for (const r of ccRows) ccToClient.set(n(r.IDcommande_client), n(r.IDclient))
  }

  // 5) Group rolls by (IDref_fini, IDColoris, lot, IDcommande_client) and
  //    aggregate nb_rolls + total_metrage. Skip rolls whose lot string is
  //    empty (defensive — those would group together meaninglessly).
  interface GroupAcc {
    IDref_fini: number
    IDColoris: number
    lot: string
    IDcommande_client: number
    IDclient: number
    nb_rolls: number
    total_metrage: number
  }
  const groups = new Map<string, GroupAcc>()
  for (const r of fixedFini as any[]) {
    const lot = (r.lot ?? '').toString().trim()
    if (!lot) continue
    const lccId = n(r.IDligne_commande_client)
    const ccId = lccToCc.get(lccId) ?? 0
    const clientId = ccToClient.get(ccId) ?? 0
    if (ccId === 0 || clientId === 0) continue
    const idRefFini = n(r.IDref_fini)
    const idColoris = n(r.IDColoris)
    const k = `${idRefFini}|${idColoris}|${lot}|${ccId}`
    const acc = groups.get(k) ?? {
      IDref_fini: idRefFini,
      IDColoris: idColoris,
      lot,
      IDcommande_client: ccId,
      IDclient: clientId,
      nb_rolls: 0,
      total_metrage: 0,
    }
    acc.nb_rolls += 1
    acc.total_metrage += Number(r.metrage) || 0
    groups.set(k, acc)
  }
  if (groups.size === 0) return []

  // 6) Filter by designation_client soumettre = 1 AND get the client's
  //    preferred reference label. Key the catalog map by `clientId|refFiniId`.
  const dcPairs = Array.from(groups.values()).map((g) => ({ c: g.IDclient, r: g.IDref_fini }))
  const uniqueClients = Array.from(new Set(dcPairs.map((p) => p.c)))
  const uniqueRefFini = Array.from(new Set(dcPairs.map((p) => p.r)))
  const dcMap = new Map<string, string>() // `${IDclient}|${IDref_fini}` → designation
  if (uniqueClients.length > 0 && uniqueRefFini.length > 0) {
    const dcRows = await query<{ IDclient: number; IDref_fini: number; designation: string | null }>(
      `SELECT IDclient, IDref_fini, designation FROM designation_client
       WHERE IDclient IN (${uniqueClients.join(',')})
         AND IDref_fini IN (${uniqueRefFini.join(',')})
         AND soumettre = 1
         AND archivé = 0`,
    )
    const dcFixed = await fixEncoding(dcRows as any[], 'designation_client', 'IDdesignation_client', ['designation'])
    for (const r of dcFixed as any[]) {
      dcMap.set(`${n(r.IDclient)}|${n(r.IDref_fini)}`, (r.designation ?? '').toString())
    }
  }

  // 7) Display lookups: ref_fini.reference, ref_fini_colori.reference,
  //    client.nom — all flat queries to avoid CONVERT-in-JOIN collapse.
  const refFiniMap = new Map<number, string>()
  if (uniqueRefFini.length > 0) {
    const rf = await query<{ IDref_fini: number; reference: string | null }>(
      `SELECT IDref_fini, reference FROM ref_fini WHERE IDref_fini IN (${uniqueRefFini.join(',')})`,
    )
    for (const r of await fixEncoding(rf as any[], 'ref_fini', 'IDref_fini', ['reference'])) {
      refFiniMap.set(n((r as any).IDref_fini), ((r as any).reference ?? '').toString())
    }
  }
  const uniqueColoris = Array.from(new Set(Array.from(groups.values()).map((g) => g.IDColoris).filter((x) => x > 0)))
  const colorisMap = new Map<number, string>()
  if (uniqueColoris.length > 0) {
    const rc = await query<{ IDref_fini_colori: number; reference: string | null }>(
      `SELECT IDref_fini_colori, reference FROM ref_fini_colori
       WHERE IDref_fini_colori IN (${uniqueColoris.join(',')})`,
    )
    for (const r of await fixEncoding(rc as any[], 'ref_fini_colori', 'IDref_fini_colori', ['reference'])) {
      colorisMap.set(n((r as any).IDref_fini_colori), ((r as any).reference ?? '').toString())
    }
  }
  const clientMap = new Map<number, string>()
  if (uniqueClients.length > 0) {
    const cl = await query<{ IDclient: number; nom: string | null }>(
      `SELECT IDclient, nom FROM client WHERE IDclient IN (${uniqueClients.join(',')})`,
    )
    for (const r of await fixEncoding(cl as any[], 'client', 'IDclient', ['nom'])) {
      clientMap.set(n((r as any).IDclient), ((r as any).nom ?? '').toString().trim())
    }
  }

  // 8) Assemble surviving groups (those with a designation_client.soumettre=1 row).
  const out: EligibleLot[] = []
  for (const g of groups.values()) {
    const dcKey = `${g.IDclient}|${g.IDref_fini}`
    const clientDesignation = dcMap.get(dcKey)
    if (clientDesignation === undefined) continue
    out.push({
      IDref_fini: g.IDref_fini,
      IDColoris: g.IDColoris,
      lot: g.lot,
      IDcommande_client: g.IDcommande_client,
      IDclient: g.IDclient,
      client_nom: clientMap.get(g.IDclient) || '',
      ref_malterre: refFiniMap.get(g.IDref_fini) || '',
      client_designation: clientDesignation,
      coloris_reference: colorisMap.get(g.IDColoris) || '',
      nb_rolls: g.nb_rolls,
      total_metrage: g.total_metrage,
      key: `${g.IDref_fini}|${g.IDColoris}|${g.lot}|${g.IDcommande_client}`,
    })
  }
  // Stable order: by client_nom then by lot
  out.sort((a, b) => a.client_nom.localeCompare(b.client_nom) || a.lot.localeCompare(b.lot))
  return out
}

// Long-form FR date formatter — reuses the existing FRENCH_MONTHS const
// declared above for the bon-de-commande PDF helpers.
function todayLongFr(): string {
  const d = new Date()
  return `${d.getDate()} ${FRENCH_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

interface SoumissionLotParams {
  IDref_fini: number
  IDColoris: number
  lot: string
  IDcommande_client: number
}

function parseSoumissionLotParams(q: any): SoumissionLotParams | null {
  const idRefFini = parseInt(String(q.ref_fini ?? ''), 10)
  const idColoris = parseInt(String(q.coloris ?? ''), 10)
  const idCommandeClient = parseInt(String(q.commande_client ?? ''), 10)
  const lot = String(q.lot ?? '').trim()
  if (!Number.isFinite(idRefFini) || idRefFini <= 0) return null
  if (!Number.isFinite(idColoris) || idColoris < 0) return null
  if (!Number.isFinite(idCommandeClient) || idCommandeClient <= 0) return null
  if (!lot) return null
  return { IDref_fini: idRefFini, IDColoris: idColoris, lot, IDcommande_client: idCommandeClient }
}

export async function buildSoumissionLotPdfData(
  commandeId: number,
  params: SoumissionLotParams,
  userId: number,
): Promise<SoumissionLotPdfData | null> {
  // 1) Verify the lot is eligible for THIS commande (defensive — also
  //    drops requests for lots not belonging to this commande).
  const eligible = await findEligibleLots(commandeId)
  const lot = eligible.find((l) =>
    l.IDref_fini === params.IDref_fini &&
    l.IDColoris === params.IDColoris &&
    l.lot === params.lot &&
    l.IDcommande_client === params.IDcommande_client,
  )
  if (!lot) return null

  // 2) commande_client row → date_commande, numero, ref_client, IDadresse_livraison.
  const ccRows = await query<{
    IDcommande_client: number
    numero: number | null
    date_commande: string | null
    ref_client: string | null
    IDadresse_livraison: number | null
  }>(
    `SELECT IDcommande_client, numero, date_commande, ref_client, IDadresse_livraison
     FROM commande_client WHERE IDcommande_client = ${lot.IDcommande_client}`,
  )
  const ccFixed = await fixEncoding(ccRows as any[], 'commande_client', 'IDcommande_client', ['ref_client'])
  const cc = (ccFixed[0] as any) ?? null

  // 3) Earliest ligne_commande_client.date_livraison for the lot's parent
  //    order (the legacy uses the line date, not the order date). Pick any
  //    ligne_commande_client of this commande_client (often there's only
  //    one); if multiple, take the earliest valid date.
  const lccRows = await query<{ date_livraison: string | null }>(
    `SELECT date_livraison FROM ligne_commande_client
     WHERE IDcommande_client = ${lot.IDcommande_client}`,
  )
  const dlValid = (lccRows
    .map((r) => (typeof r.date_livraison === 'string' ? r.date_livraison : ''))
    .filter((s: string) => /^\d{8}$/.test(s)) as string[]).sort()[0] ?? null

  // 4) Adresse de livraison.
  const idAdresse = n(cc?.IDadresse_livraison)
  let adresseLivraison: SoumissionLotPdfData['adresseLivraison'] = null
  if (idAdresse > 0) {
    const aRows = await query(
      `SELECT * FROM adresse WHERE IDadresse = ${idAdresse}`,
    )
    const aFixed = await fixEncoding(aRows as any[], 'adresse', 'IDadresse', [
      'nom', 'adresse1', 'adresse2', 'adresse3', 'ville', 'pays',
    ])
    adresseLivraison = cleanAddress(aFixed[0] as any)
  }

  // 5) Expéditeur — current user's prénom.
  const uRows = await query<{ prenom: string | null; nom: string | null }>(
    `SELECT prenom, nom FROM utilisateur WHERE IDutilisateur = ${userId}`,
  )
  const uFixed = await fixEncoding(uRows as any[], 'utilisateur', 'IDutilisateur', ['prenom', 'nom'])
  const expediteur = ((uFixed[0] as any)?.prenom ?? '').toString().trim() || 'ETS Malterre'

  // 6) Destinataire — client's contact with envoi_soumission = 1.
  const contactRows = await query<{
    IDcontact: number; nom: string | null; prenom: string | null; mail: string | null
  }>(
    `SELECT IDcontact, nom, prenom, mail FROM contact
     WHERE IDclient = ${lot.IDclient}
       AND envoi_soumission = 1
       AND est_visible = 1`,
  )
  const cFixed = await fixEncoding(contactRows as any[], 'contact', 'IDcontact', ['nom', 'prenom', 'mail'])
  const firstContact = (cFixed[0] as any) ?? null
  const destinataire = firstContact
    ? [firstContact.prenom, firstContact.nom]
        .map((s: string | null) => (s ?? '').toString().trim())
        .filter((s: string) => s.length > 0)
        .join(' ')
    : ''

  return {
    numeroCommande: cc?.numero != null ? String(cc.numero) : '',
    dateSoumission: todayLongFr(),
    dateCommande: cc?.date_commande ? formatHfsqlDateFr(cc.date_commande) : '',
    dateLivraison: dlValid ? formatHfsqlDateFr(dlValid) : '',
    refCommandeClient: (cc?.ref_client ?? '').toString().trim(),
    quantiteMl: lot.total_metrage,
    clientNom: lot.client_nom,
    refClient: lot.client_designation,
    refMalterre: lot.ref_malterre,
    coloris: lot.coloris_reference,
    adresseLivraison,
    expediteur,
    destinataire,
    lot: lot.lot,
  }
}

async function renderSoumissionLotPdfBuffer(data: SoumissionLotPdfData): Promise<Buffer> {
  return renderToBuffer(
    React.createElement(SoumissionLotPdf, { data }) as unknown as React.ReactElement<
      import('@react-pdf/renderer').DocumentProps
    >,
  )
}

// ── Soumission: eligibility list ─────────────────────────

commandesSousTraitantRouter.get('/:id/soumission/lots-eligibles', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const lots = await findEligibleLots(id)
    res.json({ lots })
  } catch (err) {
    console.error('Error fetching eligible soumission lots:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Soumission: PDF preview / download ───────────────────

commandesSousTraitantRouter.get('/:id/soumission/pdf', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    if (req.userId === undefined) { res.status(401).json({ error: 'not authenticated' }); return }

    const params = parseSoumissionLotParams(req.query)
    if (!params) { res.status(400).json({ error: 'Missing or invalid lot params' }); return }

    const data = await buildSoumissionLotPdfData(id, params, req.userId)
    if (!data) { res.status(404).json({ error: 'Lot not eligible for this commande' }); return }

    const buffer = await renderSoumissionLotPdfBuffer(data)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="soumission-lot-${data.lot.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf"`,
    )
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.send(buffer)
  } catch (err) {
    console.error('Error rendering soumission lot PDF:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Soumission: email defaults ───────────────────────────

async function buildSoumissionEmailDefaults(
  commandeId: number,
  params: SoumissionLotParams,
): Promise<EmailDefaultsPayload | null> {
  const eligible = await findEligibleLots(commandeId)
  const lot = eligible.find((l) =>
    l.IDref_fini === params.IDref_fini &&
    l.IDColoris === params.IDColoris &&
    l.lot === params.lot &&
    l.IDcommande_client === params.IDcommande_client,
  )
  if (!lot) return null

  // Client contacts. Pre-select envoi_soumission=1 contacts; everything
  // else with a valid email goes into suggestions.
  const contactRows = await query<{
    IDcontact: number; nom: string | null; prenom: string | null; mail: string | null;
    envoi_soumission: number | null; est_visible: number | null
  }>(
    `SELECT IDcontact, nom, prenom, mail, envoi_soumission, est_visible
     FROM contact WHERE IDclient = ${lot.IDclient}`,
  )
  const fixedContacts = await fixEncoding(contactRows as any[], 'contact', 'IDcontact', ['nom', 'prenom', 'mail'])

  const selected: EmailRecipientPayload[] = []
  const suggestions: EmailRecipientPayload[] = []
  const seen = new Set<string>()
  for (const c of fixedContacts as any[]) {
    if (c.est_visible === 0) continue
    const raw = (c.mail ?? '').toString().trim()
    if (!raw) continue
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) continue
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const displayName = [c.prenom, c.nom]
      .map((s: string | null) => (s ?? '').toString().trim())
      .filter((s: string) => s.length > 0)
      .join(' ')
    const recipient: EmailRecipientPayload = {
      email: raw,
      source: 'contact',
      contactId: n(c.IDcontact),
    }
    if (displayName) recipient.name = displayName
    if (c.envoi_soumission === 1) selected.push(recipient)
    else suggestions.push(recipient)
  }

  const subject = `Soumission Lot ${lot.lot} — ${lot.ref_malterre}${lot.coloris_reference ? ` · ${lot.coloris_reference}` : ''}`
  const body =
    `Bonjour,\n\n` +
    `Veuillez trouver ci-joint la soumission du lot ${lot.lot} pour la référence ${lot.client_designation || lot.ref_malterre}${lot.coloris_reference ? ` (coloris ${lot.coloris_reference})` : ''}.\n\n` +
    `Un échantillon est joint au document imprimé.\n\n` +
    `Cordialement,\n` +
    `ETS Malterre`

  return {
    recipients: { selected, suggestions },
    subject,
    body,
    sousTraitantNom: lot.client_nom, // reuse the field — the email dialog displays it as contextLabel
    numero: lot.lot,
  }
}

commandesSousTraitantRouter.get('/:id/soumission/email-defaults', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const params = parseSoumissionLotParams(req.query)
    if (!params) { res.status(400).json({ error: 'Missing or invalid lot params' }); return }
    const defaults = await buildSoumissionEmailDefaults(id, params)
    if (!defaults) { res.status(404).json({ error: 'Lot not eligible for this commande' }); return }
    res.json(defaults)
  } catch (err) {
    console.error('Error building soumission email defaults:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Soumission: send email + attach PDF ──────────────────

const soumissionEmailBody = z.object({
  to: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
  attach_pdf: z.boolean().optional(),
  extra_attachments: z.array(extraAttachmentSchema).optional(),
  // Lot params travel in the body so the server can rebuild the right PDF.
  ref_fini: z.number().int().positive(),
  coloris: z.number().int().nonnegative(),
  lot: z.string().min(1).max(200),
  commande_client: z.number().int().positive(),
})

commandesSousTraitantRouter.post('/:id/soumission/email', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    if (req.userId === undefined) { res.status(401).json({ error: 'not authenticated' }); return }

    const parsed = soumissionEmailBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return
    }
    const lotParams: SoumissionLotParams = {
      IDref_fini: parsed.data.ref_fini,
      IDColoris: parsed.data.coloris,
      lot: parsed.data.lot,
      IDcommande_client: parsed.data.commande_client,
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

    const userRows = await query<{ prenom: string | null; nom: string | null }>(
      `SELECT prenom, nom FROM utilisateur WHERE IDutilisateur = ${req.userId}`,
    )
    const fixedUser = await fixEncoding(userRows, 'utilisateur', 'IDutilisateur', ['prenom', 'nom'])
    const u = (fixedUser[0] as any) ?? null
    const displayName = u
      ? [u.prenom, u.nom].filter((s: string | null) => s && s.trim()).map((s: string) => s.trim()).join(' ')
      : ''
    const fromName = displayName ? `${displayName} — ETS Malterre` : 'ETS Malterre'

    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
    if (parsed.data.attach_pdf !== false) {
      const data = await buildSoumissionLotPdfData(id, lotParams, req.userId)
      if (!data) { res.status(404).json({ error: 'Lot not eligible for this commande' }); return }
      const buffer = await renderSoumissionLotPdfBuffer(data)
      attachments.push({
        filename: `soumission-lot-${data.lot.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
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

    // Audit: log one envoi_email row per recipient (to+cc). The legacy
    // WinDev app reads from this same table — by using IDtype_doc=15
    // and storing the lot identifier in `notes` we stay compatible
    // with what the legacy UI surfaces. The computed phase also reads
    // type=15 rows for this commande to derive "Soumis au client".
    const allRecipients = [...parsed.data.to, ...(parsed.data.cc ?? [])]
    let societe = ''
    try {
      const eligible = await findEligibleLots(id)
      const lot = eligible.find((l) =>
        l.IDref_fini === lotParams.IDref_fini &&
        l.IDColoris === lotParams.IDColoris &&
        l.lot === lotParams.lot &&
        l.IDcommande_client === lotParams.IDcommande_client,
      )
      societe = lot?.client_nom ?? ''
    } catch {
      // Audit field is informational; fall back to empty.
    }
    await logEnvoiEmails(
      TYPE_DOC_SOUMISSION_LOT_CLIENT,
      id,
      allRecipients,
      societe,
      lotParams.lot, // notes — lot identifier (legacy convention)
    )

    res.json({ ok: true, messageId })
  } catch (err) {
    console.error('Error sending soumission lot email:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: 'send_failed', message })
  }
})

// ── Historique — activity timeline for the right sidebar ─────
//
// Surfaces every envoi_email row whose IDreference points to this
// commande_sous_traitant and whose IDtype_doc is in the set we care
// about. IMPORTANT: envoi_email.IDreference is polymorphic — its
// target table depends on IDtype_doc:
//   13 = commande sst             → commande_sous_traitant.IDcommande_sous_traitant ✓
//   14 = avis expedition          → expedition.IDexpedition (NOT this commande!)
//   15 = soumission (sst → client)→ commande_sous_traitant.IDcommande_sous_traitant ✓
//                                    `notes` carries the lot identifier
//                                    ("MA105741", "MA107896 (reprise)", …)
//
// Type 14 is intentionally excluded: it lives in the expedition
// polymorphic context. A sst commande #8586 and expedition #8586 are
// unrelated rows with colliding IDs; if we naively join on IDreference
// we surface 2024-era avis-expedition emails on the 2026 sst commande
// (real bug observed on commande 8586). To show expeditions on a sst
// commande's timeline we'd need to walk sst lines → stock_fini →
// ligne_expedition → expedition — out of scope here.
//
// In addition to email events, we also surface client-response
// events from `reponse_soumission` (per-lot approve/reject log).
//
// Rows from a single send burst share the same DATE down to the
// millisecond (4 recipients → 4 rows). We group by IDtype_doc +
// timestamp-truncated-to-second so the UI renders one event per send
// with a recipient list, not one event per recipient.

type HistoriqueEvent =
  | {
      kind: 'email'
      /** Stable group key. */
      id: string
      /** HFSQL DATETIME string (e.g. "2026-03-09 14:17:36"). */
      date: string
      type_doc_id: number
      type_doc_label: string
      recipients: Array<{ email: string; societe: string | null }>
      /** First non-empty `notes` cell in the group — for sst soumissions
       *  this carries the lot identifier (e.g. "MA105741"). */
      notes: string | null
    }
  | {
      kind: 'reponse'
      id: string
      /** HFSQL date "YYYY-MM-DD" (reponse_soumission has no time). */
      date: string
      /** 1 = approuvé, 0 = refusé. */
      reponse: number
      lot: string
      IDclient: number
    }

// Only the type_doc codes whose IDreference points to a commande_sous_traitant.
const HISTORIQUE_TYPE_DOC_IDS = [13, 15] as const

commandesSousTraitantRouter.get('/:id/historique', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const rows = await query<{
      IDenvoi_email: number
      DATE: string | null
      adresse: string | null
      société: string | null
      IDreference: number
      IDtype_doc: number
      notes: string | null
    }>(
      `SELECT IDenvoi_email, DATE, adresse, société, IDreference, IDtype_doc, notes
       FROM envoi_email
       WHERE IDreference = ${id}
         AND IDtype_doc IN (${HISTORIQUE_TYPE_DOC_IDS.join(',')})
       ORDER BY DATE DESC`,
    )
    const fixed = await fixEncoding(rows as any[], 'envoi_email', 'IDenvoi_email', ['adresse', 'société', 'notes'])

    // Resolve type_doc labels (small lookup — 29 rows). Fetch once,
    // share across all events.
    const tdRows = await query<{ IDtype_doc: number; nom: string | null }>(
      `SELECT IDtype_doc, nom FROM type_doc
       WHERE IDtype_doc IN (${HISTORIQUE_TYPE_DOC_IDS.join(',')})`,
    )
    const tdFixed = await fixEncoding(tdRows as any[], 'type_doc', 'IDtype_doc', ['nom'])
    const labelMap = new Map<number, string>()
    for (const r of tdFixed as any[]) labelMap.set(Number(r.IDtype_doc), (r.nom ?? '').toString())

    // Group email rows by (IDtype_doc, DATE-to-minute). Truncating to
    // the second isn't enough — a single send burst with many
    // recipients can straddle the second boundary (e.g. 4 emails
    // spanning 17:00:31.855 → 17:00:32.026 would otherwise become two
    // separate "events"). Minute precision keeps real sends together
    // while still distinguishing distinct user actions (no two sends
    // for the same commande + type ever happen within the same minute).
    type EmailEvent = Extract<HistoriqueEvent, { kind: 'email' }>
    const groups = new Map<string, EmailEvent>()
    for (const r of fixed as any[]) {
      const rawDate = (r.DATE ?? '').toString()
      // "2026-03-09 14:17:36.744" → "2026-03-09 14:17" (drop seconds + subseconds).
      const dateMin = rawDate.split('.')[0].replace(/:\d{2}$/, '')
      const dateSec = rawDate.split('.')[0]
      const tdid = Number(r.IDtype_doc) || 0
      const key = `email|${tdid}|${dateMin}`
      const event = groups.get(key) ?? {
        kind: 'email' as const,
        id: key,
        date: dateSec,
        type_doc_id: tdid,
        type_doc_label: labelMap.get(tdid) ?? `type_doc ${tdid}`,
        recipients: [],
        notes: null,
      }
      const email = (r.adresse ?? '').toString().trim()
      const societe = (r['société'] ?? '').toString().trim() || null
      if (email) event.recipients.push({ email, societe })
      if (!event.notes) {
        const n = (r.notes ?? '').toString().trim()
        if (n) event.notes = n
      }
      groups.set(key, event)
    }

    // Fetch client-response events from reponse_soumission. Keyed
    // directly on IDcommande_sous_traitant, no polymorphism concerns.
    const reponseRows = await query<{
      IDreponse_soumission: number
      DATE: string | null
      reponse: number | null
      lot: string | null
      IDclient: number | null
    }>(
      `SELECT IDreponse_soumission, DATE, reponse, lot, IDclient
       FROM reponse_soumission
       WHERE IDcommande_sous_traitant = ${id}`,
    )
    const reponseFixed = await fixEncoding(reponseRows as any[], 'reponse_soumission', 'IDreponse_soumission', ['lot'])
    const reponseEvents: HistoriqueEvent[] = (reponseFixed as any[]).map((r) => {
      // reponse_soumission.DATE is HFSQL "YYYYMMDD" — convert to "YYYY-MM-DD"
      // so the timeline can sort it alongside the timestamped email events.
      const raw = (r.DATE ?? '').toString()
      const iso = /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw
      return {
        kind: 'reponse' as const,
        id: `reponse|${Number(r.IDreponse_soumission)}`,
        date: iso,
        reponse: Number(r.reponse) || 0,
        lot: (r.lot ?? '').toString().trim(),
        IDclient: Number(r.IDclient) || 0,
      }
    })

    // Merge + sort by date DESC. For events with the same date, emails
    // (with timestamps) outrank responses (date-only); within emails,
    // SQL already returned them DESC; within responses, order by id
    // DESC as a tie-breaker.
    const merged: HistoriqueEvent[] = [
      ...Array.from(groups.values()),
      ...reponseEvents,
    ].sort((a, b) => {
      // String compare on date works for both "2026-03-09 14:17:36" and "2026-03-09" formats.
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      // Emails first (richer info), then responses.
      if (a.kind !== b.kind) return a.kind === 'email' ? -1 : 1
      return a.id < b.id ? 1 : -1
    })

    res.json({ events: merged })
  } catch (err) {
    console.error('Error fetching historique:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Create commande ──────────────────────────────────────

commandesSousTraitantRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = commandeBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data
    const dateCmd = dateStr(d.date_commande)

    // Wrap commentaire + journal in minimal RTF so the legacy WinDev app
    // continues to read them.
    const commentaireRtf = wrapRtf(d.commentaire ?? '')
    const journalRtf = wrapRtf(d.journal ?? '')
    await query(
      `INSERT INTO commande_sous_traitant
       (IDsous_traitant, date_commande, est_soldee, commentaire, journal,
        IDadresse_sous_traitant, IDadresse_livraison, IDdossier, IDcommande_client, IDligne_commande_client)
       VALUES (${d.IDsous_traitant}, '${dateCmd}', 0, '${esc(commentaireRtf)}', '${esc(journalRtf)}',
               ${d.IDadresse_sous_traitant ?? 0}, ${d.IDadresse_livraison ?? 0}, 0, 0, 0)`,
    )

    const rows = await query<{ IDcommande_sous_traitant: number }>(
      `SELECT IDcommande_sous_traitant FROM commande_sous_traitant
       WHERE IDsous_traitant = ${d.IDsous_traitant}
       ORDER BY IDcommande_sous_traitant DESC`,
    )
    const newId = rows[0]?.IDcommande_sous_traitant ?? null
    if (newId == null) { res.status(500).json({ error: 'Insert lookup failed' }); return }
    res.status(201).json({ IDcommande_sous_traitant: Number(newId) })
  } catch (err) {
    console.error('Error creating commande-sous-traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Update commande header ───────────────────────────────

commandesSousTraitantRouter.put('/:id', async (req: Request, res: Response) => {
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
    if (d.est_soldee !== undefined) sets.push(`est_soldee = ${d.est_soldee}`)
    if (d.commentaire !== undefined) sets.push(`commentaire = '${esc(wrapRtf(d.commentaire))}'`)
    if (d.journal !== undefined) sets.push(`journal = '${esc(wrapRtf(d.journal))}'`)
    if (d.IDadresse_sous_traitant !== undefined) sets.push(`IDadresse_sous_traitant = ${d.IDadresse_sous_traitant}`)
    if (d.IDadresse_livraison !== undefined) sets.push(`IDadresse_livraison = ${d.IDadresse_livraison}`)

    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    await query(
      `UPDATE commande_sous_traitant SET ${sets.join(', ')} WHERE IDcommande_sous_traitant = ${id}`,
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating commande-sous-traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Status toggle (binary est_soldee) ────────────────────

commandesSousTraitantRouter.put('/:id/etat', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const parsed = z.object({ est_soldee: z.number().int().min(0).max(1) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    await query(
      `UPDATE commande_sous_traitant SET est_soldee = ${parsed.data.est_soldee} WHERE IDcommande_sous_traitant = ${id}`,
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error toggling commande-sous-traitant etat:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Delete commande (cascade lines + clear ecru affectations) ──

commandesSousTraitantRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    // Collect line ids to clear stock_ecru affectations.
    const lines = await query<{ IDligne_commande_sous_traitant: number }>(
      `SELECT IDligne_commande_sous_traitant FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = ${id}`,
    )
    const lineIds = lines.map((l) => Number(l.IDligne_commande_sous_traitant)).filter((x) => x > 0)
    if (lineIds.length > 0) {
      await query(
        `UPDATE stock_ecru SET IDref_commande_affectation = 0
         WHERE IDref_commande_affectation IN (${lineIds.join(',')})`,
      )
    }
    await query(`DELETE FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = ${id}`)
    await query(`DELETE FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting commande-sous-traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Create line ──────────────────────────────────────────

commandesSousTraitantRouter.post('/:id/lignes', async (req: Request, res: Response) => {
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

    if (refuseIfTerminee(res, await loadCommandeSoldee(id))) return

    // On creation, date_delai mirrors date_livraison so the "first reschedule"
    // rule has a baseline to compare against later. `type` defaults to 2,
    // the dominant legacy value for ennoblisseur lines (matches stock_ecru
    // references; 4668/7247 legacy lines have type=2).
    await query(
      `INSERT INTO ligne_commande_sous_traitant
       (IDcommande_sous_traitant, type, IDreference, IDColoris, quantite, unite, prix,
        date_livraison, date_delai, sstatut, commentaire)
       VALUES (${id}, ${d.type ?? 2}, ${d.IDreference ?? 0}, ${d.IDColoris ?? 0},
               ${n(d.quantite)}, ${d.unite ?? 0}, ${n(d.prix)},
               '${dateLiv}', '${dateLiv}', '${esc(d.sstatut ?? STATUT_OPEN)}', '${esc(d.commentaire ?? '')}')`,
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Error creating ligne_commande_sous_traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Update line ──────────────────────────────────────────
// Implements the first-change capture rule for date_delai: if the request
// changes date_livraison AND the row's current date_delai equals the row's
// current date_livraison (never been rescheduled before), promote the
// previous date_livraison into date_delai before applying the new value.

commandesSousTraitantRouter.put('/lignes/:lineId', async (req: Request, res: Response) => {
  try {
    const lineId = parseInt(req.params.lineId, 10)
    if (isNaN(lineId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = ligneBody.partial().safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data

    const commandeId = await loadCommandeIdForLine(lineId)
    if (commandeId == null) { res.status(404).json({ error: 'Line not found' }); return }
    if (refuseIfTerminee(res, await loadCommandeSoldee(commandeId))) return

    // Read current dates for the delai-initial preservation rule.
    const currentRows = await query<{ date_livraison: string | null; date_delai: string | null }>(
      `SELECT date_livraison, date_delai FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = ${lineId}`,
    )
    const cur = currentRows[0] ?? { date_livraison: '', date_delai: '' }

    const sets: string[] = []
    if (d.type !== undefined) sets.push(`type = ${d.type}`)
    if (d.IDreference !== undefined) sets.push(`IDreference = ${d.IDreference}`)
    if (d.IDColoris !== undefined) sets.push(`IDColoris = ${d.IDColoris}`)
    if (d.quantite !== undefined) sets.push(`quantite = ${n(d.quantite)}`)
    if (d.unite !== undefined) sets.push(`unite = ${d.unite}`)
    if (d.prix !== undefined) sets.push(`prix = ${n(d.prix)}`)
    if (d.commentaire !== undefined) sets.push(`commentaire = '${esc(d.commentaire)}'`)
    if (d.sstatut !== undefined) sets.push(`sstatut = '${esc(d.sstatut)}'`)
    if (d.date_livraison !== undefined) {
      const nextLiv = dateStr(d.date_livraison)
      const prevLiv = typeof cur.date_livraison === 'string' ? cur.date_livraison : ''
      const prevDelai = typeof cur.date_delai === 'string' ? cur.date_delai : ''
      // Capture-once rule: only promote prevLiv into date_delai if the line
      // has never been rescheduled before (date_delai still equals
      // date_livraison) AND this update actually changes date_livraison.
      if (nextLiv !== prevLiv && prevDelai === prevLiv && prevLiv) {
        sets.push(`date_delai = '${prevLiv}'`)
      }
      sets.push(`date_livraison = '${nextLiv}'`)
    }

    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    await query(
      `UPDATE ligne_commande_sous_traitant SET ${sets.join(', ')} WHERE IDligne_commande_sous_traitant = ${lineId}`,
    )

    // Auto-close on "all lines done" was removed when we moved to the
    // computed-phase model — the operator now uses the Clôturer button in
    // the sidebar footer to flip est_soldee manually. `maybeAutoCloseCommande`
    // and `isLineDone` remain in the module (cheap to revert) but are no
    // longer called from the line-update path.

    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating ligne_commande_sous_traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Delete line ──────────────────────────────────────────

commandesSousTraitantRouter.delete('/lignes/:lineId', async (req: Request, res: Response) => {
  try {
    const lineId = parseInt(req.params.lineId, 10)
    if (isNaN(lineId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const commandeId = await loadCommandeIdForLine(lineId)
    if (commandeId == null) { res.status(404).json({ error: 'Line not found' }); return }
    if (refuseIfTerminee(res, await loadCommandeSoldee(commandeId))) return

    // Clear ecru affectations pointing at this line (rolls go back to stock).
    await query(`UPDATE stock_ecru SET IDref_commande_affectation = 0 WHERE IDref_commande_affectation = ${lineId}`)
    await query(`DELETE FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = ${lineId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting ligne_commande_sous_traitant:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Pieces drawer (ennoblisseur flow) ────────────────────
//
// Each line of an ennoblisseur commande drives two flows:
//   1. Affectation: take an existing stock_ecru roll (greige fabric we
//      knitted in-house) and mark it as sent to this dyer for finishing.
//      Wire: stock_ecru.IDref_commande_affectation = IDligne_commande_sous_traitant
//   2. Reception: when the dyer returns the dyed roll, we record a new
//      stock_fini row that references both the source écru roll and the
//      sous-traitant commande line.
//      Wire: stock_fini.IDref_commande_source = IDligne_commande_sous_traitant,
//            stock_fini.IDstock_ecru = IDstock_ecru of the original.

interface LineContext {
  commandeId: number
  /** The line's IDreference column — it's an IDref_fini. */
  IDref_fini: number
  /** The IDref_ecru that ref_fini maps to (via ref_fini.IDref_ecru). Used
   *  to filter compatible écru rolls for the drawer. */
  IDref_ecru: number
}

async function loadEnnoblisseurLineContext(
  commandeId: number,
  ligneId: number,
): Promise<LineContext | null> {
  const lineRows = await query<{
    IDcommande_sous_traitant: number
    IDreference: number | null
  }>(
    `SELECT IDcommande_sous_traitant, IDreference
     FROM ligne_commande_sous_traitant
     WHERE IDligne_commande_sous_traitant = ${ligneId}`,
  )
  if (lineRows.length === 0) return null
  const line = lineRows[0] as any
  if (Number(line.IDcommande_sous_traitant) !== commandeId) return null
  const IDref_fini = Number(line.IDreference) || 0

  // Resolve the écru ref via ref_fini.IDref_ecru — that's the ref the
  // ennoblisseur receives (greige rolls of that ecru ref are dyed/finished
  // into rolls of this fini ref).
  let IDref_ecru = 0
  if (IDref_fini > 0) {
    const r = await query<{ IDref_ecru: number | null }>(
      `SELECT IDref_ecru FROM ref_fini WHERE IDref_fini = ${IDref_fini}`,
    )
    IDref_ecru = Number((r[0] as any)?.IDref_ecru) || 0
  }
  return { commandeId, IDref_fini, IDref_ecru }
}

/** Create a `suivilot` row for a (ligne, lot) pair.
 *
 *  Legacy behaviour: ONE `suivilot` row per (IDligne_commande_sous_traitant,
 *  lot). The row identifies the lot + carries the demande fields copied
 *  from `ref_fini` at creation. `quantite_receptionnee` and
 *  `metrage_receptionne` start at 0 and are filled by a downstream
 *  workflow (verified against the user's MA108050-Actual sample). We
 *  match that exactly — no auto-aggregation on reception.
 *
 *  - Empty/whitespace lot → no-op (matches legacy: stock_fini rows with
 *    empty lot have no suivilot).
 *  - If a suivilot already exists for the same (ligne, lot) → no-op
 *    (the lot is already tracked).
 *  - First call → INSERT with totals=0, IDetatLot=1 (initial state, set
 *    by the legacy app on creation; later workflow steps advance it).
 *  - `IDColoris` / `IDref_fini_colori` come from the LINE, not the
 *    écru's `IDcolori_ecru` — fini lines reference `ref_fini_colori`.
 *  - Accented columns (`stabL_demandée`, `stabH_demandée`,
 *    `freinte_demandée`, `approuvé_qualité`) are omitted on Linux
 *    because the bridge rejects them in INSERT clauses. HFSQL fills
 *    its own defaults there.
 *  - Failures are logged but never bubble up: the stock_fini reception
 *    is the user's primary action, and a missing suivilot row is a
 *    secondary annoyance, not data loss.
 */
async function upsertSuivilot(opts: {
  commandeId: number
  ligneId: number
  lot: string
}): Promise<void> {
  const lot = (opts.lot ?? '').trim()
  if (lot.length === 0) return
  try {
    const existing = await query<{ IDsuivilot: number }>(
      `SELECT IDsuivilot FROM suivilot
       WHERE IDligne_commande_sous_traitant = ${opts.ligneId} AND lot = '${esc(lot)}'`,
    )
    if (existing.length > 0) return  // Lot already tracked.

    // Resolve everything else from the line + parent commande + ref_fini.
    const lineRows = await query<{ IDreference: number | null; IDColoris: number | null }>(
      `SELECT IDreference, IDColoris FROM ligne_commande_sous_traitant
       WHERE IDligne_commande_sous_traitant = ${opts.ligneId}`,
    )
    const IDref_fini = Number(lineRows[0]?.IDreference) || 0
    const IDColoris = Number(lineRows[0]?.IDColoris) || 0
    const cmdRows = await query<{ IDsous_traitant: number | null }>(
      `SELECT IDsous_traitant FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${opts.commandeId}`,
    )
    const IDsous_traitant = Number(cmdRows[0]?.IDsous_traitant) || 0
    const refRows = IDref_fini > 0
      ? await query<{
          laizeHT_Moy: number | null
          poids_Moy: number | null
          rendement: number | null
          freinte: number | null
          stab_hauteur: number | null
          stab_largeur: number | null
        }>(
          `SELECT laizeHT_Moy, poids_Moy, rendement, freinte, stab_hauteur, stab_largeur
           FROM ref_fini WHERE IDref_fini = ${IDref_fini}`,
        )
      : []
    const ref = refRows[0] ?? {
      laizeHT_Moy: null, poids_Moy: null, rendement: null,
      freinte: null, stab_hauteur: null, stab_largeur: null,
    }

    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`

    // For fini lines, ligne.IDColoris IS the ref_fini_colori id —
    // legacy verified: every sample row has IDColoris == IDref_fini_colori.
    const baseCols = [
      'IDref_fini_colori', 'IDcommande_sous_traitant', 'IDsous_traitant', 'DATE', 'lot',
      'laize_demandee', 'poids_demande', 'rendement_demande',
      'quantite_receptionnee', 'metrage_receptionne',
      'IDref_fini', 'IDColoris', 'IDligne_commande_sous_traitant', 'IDetatLot',
    ]
    const baseVals = [
      String(IDColoris),
      String(opts.commandeId),
      String(IDsous_traitant),
      `'${dateStr}'`,
      `'${esc(lot)}'`,
      String(n(ref.laizeHT_Moy)),
      String(n(ref.poids_Moy)),
      String(n(ref.rendement)),
      '0',
      '0',
      String(IDref_fini),
      String(IDColoris),
      String(opts.ligneId),
      '1',
    ]
    // Accented columns — only on Windows. Linux will get HFSQL's column
    // defaults (typically 0 / NULL) and the user can backfill via the
    // legacy app if those values are needed.
    if (IS_WINDOWS) {
      baseCols.push('stabL_demandée', 'stabH_demandée', 'freinte_demandée', 'approuvé_qualité')
      baseVals.push(
        String(n(ref.stab_hauteur)),
        String(n(ref.stab_largeur)),
        String(n(ref.freinte)),
        '0',
      )
    }
    await query(
      `INSERT INTO suivilot (${baseCols.join(', ')}) VALUES (${baseVals.join(', ')})`,
    )
  } catch (err) {
    console.error(`upsertSuivilot failed for ligne=${opts.ligneId} lot=${lot}:`, err)
  }
}

/** Quality defect recorded against an écru roll. Stored in the legacy
 *  `defaut_qualite` table with a polymorphic link: when
 *  `Type_Reference = 2`, `reference` is a stringified `IDstock_ecru`.
 *  Multiple defects per piece are possible (each is its own row), so
 *  the per-roll payload carries an array. */
interface DefautQualite {
  IDdefaut_qualite: number
  description: string | null
  type_defaut: string | null
  taille_cm: number | null
}

interface StockEcruLite {
  IDstock_ecru: number
  numero: string | null
  lot: string | null
  poids: number | null
  metrage: number | null
  IDref_ecru: number
  IDcolori_ecru: number
  IDmagasin: number
  IDordre_fabrication: number
  date_saisie: string | null
  // Quality + free-text notes. `second_choix` is the legacy
  // 0-or-positive flag the textile industry uses to mark downgraded
  // rolls ("second choix"). Surfaced as a destructive badge in the
  // drawer; `observations` renders as the italic comment line.
  second_choix: number | null
  observations: string | null
  /** Structured defects from `defaut_qualite` (visiteur-logged). Empty
   *  array when the piece has none. Distinct from the free-text
   *  `observations` field — both can coexist on the same roll. */
  defects?: DefautQualite[]
  // Customer reservation: when the sous-traitant order was created from
  // a commande_client screen in the legacy ERP, the stock_ecru roll keeps
  // a back-pointer to the originating client line. We chase the chain
  // stock_ecru.IDligne_commande_client → ligne_commande_client.IDcommande_client
  // → commande_client.IDclient → client.nom so the UI can tag the roll
  // with the customer it's been earmarked for. Only set on linked rolls;
  // the `ecruAvailable` list omits these fields (they're not needed in the
  // picker UI, and including them would require resolving the chain for
  // every unaffected roll of the ref).
  IDligne_commande_client?: number
  client_nom?: string | null
}

interface StockFiniLite {
  IDstock_fini: number
  numero: string | null
  lot: string | null
  poids: number | null
  metrage: number | null
  IDref_fini: number
  IDColoris: number
  IDstock_ecru: number
  IDmagasin: number
  date_saisie: string | null
  // Two distinct free-text fields on stock_fini: the visitor's note
  // (`observations`, captured when the roll is checked in) and the
  // ennoblisseur's note (`observation_sst`). They're surfaced as two
  // separate italic lines in the card so the source of each comment
  // stays clear. `second_choix` mirrors the écru behaviour.
  second_choix: number | null
  observations: string | null
  observation_sst: string | null
  /** Workflow state from `etat_stock_fini`:
   *    1=En Contrôle, 2=En Reprise, 3=Validé, 4=Expédié, 5=Attente de décision.
   *  New receptions enter at 1; the legacy app advances it as the roll
   *  moves through inspection / shipping. */
  IDetat_stock_fini: number | null
  /** Resolved client name when this fini is reserved for a client order —
   *  derived from `stock_fini.IDligne_commande_client` walked through
   *  ligne_commande_client → commande_client → client. Inherited from
   *  the source écru's reservation at reception time. */
  client_nom?: string | null
}

async function fetchPiecesPayload(ctx: LineContext, ligneId: number): Promise<{
  ecruLinked: StockEcruLite[]
  ecruAvailable: StockEcruLite[]
  finiReceived: StockFiniLite[]
  /** Current `ligne_commande_sous_traitant.prix` for this line. Surfaced
   *  so the link/unlink endpoints can return the freshly-recalculated
   *  price without forcing the frontend to refetch the whole commande
   *  detail. Read from the row after any in-flight recalc has persisted. */
  prix: number
}> {
  // Linked écru rolls — those already affected to this line.
  const linkedRows = await query<StockEcruLite>(
    `SELECT IDstock_ecru, numero, lot, poids, metrage, IDref_ecru, IDcolori_ecru,
            IDmagasin, IDordre_fabrication, date_saisie, IDligne_commande_client,
            second_choix, observations
     FROM stock_ecru
     WHERE IDref_commande_affectation = ${ligneId}
     ORDER BY date_saisie DESC, IDstock_ecru DESC`,
  )
  const linkedFixed = await fixEncoding(linkedRows, 'stock_ecru', 'IDstock_ecru', ['numero', 'lot', 'observations'])

  // Pull fini rows up front so their IDligne_commande_client values
  // join the same client-name lookup pass used for écru (one chain walk
  // instead of two). Fini rolls inherit the écru's client reservation
  // on creation — that lcc id propagates into stock_fini and we surface
  // it as `client_nom` on the response so the Réception card can render
  // the same client badge.
  const finiRowsRaw = await query<StockFiniLite & { IDligne_commande_client?: number | null }>(
    `SELECT IDstock_fini, numero, lot, poids, metrage, IDref_fini, IDColoris,
            IDstock_ecru, IDmagasin, date_saisie, observations, observation_sst, second_choix,
            IDetat_stock_fini, IDligne_commande_client
     FROM stock_fini
     WHERE IDref_commande_source = ${ligneId}
     ORDER BY date_saisie DESC, IDstock_fini DESC`,
  )
  const finiFixed = await fixEncoding(finiRowsRaw, 'stock_fini', 'IDstock_fini', ['numero', 'lot', 'observations', 'observation_sst'])

  // Resolve each roll's client reservation in two batched JOIN hops.
  // We can't do a 3-way JOIN here because the legacy bridge has issues
  // with CONVERT() across joins (see CLAUDE.md), so we walk the chain
  // ligne_commande_client → commande_client → client manually and
  // assemble the name map.
  const clientByLcc = new Map<number, string>()
  const lccIds = Array.from(new Set([
    ...linkedFixed.map((r) => Number(r.IDligne_commande_client) || 0),
    ...finiFixed.map((r) => Number((r as any).IDligne_commande_client) || 0),
  ].filter((x) => x > 0)))
  if (lccIds.length > 0) {
    const lccRows = await query<{ IDligne_commande_client: number; IDcommande_client: number }>(
      `SELECT IDligne_commande_client, IDcommande_client
       FROM ligne_commande_client
       WHERE IDligne_commande_client IN (${lccIds.join(',')})`,
    )
    const ccIds = Array.from(new Set(
      lccRows.map((r) => Number(r.IDcommande_client) || 0).filter((x) => x > 0)
    ))
    const clientIdByCC = new Map<number, number>()
    if (ccIds.length > 0) {
      const ccRows = await query<{ IDcommande_client: number; IDclient: number }>(
        `SELECT IDcommande_client, IDclient FROM commande_client
         WHERE IDcommande_client IN (${ccIds.join(',')})`,
      )
      for (const r of ccRows) clientIdByCC.set(Number(r.IDcommande_client), Number(r.IDclient))
    }
    const clientIds = Array.from(new Set(Array.from(clientIdByCC.values()).filter((x) => x > 0)))
    const nameById = new Map<number, string>()
    if (clientIds.length > 0) {
      const clRows = await query<{ IDclient: number; nom: string | null }>(
        `SELECT IDclient, nom FROM client WHERE IDclient IN (${clientIds.join(',')})`,
      )
      const fixedCl = await fixEncoding(clRows, 'client', 'IDclient', ['nom'])
      for (const r of fixedCl) nameById.set(Number(r.IDclient), (r.nom ?? '').trim())
    }
    for (const r of lccRows) {
      const cid = clientIdByCC.get(Number(r.IDcommande_client))
      if (cid && cid > 0) {
        const nm = nameById.get(cid)
        if (nm) clientByLcc.set(Number(r.IDligne_commande_client), nm)
      }
    }
  }

  // Available écru rolls — every roll of the ref_ecru that maps to this
  // fini line, currently unaffected. Coloris is intentionally not filtered:
  // the ennoblisseur dyes the écru regardless of its source coloris, so we
  // present all matching écru rolls.
  let available: StockEcruLite[] = []
  if (ctx.IDref_ecru > 0) {
    const availRows = await query<StockEcruLite>(
      `SELECT IDstock_ecru, numero, lot, poids, metrage, IDref_ecru, IDcolori_ecru,
              IDmagasin, IDordre_fabrication, date_saisie,
              second_choix, observations
       FROM stock_ecru
       WHERE IDref_ecru = ${ctx.IDref_ecru}
         AND (IDref_commande_affectation IS NULL OR IDref_commande_affectation = 0)
       ORDER BY date_saisie DESC, IDstock_ecru DESC`,
    )
    available = await fixEncoding(availRows, 'stock_ecru', 'IDstock_ecru', ['numero', 'lot', 'observations'])
  }

  // Batch-fetch structured defects from `defaut_qualite` for every écru
  // roll we're about to return (linked + available). The link is
  // polymorphic — Type_Reference=2 with reference (string) =
  // IDstock_ecru. We group by IDstock_ecru and attach as `defects` so
  // the UI can render them in the red banner alongside `observations`.
  const allEcruIds = Array.from(new Set<number>([
    ...linkedFixed.map((r) => Number(r.IDstock_ecru) || 0),
    ...available.map((r) => Number(r.IDstock_ecru) || 0),
  ].filter((x) => x > 0)))
  const defectsByEcruId = new Map<number, DefautQualite[]>()
  if (allEcruIds.length > 0) {
    const inList = allEcruIds.map((id) => `'${id}'`).join(',')
    const defaultRows = await query<{
      IDdefaut_qualite: number
      reference: string | null
      description: string | null
      type_defaut: string | null
      taille_cm: number | null
    }>(
      `SELECT IDdefaut_qualite, reference, description, type_defaut, taille_cm
       FROM defaut_qualite
       WHERE Type_Reference = 2 AND reference IN (${inList})`,
    )
    const defaultsFixed = await fixEncoding(defaultRows, 'defaut_qualite', 'IDdefaut_qualite', ['description', 'type_defaut'])
    for (const d of defaultsFixed as any[]) {
      const refId = parseInt(String(d.reference ?? ''), 10)
      if (!(refId > 0)) continue
      const arr = defectsByEcruId.get(refId) ?? []
      arr.push({
        IDdefaut_qualite: Number(d.IDdefaut_qualite),
        description: d.description ?? null,
        type_defaut: d.type_defaut ?? null,
        taille_cm: Number(d.taille_cm) || 0,
      })
      defectsByEcruId.set(refId, arr)
    }
  }

  const linked = linkedFixed.map((r) => ({
    ...r,
    client_nom: clientByLcc.get(Number(r.IDligne_commande_client) || 0) ?? null,
    defects: defectsByEcruId.get(Number(r.IDstock_ecru) || 0) ?? [],
  }))
  available = available.map((r) => ({
    ...r,
    defects: defectsByEcruId.get(Number(r.IDstock_ecru) || 0) ?? [],
  }))

  // Attach client_nom to each fini using the shared clientByLcc map
  // built above. The raw IDligne_commande_client comes from the stock_fini
  // SELECT (already fetched into finiFixed); it isn't part of the public
  // StockFiniLite shape so we read it as any.
  const fini = finiFixed.map((r) => {
    const lcc = Number((r as any).IDligne_commande_client) || 0
    return {
      ...r,
      client_nom: lcc > 0 ? (clientByLcc.get(lcc) ?? null) : null,
    }
  })

  // Read the line's current prix so the caller can patch the frontend
  // detail cache without a full refetch. We re-read here (rather than
  // passing it in) so the value reflects any recalc that ran between
  // the link/unlink mutation and this fetch.
  const prixRows = await query<{ prix: number | null }>(
    `SELECT prix FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = ${ligneId}`,
  )
  const prix = Number(prixRows[0]?.prix) || 0

  return {
    ecruLinked: linked as StockEcruLite[],
    ecruAvailable: available as StockEcruLite[],
    finiReceived: fini as StockFiniLite[],
    prix,
  }
}

commandesSousTraitantRouter.get('/:commandeId/lignes/:ligneId/pieces', async (req: Request, res: Response) => {
  try {
    const commandeId = parseInt(req.params.commandeId, 10)
    const ligneId = parseInt(req.params.ligneId, 10)
    if (isNaN(commandeId) || isNaN(ligneId)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const ctx = await loadEnnoblisseurLineContext(commandeId, ligneId)
    if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }
    res.json(await fetchPiecesPayload(ctx, ligneId))
  } catch (err) {
    console.error('Error fetching line pieces:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Breakdown of the current prix calculation for a line. Returns the
// algorithm's full trace (base + treatments + multipliers) with
// human-readable names resolved server-side, so the LineCard tooltip can
// render an explanatory popover. Called on-demand when the user hovers
// the Info icon next to "Prix unit.".
commandesSousTraitantRouter.get(
  '/:commandeId/lignes/:ligneId/prix-breakdown',
  async (req: Request, res: Response) => {
    try {
      const commandeId = parseInt(req.params.commandeId, 10)
      const ligneId = parseInt(req.params.ligneId, 10)
      if (isNaN(commandeId) || isNaN(ligneId)) { res.status(400).json({ error: 'Invalid ID' }); return }

      // Resolve line + commande context.
      const lineRows = await query<any>(
        `SELECT IDcommande_sous_traitant, IDreference, IDColoris, type AS type_kind
         FROM ligne_commande_sous_traitant
         WHERE IDligne_commande_sous_traitant = ${ligneId}`,
      )
      if (lineRows.length === 0) { res.status(404).json({ error: 'Line not found' }); return }
      const line = lineRows[0]
      if (Number(line.IDcommande_sous_traitant) !== commandeId) { res.status(404).json({ error: 'Line does not belong to commande' }); return }
      if (Number(line.type_kind) !== 2) { res.json({ enabled: false, reason: 'not-ennoblisseur' }); return }

      const cmdRows = await query<{ IDsous_traitant: number }>(
        `SELECT IDsous_traitant FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${commandeId}`,
      )
      const IDsous_traitant = Number(cmdRows[0]?.IDsous_traitant) || 0
      if (!(await hasTariffData(IDsous_traitant))) {
        res.json({ enabled: false, reason: 'no-tariff-data' })
        return
      }

      const poidsRows = await query<{ total: number | null }>(
        `SELECT SUM(poids) AS total FROM stock_ecru WHERE IDref_commande_affectation = ${ligneId}`,
      )
      const xPoids = Number(poidsRows[0]?.total) || 0

      const bd: PrixBreakdown | null = await calcTarifSSTBreakdown({
        xPoids,
        IDsous_traitant,
        IDref_fini: Number(line.IDreference) || 0,
        IDref_fini_colori: Number(line.IDColoris) || 0,
      })
      if (!bd) { res.json({ enabled: false, reason: 'no-weight' }); return }

      // Resolve human-readable names for the IDs in the breakdown.
      const stRows = await query<{ nom: string | null }>(
        `SELECT nom FROM sous_traitant WHERE IDsous_traitant = ${IDsous_traitant}`,
      )
      const sstFixed = await fixEncoding(stRows, 'sous_traitant', 'IDsous_traitant', ['nom'])
      const sst_nom = ((sstFixed[0] as any)?.nom ?? '').trim()

      let teinture_nom: string | null = null
      if (bd.IDteinture > 0) {
        const teintRows = await query<{ designation_interne: string | null; designation_externe: string | null }>(
          `SELECT designation_interne, designation_externe FROM teinture WHERE IDteinture = ${bd.IDteinture}`,
        )
        const fixedT = await fixEncoding(teintRows, 'teinture', 'IDteinture', ['designation_interne', 'designation_externe'])
        const t = fixedT[0] as any
        teinture_nom = (t?.designation_externe || t?.designation_interne || '').trim() || null
      }

      // Collect all treatment ids we need names for (combination-covered
      // + remaining-priced + unpriced).
      const trtIds = new Set<number>()
      if (bd.base?.kind === 'combination') for (const t of bd.base.covered) trtIds.add(t)
      for (const t of bd.treatments) trtIds.add(t.IDtraitement)
      for (const t of bd.unpriced_treatments) trtIds.add(t)
      const trtNames = new Map<number, string>()
      if (trtIds.size > 0) {
        const trtRows = await query<{ IDtraitement: number; designation: string | null }>(
          `SELECT IDtraitement, designation FROM traitement WHERE IDtraitement IN (${Array.from(trtIds).join(',')})`,
        )
        const fixedTrt = await fixEncoding(trtRows, 'traitement', 'IDtraitement', ['designation'])
        for (const r of fixedTrt as any[]) trtNames.set(Number(r.IDtraitement), (r.designation ?? '').trim())
      }

      res.json({
        enabled: true,
        sst_nom,
        teinture_nom,
        traitement_names: Object.fromEntries(trtNames),
        breakdown: bd,
      })
    } catch (err) {
      console.error('Error computing prix breakdown:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

commandesSousTraitantRouter.put(
  '/:commandeId/lignes/:ligneId/pieces/ecru/:stockEcruId',
  async (req: Request, res: Response) => {
    try {
      const commandeId = parseInt(req.params.commandeId, 10)
      const ligneId = parseInt(req.params.ligneId, 10)
      const stockEcruId = parseInt(req.params.stockEcruId, 10)
      if (isNaN(commandeId) || isNaN(ligneId) || isNaN(stockEcruId)) {
        res.status(400).json({ error: 'Invalid ID' }); return
      }
      const ctx = await loadEnnoblisseurLineContext(commandeId, ligneId)
      if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }
      if (refuseIfTerminee(res, await loadCommandeSoldee(commandeId))) return

      // Verify the écru row's IDref_ecru matches the ref_fini.IDref_ecru
      // resolved for this line, and that the roll is unassigned.
      const ecruRows = await query<{
        IDstock_ecru: number
        IDref_ecru: number
        IDref_commande_affectation: number | null
      }>(
        `SELECT IDstock_ecru, IDref_ecru, IDref_commande_affectation
         FROM stock_ecru
         WHERE IDstock_ecru = ${stockEcruId}`,
      )
      if (ecruRows.length === 0) { res.status(404).json({ error: 'Stock ecru not found' }); return }
      const s = ecruRows[0] as any
      if (Number(s.IDref_ecru) !== ctx.IDref_ecru) {
        res.status(400).json({ error: 'Stock ecru ref does not match the line\'s fini ref mapping' })
        return
      }
      const current = Number(s.IDref_commande_affectation) || 0
      if (current !== 0 && current !== ligneId) {
        res.status(409).json({ error: 'Stock ecru is already linked to another line' })
        return
      }

      await query(
        `UPDATE stock_ecru SET IDref_commande_affectation = ${ligneId} WHERE IDstock_ecru = ${stockEcruId}`,
      )
      // Auto-recompute the line's prix from the new total écru weight.
      // Must run AFTER the link UPDATE so the SUM sees the new roll, and
      // BEFORE fetchPiecesPayload so the payload's `prix` reflects the
      // freshly-computed value. See pricing-sst.ts for the algorithm.
      await recalcLignePrix(ligneId)
      res.json(await fetchPiecesPayload(ctx, ligneId))
    } catch (err) {
      console.error('Error linking ecru to line:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

commandesSousTraitantRouter.delete(
  '/:commandeId/lignes/:ligneId/pieces/ecru/:stockEcruId',
  async (req: Request, res: Response) => {
    try {
      const commandeId = parseInt(req.params.commandeId, 10)
      const ligneId = parseInt(req.params.ligneId, 10)
      const stockEcruId = parseInt(req.params.stockEcruId, 10)
      if (isNaN(commandeId) || isNaN(ligneId) || isNaN(stockEcruId)) {
        res.status(400).json({ error: 'Invalid ID' }); return
      }
      const ctx = await loadEnnoblisseurLineContext(commandeId, ligneId)
      if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }
      if (refuseIfTerminee(res, await loadCommandeSoldee(commandeId))) return

      await query(
        `UPDATE stock_ecru SET IDref_commande_affectation = 0
         WHERE IDstock_ecru = ${stockEcruId} AND IDref_commande_affectation = ${ligneId}`,
      )
      // Recompute prix now that the écru weight total has dropped.
      await recalcLignePrix(ligneId)
      res.json(await fetchPiecesPayload(ctx, ligneId))
    } catch (err) {
      console.error('Error unlinking ecru from line:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

const finiBody = z.object({
  numero: z.string().min(1).max(20),
  lot: z.string().optional(),
  poids: z.number().optional(),
  metrage: z.number().optional(),
  IDstock_ecru: z.number().int().nonnegative().optional(),
  IDref_fini: z.number().int().positive(),
  IDColoris: z.number().int().nonnegative().optional(),
  IDmagasin: z.number().int().nonnegative().optional(),
  observations: z.string().optional(),
  observation_sst: z.string().optional(),
})

commandesSousTraitantRouter.post(
  '/:commandeId/lignes/:ligneId/pieces/fini',
  async (req: Request, res: Response) => {
    try {
      const commandeId = parseInt(req.params.commandeId, 10)
      const ligneId = parseInt(req.params.ligneId, 10)
      if (isNaN(commandeId) || isNaN(ligneId)) { res.status(400).json({ error: 'Invalid ID' }); return }

      const ctx = await loadEnnoblisseurLineContext(commandeId, ligneId)
      if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }
      if (refuseIfTerminee(res, await loadCommandeSoldee(commandeId))) return

      const parsed = finiBody.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
        return
      }
      const d = parsed.data

      // If a source écru roll is referenced, sanity check it points at this
      // line and inherit its IDcolori_ecru into the new stock_fini's
      // IDColoris (the dyed roll keeps the écru's coloris designation —
      // simpler and avoids the stock_fini.IDColoris-vs-colori_fini
      // mismatch in the legacy schema).
      let inheritedIDColoris = d.IDColoris ?? 0
      // Inherit the source écru's client reservation. When the écru was
      // affected with `IDligne_commande_client > 0` (e.g. reserved for
      // "BONNE NOUVELLE"), the dyed roll keeps the same reservation so
      // the client tag flows downstream into the Réception tab.
      let inheritedLcc = 0
      if (d.IDstock_ecru && d.IDstock_ecru > 0) {
        const verify = await query<{
          IDref_commande_affectation: number | null
          IDcolori_ecru: number | null
          IDligne_commande_client: number | null
        }>(
          `SELECT IDref_commande_affectation, IDcolori_ecru, IDligne_commande_client
           FROM stock_ecru WHERE IDstock_ecru = ${d.IDstock_ecru}`,
        )
        if (verify.length === 0) {
          res.status(400).json({ error: 'Source ecru not found' }); return
        }
        const aff = Number((verify[0] as any).IDref_commande_affectation) || 0
        if (aff !== ligneId) {
          res.status(400).json({ error: 'Source ecru is not affected to this line' }); return
        }
        if (!inheritedIDColoris) {
          inheritedIDColoris = Number((verify[0] as any).IDcolori_ecru) || 0
        }
        inheritedLcc = Number((verify[0] as any).IDligne_commande_client) || 0
      }

      const today = new Date()
      const yyyy = String(today.getFullYear())
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const dateSaisie = `${yyyy}${mm}${dd}`

      // Resolve the parent commande's sous-traitant. New receptions are
      // stored in the magasin keyed on that sst id (matches legacy: 86%
      // of legacy stock_fini rows have IDmagasin = IDsous_traitant; the
      // mismatched ones are mostly the IDmagasin=0 rows previously
      // inserted by MPS_NG before this fix). Body-supplied IDmagasin
      // (non-zero) still wins so a user can override later.
      const cmdInfo = await query<{ IDsous_traitant: number | null }>(
        `SELECT IDsous_traitant FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${commandeId}`,
      )
      const sstId = Number(cmdInfo[0]?.IDsous_traitant) || 0
      const idMagasin = (d.IDmagasin && d.IDmagasin > 0) ? d.IDmagasin : sstId

      // IDetat_stock_fini = 1 → "En Contrôle" (per etat_stock_fini
      // label table). New receptions need inspection before being
      // validated/shipped, so they enter at state 1.
      await query(
        `INSERT INTO stock_fini
         (numero, lot, poids, metrage, IDref_fini, IDColoris, IDstock_ecru,
          IDmagasin, IDref_commande_source, observations, observation_sst, date_saisie,
          second_choix, destockage, don, IDProprietaire, IDcommande_donation, IDligne_commande_client, IDligne_expedition,
          IDetat_stock_fini)
         VALUES ('${esc(d.numero)}', '${esc(d.lot ?? '')}', ${n(d.poids)}, ${n(d.metrage)},
                 ${d.IDref_fini}, ${inheritedIDColoris}, ${d.IDstock_ecru ?? 0},
                 ${idMagasin}, ${ligneId}, '${esc(d.observations ?? '')}', '${esc(d.observation_sst ?? '')}', '${dateSaisie}',
                 0, 0, 0, 0, 0, ${inheritedLcc}, 0, 1)`,
      )

      // Track the lot in suivilot if it isn't already. Idempotent per
      // (ligne, lot) — only the first reception of a given lot creates
      // the row. Totals stay at 0 (a downstream workflow populates
      // quantite_receptionnee / metrage_receptionne), matching legacy.
      await upsertSuivilot({ commandeId, ligneId, lot: d.lot ?? '' })

      res.status(201).json(await fetchPiecesPayload(ctx, ligneId))
    } catch (err) {
      console.error('Error creating stock_fini reception:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

commandesSousTraitantRouter.delete(
  '/:commandeId/lignes/:ligneId/pieces/fini/:stockFiniId',
  async (req: Request, res: Response) => {
    try {
      const commandeId = parseInt(req.params.commandeId, 10)
      const ligneId = parseInt(req.params.ligneId, 10)
      const stockFiniId = parseInt(req.params.stockFiniId, 10)
      if (isNaN(commandeId) || isNaN(ligneId) || isNaN(stockFiniId)) {
        res.status(400).json({ error: 'Invalid ID' }); return
      }
      const ctx = await loadEnnoblisseurLineContext(commandeId, ligneId)
      if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }
      if (refuseIfTerminee(res, await loadCommandeSoldee(commandeId))) return

      // Refuse if the row already has downstream usage we'd be erasing silently.
      const verify = await query<{
        IDref_commande_source: number | null
        IDligne_expedition: number | null
        IDligne_commande_client: number | null
        destockage: number | null
      }>(
        `SELECT IDref_commande_source, IDligne_expedition, IDligne_commande_client, destockage
         FROM stock_fini
         WHERE IDstock_fini = ${stockFiniId}`,
      )
      if (verify.length === 0) { res.status(404).json({ error: 'Stock fini not found' }); return }
      const v = verify[0] as any
      if (Number(v.IDref_commande_source) !== ligneId) {
        res.status(400).json({ error: 'Stock fini is not linked to this line' }); return
      }
      if ((Number(v.IDligne_expedition) || 0) > 0
        || (Number(v.IDligne_commande_client) || 0) > 0
        || Number(v.destockage) === 1) {
        res.status(409).json({
          error: 'fini_already_used',
          message:
            "Ce rouleau a déjà été utilisé en aval (expédition / commande client / destockage). Annulez d'abord ces opérations dans le stock finis.",
        })
        return
      }

      await query(`DELETE FROM stock_fini WHERE IDstock_fini = ${stockFiniId}`)
      res.json(await fetchPiecesPayload(ctx, ligneId))
    } catch (err) {
      console.error('Error deleting stock_fini reception:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

// ── Edit a stock_fini reception's notes ──────────────────
//
// PATCH only edits the two free-text columns:
//   - `observations`     : the visiteur's note shared with the customer
//                          (blue banner in the UI)
//   - `observation_sst`  : the ennoblisseur's defect report
//                          (red banner in the UI)
//
// Reprise flow (multi-select in the Réception tab → "Reprendre X" → batch
// dialog): the same PATCH endpoint is also used to update lot / poids /
// metrage / numero on a roll currently in `IDetat_stock_fini = 2` ("En
// reprise"). The frontend defaults the etat back to `1` (En contrôle)
// after the reprise edit so the visiteur can re-validate the values.
// Other stock_fini fields (magasin, …) remain non-editable from this
// surface — they'd require revisiting the link/destockage invariants.

const finiNotesPatchBody = z.object({
  observations: z.string().optional(),
  observation_sst: z.string().optional(),
  // Reprise-only fields. All optional — only set when the caller wants to
  // overwrite the corresponding stock_fini column.
  numero: z.string().max(40).optional(),
  lot: z.string().max(40).optional(),
  poids: z.number().nonnegative().optional(),
  metrage: z.number().nonnegative().optional(),
  IDetat_stock_fini: z.number().int().min(1).max(5).optional(),
})

commandesSousTraitantRouter.patch(
  '/:commandeId/lignes/:ligneId/pieces/fini/:stockFiniId',
  async (req: Request, res: Response) => {
    try {
      const commandeId = parseInt(req.params.commandeId, 10)
      const ligneId = parseInt(req.params.ligneId, 10)
      const stockFiniId = parseInt(req.params.stockFiniId, 10)
      if (isNaN(commandeId) || isNaN(ligneId) || isNaN(stockFiniId)) {
        res.status(400).json({ error: 'Invalid ID' }); return
      }
      const ctx = await loadEnnoblisseurLineContext(commandeId, ligneId)
      if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }
      if (refuseIfTerminee(res, await loadCommandeSoldee(commandeId))) return

      const parsed = finiNotesPatchBody.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
        return
      }
      const d = parsed.data

      // Verify the row belongs to this line — symmetric with the DELETE
      // handler. We don't need the downstream-usage guard here because
      // editing notes never breaks an expedition / commande client / etc.
      const verify = await query<{ IDref_commande_source: number | null }>(
        `SELECT IDref_commande_source FROM stock_fini WHERE IDstock_fini = ${stockFiniId}`,
      )
      if (verify.length === 0) { res.status(404).json({ error: 'Stock fini not found' }); return }
      if (Number(verify[0].IDref_commande_source) !== ligneId) {
        res.status(400).json({ error: 'Stock fini is not linked to this line' }); return
      }

      const setParts: string[] = []
      if (d.observations !== undefined) setParts.push(`observations = '${esc(d.observations)}'`)
      if (d.observation_sst !== undefined) setParts.push(`observation_sst = '${esc(d.observation_sst)}'`)
      if (d.numero !== undefined) setParts.push(`numero = '${esc(d.numero)}'`)
      if (d.lot !== undefined) setParts.push(`lot = '${esc(d.lot)}'`)
      if (d.poids !== undefined) setParts.push(`poids = ${d.poids}`)
      if (d.metrage !== undefined) setParts.push(`metrage = ${d.metrage}`)
      if (d.IDetat_stock_fini !== undefined) setParts.push(`IDetat_stock_fini = ${d.IDetat_stock_fini}`)
      if (setParts.length > 0) {
        await query(`UPDATE stock_fini SET ${setParts.join(', ')} WHERE IDstock_fini = ${stockFiniId}`)
      }
      res.json(await fetchPiecesPayload(ctx, ligneId))
    } catch (err) {
      console.error('Error updating stock_fini notes:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

// ── Tricobot — autofill from BL PDFs ─────────────────────
//
// Tricobot is an AI agent that monitors the company inbox, parses BLs
// received from sous-traitants, and writes per-piece rows into
// `data_bl_tricotbot`. This endpoint returns those rows for a given
// ligne so the frontend batch-reception dialog can pre-populate Lot /
// Poids / Métrage / Défaut by matching `num_piece` to each écru's
// numero.
commandesSousTraitantRouter.get(
  '/:commandeId/lignes/:ligneId/tricobot',
  async (req: Request, res: Response) => {
    try {
      const commandeId = parseInt(req.params.commandeId, 10)
      const ligneId = parseInt(req.params.ligneId, 10)
      if (isNaN(commandeId) || isNaN(ligneId)) { res.status(400).json({ error: 'Invalid ID' }); return }
      const ctx = await loadEnnoblisseurLineContext(commandeId, ligneId)
      if (!ctx) { res.status(404).json({ error: 'Line not found or does not belong to commande' }); return }

      const rows = await query<{
        IDdata_bl_tricotbot: number
        IDligne_commande_sous_traitant: number
        lot: string | null
        poids: number | null
        metrage: number | null
        observation: string | null
        num_piece: string | null
        DATE: string | null
      }>(
        `SELECT IDdata_bl_tricotbot, IDligne_commande_sous_traitant, lot, poids, metrage,
                observation, num_piece, DATE
         FROM data_bl_tricotbot
         WHERE IDligne_commande_sous_traitant = ${ligneId}`,
      )
      const fixed = await fixEncoding(rows, 'data_bl_tricotbot', 'IDdata_bl_tricotbot', ['observation', 'num_piece', 'lot'])
      res.json(fixed)
    } catch (err) {
      console.error('Error fetching tricobot data:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

// ── Documents (polymorphic GED) ──────────────────────────
//
// Discriminator: rows where IDcommande_sous_traitant = id AND IDtype_doc
// is in the sst-relevant whitelist below. The whitelist was empirically
// derived from production data — see inspect-pieces-flow.ts output:
//   1=facture fil, 2=autre, 3=bl retour ennoblisseur (most common),
//   4=bl retour tricoteur, 5=cert GOTS, 6=bl fournisseur, 15=soumission
//
// CRITICAL: we do NOT filter `IDcommande_client = 0`. A single ged row
// can legitimately point at BOTH a sous-traitant commande and the parent
// client commande in the chain (e.g. ged#9292 for sst-cmd 7925 also has
// IDcommande_client = 6351). Adding the zero filter silently hides
// those shared docs — see the CLAUDE.md polymorphic-ged rule.

const COMMANDE_SST_DOC_TYPES = '1, 2, 3, 4, 5, 6, 15'

commandesSousTraitantRouter.get('/:id/documents', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const rows = await query<{
      IDged: number
      nom: string | null
      commentaire: string | null
      IDtype_doc: number
    }>(
      `SELECT g.IDged, g.nom, g.commentaire, g.IDtype_doc
       FROM ged g
       WHERE g.IDcommande_sous_traitant = ${id}
         AND g.IDtype_doc IN (${COMMANDE_SST_DOC_TYPES})
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

    const out = fixed.map((r) => ({
      IDged: r.IDged,
      nom: r.nom,
      commentaire: r.commentaire,
      IDtype_doc: r.IDtype_doc,
      type_nom: typeMap.get(r.IDtype_doc) ?? null,
    }))
    res.json(out)
  } catch (err) {
    console.error('Error listing commande-sst documents:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesSousTraitantRouter.get('/:id/documents/:idged/fichier', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    const idged = parseInt(req.params.idged, 10)
    if (isNaN(id) || isNaN(idged)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const rows = await queryRaw(
      `SELECT fichier FROM ged
       WHERE IDged = ${idged}
         AND IDcommande_sous_traitant = ${id}
         AND IDtype_doc IN (${COMMANDE_SST_DOC_TYPES})`,
    )
    if (rows.length === 0) { res.status(404).json({ error: 'Document not found' }); return }
    const fichier = (rows[0] as any).fichier
    if (fichier == null) { res.status(404).json({ error: 'No file attached' }); return }
    let buf: Buffer
    if (fichier instanceof ArrayBuffer) buf = Buffer.from(fichier)
    else if (Buffer.isBuffer(fichier)) buf = fichier
    else { res.status(404).json({ error: 'No file attached' }); return }
    if (buf.length === 0 || (buf.length === 1 && buf[0] === 0)) {
      res.status(404).json({ error: 'No file attached' }); return
    }

    let contentType = 'application/octet-stream'
    if (buf.length >= 4) {
      const h = buf.subarray(0, 4)
      if (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) contentType = 'application/pdf'
      else if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4E && h[3] === 0x47) contentType = 'image/png'
      else if (h[0] === 0xFF && h[1] === 0xD8) contentType = 'image/jpeg'
    }
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', 'inline')
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.end(buf)
  } catch (err) {
    console.error('Error serving commande-sst document:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

commandesSousTraitantRouter.post(
  '/:id/documents',
  upload.single('fichier'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10)
      if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
      const cf = await query(
        `SELECT IDcommande_sous_traitant FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${id}`,
      )
      if (cf.length === 0) { res.status(404).json({ error: 'Commande not found' }); return }

      const nom = (req.body.nom ?? '').toString()
      const commentaire = (req.body.commentaire ?? '').toString()
      const idTypeDoc = parseInt(req.body.IDtype_doc, 10) || 0

      // Note: IDreference is set to the commande id too (mirroring the
      // legacy convention seen in commande_fil docs) so any future query
      // that joined on IDreference still finds the rows.
      await query(
        `INSERT INTO ged (nom, commentaire, IDtype_doc, IDreference, IDcommande_client, IDcommande_sous_traitant, IDdossier)
         VALUES ('${esc(nom)}', '${esc(commentaire)}', ${idTypeDoc}, ${id}, 0, ${id}, 0)`,
      )

      const newRows = await query<{ IDged: number }>(
        `SELECT IDged FROM ged
         WHERE IDcommande_sous_traitant = ${id}
           AND IDcommande_client = 0
           AND IDtype_doc = ${idTypeDoc}
         ORDER BY IDged DESC`,
      )
      if (newRows.length === 0) { res.status(500).json({ error: 'Insert lookup failed' }); return }
      const newId = newRows[0].IDged

      if (req.file && req.file.buffer.length > 0) {
        const hexStr = req.file.buffer.toString('hex')
        await queryRaw(`UPDATE ged SET fichier = x'${hexStr}' WHERE IDged = ${newId}`)
      }

      res.status(201).json({ IDged: newId })
    } catch (err) {
      console.error('Error creating commande-sst document:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

commandesSousTraitantRouter.put(
  '/:id/documents/:idged',
  upload.single('fichier'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10)
      const idged = parseInt(req.params.idged, 10)
      if (isNaN(id) || isNaN(idged)) { res.status(400).json({ error: 'Invalid ID' }); return }

      const scope = await query(
        `SELECT IDged FROM ged
         WHERE IDged = ${idged}
           AND IDcommande_sous_traitant = ${id}
           AND IDtype_doc IN (${COMMANDE_SST_DOC_TYPES})`,
      )
      if (scope.length === 0) { res.status(404).json({ error: 'Document not found' }); return }

      const sets: string[] = []
      if (req.body.nom !== undefined) sets.push(`nom = '${esc(String(req.body.nom))}'`)
      if (req.body.commentaire !== undefined) sets.push(`commentaire = '${esc(String(req.body.commentaire))}'`)
      if (req.body.IDtype_doc !== undefined) sets.push(`IDtype_doc = ${parseInt(req.body.IDtype_doc, 10) || 0}`)
      if (sets.length > 0) {
        await query(`UPDATE ged SET ${sets.join(', ')} WHERE IDged = ${idged}`)
      }
      if (req.file && req.file.buffer.length > 0) {
        const hexStr = req.file.buffer.toString('hex')
        await queryRaw(`UPDATE ged SET fichier = x'${hexStr}' WHERE IDged = ${idged}`)
      } else if (req.body.remove_fichier === '1') {
        await query(`UPDATE ged SET fichier = NULL WHERE IDged = ${idged}`)
      }
      res.json({ ok: true })
    } catch (err) {
      console.error('Error updating commande-sst document:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

commandesSousTraitantRouter.delete('/:id/documents/:idged', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    const idged = parseInt(req.params.idged, 10)
    if (isNaN(id) || isNaN(idged)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const scope = await query(
      `SELECT IDged FROM ged
       WHERE IDged = ${idged}
         AND IDcommande_sous_traitant = ${id}
         AND IDtype_doc IN (${COMMANDE_SST_DOC_TYPES})`,
    )
    if (scope.length === 0) { res.status(404).json({ error: 'Document not found' }); return }
    await query(`DELETE FROM ged WHERE IDged = ${idged}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting commande-sst document:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Reuse the type-doc lookup that fournisseurs already exposes (if the FE
// relies on it). The list endpoint above already includes per-doc type_nom
// resolution, so the FE often won't need this — but having the router
// expose it locally avoids a cross-route dependency for the FE.
commandesSousTraitantRouter.get('/lookups/type-doc', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDtype_doc: number; nom: string | null }>(
      `SELECT IDtype_doc, nom FROM type_doc WHERE IDtype_doc IN (${COMMANDE_SST_DOC_TYPES}) ORDER BY nom`,
    )
    const fixed = await fixEncoding(rows, 'type_doc', 'IDtype_doc', ['nom'])
    res.json(fixed)
  } catch (err) {
    console.error('Error listing sst type-doc:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Suppress unused-import noise for the type loader helper used only in
// validation paths. (kept here intentionally for future ennoblisseur-only
// gating logic on POST line, etc.)
void loadSousTraitantType

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { query, fixEncoding } from '../lib/hfsql-auto.js'
import { repairAliased, resolveSstLine, resolveProvenanceFils } from './stock-fini.js'
import { userHasPermission } from '../lib/permissions.js'
import { isEffectiveAdmin } from '../lib/auth.js'

export const stockEcruRouter: RouterType = Router()

type StockEcru = Record<string, unknown>

/** Escape a string for use in SQL (single quotes doubled). */
function esc(value: string): string {
  return value.replace(/'/g, "''")
}

const IS_WINDOWS = process.platform === 'win32'

/** ref_ecru.archivé is accented — on Linux SELECT * returns a mangled key. */
function isArchive(row: Record<string, unknown>): boolean {
  const v = row.archivé ?? row.archiv ?? 0
  return Number(v) === 1
}

/** Emit a text value as a bridge-safe SQL literal: plain quoted for ASCII,
 *  Latin-1 hex literal for accented text (raw multi-byte UTF-8 in a SQL
 *  string corrupts the Linux bridge → [HY090]). Ported from stock-fini.ts. */
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

// stock_ecru and the tables we join (ref_ecru, colori_ecru, sous_traitant) have
// NO accented columns in the fields we read, so the IS_WINDOWS branching from
// stock.ts is not needed on the base query — every selected column name is
// ASCII. Accented *values* in numero/lot/observations/visiteur and the joined
// labels are repaired afterwards via repairAliased (batched CONVERT).
const STOCK_ECRU_SELECT = `se.IDstock_ecru, se.IDref_ecru, se.IDcolori_ecru, se.IDmagasin, se.IDordre_fabrication, se.IDref_commande_source, se.IDref_commande_affectation, se.IDligne_commande_client, se.poids, se.metrage, se.lot, se.numero, se.observations, se.visiteur, se.second_choix, se.date_saisie, re.reference AS ref_ecru, ce.reference AS coloris_reference, st.nom AS magasin_nom`

const STOCK_ECRU_JOINS = `FROM stock_ecru se LEFT JOIN ref_ecru re ON se.IDref_ecru = re.IDref_ecru LEFT JOIN colori_ecru ce ON se.IDcolori_ecru = ce.IDcolori_ecru LEFT JOIN sous_traitant st ON se.IDmagasin = st.IDsous_traitant`

const TEXT_FIELDS = ['numero', 'lot', 'observations', 'visiteur']

export interface DefautQualite {
  IDdefaut_qualite: number
  description: string | null
  type_defaut: string | null
  taille_cm: number | null
}

/** Build the per-roll défauts summary string shown in the table column:
 *  "Maille 200 cm; Trou" etc. Each defect is `type_defaut [taille cm]`, falling
 *  back to its free-text description when there's no structured type. */
export function defautSummary(defects: DefautQualite[]): string {
  return defects
    .map((d) => {
      const type = (d.type_defaut ?? '').toString().trim()
      const size = d.taille_cm != null && Number(d.taille_cm) > 0 ? `${Number(d.taille_cm)} cm` : ''
      const head = [type, size].filter(Boolean).join(' ')
      return head || (d.description ?? '').toString().trim()
    })
    .filter(Boolean)
    .join('; ')
}

/** Fetch structured defects for a set of écru rolls. `defaut_qualite` is
 *  polymorphic: Type_Reference=2 with reference (string) = stringified
 *  IDstock_ecru (pattern: commandes-sous-traitant.ts). Returns a Map keyed by
 *  IDstock_ecru. */
export async function fetchDefectsByEcru(ecruIds: number[]): Promise<Map<number, DefautQualite[]>> {
  const out = new Map<number, DefautQualite[]>()
  const ids = Array.from(new Set(ecruIds.filter((x) => Number.isInteger(x) && x > 0)))
  if (ids.length === 0) return out
  const inList = ids.map((x) => `'${x}'`).join(',')
  const rows = await query<{
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
  const fixed = await fixEncoding(rows, 'defaut_qualite', 'IDdefaut_qualite', ['description', 'type_defaut'])
  for (const d of fixed as any[]) {
    const ecruId = parseInt(String(d.reference ?? ''), 10)
    if (!Number.isInteger(ecruId)) continue
    const arr = out.get(ecruId) ?? []
    arr.push({
      IDdefaut_qualite: Number(d.IDdefaut_qualite),
      description: d.description ?? null,
      type_defaut: d.type_defaut ?? null,
      taille_cm: d.taille_cm == null ? null : Number(d.taille_cm),
    })
    out.set(ecruId, arr)
  }
  return out
}

interface ClientReservation {
  commande_numero: string | null
  client_nom: string | null
}

/** Resolve a set of IDligne_commande_client → { N° commande, client name } via
 *  the flat chain ligne_commande_client → commande_client → client. Flat
 *  queries only (a JOIN + CONVERT collapses the result set on the Linux bridge
 *  — see CLAUDE.md). Returns a Map keyed by IDligne_commande_client; missing /
 *  empty links are simply absent. */
async function resolveClientReservations(lccIds: number[]): Promise<Map<number, ClientReservation>> {
  const out = new Map<number, ClientReservation>()
  const ids = Array.from(new Set(lccIds.filter((x) => Number.isInteger(x) && x > 0)))
  if (ids.length === 0) return out

  const lccRows = await query<{ IDligne_commande_client: number; IDcommande_client: number }>(
    `SELECT IDligne_commande_client, IDcommande_client FROM ligne_commande_client WHERE IDligne_commande_client IN (${ids.join(',')})`,
  )
  const lccToCc = new Map<number, number>()
  for (const r of lccRows) lccToCc.set(Number(r.IDligne_commande_client), Number(r.IDcommande_client) || 0)

  const ccIds = Array.from(new Set(Array.from(lccToCc.values()))).filter((x) => x > 0)
  const ccInfo = new Map<number, { numero: string | null; IDclient: number }>()
  if (ccIds.length > 0) {
    const ccRows = await query<{ IDcommande_client: number; IDclient: number; numero: string | null }>(
      `SELECT IDcommande_client, IDclient, numero FROM commande_client WHERE IDcommande_client IN (${ccIds.join(',')})`,
    )
    for (const r of ccRows) {
      ccInfo.set(Number(r.IDcommande_client), {
        numero: (r.numero ?? null) as string | null,
        IDclient: Number(r.IDclient) || 0,
      })
    }
  }

  const clientIds = Array.from(new Set(Array.from(ccInfo.values()).map((c) => c.IDclient))).filter((x) => x > 0)
  const clientName = new Map<number, string>()
  if (clientIds.length > 0) {
    const cRows = await query<{ IDclient: number; nom: string | null }>(
      `SELECT IDclient, nom FROM client WHERE IDclient IN (${clientIds.join(',')})`,
    )
    const fixedC = (await fixEncoding(cRows, 'client', 'IDclient', ['nom'])) as any[]
    for (const r of fixedC) clientName.set(Number(r.IDclient), (r.nom ?? '').toString().trim())
  }

  for (const [lccId, ccId] of lccToCc) {
    const cc = ccInfo.get(ccId)
    if (!cc) continue
    const numero = (cc.numero ?? '').toString().trim() || null
    const nom = clientName.get(cc.IDclient) || null
    if (numero || nom) out.set(lccId, { commande_numero: numero, client_nom: nom })
  }
  return out
}

/** Repair the base text columns + joined labels for a batch of écru rows, then
 *  attach the resolved client reservation (N° commande + client) and the
 *  défauts summary. Shared by the list and detail endpoints. */
async function hydrateEcruRows(rows: StockEcru[]): Promise<StockEcru[]> {
  let fixed = await repairAliased(rows, 'stock_ecru', 'IDstock_ecru', {
    numero: 'numero',
    lot: 'lot',
    observations: 'observations',
    visiteur: 'visiteur',
  })
  fixed = await repairAliased(fixed, 'ref_ecru', 'IDref_ecru', { ref_ecru: 'reference' })
  fixed = await repairAliased(fixed, 'colori_ecru', 'IDcolori_ecru', { coloris_reference: 'reference' })
  fixed = await repairAliased(fixed, 'sous_traitant', 'IDmagasin', { magasin_nom: 'nom' }, 'IDsous_traitant')

  const lccIds = fixed.map((r) => Number((r as any).IDligne_commande_client) || 0)
  const reservations = await resolveClientReservations(lccIds)
  const ecruIds = fixed.map((r) => Number((r as any).IDstock_ecru) || 0)
  const defectsByEcru = await fetchDefectsByEcru(ecruIds)

  for (const r of fixed as any[]) {
    const lccId = Number(r.IDligne_commande_client) || 0
    const resv = lccId > 0 ? reservations.get(lccId) : undefined
    r.commande_numero = resv?.commande_numero ?? null
    r.client_nom = resv?.client_nom ?? null
    const defects = defectsByEcru.get(Number(r.IDstock_ecru) || 0) ?? []
    r.defects = defects
    r.defauts = defautSummary(defects)
  }
  return fixed
}

// GET /api/stock/ecru - list écru (tombé de métier) rolls with joined display
//   columns + client reservation + défauts.
//     ?statut=disponible | teinture | tous   (default disponible)
//        disponible → not affected to an ennoblisseur (dyeing) line
//        teinture   → affected to a dyeing line (IDref_commande_affectation > 0)
//        tous       → no affectation filter
//     ?second_choix=1   → only second-choix rolls
//     ?q=<text>         → optional server-side fuzzy filter (the frontend
//                         filters client-side; kept for completeness)
stockEcruRouter.get('/ecru', async (req: Request, res: Response) => {
  try {
    const statut = typeof req.query.statut === 'string' ? req.query.statut : 'disponible'
    const onlySecond = req.query.second_choix === '1'
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''

    // Base population = ETM écru rolls currently physically in stock:
    //   IDsociete = 1             → ETM only (TRM rolls belong to the sister
    //                               company; the legacy ETM screen never shows them)
    //   IDligne_expedition_ETM = 0 → not yet shipped out from ETM
    //   no stock_fini child        → not yet dyed/consumed into a finished roll
    // This bounds the view to the live working set (~1.5k rolls) matching the
    // legacy "Disponible / En teinture / Tous" screen. Without it, "Tous" would
    // return ~45k historical rows and the client-chain + défauts hydration would
    // time out. (IDligne_expedition_TRM is NOT a stock signal — it records the
    // TRM→ETM provenance, so most in-stock rolls carry it.)
    // HFSQL stores "no FK" as 0 (not NULL) — guard both.
    const where: string[] = [
      'se.IDsociete = 1',
      '(se.IDligne_expedition_ETM = 0 OR se.IDligne_expedition_ETM IS NULL)',
      'NOT EXISTS (SELECT 1 FROM stock_fini sf WHERE sf.IDstock_ecru = se.IDstock_ecru)',
    ]
    if (statut === 'disponible') {
      where.push(`(se.IDref_commande_affectation IS NULL OR se.IDref_commande_affectation = 0)`)
      // Rolls reserved to a donation commande client are already assigned —
      // they are not disponible (still visible under "tous").
      where.push(`(se.IDcommande_donation IS NULL OR se.IDcommande_donation = 0)`)
    } else if (statut === 'teinture') {
      where.push(`se.IDref_commande_affectation > 0`)
    }
    if (onlySecond) where.push(`se.second_choix = 1`)
    if (q) {
      const e = esc(q)
      where.push(
        `(se.lot LIKE '%${e}%' OR se.numero LIKE '%${e}%' OR se.observations LIKE '%${e}%' OR se.visiteur LIKE '%${e}%' OR re.reference LIKE '%${e}%' OR ce.reference LIKE '%${e}%')`,
      )
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const sql = `SELECT ${STOCK_ECRU_SELECT} ${STOCK_ECRU_JOINS} ${whereSql} ORDER BY se.date_saisie DESC, se.IDstock_ecru DESC`
    const rows = await query<StockEcru>(sql)
    const hydrated = await hydrateEcruRows(rows)
    res.json(hydrated)
  } catch (err) {
    console.error('Error fetching stock_ecru:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/ecru/lookups/refs - ref_ecru list for the "Nouveau" form.
stockEcruRouter.get('/ecru/lookups/refs', async (_req: Request, res: Response) => {
  try {
    // ref_ecru.archivé is accented: name it only on Windows; on Linux SELECT *
    // and filter in JS (naming the accented column storms the bridge).
    const sql = IS_WINDOWS
      ? `SELECT IDref_ecru, reference, designation FROM ref_ecru WHERE archivé = 0 ORDER BY reference`
      : `SELECT * FROM ref_ecru ORDER BY reference`
    const rows = await query<Record<string, unknown>>(sql)
    const visible = IS_WINDOWS ? rows : rows.filter((r) => !isArchive(r))
    const shaped = visible.map((r) => ({
      IDref_ecru: Number(r.IDref_ecru),
      reference: (r.reference ?? null) as string | null,
      designation: (r.designation ?? null) as string | null,
    }))
    const fixed = (await fixEncoding(shaped, 'ref_ecru', 'IDref_ecru', ['reference', 'designation'])) as any[]
    res.json(fixed.filter((r) => r.reference && String(r.reference).trim().length > 0))
  } catch (err) {
    console.error('Error fetching refs-ecru lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/ecru/lookups/coloris?ref_ecru=X - colori_ecru options for a ref.
//   colori_ecru cannot be read via SELECT * (returns 0 rows) — explicit columns.
stockEcruRouter.get('/ecru/lookups/coloris', async (req: Request, res: Response) => {
  try {
    const refEcru = parseInt(String(req.query.ref_ecru ?? ''), 10)
    if (isNaN(refEcru) || refEcru <= 0) { res.json([]); return }
    const rows = await query<{ IDcolori_ecru: number; reference: string | null }>(
      `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDref_ecru = ${refEcru} ORDER BY reference`,
    )
    const fixed = (await fixEncoding(rows, 'colori_ecru', 'IDcolori_ecru', ['reference'])) as any[]
    res.json(
      fixed
        .filter((r) => r.reference && String(r.reference).trim().length > 0)
        .map((r) => ({ id: Number(r.IDcolori_ecru), reference: r.reference })),
    )
  } catch (err) {
    console.error('Error fetching coloris-ecru lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/ecru/lookups/magasins - sous_traitant rows used as depots
//   (stock_ecru.IDmagasin → sous_traitant).
stockEcruRouter.get('/ecru/lookups/magasins', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDsous_traitant: number; nom: string | null }>(
      `SELECT IDsous_traitant, nom FROM sous_traitant ORDER BY nom`,
    )
    const fixed = (await fixEncoding(rows, 'sous_traitant', 'IDsous_traitant', ['nom'])) as any[]
    res.json(
      fixed
        .filter((r) => r.nom && String(r.nom).trim().length > 0)
        .map((r) => ({ IDsous_traitant: Number(r.IDsous_traitant), nom: r.nom })),
    )
  } catch (err) {
    console.error('Error fetching magasins lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/stock/ecru - manually create an écru roll. Gated by the
//   create_stock_ecru permission (effective admins bypass). Écru rolls are
//   normally created by the tricoteur reception flow; this is the rare manual
//   entry. Column set mirrors the reception INSERT (commandes-sous-traitant.ts)
//   plus visiteur — every named column is known to exist (naming a phantom
//   column storms the Linux bridge). Empty text → '' (never NULL).
stockEcruRouter.post('/ecru', async (req: Request, res: Response) => {
  try {
    if (req.userId === undefined) {
      res.status(401).json({ error: 'not authenticated' })
      return
    }
    const allowed = await userHasPermission(req.userId, isEffectiveAdmin(req), 'create_stock_ecru')
    if (!allowed) {
      res.status(403).json({ error: 'permission denied: create_stock_ecru' })
      return
    }

    const b = req.body ?? {}
    const IDref_ecru = parseInt(String(b.IDref_ecru), 10)
    const IDcolori_ecru = parseInt(String(b.IDcolori_ecru), 10)
    const poids = Number(b.poids)
    if (!Number.isInteger(IDref_ecru) || IDref_ecru <= 0) {
      res.status(400).json({ error: 'IDref_ecru required' })
      return
    }
    if (!Number.isInteger(IDcolori_ecru) || IDcolori_ecru <= 0) {
      res.status(400).json({ error: 'IDcolori_ecru required' })
      return
    }
    if (!Number.isFinite(poids) || poids < 0) {
      res.status(400).json({ error: 'poids must be a non-negative number' })
      return
    }
    const metrage = Number.isFinite(Number(b.metrage)) && Number(b.metrage) >= 0 ? Number(b.metrage) : 0
    const r2 = (v: number) => Math.round(v * 100) / 100
    const IDmagasin = Number.isInteger(parseInt(String(b.IDmagasin), 10)) && parseInt(String(b.IDmagasin), 10) > 0
      ? parseInt(String(b.IDmagasin), 10)
      : 0
    const secondChoix = b.second_choix ? 1 : 0
    const lot = (b.lot ?? '').toString()
    const numero = (b.numero ?? '').toString()
    const observations = (b.observations ?? '').toString()
    const visiteur = (b.visiteur ?? '').toString()
    const now = new Date()
    const dateSaisie = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

    await query(
      `INSERT INTO stock_ecru
       (numero, lot, poids, metrage, IDref_ecru, IDcolori_ecru, IDmagasin,
        IDordre_fabrication, IDref_commande_source, IDref_commande_affectation,
        IDligne_commande_client, IDLigne_Commande_TRM, IDsociete,
        second_choix, observations, visiteur, date_saisie)
       VALUES (${sqlText(numero)}, ${sqlText(lot)}, ${r2(poids)}, ${r2(metrage)},
               ${IDref_ecru}, ${IDcolori_ecru}, ${IDmagasin},
               0, 0, 0,
               0, 0, 1,
               ${secondChoix}, ${sqlText(observations)}, ${sqlText(visiteur)}, '${dateSaisie}')`,
    )
    const idRows = await query<{ id: number }>(`SELECT MAX(IDstock_ecru) AS id FROM stock_ecru`)
    const newId = Number(idRows[0]?.id) || null
    res.status(201).json({ IDstock_ecru: newId })
  } catch (err) {
    console.error('Error creating stock_ecru:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/ecru/:id - single écru roll, same shape as a list row.
stockEcruRouter.get('/ecru/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }
    const rows = await query<StockEcru>(
      `SELECT ${STOCK_ECRU_SELECT} ${STOCK_ECRU_JOINS} WHERE se.IDstock_ecru = ${id}`,
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Stock écru not found' })
      return
    }
    const hydrated = await hydrateEcruRows(rows)
    res.json(hydrated[0])
  } catch (err) {
    console.error('Error fetching stock_ecru detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/stock/ecru/:id/provenance — yarn + knitting origins of one écru roll.
//   The écru roll IS the source écru, so its provenance is simpler than a fini's:
//     stock_ecru.IDref_commande_source → the tricoteur sst line that knit it
//       → resolveSstLine gives { sst_nom, IDcommande } (Tricotage)
//       → resolveProvenanceFils gives the yarn lots affected to that line (Fils)
//   There is no "ennoblissement" step — dyeing is the écru's destination
//   (IDref_commande_affectation), not its origin. Read-only, not gated.
//   Mirrors stock-fini.ts /provenance; reuses its exported resolvers.
stockEcruRouter.get('/ecru/:id/provenance', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }
    const rows = await query<{ IDref_commande_source: number }>(
      `SELECT IDref_commande_source FROM stock_ecru WHERE IDstock_ecru = ${id}`,
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Stock écru not found' })
      return
    }
    const tricoteurLineId = Number(rows[0].IDref_commande_source) || 0
    const tricotage = await resolveSstLine(tricoteurLineId)
    const fils = await resolveProvenanceFils(tricoteurLineId)
    res.json({ tricotage, fils })
  } catch (err) {
    console.error('Error fetching stock_ecru provenance:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/stock/ecru/batch - "Édition groupée": apply observations / visiteur
//   / magasin / second_choix to many rolls at once. Only the provided fields
//   are written. Accented values via sqlText() for bridge safety.
//   MUST be registered before PATCH /ecru/:id (else "batch" is parsed as :id).
stockEcruRouter.patch('/ecru/batch', async (req: Request, res: Response) => {
  try {
    if (req.userId === undefined) {
      res.status(401).json({ error: 'not authenticated' })
      return
    }
    const allowed = await userHasPermission(req.userId, isEffectiveAdmin(req), 'edit_stock_ecru')
    if (!allowed) {
      res.status(403).json({ error: 'permission denied: edit_stock_ecru' })
      return
    }
    const body = req.body ?? {}
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .map((x: unknown) => parseInt(String(x), 10))
      .filter((n: number) => Number.isInteger(n) && n > 0)
    if (ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array of roll ids' })
      return
    }
    if (ids.length > 1000) {
      res.status(400).json({ error: 'too many ids (max 1000)' })
      return
    }

    const sets: string[] = []
    if (typeof body.observations === 'string') sets.push(`observations = ${sqlText(body.observations)}`)
    if (typeof body.visiteur === 'string') sets.push(`visiteur = ${sqlText(body.visiteur)}`)
    if (body.IDmagasin !== undefined) {
      const m = parseInt(String(body.IDmagasin), 10)
      if (Number.isInteger(m) && m >= 0) sets.push(`IDmagasin = ${m}`)
    }
    if (body.second_choix !== undefined) sets.push(`second_choix = ${body.second_choix ? 1 : 0}`)
    if (sets.length === 0) {
      res.status(400).json({ error: 'No editable fields provided' })
      return
    }

    await query(`UPDATE stock_ecru SET ${sets.join(', ')} WHERE IDstock_ecru IN (${ids.join(',')})`)
    res.json({ updated: ids.length })
  } catch (err) {
    console.error('Error batch-updating stock_ecru:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/stock/ecru/:id - whitelist edit (observations, visiteur,
//   second_choix, IDmagasin). poids/metrage/refs/affectation/reservation belong
//   to the reception & affectation flows, not this screen.
stockEcruRouter.patch('/ecru/:id', async (req: Request, res: Response) => {
  try {
    if (req.userId === undefined) {
      res.status(401).json({ error: 'not authenticated' })
      return
    }
    const allowed = await userHasPermission(req.userId, isEffectiveAdmin(req), 'edit_stock_ecru')
    if (!allowed) {
      res.status(403).json({ error: 'permission denied: edit_stock_ecru' })
      return
    }
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }
    const body = req.body ?? {}
    const sets: string[] = []
    if (typeof body.observations === 'string') sets.push(`observations = ${sqlText(body.observations)}`)
    if (typeof body.visiteur === 'string') sets.push(`visiteur = ${sqlText(body.visiteur)}`)
    if (body.second_choix !== undefined) sets.push(`second_choix = ${body.second_choix ? 1 : 0}`)
    if (body.IDmagasin !== undefined) {
      const m = parseInt(String(body.IDmagasin), 10)
      if (Number.isInteger(m) && m >= 0) sets.push(`IDmagasin = ${m}`)
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'No editable fields provided' })
      return
    }

    await query(`UPDATE stock_ecru SET ${sets.join(', ')} WHERE IDstock_ecru = ${id}`)

    const rows = await query<StockEcru>(
      `SELECT ${STOCK_ECRU_SELECT} ${STOCK_ECRU_JOINS} WHERE se.IDstock_ecru = ${id}`,
    )
    const hydrated = await hydrateEcruRows(rows)
    res.json(hydrated[0])
  } catch (err) {
    console.error('Error updating stock_ecru:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/stock/ecru/:id/cut - split one écru roll into N rolls (2..10). The
//   poids/metrage of the pieces must sum to the original (value conservation),
//   re-validated server-side. Piece 0 updates the original in place; pieces
//   1..N-1 are INSERT ... SELECT copies (accented text columns copied inside the
//   DB — no encoding round-trip) with numero suffixes -2, -3, … Gated by the
//   cut_stock_ecru permission.
stockEcruRouter.post('/ecru/:id/cut', async (req: Request, res: Response) => {
  try {
    if (req.userId === undefined) {
      res.status(401).json({ error: 'not authenticated' })
      return
    }
    const allowed = await userHasPermission(req.userId, isEffectiveAdmin(req), 'cut_stock_ecru')
    if (!allowed) {
      res.status(403).json({ error: 'permission denied: cut_stock_ecru' })
      return
    }

    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' })
      return
    }

    const pieces = (req.body?.pieces ?? []) as Array<{ poids?: unknown; metrage?: unknown }>
    if (!Array.isArray(pieces) || pieces.length < 2 || pieces.length > 10) {
      res.status(400).json({ error: 'pieces must be an array of length 2..10' })
      return
    }
    const norm = pieces.map((p) => ({ poids: Number(p?.poids), metrage: Number(p?.metrage) }))
    if (norm.some((p) => !Number.isFinite(p.poids) || !Number.isFinite(p.metrage) || p.poids < 0 || p.metrage < 0)) {
      res.status(400).json({ error: 'each piece needs a non-negative poids and metrage' })
      return
    }

    const origRows = await query<{ poids: number | null; metrage: number | null; numero: string | null }>(
      `SELECT poids, metrage, numero FROM stock_ecru WHERE IDstock_ecru = ${id}`,
    )
    if (origRows.length === 0) {
      res.status(404).json({ error: 'Stock écru not found' })
      return
    }
    const orig = origRows[0]
    const origPoids = Number(orig.poids) || 0
    const origMetrage = Number(orig.metrage) || 0
    const sumPoids = norm.reduce((s, p) => s + p.poids, 0)
    const sumMetrage = norm.reduce((s, p) => s + p.metrage, 0)
    if (Math.abs(sumPoids - origPoids) > 0.01 || Math.abs(sumMetrage - origMetrage) > 0.1) {
      res.status(400).json({ error: 'Sum mismatch: pieces must total the original poids and metrage' })
      return
    }

    const r2 = (v: number) => Math.round(v * 100) / 100
    const base = (orig.numero ?? '').trim() || `#${id}`

    // Piece 0 -> update the original row in place (numero unchanged).
    await query(
      `UPDATE stock_ecru SET poids = ${r2(norm[0].poids)}, metrage = ${r2(norm[0].metrage)} WHERE IDstock_ecru = ${id}`,
    )

    // Pieces 1..N-1 -> new rows copying every known column from the original.
    // Only columns proven to exist are named (a phantom column storms the
    // Linux bridge).
    const COPY_COLS =
      'numero, IDref_ecru, IDcolori_ecru, IDmagasin, IDordre_fabrication, IDref_commande_source, IDref_commande_affectation, IDligne_commande_client, IDLigne_Commande_TRM, IDsociete, poids, metrage, lot, observations, visiteur, second_choix, date_saisie'
    for (let i = 1; i < norm.length; i++) {
      const suffix = `-${i + 1}`
      const child = base.slice(0, 20 - suffix.length) + suffix
      await query(
        `INSERT INTO stock_ecru (${COPY_COLS})
         SELECT '${esc(child)}', IDref_ecru, IDcolori_ecru, IDmagasin, IDordre_fabrication, IDref_commande_source, IDref_commande_affectation, IDligne_commande_client, IDLigne_Commande_TRM, IDsociete, ${r2(norm[i].poids)}, ${r2(norm[i].metrage)}, lot, observations, visiteur, second_choix, date_saisie
         FROM stock_ecru WHERE IDstock_ecru = ${id}`,
      )
    }

    res.json({ ok: true, created: norm.length - 1 })
  } catch (err) {
    console.error('Error cutting stock_ecru:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

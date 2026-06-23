// Qualité › Suivi Lots — quality-control lot tracking.
//
// One `suivilot` row per (IDligne_commande_sous_traitant, lot) pair, created
// on reception by `upsertSuivilot()` in commandes-sous-traitant.ts. This route
// powers the read-only récap + pièces and the editable Contrôles (SST + tirelle
// measurements, observations, emplacement, archivage) plus lot état / archive.
//
// HFSQL footguns honoured (see CLAUDE.md):
//  - No parameterized queries: string-interpolate with esc()/sqlText()/n().
//  - No RETURNING: follow-up SELECT after writes.
//  - Accented columns (`freinte_demandée`, `stabH_demandée`, `stabL_demandée`,
//    `approuvé_qualité`) are NEVER named on Linux: reads go through SELECT * +
//    pickKey regex; the only accented write (`approuvé_qualité`) is gated on
//    IS_WINDOWS, with IDetatLot carrying validation state on the bridge.
//  - All editable Contrôles columns are ASCII → direct UPDATE is bridge-safe.
//  - Empty FK columns store 0, not NULL: guard with (col IS NULL OR col = 0).
//  - Driver returns état ids as BigInt → coerce with Number().

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { query, queryRaw, fixEncoding } from '../lib/hfsql-auto.js'

const IS_WINDOWS = process.platform === 'win32'

export const suiviLotsRouter: RouterType = Router()

// ── Helpers ──────────────────────────────────────────────

function esc(value: string): string {
  return value.replace(/'/g, "''")
}

/** SQL literal for user text: ASCII → quoted, accented → Latin-1 hex literal
 *  (the Linux bridge corrupts raw multi-byte UTF-8 in the SQL line). */
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

function n(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(value)
  return isNaN(parsed) ? 0 : parsed
}

/** Keep only an 8-digit YYYYMMDD; accepts 'YYYY-MM-DD' / 'YYYYMMDD' / ''. */
function dateStr(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value).replace(/-/g, '')
  return /^\d{8}$/.test(s) ? s : ''
}

function todayHfsql(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** Resolve an accent-mangled SELECT * key by prefix regex (the Linux bridge
 *  truncates accented identifiers; Windows keeps them intact). */
function pickKey(row: Record<string, unknown>, re: RegExp): unknown {
  const k = Object.keys(row).find((key) => re.test(key))
  return k !== undefined ? row[k] : null
}

/** Lot is "Terminé" when archived (fin_archivage set). Working definition —
 *  retune here if legacy keys off IDetatLot instead. */
function isArchived(finArchivage: unknown): boolean {
  const s = (finArchivage ?? '').toString().trim()
  return s.length > 0 && s !== '0'
}

/** Cache-free per-request état label map (small table). */
async function loadEtatLabels(): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  try {
    const rows = await query<{ IDetat_stock_fini: number; libelle: string | null }>(
      `SELECT IDetat_stock_fini, libelle FROM etat_stock_fini`,
    )
    const fixed = await fixEncoding(rows, 'etat_stock_fini', 'IDetat_stock_fini', ['libelle'])
    for (const r of fixed) map.set(Number(r.IDetat_stock_fini), (r.libelle ?? '').toString())
  } catch {
    /* labels are best-effort */
  }
  return map
}

// ── Types ────────────────────────────────────────────────

interface SuiviLotListRow {
  IDsuivilot: number
  lot: string | null
  IDsous_traitant: number
  IDetatLot: number | null
  fin_archivage: string | null
  DATE: string | null
}

// ── List ─────────────────────────────────────────────────
//
// GET /suivi-lots?status=en_cours|termine|tous&q=
suiviLotsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'en_cours'
    const q = ((req.query.q as string) || '').trim()

    let where = 'WHERE 1=1'
    if (status === 'en_cours') where += ` AND (s.fin_archivage IS NULL OR s.fin_archivage = '')`
    else if (status === 'termine') where += ` AND (s.fin_archivage IS NOT NULL AND s.fin_archivage <> '')`
    if (q) {
      const e = esc(q)
      where += ` AND (s.lot LIKE '%${e}%' OR st.nom LIKE '%${e}%')`
    }

    const rows = await query<SuiviLotListRow & { sous_traitant_nom: string | null }>(
      `SELECT s.IDsuivilot, s.lot, s.IDsous_traitant, s.IDetatLot, s.fin_archivage, s.DATE,
              st.nom AS sous_traitant_nom
       FROM suivilot s
       LEFT JOIN sous_traitant st ON s.IDsous_traitant = st.IDsous_traitant
       ${where}
       ORDER BY s.DATE DESC, s.IDsuivilot DESC`,
    )
    const fixed = await fixEncoding(rows, 'sous_traitant', 'IDsous_traitant', ['sous_traitant_nom'])
    const etatLabels = await loadEtatLabels()

    res.json(
      fixed.map((r) => {
        const etat = r.IDetatLot != null ? Number(r.IDetatLot) : null
        return {
          IDsuivilot: Number(r.IDsuivilot),
          lot: r.lot ?? '',
          sous_traitant_nom: r.sous_traitant_nom ?? '',
          IDetatLot: etat,
          etat_libelle: etat != null ? etatLabels.get(etat) ?? null : null,
          archived: isArchived(r.fin_archivage),
          date: r.DATE ?? null,
        }
      }),
    )
  } catch (err) {
    console.error('Error listing suivi-lots:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Detail ───────────────────────────────────────────────
//
// GET /suivi-lots/:id
suiviLotsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    // Base row — single-table SELECT * so accented spec columns survive
    // (resolved via pickKey below). Windows returns intact keys; Linux
    // truncates them, both matched by the prefix regex.
    const baseRows = await query<Record<string, unknown>>(
      `SELECT * FROM suivilot WHERE IDsuivilot = ${id}`,
    )
    if (baseRows.length === 0) { res.status(404).json({ error: 'Lot not found' }); return }
    const raw = baseRows[0]

    const ligneId = Number(raw.IDligne_commande_sous_traitant) || 0
    const cmdId = Number(raw.IDcommande_sous_traitant) || 0
    const sstId = Number(raw.IDsous_traitant) || 0
    const IDref_fini = Number(raw.IDref_fini) || 0
    const IDref_fini_colori = Number(raw.IDref_fini_colori) || 0
    const IDColoris = Number(raw.IDColoris) || 0
    const lot = (raw.lot ?? '').toString()

    // Repair encoding on the free-text fields stored on suivilot itself.
    const [fixedSelf] = await fixEncoding(
      [raw],
      'suivilot',
      'IDsuivilot',
      ['observations', 'emplacement_tirelle'],
    )

    // Récap context: commande header + références + coloris (avec_teinture rule).
    const [cmdRows, refRows] = await Promise.all([
      cmdId > 0
        ? query<{ date_commande: string | null; commentaire: string | null; IDcommande_client: number | null }>(
            `SELECT date_commande, commentaire, IDcommande_client
             FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${cmdId}`,
          )
        : Promise.resolve([]),
      IDref_fini > 0
        ? query<{ reference: string | null; avec_teinture: number | null }>(
            `SELECT reference, avec_teinture FROM ref_fini WHERE IDref_fini = ${IDref_fini}`,
          )
        : Promise.resolve([]),
    ])
    const [fixedCmd] = cmdRows.length
      ? await fixEncoding(cmdRows, 'commande_sous_traitant', 'IDcommande_sous_traitant', ['commentaire'])
      : [undefined as any]
    const [fixedRef] = refRows.length
      ? await fixEncoding(refRows, 'ref_fini', 'IDref_fini', ['reference'])
      : [undefined as any]

    const avecTeinture = Number(fixedRef?.avec_teinture) || 0
    let coloris = ''
    if (avecTeinture > 0 && IDref_fini_colori > 0) {
      const cr = await query<{ reference: string | null }>(
        `SELECT reference FROM ref_fini_colori WHERE IDref_fini_colori = ${IDref_fini_colori}`,
      )
      const [fc] = cr.length ? await fixEncoding(cr, 'ref_fini_colori', 'IDref_fini_colori', ['reference']) : []
      coloris = (fc?.reference ?? '').toString()
    } else if (IDColoris > 0) {
      const cr = await query<{ reference: string | null }>(
        `SELECT reference FROM colori_ecru WHERE IDcolori_ecru = ${IDColoris}`,
      )
      const [fc] = cr.length ? await fixEncoding(cr, 'colori_ecru', 'IDcolori_ecru', ['reference']) : []
      coloris = (fc?.reference ?? '').toString()
    }

    // Pièces du lot — received finished rolls for this (ligne, lot).
    type PieceRow = { IDstock_fini: number; numero: string | null; poids: number | null; metrage: number | null; IDmagasin: number | null }
    const pieceRows = ligneId > 0
      ? await query<PieceRow>(
          `SELECT IDstock_fini, numero, poids, metrage, IDmagasin
           FROM stock_fini
           WHERE IDref_commande_source = ${ligneId} AND lot = '${esc(lot)}'
           ORDER BY numero, IDstock_fini`,
        )
      : []
    // Resolve magasin (= sous_traitant) names in one batched query.
    const magIds = Array.from(new Set(pieceRows.map((p) => Number(p.IDmagasin)).filter((m) => m > 0)))
    const magMap = new Map<number, string>()
    if (magIds.length > 0) {
      const magRows = await query<{ IDsous_traitant: number; nom: string | null }>(
        `SELECT IDsous_traitant, nom FROM sous_traitant WHERE IDsous_traitant IN (${magIds.join(',')})`,
      )
      for (const m of await fixEncoding(magRows, 'sous_traitant', 'IDsous_traitant', ['nom']))
        magMap.set(Number(m.IDsous_traitant), (m.nom ?? '').toString())
    }
    let rdtSum = 0
    let rdtCount = 0
    const pieces = pieceRows.map((p) => {
      const poids = n(p.poids)
      const metrage = n(p.metrage)
      const rdt = poids > 0 ? metrage / poids : null
      if (rdt != null) { rdtSum += rdt; rdtCount += 1 }
      return {
        IDstock_fini: Number(p.IDstock_fini),
        numero: (p.numero ?? '').toString() || `#${Number(p.IDstock_fini)}`,
        poids,
        metrage,
        magasin_nom: magMap.get(Number(p.IDmagasin)) ?? '',
        rdt,
      }
    })
    const moyenne_rdt = rdtCount > 0 ? rdtSum / rdtCount : null

    // Client summary (commande_sous_traitant.IDcommande_client → client).
    const IDcommande_client = Number(fixedCmd?.IDcommande_client) || 0
    let client: { IDclient: number; nom: string; numero: string | null; ref_client: string | null } | null = null
    if (IDcommande_client > 0) {
      const ccRows = await query<{ IDclient: number | null; numero: string | null; ref_client: string | null }>(
        `SELECT IDclient, numero, ref_client FROM commande_client WHERE IDcommande_client = ${IDcommande_client}`,
      )
      const [cc] = ccRows.length
        ? await fixEncoding(ccRows, 'commande_client', 'IDcommande_client', ['numero', 'ref_client'])
        : []
      const IDclient = Number(cc?.IDclient) || 0
      if (IDclient > 0) {
        const clRows = await query<{ IDclient: number; nom: string | null }>(
          `SELECT IDclient, nom FROM client WHERE IDclient = ${IDclient}`,
        )
        const [cl] = clRows.length ? await fixEncoding(clRows, 'client', 'IDclient', ['nom']) : []
        client = {
          IDclient,
          nom: (cl?.nom ?? '').toString(),
          numero: cc?.numero ?? null,
          ref_client: cc?.ref_client ?? null,
        }
      }
    }

    const etat = raw.IDetatLot != null ? Number(raw.IDetatLot) : null
    const etatLabels = await loadEtatLabels()

    res.json({
      IDsuivilot: id,
      lot,
      DATE: raw.DATE ?? null,
      IDcommande_sous_traitant: cmdId,
      IDligne_commande_sous_traitant: ligneId,
      IDsous_traitant: sstId,

      // Récap context
      date_commande: fixedCmd?.date_commande ?? null,
      reference: (fixedRef?.reference ?? '').toString(),
      coloris,
      commentaire: fixedCmd?.commentaire ?? '',

      // Spec banner (demande) — accented cols via pickKey
      laize_demandee: n(raw.laize_demandee),
      poids_demande: n(raw.poids_demande),
      rendement_demande: n(raw.rendement_demande),
      freinte_demandee: n(pickKey(raw, /^freinte/i)),
      stabH_demandee: n(pickKey(raw, /^stabh_dem/i)),
      stabL_demandee: n(pickKey(raw, /^stabl_dem/i)),

      // Contrôles — Sous-Traitant
      laize_sst: n(raw.laize_sst),
      poids_sst: n(raw.poids_sst),
      rendement_sst: n(raw.rendement_sst),
      stabH_sst: n(raw.stabH_sst),
      stabL_sst: n(raw.stabL_sst),

      // Contrôles — Tirelle
      laize_tirelle: n(raw.laize_tirelle),
      poids_tirelle: n(raw.poids_tirelle),
      rendement_tirelle: n(raw.rendement_tirelle),
      stabH_tirelle: n(raw.stabH_tirelle),
      stabL_tirelle: n(raw.stabL_tirelle),

      observations: (fixedSelf?.observations ?? '').toString(),
      emplacement_tirelle: (fixedSelf?.emplacement_tirelle ?? '').toString(),
      fin_archivage: (raw.fin_archivage ?? '').toString(),

      IDetatLot: etat,
      etat_libelle: etat != null ? etatLabels.get(etat) ?? null : null,
      archived: isArchived(raw.fin_archivage),

      pieces,
      moyenne_rdt,
      client,
    })
  } catch (err) {
    console.error('Error loading suivi-lot detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Save Contrôles ───────────────────────────────────────
//
// PUT /suivi-lots/:id — every named column is ASCII → bridge-safe.
suiviLotsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const b = req.body ?? {}

    const exists = await query<{ IDsuivilot: number }>(
      `SELECT IDsuivilot FROM suivilot WHERE IDsuivilot = ${id}`,
    )
    if (exists.length === 0) { res.status(404).json({ error: 'Lot not found' }); return }

    await query(
      `UPDATE suivilot SET
         laize_sst = ${n(b.laize_sst)}, poids_sst = ${n(b.poids_sst)}, rendement_sst = ${n(b.rendement_sst)},
         stabH_sst = ${n(b.stabH_sst)}, stabL_sst = ${n(b.stabL_sst)},
         laize_tirelle = ${n(b.laize_tirelle)}, poids_tirelle = ${n(b.poids_tirelle)}, rendement_tirelle = ${n(b.rendement_tirelle)},
         stabH_tirelle = ${n(b.stabH_tirelle)}, stabL_tirelle = ${n(b.stabL_tirelle)},
         observations = ${sqlText(b.observations)}, emplacement_tirelle = ${sqlText(b.emplacement_tirelle)},
         fin_archivage = '${dateStr(b.fin_archivage)}'
       WHERE IDsuivilot = ${id}`,
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Error saving suivi-lot:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Change lot état (immediate, no edit-mode) ────────────
//
// POST /suivi-lots/:id/etat { etat }
suiviLotsRouter.post('/:id/etat', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    const etat = parseInt(req.body?.etat, 10)
    if (isNaN(id) || isNaN(etat)) { res.status(400).json({ error: 'Invalid input' }); return }

    await query(`UPDATE suivilot SET IDetatLot = ${etat} WHERE IDsuivilot = ${id}`)
    // Validation flag lives in the accented `approuvé_qualité` column — only
    // writable on Windows ODBC. On the Linux bridge IDetatLot is the source
    // of truth, so we skip it there.
    if (IS_WINDOWS) {
      await query(`UPDATE suivilot SET approuvé_qualité = ${etat === 3 ? 1 : 0} WHERE IDsuivilot = ${id}`)
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Error changing suivi-lot état:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Archive / unarchive ──────────────────────────────────
//
// POST /suivi-lots/:id/archive { archived }
suiviLotsRouter.post('/:id/archive', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const archived = !!req.body?.archived
    await query(
      `UPDATE suivilot SET fin_archivage = '${archived ? todayHfsql() : ''}' WHERE IDsuivilot = ${id}`,
    )
    res.json({ ok: true, archived })
  } catch (err) {
    console.error('Error archiving suivi-lot:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Défauts (read-only aggregate over the lot's source écrus) ─────
//
// GET /suivi-lots/:id/defauts
suiviLotsRouter.get('/:id/defauts', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const baseRows = await query<{ IDligne_commande_sous_traitant: number | null; lot: string | null }>(
      `SELECT IDligne_commande_sous_traitant, lot FROM suivilot WHERE IDsuivilot = ${id}`,
    )
    if (baseRows.length === 0) { res.status(404).json({ error: 'Lot not found' }); return }
    const ligneId = Number(baseRows[0].IDligne_commande_sous_traitant) || 0
    const lot = (baseRows[0].lot ?? '').toString()
    if (ligneId === 0) { res.json([]); return }

    // The lot's rolls → their source écru ids (defaut_qualite.Type_Reference=2
    // keys reference = stringified IDstock_ecru).
    const rolls = await query<{ IDstock_fini: number; numero: string | null; IDstock_ecru: number | null }>(
      `SELECT IDstock_fini, numero, IDstock_ecru
       FROM stock_fini
       WHERE IDref_commande_source = ${ligneId} AND lot = '${esc(lot)}'`,
    )
    const ecruIds = Array.from(new Set(rolls.map((r) => Number(r.IDstock_ecru)).filter((e) => e > 0)))
    if (ecruIds.length === 0) { res.json([]); return }
    const numByEcru = new Map<number, string>()
    for (const r of rolls) {
      const e = Number(r.IDstock_ecru)
      if (e > 0 && !numByEcru.has(e)) numByEcru.set(e, (r.numero ?? '').toString())
    }

    const inList = ecruIds.map((e) => `'${e}'`).join(',')
    // SELECT * + pickKey: defaut_qualite has accented cols (traité, récuperé).
    const defRows = await queryRaw(
      `SELECT * FROM defaut_qualite WHERE Type_Reference = 2 AND reference IN (${inList})`,
    )
    const fixed = await fixEncoding(
      defRows as Record<string, unknown>[],
      'defaut_qualite',
      'IDdefaut_qualite',
      ['description', 'type_defaut'],
    )
    res.json(
      fixed.map((d) => {
        const ecru = Number((d as any).reference) || 0
        return {
          IDdefaut_qualite: Number((d as any).IDdefaut_qualite),
          reference: (d as any).reference ?? null,
          roll_numero: numByEcru.get(ecru) ?? '',
          description: ((d as any).description ?? '').toString(),
          type_defaut: ((d as any).type_defaut ?? '').toString(),
          taille_cm: n((d as any).taille_cm),
          nombre: n((d as any).nombre),
          date: ((d as any).DATE ?? '').toString(),
        }
      }),
    )
  } catch (err) {
    console.error('Error loading suivi-lot defauts:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

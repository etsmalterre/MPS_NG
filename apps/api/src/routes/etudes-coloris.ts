import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import { query, queryRaw, fixEncoding } from '../lib/hfsql-auto.js'

export const etudesColorisRouter: RouterType = Router()

// ── Types ────────────────────────────────────────────────

type EtudeStatut = 1 | 2 | 3 | 4 // 1=attente labo · 2=soumis au client · 3=accepté · 4=annulé
type SoumissionAccepte = 0 | 1 | 2 // 0=pending · 1=accepté · 2=refusé

interface EtudeRow {
  IDetude_col: number
  IDclient: number
  IDref_fini: number
  IDref_fini_colori: number
  IDsous_traitant: number
  libelle: string | null
  num_commande: string | null
  desig_client: string | null
  date_reception_type: string | null // YYYYMMDD
  statut_col: EtudeStatut
  commentaire: string | null
  date_derniere_action: string | null // YYYY-MM-DD (ISO)
}

interface SoumissionRow {
  IDsoum_col: number
  IDetude_col: number
  date_soum: string | null // YYYYMMDD
  type_soum: string | null
  observation: string | null
  date_reponse: string | null // YYYYMMDD
  accepte: SoumissionAccepte
}

// ── Helpers ──────────────────────────────────────────────

function esc(v: string): string {
  return v.replace(/'/g, "''")
}

function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const p = Number(v)
  return isNaN(p) ? 0 : p
}

/** Strip non-digits. Accepts 'YYYY-MM-DD' or 'YYYYMMDD' or ''. */
function dateStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v).replace(/-/g, '')
  return /^\d{8}$/.test(s) ? s : ''
}

/** Format today as HFSQL YYYYMMDD. */
function todayHfsql(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${dd}`
}

/** Format today as ISO YYYY-MM-DD (used for etude_col.date_derniere_action). */
function todayIso(): string {
  const t = todayHfsql()
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`
}

const statutFilterToCode: Record<string, EtudeStatut | undefined> = {
  attente_labo: 1,
  soumis: 2,
  accepte: 3,
  annule: 4,
}

/** Coerce HFSQL BYTE driver output into a strict EtudeStatut union. */
function coerceStatut(v: unknown): EtudeStatut {
  const x = Number(v)
  if (x === 1 || x === 2 || x === 3 || x === 4) return x as EtudeStatut
  return 1
}

function coerceAccepte(v: unknown): SoumissionAccepte {
  const x = Number(v)
  if (x === 0 || x === 1 || x === 2) return x as SoumissionAccepte
  return 0
}

/** Bump date_derniere_action to now for a given étude id. Fire-and-log-failure. */
async function touchEtude(id: number): Promise<void> {
  try {
    await query(
      `UPDATE etude_col SET date_derniere_action = '${todayIso()}' WHERE IDetude_col = ${id}`,
    )
  } catch (err) {
    console.error(`touchEtude(${id}) failed:`, (err as Error).message)
  }
}

/** Compute the next auto version label ('v{N+1}') across existing soumissions. */
function nextTypeSoum(existing: SoumissionRow[]): string {
  let max = 0
  for (const s of existing) {
    const t = (s.type_soum ?? '').trim()
    const m = /^v(\d+)$/i.exec(t)
    if (m) {
      const n = parseInt(m[1], 10)
      if (!isNaN(n) && n > max) max = n
    }
  }
  return `v${max + 1}`
}

/** Load soumissions for an étude, ordered newest-first. */
async function loadSoumissions(etudeId: number): Promise<SoumissionRow[]> {
  const rows = await query<any>(
    `SELECT IDsoum_col, IDetude_col, date_soum, type_soum, observation, date_reponse, accepte
     FROM soum_col WHERE IDetude_col = ${etudeId}
     ORDER BY date_soum DESC, IDsoum_col DESC`,
  )
  const fixed = await fixEncoding(rows, 'soum_col', 'IDsoum_col', ['type_soum', 'observation'])
  return (fixed as any[]).map((r) => ({
    IDsoum_col: Number(r.IDsoum_col),
    IDetude_col: Number(r.IDetude_col),
    date_soum: r.date_soum ?? null,
    type_soum: r.type_soum ?? null,
    observation: r.observation ?? null,
    date_reponse: r.date_reponse ?? null,
    accepte: coerceAccepte(r.accepte),
  }))
}

/** Load a single étude with all its soumissions + join-enriched display names.
 *  Returns null on not-found. */
async function loadEtudeDetail(id: number): Promise<Record<string, unknown> | null> {
  const rows = await query<any>(
    `SELECT IDetude_col, IDclient, IDref_fini, IDref_fini_colori, IDsous_traitant,
            libelle, num_commande, desig_client, date_reception_type, statut_col,
            commentaire, date_derniere_action
     FROM etude_col WHERE IDetude_col = ${id}`,
  )
  if (rows.length === 0) return null
  const fixed = await fixEncoding(rows, 'etude_col', 'IDetude_col', [
    'libelle', 'num_commande', 'desig_client', 'commentaire',
  ])
  const header = fixed[0] as any as EtudeRow

  // Bulk-fetch display names for FK parents
  const [clientRows, refFiniRows, refFiniColRows, sousTraitantRows, soumissions] = await Promise.all([
    header.IDclient > 0
      ? query<{ IDclient: number; nom: string | null }>(
          `SELECT IDclient, nom FROM client WHERE IDclient = ${header.IDclient}`,
        )
      : Promise.resolve([]),
    header.IDref_fini > 0
      ? query<{ IDref_fini: number; reference: string | null; designation: string | null }>(
          `SELECT IDref_fini, reference, designation FROM ref_fini WHERE IDref_fini = ${header.IDref_fini}`,
        )
      : Promise.resolve([]),
    header.IDref_fini_colori > 0
      ? query<{ IDref_fini_colori: number; reference: string | null }>(
          `SELECT IDref_fini_colori, reference FROM ref_fini_colori WHERE IDref_fini_colori = ${header.IDref_fini_colori}`,
        )
      : Promise.resolve([]),
    header.IDsous_traitant > 0
      ? query<{ IDsous_traitant: number; nom: string | null }>(
          `SELECT IDsous_traitant, nom FROM sous_traitant WHERE IDsous_traitant = ${header.IDsous_traitant}`,
        )
      : Promise.resolve([]),
    loadSoumissions(id),
  ])

  const fixedClient = await fixEncoding(clientRows as any[], 'client', 'IDclient', ['nom'])
  const fixedRefFini = await fixEncoding(refFiniRows as any[], 'ref_fini', 'IDref_fini', ['reference', 'designation'])
  const fixedRefFiniCol = await fixEncoding(refFiniColRows as any[], 'ref_fini_colori', 'IDref_fini_colori', ['reference'])
  const fixedSousTraitant = await fixEncoding(sousTraitantRows as any[], 'sous_traitant', 'IDsous_traitant', ['nom'])

  return {
    ...header,
    statut_col: coerceStatut(header.statut_col),
    client_nom: (fixedClient[0] as any)?.nom ?? null,
    ref_fini_reference: (fixedRefFini[0] as any)?.reference ?? null,
    ref_fini_designation: (fixedRefFini[0] as any)?.designation ?? null,
    ref_fini_colori_reference: (fixedRefFiniCol[0] as any)?.reference ?? null,
    // Photos are disabled in v1 (see /lookups/ref-fini-coloris note).
    ref_fini_colori_has_photo: 0,
    sous_traitant_nom: (fixedSousTraitant[0] as any)?.nom ?? null,
    soumissions,
  }
}

// ── Validation schemas ───────────────────────────────────

const etudeBody = z.object({
  IDclient: z.number().int().positive(),
  IDref_fini: z.number().int().positive(),
  IDref_fini_colori: z.number().int().nonnegative().optional(),
  IDsous_traitant: z.number().int().nonnegative().optional(),
  libelle: z.string().min(1).max(100),
  num_commande: z.string().max(100).optional(),
  desig_client: z.string().max(100).optional(),
  date_reception_type: z.string().optional(), // YYYYMMDD or YYYY-MM-DD
  commentaire: z.string().optional(),
})

const etudeUpdateBody = etudeBody.partial().extend({
  statut_col: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
})

const soumissionBody = z.object({
  date_soum: z.string().optional(),
  type_soum: z.string().max(50).optional(),
  observation: z.string().optional(),
})

const respondBody = z.object({
  accepte: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  date_reponse: z.string().optional(), // defaults to today
})

// ── List endpoint ────────────────────────────────────────

etudesColorisRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim()
    const statut = String(req.query.statut ?? 'attente_labo')
    const clientFilter = parseInt(String(req.query.client ?? ''), 10)

    const whereParts: string[] = []
    const statutCode = statutFilterToCode[statut]
    if (statutCode !== undefined) whereParts.push(`ec.statut_col = ${statutCode}`)
    // 'all' → no filter
    if (!isNaN(clientFilter) && clientFilter > 0) whereParts.push(`ec.IDclient = ${clientFilter}`)
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

    const etudes = await query<any>(
      `SELECT ec.IDetude_col, ec.IDclient, ec.IDref_fini, ec.IDref_fini_colori, ec.IDsous_traitant,
              ec.libelle, ec.num_commande, ec.desig_client, ec.date_reception_type, ec.statut_col,
              ec.date_derniere_action
       FROM etude_col ec
       ${whereSql}
       ORDER BY ec.date_derniere_action DESC, ec.IDetude_col DESC`,
    )
    const fixedEtudes = await fixEncoding(etudes as any[], 'etude_col', 'IDetude_col', [
      'libelle', 'num_commande', 'desig_client',
    ]) as any[]

    // Bulk-fetch display names for FK parents
    const clientIds = Array.from(new Set(fixedEtudes.map((e) => Number(e.IDclient)).filter((x) => x > 0)))
    const refFiniIds = Array.from(new Set(fixedEtudes.map((e) => Number(e.IDref_fini)).filter((x) => x > 0)))
    const refFiniColIds = Array.from(
      new Set(fixedEtudes.map((e) => Number(e.IDref_fini_colori)).filter((x) => x > 0)),
    )
    const sousTraitantIds = Array.from(
      new Set(fixedEtudes.map((e) => Number(e.IDsous_traitant)).filter((x) => x > 0)),
    )

    const [clientRows, refFiniRows, refFiniColRows, sousTraitantRows] = await Promise.all([
      clientIds.length > 0
        ? query<{ IDclient: number; nom: string | null }>(
            `SELECT IDclient, nom FROM client WHERE IDclient IN (${clientIds.join(',')})`,
          )
        : Promise.resolve([]),
      refFiniIds.length > 0
        ? query<{ IDref_fini: number; reference: string | null }>(
            `SELECT IDref_fini, reference FROM ref_fini WHERE IDref_fini IN (${refFiniIds.join(',')})`,
          )
        : Promise.resolve([]),
      refFiniColIds.length > 0
        ? query<{ IDref_fini_colori: number; reference: string | null }>(
            `SELECT IDref_fini_colori, reference FROM ref_fini_colori WHERE IDref_fini_colori IN (${refFiniColIds.join(',')})`,
          )
        : Promise.resolve([]),
      sousTraitantIds.length > 0
        ? query<{ IDsous_traitant: number; nom: string | null }>(
            `SELECT IDsous_traitant, nom FROM sous_traitant WHERE IDsous_traitant IN (${sousTraitantIds.join(',')})`,
          )
        : Promise.resolve([]),
    ])

    const fixedClients = await fixEncoding(clientRows as any[], 'client', 'IDclient', ['nom'])
    const fixedRefFini = await fixEncoding(refFiniRows as any[], 'ref_fini', 'IDref_fini', ['reference'])
    const fixedRefFiniCol = await fixEncoding(
      refFiniColRows as any[], 'ref_fini_colori', 'IDref_fini_colori', ['reference'],
    )
    const fixedSousTraitant = await fixEncoding(
      sousTraitantRows as any[], 'sous_traitant', 'IDsous_traitant', ['nom'],
    )

    const clientMap = new Map<number, string>()
    for (const c of fixedClients as any[]) clientMap.set(Number(c.IDclient), c.nom ?? '')
    const refFiniMap = new Map<number, string>()
    for (const r of fixedRefFini as any[]) refFiniMap.set(Number(r.IDref_fini), r.reference ?? '')
    const refFiniColMap = new Map<number, string>()
    for (const r of fixedRefFiniCol as any[])
      refFiniColMap.set(Number(r.IDref_fini_colori), r.reference ?? '')
    const sousTraitantMap = new Map<number, string>()
    for (const s of fixedSousTraitant as any[])
      sousTraitantMap.set(Number(s.IDsous_traitant), s.nom ?? '')

    // Bulk-fetch soumission aggregates: count + latest date_soum per étude
    const etudeIds = fixedEtudes.map((e) => Number(e.IDetude_col)).filter(Boolean)
    const soumAggMap = new Map<number, { nb_soumissions: number; last_soumission_date: string | null }>()
    if (etudeIds.length > 0) {
      const soums = await query<{ IDetude_col: number; date_soum: string | null }>(
        `SELECT IDetude_col, date_soum FROM soum_col WHERE IDetude_col IN (${etudeIds.join(',')})`,
      )
      for (const s of soums) {
        const id = Number(s.IDetude_col)
        const acc = soumAggMap.get(id) ?? { nb_soumissions: 0, last_soumission_date: null }
        acc.nb_soumissions += 1
        const ds = typeof s.date_soum === 'string' ? s.date_soum : ''
        if (/^\d{8}$/.test(ds) && (acc.last_soumission_date === null || ds > acc.last_soumission_date)) {
          acc.last_soumission_date = ds
        }
        soumAggMap.set(id, acc)
      }
    }

    const qLower = q.toLowerCase()
    const result = fixedEtudes
      .map((e: any) => {
        const agg = soumAggMap.get(Number(e.IDetude_col)) ?? {
          nb_soumissions: 0, last_soumission_date: null,
        }
        return {
          ...e,
          statut_col: coerceStatut(e.statut_col),
          client_nom: clientMap.get(Number(e.IDclient)) ?? null,
          ref_fini_reference: refFiniMap.get(Number(e.IDref_fini)) ?? null,
          ref_fini_colori_reference: refFiniColMap.get(Number(e.IDref_fini_colori)) ?? null,
          sous_traitant_nom: sousTraitantMap.get(Number(e.IDsous_traitant)) ?? null,
          ...agg,
        }
      })
      .filter((e: any) => {
        if (!q) return true
        const hay = [
          e.IDetude_col, e.libelle, e.num_commande, e.desig_client, e.client_nom,
          e.ref_fini_reference, e.ref_fini_colori_reference,
        ].join(' ').toLowerCase()
        return hay.includes(qLower)
      })

    res.json(result)
  } catch (err) {
    console.error('Error listing etudes-coloris:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Detail endpoint ──────────────────────────────────────

etudesColorisRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const detail = await loadEtudeDetail(id)
    if (!detail) { res.status(404).json({ error: 'Étude not found' }); return }
    res.json(detail)
  } catch (err) {
    console.error('Error fetching etude-coloris detail:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Create étude ─────────────────────────────────────────

etudesColorisRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = etudeBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data
    const dateRecep = dateStr(d.date_reception_type)

    await query(
      `INSERT INTO etude_col
         (IDclient, IDref_fini, IDref_fini_colori, IDsous_traitant,
          libelle, num_commande, desig_client, date_reception_type,
          statut_col, commentaire, date_derniere_action)
       VALUES
         (${d.IDclient}, ${d.IDref_fini}, ${d.IDref_fini_colori ?? 0}, ${d.IDsous_traitant ?? 0},
          '${esc(d.libelle)}', '${esc(d.num_commande ?? '')}', '${esc(d.desig_client ?? '')}',
          '${dateRecep}', 1, '${esc(d.commentaire ?? '')}', '${todayIso()}')`,
    )

    // Find the newly-inserted row. Use the last ID that matches the creation signature.
    const rows = await query<{ IDetude_col: number }>(
      `SELECT TOP 1 IDetude_col FROM etude_col
       WHERE IDclient = ${d.IDclient} AND IDref_fini = ${d.IDref_fini}
       ORDER BY IDetude_col DESC`,
    )
    const newId = rows[0]?.IDetude_col
    if (!newId) { res.status(500).json({ error: 'Insert succeeded but ID not found' }); return }

    const detail = await loadEtudeDetail(newId)
    res.status(201).json(detail)
  } catch (err) {
    console.error('Error creating etude-coloris:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Update étude ─────────────────────────────────────────

etudesColorisRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = etudeUpdateBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data

    const sets: string[] = []
    if (d.IDclient !== undefined) sets.push(`IDclient = ${d.IDclient}`)
    if (d.IDref_fini !== undefined) sets.push(`IDref_fini = ${d.IDref_fini}`)
    if (d.IDref_fini_colori !== undefined) sets.push(`IDref_fini_colori = ${d.IDref_fini_colori}`)
    if (d.IDsous_traitant !== undefined) sets.push(`IDsous_traitant = ${d.IDsous_traitant}`)
    if (d.libelle !== undefined) sets.push(`libelle = '${esc(d.libelle)}'`)
    if (d.num_commande !== undefined) sets.push(`num_commande = '${esc(d.num_commande)}'`)
    if (d.desig_client !== undefined) sets.push(`desig_client = '${esc(d.desig_client)}'`)
    if (d.date_reception_type !== undefined)
      sets.push(`date_reception_type = '${dateStr(d.date_reception_type)}'`)
    if (d.statut_col !== undefined) sets.push(`statut_col = ${d.statut_col}`)
    if (d.commentaire !== undefined) sets.push(`commentaire = '${esc(d.commentaire)}'`)

    if (sets.length === 0) {
      res.status(400).json({ error: 'No fields to update' }); return
    }

    // Always touch date_derniere_action on update
    sets.push(`date_derniere_action = '${todayIso()}'`)

    await query(`UPDATE etude_col SET ${sets.join(', ')} WHERE IDetude_col = ${id}`)
    const detail = await loadEtudeDetail(id)
    if (!detail) { res.status(404).json({ error: 'Étude not found' }); return }
    res.json(detail)
  } catch (err) {
    console.error('Error updating etude-coloris:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Delete étude (cascade to soumissions) ────────────────

etudesColorisRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM soum_col WHERE IDetude_col = ${id}`)
    await query(`DELETE FROM etude_col WHERE IDetude_col = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting etude-coloris:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Create soumission (auto-advance parent if needed) ────

etudesColorisRouter.post('/:id/soumissions', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = soumissionBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data

    // Confirm parent exists + capture current statut
    const parentRows = await query<{ statut_col: number }>(
      `SELECT statut_col FROM etude_col WHERE IDetude_col = ${id}`,
    )
    if (parentRows.length === 0) { res.status(404).json({ error: 'Étude not found' }); return }
    const currentStatut = coerceStatut(parentRows[0].statut_col)

    // Auto-pick type_soum if empty
    let typeSoum = (d.type_soum ?? '').trim()
    if (typeSoum.length === 0) {
      const existing = await loadSoumissions(id)
      typeSoum = nextTypeSoum(existing)
    }
    const dateSoum = dateStr(d.date_soum) || todayHfsql()

    await query(
      `INSERT INTO soum_col
         (IDetude_col, date_soum, type_soum, observation, date_reponse, accepte)
       VALUES
         (${id}, '${dateSoum}', '${esc(typeSoum)}', '${esc(d.observation ?? '')}', '', 0)`,
    )

    // Hybrid auto-advance: if étude was "attente labo" (1), bump to "soumis au client" (2)
    if (currentStatut === 1) {
      await query(`UPDATE etude_col SET statut_col = 2 WHERE IDetude_col = ${id}`)
    }
    await touchEtude(id)

    const detail = await loadEtudeDetail(id)
    res.status(201).json(detail)
  } catch (err) {
    console.error('Error creating soumission:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Update soumission fields (type, date, observation) ───

etudesColorisRouter.put('/soumissions/:soumId', async (req: Request, res: Response) => {
  try {
    const soumId = parseInt(String(req.params.soumId), 10)
    if (isNaN(soumId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = soumissionBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data

    const sets: string[] = []
    if (d.date_soum !== undefined) sets.push(`date_soum = '${dateStr(d.date_soum)}'`)
    if (d.type_soum !== undefined) sets.push(`type_soum = '${esc(d.type_soum)}'`)
    if (d.observation !== undefined) sets.push(`observation = '${esc(d.observation)}'`)
    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    // Look up parent étude to return a refreshed detail and touch its date
    const parentRows = await query<{ IDetude_col: number }>(
      `SELECT IDetude_col FROM soum_col WHERE IDsoum_col = ${soumId}`,
    )
    if (parentRows.length === 0) { res.status(404).json({ error: 'Soumission not found' }); return }
    const etudeId = Number(parentRows[0].IDetude_col)

    await query(`UPDATE soum_col SET ${sets.join(', ')} WHERE IDsoum_col = ${soumId}`)
    await touchEtude(etudeId)

    const detail = await loadEtudeDetail(etudeId)
    res.json(detail)
  } catch (err) {
    console.error('Error updating soumission:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Delete soumission ────────────────────────────────────

etudesColorisRouter.delete('/soumissions/:soumId', async (req: Request, res: Response) => {
  try {
    const soumId = parseInt(String(req.params.soumId), 10)
    if (isNaN(soumId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parentRows = await query<{ IDetude_col: number }>(
      `SELECT IDetude_col FROM soum_col WHERE IDsoum_col = ${soumId}`,
    )
    if (parentRows.length === 0) { res.status(404).json({ error: 'Soumission not found' }); return }
    const etudeId = Number(parentRows[0].IDetude_col)

    await query(`DELETE FROM soum_col WHERE IDsoum_col = ${soumId}`)
    await touchEtude(etudeId)

    const detail = await loadEtudeDetail(etudeId)
    res.json(detail)
  } catch (err) {
    console.error('Error deleting soumission:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Respond to soumission (accept / refuse / clear) ──────

etudesColorisRouter.post('/soumissions/:soumId/respond', async (req: Request, res: Response) => {
  try {
    const soumId = parseInt(String(req.params.soumId), 10)
    if (isNaN(soumId)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = respondBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data

    const parentRows = await query<{ IDetude_col: number }>(
      `SELECT IDetude_col FROM soum_col WHERE IDsoum_col = ${soumId}`,
    )
    if (parentRows.length === 0) { res.status(404).json({ error: 'Soumission not found' }); return }
    const etudeId = Number(parentRows[0].IDetude_col)

    // accepte=0 means "clear the response" → wipe date_reponse. Non-zero → set date.
    const dateRep = d.accepte === 0 ? '' : (dateStr(d.date_reponse) || todayHfsql())
    await query(
      `UPDATE soum_col SET accepte = ${d.accepte}, date_reponse = '${dateRep}' WHERE IDsoum_col = ${soumId}`,
    )
    await touchEtude(etudeId)

    const detail = await loadEtudeDetail(etudeId)
    res.json(detail)
  } catch (err) {
    console.error('Error responding to soumission:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Lookups (dropdown sources) ───────────────────────────

etudesColorisRouter.get('/lookups/clients', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDclient: number; nom: string | null }>(
      `SELECT IDclient, nom FROM client WHERE est_visible = 1 ORDER BY nom`,
    )
    const fixed = await fixEncoding(rows, 'client', 'IDclient', ['nom'])
    res.json(fixed.filter((r: any) => r.nom && String(r.nom).trim().length > 0))
  } catch (err) {
    console.error('Error fetching clients lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

etudesColorisRouter.get('/lookups/refs-fini', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDref_fini: number; reference: string | null; designation: string | null }>(
      `SELECT IDref_fini, reference, designation FROM ref_fini ORDER BY reference`,
    )
    const fixed = await fixEncoding(rows, 'ref_fini', 'IDref_fini', ['reference', 'designation'])
    res.json(fixed.filter((r: any) => r.reference && String(r.reference).trim().length > 0))
  } catch (err) {
    console.error('Error fetching refs-fini lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

etudesColorisRouter.get('/lookups/ref-fini-coloris', async (req: Request, res: Response) => {
  try {
    const refFini = parseInt(String(req.query.ref_fini ?? ''), 10)
    if (isNaN(refFini) || refFini <= 0) { res.json([]); return }

    const rows = await query<{ IDref_fini_colori: number; reference: string | null }>(
      `SELECT IDref_fini_colori, reference FROM ref_fini_colori
       WHERE IDref_fini = ${refFini}
       ORDER BY reference`,
    )
    const fixed = (await fixEncoding(rows, 'ref_fini_colori', 'IDref_fini_colori', ['reference'])) as any[]
    const out = fixed
      .filter((r) => r.reference && String(r.reference).trim().length > 0)
      .map((r) => ({
        IDref_fini_colori: Number(r.IDref_fini_colori),
        reference: r.reference,
        // `has_photo` reserved for future — probing ref_fini_colori.photo with a
        // WHERE clause returns 0 rows on Windows HFSQL ODBC (BinMemo quirk). A
        // scan of 50 "photo IS NOT NULL" rows also showed every blob was
        // effectively empty, so there's nothing to surface in v1. Revisit if
        // real photos start landing.
        has_photo: 0,
      }))
    res.json(out)
  } catch (err) {
    console.error('Error fetching ref-fini-coloris lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

etudesColorisRouter.get('/lookups/sous-traitants', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDsous_traitant: number; nom: string | null }>(
      `SELECT IDsous_traitant, nom FROM sous_traitant WHERE est_visible = 1 ORDER BY nom`,
    )
    const fixed = await fixEncoding(rows, 'sous_traitant', 'IDsous_traitant', ['nom'])
    res.json(fixed.filter((r: any) => r.nom && String(r.nom).trim().length > 0))
  } catch (err) {
    console.error('Error fetching sous-traitants lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Photo blob proxy (ref_fini_colori.photo) ─────────────
//
// HFSQL BinMemo IS NOT NULL is unreliable — empty blobs pass the null check.
// Return 404 when the buffer is empty so the frontend can hide the thumbnail
// cleanly. Strip helmet's restrictive headers so cross-origin <img> works in
// dev — mirror §21 / §34.6 of the design skill.

etudesColorisRouter.get('/ref-fini-coloris/:id/photo', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const rows = await queryRaw(
      `SELECT photo FROM ref_fini_colori WHERE IDref_fini_colori = ${id}`,
    )
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return }

    const raw = rows[0].photo
    if (raw == null) { res.status(404).json({ error: 'No photo' }); return }
    let buf: Buffer
    if (raw instanceof ArrayBuffer) buf = Buffer.from(raw)
    else if (Buffer.isBuffer(raw)) buf = raw
    else { res.status(404).json({ error: 'No photo' }); return }
    if (buf.length === 0 || (buf.length === 1 && buf[0] === 0)) {
      res.status(404).json({ error: 'No photo' }); return
    }

    // MIME sniff (PNG / JPEG / generic)
    let contentType = 'application/octet-stream'
    if (buf.length >= 4) {
      const h = buf.subarray(0, 4)
      if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) contentType = 'image/png'
      else if (h[0] === 0xff && h[1] === 0xd8) contentType = 'image/jpeg'
      else if (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) contentType = 'application/pdf'
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.end(buf)
  } catch (err) {
    console.error('Error serving ref_fini_colori photo:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

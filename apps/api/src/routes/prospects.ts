import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { z } from 'zod'
import { query, fixEncoding } from '../lib/hfsql-auto.js'

export const prospectsRouter: RouterType = Router()

// The `prospect` table has accented column names: `prénom`, `société`, `traité`.
// The Linux iODBC bridge (production) rejects accented identifier tokens
// entirely, while the Windows ODBC driver accepts them. Following the
// canonical stock.ts pattern:
//   • Reads use `SELECT *` (no accented identifier named) on both platforms;
//     `normalizeProspectRow` folds the returned keys to canonical ASCII keys.
//   • Writes name the accented columns only on Windows; on Linux those three
//     fields are skipped (same limitation stock.ts ships for `terminé`).
const IS_WINDOWS = process.platform === 'win32'

// ── Helpers ──────────────────────────────────────────────

function esc(value: string): string {
  return value.replace(/'/g, "''")
}

/** SQL literal for a user-supplied text value. Pure-ASCII → quoted literal;
 *  accented values → hex literal of their Latin-1 bytes (the Linux bridge
 *  corrupts raw multi-byte UTF-8 embedded in a SQL string). */
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

function n(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(value)
  return isNaN(parsed) ? 0 : parsed
}

/** Keep only digits from a YYYYMMDD-ish input. Accepts 'YYYY-MM-DD', 'YYYYMMDD' or ''. */
function dateStr(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value).replace(/-/g, '')
  return /^\d{8}$/.test(s) ? s : ''
}

function todayHfsql(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** Diacritic-insensitive, lowercased key. `prénom` → `prenom`, `DATE` → `date`. */
function foldKey(k: string): string {
  return k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Legacy status_catalogue values -1 and 0 display as Nouveau (1). */
function coerceStatus(raw: unknown): 1 | 2 | 3 {
  const v = n(raw)
  return v === 2 ? 2 : v === 3 ? 3 : 1
}

// ── Types ────────────────────────────────────────────────

interface ProspectRow {
  IDprospect: number
  prenom: string
  nom: string
  email: string
  societe: string
  adresse: string
  code_postal: string
  ville: string
  pays: string
  telephone: string
  status_catalogue: 1 | 2 | 3
  date: string
  observation: string
  notes_interne: string
  expe_catalogue: string
  tracking_number: string
  IDtransporteur: number
  traite: number
  IDclient: number
}

/** Map a raw HFSQL row (exact accented keys on Windows, possibly mangled on
 *  Linux, `date` uppercased as `DATE`) to canonical ASCII-keyed fields. */
function normalizeProspectRow(raw: Record<string, unknown>): ProspectRow {
  const byFold = new Map<string, unknown>()
  for (const [k, v] of Object.entries(raw)) byFold.set(foldKey(k), v)

  // Exact fold match, with a one-char-truncation fallback for the Linux
  // bridge mangling accented column names (terminé → termin style).
  const get = (folded: string): unknown => {
    if (byFold.has(folded)) return byFold.get(folded)
    for (const [f, v] of byFold) {
      if (f.length >= 3 && folded.startsWith(f) && folded.length - f.length <= 1) return v
    }
    return undefined
  }
  const str = (folded: string): string => {
    const v = get(folded)
    return v === null || v === undefined ? '' : String(v)
  }

  return {
    IDprospect: n(get('idprospect')),
    prenom: str('prenom'),
    nom: str('nom'),
    email: str('email'),
    societe: str('societe'),
    adresse: str('adresse'),
    code_postal: str('code_postal'),
    ville: str('ville'),
    pays: str('pays'),
    telephone: str('telephone'),
    status_catalogue: coerceStatus(get('status_catalogue')),
    date: str('date'),
    observation: str('observation'),
    notes_interne: str('notes_interne'),
    expe_catalogue: str('expe_catalogue'),
    tracking_number: str('tracking_number'),
    IDtransporteur: n(get('idtransporteur')),
    traite: n(get('traite')) ? 1 : 0,
    IDclient: n(get('idclient')),
  }
}

// fixEncoding field lists keyed on the RAW column names. Non-accented columns
// are identical on both platforms; the accented ones are only nameable in a
// CONVERT() query on Windows.
const TEXT_FIELDS_BASE = [
  'nom', 'email', 'adresse', 'code_postal', 'ville', 'pays', 'telephone',
  'observation', 'notes_interne', 'tracking_number',
]
const TEXT_FIELDS_FULL = IS_WINDOWS ? [...TEXT_FIELDS_BASE, 'prénom', 'société'] : TEXT_FIELDS_BASE
const TEXT_FIELDS_LIST = IS_WINDOWS ? ['nom', 'ville', 'email', 'prénom', 'société'] : ['nom', 'ville', 'email']

// ── Validation ───────────────────────────────────────────

const prospectBody = z.object({
  prenom: z.string().max(150).optional(),
  nom: z.string().max(150).optional(),
  email: z.string().max(150).optional(),
  societe: z.string().max(150).optional(),
  adresse: z.string().max(255).optional(),
  code_postal: z.string().max(20).optional(),
  ville: z.string().max(120).optional(),
  pays: z.string().max(120).optional(),
  telephone: z.string().max(40).optional(),
  date: z.string().optional(),
  observation: z.string().optional(),
  notes_interne: z.string().optional(),
  expe_catalogue: z.string().optional(),
  tracking_number: z.string().max(120).optional(),
  IDtransporteur: z.number().int().nonnegative().optional(),
  traite: z.number().int().min(0).max(1).optional(),
})

const statusBody = z.object({
  status_catalogue: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

// ── Detail loader (shared by GET /:id, PUT, status, convert) ──

async function loadProspectDetail(id: number): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(`SELECT * FROM prospect WHERE IDprospect = ${id}`)
  if (rows.length === 0) return null
  const fixed = await fixEncoding(rows, 'prospect', 'IDprospect', TEXT_FIELDS_FULL)
  const p = normalizeProspectRow(fixed[0])

  let transporteur_nom: string | null = null
  if (p.IDtransporteur > 0) {
    const tr = await query<{ IDtransporteur: number; nom: string }>(
      `SELECT IDtransporteur, nom FROM transporteur WHERE IDtransporteur = ${p.IDtransporteur}`,
    )
    const fixedTr = await fixEncoding(tr, 'transporteur', 'IDtransporteur', ['nom'])
    transporteur_nom = fixedTr[0]?.nom ?? null
  }

  let client_nom: string | null = null
  if (p.IDclient > 0) {
    const cl = await query<{ IDclient: number; nom: string }>(
      `SELECT IDclient, nom FROM client WHERE IDclient = ${p.IDclient}`,
    )
    const fixedCl = await fixEncoding(cl, 'client', 'IDclient', ['nom'])
    client_nom = fixedCl[0]?.nom ?? null
  }

  return { ...p, transporteur_nom, client_nom }
}

// ── Transporteurs lookup ─────────────────────────────────

prospectsRouter.get('/lookups/transporteurs', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ IDtransporteur: number; nom: string }>(
      `SELECT IDtransporteur, nom FROM transporteur WHERE est_visible = 1 ORDER BY nom`,
    )
    const fixed = await fixEncoding(rows, 'transporteur', 'IDtransporteur', ['nom'])
    res.json(fixed.map((t) => ({ IDtransporteur: Number(t.IDtransporteur), nom: t.nom ?? '' })))
  } catch (err) {
    console.error('Error fetching transporteurs lookup:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── List demandes ────────────────────────────────────────

prospectsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim().toLowerCase()
    const statusFilter = String(req.query.status ?? 'all')

    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM prospect ORDER BY date DESC, IDprospect DESC`,
    )
    const fixed = await fixEncoding(rows, 'prospect', 'IDprospect', TEXT_FIELDS_LIST)
    let demandes = fixed.map(normalizeProspectRow)

    if (statusFilter === 'nouveau') demandes = demandes.filter((d) => d.status_catalogue === 1)
    else if (statusFilter === 'en_attente') demandes = demandes.filter((d) => d.status_catalogue === 2)
    else if (statusFilter === 'terminee') demandes = demandes.filter((d) => d.status_catalogue === 3)

    if (q) {
      demandes = demandes.filter((d) => {
        const hay = `${d.prenom} ${d.nom} ${d.societe} ${d.email} ${d.ville}`.toLowerCase()
        return hay.includes(q)
      })
    }

    res.json(demandes)
  } catch (err) {
    console.error('Error fetching prospects:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Get one demande ──────────────────────────────────────

prospectsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    const detail = await loadProspectDetail(id)
    if (!detail) { res.status(404).json({ error: 'Demande not found' }); return }
    res.json(detail)
  } catch (err) {
    console.error('Error fetching prospect:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Create demande ───────────────────────────────────────

prospectsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = prospectBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data

    // New demandes always start at status_catalogue 1 (Nouveau), unconverted.
    const cols = [
      'nom', 'email', 'adresse', 'code_postal', 'ville', 'pays', 'telephone',
      'status_catalogue', 'date', 'observation', 'notes_interne',
      'expe_catalogue', 'tracking_number', 'IDtransporteur', 'IDclient',
    ]
    const vals = [
      sqlText(d.nom), sqlText(d.email), sqlText(d.adresse), sqlText(d.code_postal),
      sqlText(d.ville), sqlText(d.pays), sqlText(d.telephone),
      '1', `'${dateStr(d.date) || todayHfsql()}'`, sqlText(d.observation),
      sqlText(d.notes_interne), `'${dateStr(d.expe_catalogue)}'`, sqlText(d.tracking_number),
      String(d.IDtransporteur ?? 0), '0',
    ]
    if (IS_WINDOWS) {
      cols.push('prénom', 'société', 'traité')
      vals.push(sqlText(d.prenom), sqlText(d.societe), String(d.traite ?? 0))
    }

    await query(`INSERT INTO prospect (${cols.join(', ')}) VALUES (${vals.join(', ')})`)

    const created = await query<Record<string, unknown>>(
      `SELECT * FROM prospect ORDER BY IDprospect DESC`,
    )
    if (created.length === 0) { res.status(500).json({ error: 'Insert failed' }); return }
    const newId = normalizeProspectRow(created[0]).IDprospect
    const detail = await loadProspectDetail(newId)
    res.status(201).json(detail)
  } catch (err) {
    console.error('Error creating prospect:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Update demande ───────────────────────────────────────

prospectsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = prospectBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }
    const d = parsed.data

    const sets: string[] = []
    if (d.nom !== undefined) sets.push(`nom = ${sqlText(d.nom)}`)
    if (d.email !== undefined) sets.push(`email = ${sqlText(d.email)}`)
    if (d.adresse !== undefined) sets.push(`adresse = ${sqlText(d.adresse)}`)
    if (d.code_postal !== undefined) sets.push(`code_postal = ${sqlText(d.code_postal)}`)
    if (d.ville !== undefined) sets.push(`ville = ${sqlText(d.ville)}`)
    if (d.pays !== undefined) sets.push(`pays = ${sqlText(d.pays)}`)
    if (d.telephone !== undefined) sets.push(`telephone = ${sqlText(d.telephone)}`)
    if (d.date !== undefined) sets.push(`date = '${dateStr(d.date)}'`)
    if (d.observation !== undefined) sets.push(`observation = ${sqlText(d.observation)}`)
    if (d.notes_interne !== undefined) sets.push(`notes_interne = ${sqlText(d.notes_interne)}`)
    if (d.expe_catalogue !== undefined) sets.push(`expe_catalogue = '${dateStr(d.expe_catalogue)}'`)
    if (d.tracking_number !== undefined) sets.push(`tracking_number = ${sqlText(d.tracking_number)}`)
    if (d.IDtransporteur !== undefined) sets.push(`IDtransporteur = ${n(d.IDtransporteur)}`)
    // Accented columns: writable only on the Windows ODBC driver.
    if (IS_WINDOWS) {
      if (d.prenom !== undefined) sets.push(`prénom = ${sqlText(d.prenom)}`)
      if (d.societe !== undefined) sets.push(`société = ${sqlText(d.societe)}`)
      if (d.traite !== undefined) sets.push(`traité = ${n(d.traite) ? 1 : 0}`)
    }

    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    await query(`UPDATE prospect SET ${sets.join(', ')} WHERE IDprospect = ${id}`)

    const detail = await loadProspectDetail(id)
    if (!detail) { res.status(404).json({ error: 'Demande not found' }); return }
    res.json(detail)
  } catch (err) {
    console.error('Error updating prospect:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Change status ────────────────────────────────────────

prospectsRouter.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const parsed = statusBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
      return
    }

    await query(
      `UPDATE prospect SET status_catalogue = ${parsed.data.status_catalogue} WHERE IDprospect = ${id}`,
    )

    const detail = await loadProspectDetail(id)
    if (!detail) { res.status(404).json({ error: 'Demande not found' }); return }
    res.json(detail)
  } catch (err) {
    console.error('Error updating prospect status:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Convert demande to client ────────────────────────────

prospectsRouter.post('/:id/convert', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

    const rows = await query<Record<string, unknown>>(`SELECT * FROM prospect WHERE IDprospect = ${id}`)
    if (rows.length === 0) { res.status(404).json({ error: 'Demande not found' }); return }
    const fixed = await fixEncoding(rows, 'prospect', 'IDprospect', TEXT_FIELDS_FULL)
    const p = normalizeProspectRow(fixed[0])

    if (p.IDclient > 0) {
      res.status(409).json({
        error: 'already_converted',
        message: 'Ce prospect est déjà converti en client.',
      })
      return
    }

    // The `client` table has no first-name/email/postal-address columns
    // (those live in the `adresse` / `contact` tables) — create only the
    // master row here. `bloqué` / `archivé` are accented identifiers, so
    // they are left to their HFSQL default (0).
    const clientNom = (p.societe.trim() || `${p.prenom} ${p.nom}`.trim() || `Prospect #${id}`).slice(0, 100)
    const tel = p.telephone.slice(0, 20)

    await query(
      `INSERT INTO client (nom, tel, IDtransporteur, commentaire, date_creation, est_visible, client_interne) ` +
      `VALUES (${sqlText(clientNom)}, ${sqlText(tel)}, ${p.IDtransporteur}, ${sqlText(p.observation)}, '${todayHfsql()}', 1, 0)`,
    )
    const createdClient = await query<Record<string, unknown>>(
      `SELECT IDclient FROM client ORDER BY IDclient DESC`,
    )
    if (createdClient.length === 0) { res.status(500).json({ error: 'Client insert failed' }); return }
    const newClientId = n(createdClient[0].IDclient)

    // Linking + status (3 = Terminée) use non-accented columns — safe on Linux.
    await query(
      `UPDATE prospect SET IDclient = ${newClientId}, status_catalogue = 3 WHERE IDprospect = ${id}`,
    )

    const detail = await loadProspectDetail(id)
    res.json({ IDclient: newClientId, demande: detail })
  } catch (err) {
    console.error('Error converting prospect:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Delete demande ───────────────────────────────────────

prospectsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }
    await query(`DELETE FROM prospect WHERE IDprospect = ${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting prospect:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

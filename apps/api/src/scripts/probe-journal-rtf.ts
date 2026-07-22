// Probe: how many commande_sous_traitant.journal rows are RTF-wrapped, and
// preview a few before/after values. Read-only — does NOT modify any data.
import dotenv from 'dotenv'
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: `.env.${env}` })
dotenv.config({ path: '.env' })
import { query, fixEncoding, closeConnection } from '../lib/hfsql-auto.js'
import { stripRtf } from '../lib/rtf-utils.js'

async function main() {
  // First: what's the max ID + few recent rows?
  const maxRow = await query<any>(`SELECT MAX(IDcommande_sous_traitant) AS maxid FROM commande_sous_traitant`)
  console.log('[max id]', JSON.stringify(maxRow[0]))
  const recent = await query<any>(`SELECT IDcommande_sous_traitant, date_commande FROM commande_sous_traitant ORDER BY IDcommande_sous_traitant DESC LIMIT 5`)
  console.log('[5 most recent ids]', recent.map((r: any) => `${r.IDcommande_sous_traitant} (${r.date_commande})`).join(', '))

  // Targeted: look at commande 8743 — user says it has journal content
  console.log('=== Targeted probe: IDcommande_sous_traitant = 8743 ===')
  const peek8743 = await query<Record<string, unknown>>(
    `SELECT * FROM commande_sous_traitant WHERE IDcommande_sous_traitant = 8743`,
  )
  console.log(`rows returned: ${peek8743.length}`)
  if (peek8743.length > 0) {
    const r = peek8743[0] as any
    console.log('column names:', Object.keys(r).sort().join(', '))
    for (const [k, v] of Object.entries(r)) {
      if (k.toLowerCase().includes('journ') || k.toLowerCase().includes('comment')) {
        let kind: string = typeof v
        let preview = ''
        let len = -1
        if (v == null) kind = 'null'
        else if (Buffer.isBuffer(v)) { kind = 'Buffer'; len = v.length; preview = v.toString('utf8') }
        else if (v instanceof ArrayBuffer) { kind = 'ArrayBuffer'; len = v.byteLength; preview = Buffer.from(v).toString('utf8') }
        else if (typeof v === 'string') { len = v.length; preview = v }
        else preview = JSON.stringify(v)
        console.log(`  col=${k} kind=${kind} len=${len}`)
        console.log(`  preview=${JSON.stringify(preview.slice(0, 500))}`)
      }
    }
  }

  const cnt = await query<any>(`SELECT COUNT(*) AS n FROM commande_sous_traitant WHERE journal IS NOT NULL AND LEN(journal) > 0`)
  console.log('[count] commande_sous_traitant.journal non-empty:', JSON.stringify(cnt[0]))

  const cntC = await query<any>(`SELECT COUNT(*) AS n FROM commande_sous_traitant WHERE commentaire IS NOT NULL AND LEN(commentaire) > 0`)
  console.log('[count] commande_sous_traitant.commentaire non-empty:', JSON.stringify(cntC[0]))

  const cntL = await query<any>(`SELECT COUNT(*) AS n FROM ligne_commande_sous_traitant WHERE commentaire IS NOT NULL AND LEN(commentaire) > 0`)
  console.log('[count] ligne_commande_sous_traitant.commentaire non-empty:', JSON.stringify(cntL[0]))

  const peek = await query<Record<string, unknown>>(
    `SELECT IDcommande_sous_traitant, journal, commentaire, LEN(journal) AS journal_len, LEN(commentaire) AS commentaire_len FROM commande_sous_traitant WHERE LEN(journal) > 0 ORDER BY IDcommande_sous_traitant DESC LIMIT 5`,
  )
  console.log('[non-empty journal rows]', peek.length)
  for (const r of peek as any[]) {
    const j = r.journal
    let preview = ''
    let kind: string = typeof j
    if (j == null) kind = 'null'
    else if (Buffer.isBuffer(j)) { kind = 'Buffer'; preview = j.toString('utf8').slice(0, 200) }
    else if (j instanceof ArrayBuffer) { kind = 'ArrayBuffer'; preview = Buffer.from(j).toString('utf8').slice(0, 200) }
    else preview = String(j).slice(0, 200)
    console.log(`  id=${r.IDcommande_sous_traitant} journal_len=${r.journal_len} commentaire_len=${r.commentaire_len} journal_kind=${kind} preview=${JSON.stringify(preview)}`)
  }
  if (peek.length > 0) {
    console.log('[schema] columns on commande_sous_traitant:', Object.keys(peek[0]).sort().join(', '))
    for (const [k, v] of Object.entries(peek[0])) {
      if (k.toLowerCase().includes('journ') || k.toLowerCase().includes('comment')) {
        const j = v as any
        let kind: string = typeof j
        let preview = ''
        if (j == null) kind = 'null'
        else if (Buffer.isBuffer(j)) { kind = 'Buffer'; preview = j.toString('utf8').slice(0, 300) }
        else if (j instanceof ArrayBuffer) { kind = 'ArrayBuffer'; preview = Buffer.from(j).toString('utf8').slice(0, 300) }
        else preview = String(j).slice(0, 300)
        console.log(`  col=${k} kind=${kind} preview=${JSON.stringify(preview)}`)
      }
    }
  }

  const rows = await query<{ IDcommande_sous_traitant: number; journal: string | null }>(
    `SELECT IDcommande_sous_traitant, journal FROM commande_sous_traitant ORDER BY IDcommande_sous_traitant DESC`,
  )
  // Diagnostic: peek at the raw values BEFORE fixEncoding
  let rawNonEmpty = 0
  let rawRtf = 0
  for (const r of rows as any[]) {
    const raw = String(r.journal ?? '')
    if (raw.trim() !== '') rawNonEmpty++
    if (/^\s*\{\\rtf/i.test(raw)) rawRtf++
  }
  console.log(`[raw] rows=${rows.length} nonEmpty=${rawNonEmpty} rtfHeader=${rawRtf}`)
  console.log(`[raw] first 8 sample journal values:`)
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const r = rows[i] as any
    const j = r.journal
    let kind: string = typeof j
    let preview = ''
    let byteLen = -1
    if (j == null) {
      kind = 'null'
    } else if (Buffer.isBuffer(j)) {
      kind = 'Buffer'
      byteLen = j.length
      preview = j.toString('utf8').slice(0, 200)
    } else if (j instanceof ArrayBuffer) {
      kind = 'ArrayBuffer'
      byteLen = j.byteLength
      preview = Buffer.from(j).toString('utf8').slice(0, 200)
    } else if (typeof j === 'string') {
      kind = 'string'
      byteLen = Buffer.byteLength(j, 'utf8')
      preview = j.slice(0, 200)
    } else {
      preview = JSON.stringify(j).slice(0, 200)
    }
    console.log(`  id=${r.IDcommande_sous_traitant} kind=${kind} bytes=${byteLen} preview=${JSON.stringify(preview)}`)
  }

  const fixed = await fixEncoding(
    rows as any[],
    'commande_sous_traitant',
    'IDcommande_sous_traitant',
    ['journal'],
  )

  let total = 0
  let nonEmpty = 0
  let rtfWrapped = 0
  let alreadyPlain = 0
  const samples: { id: number; before: string; after: string }[] = []

  for (const r of fixed as any[]) {
    total++
    const raw = (r.journal ?? '') as string
    if (raw.trim() === '') continue
    nonEmpty++
    const stripped = stripRtf(raw)
    if (raw.startsWith('{\\rtf') || /^\s*\{\\rtf/i.test(raw)) {
      rtfWrapped++
      if (samples.length < 5) {
        samples.push({
          id: Number(r.IDcommande_sous_traitant),
          before: raw.slice(0, 200),
          after: stripped.slice(0, 200),
        })
      }
    } else {
      alreadyPlain++
    }
  }

  console.log(`total rows:      ${total}`)
  console.log(`non-empty:       ${nonEmpty}`)
  console.log(`RTF-wrapped:     ${rtfWrapped}`)
  console.log(`already plain:   ${alreadyPlain}`)
  console.log('')
  console.log('=== sample RTF → plain conversions ===')
  for (const s of samples) {
    console.log(`\n--- IDcommande_sous_traitant = ${s.id} ---`)
    console.log(`BEFORE: ${JSON.stringify(s.before)}`)
    console.log(`AFTER:  ${JSON.stringify(s.after)}`)
  }

  await closeConnection()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

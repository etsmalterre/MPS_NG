// One-shot migration: convert commande_sous_traitant.journal from RTF-wrapped
// plain text to bare plain text. Safe to re-run (idempotent — rows already
// stripped are skipped).
//
// Phases:
//   1. SELECT every IDcommande_sous_traitant with journal starting with `{\rtf`.
//   2. DUMP the current values to a JSON backup file BEFORE any UPDATE.
//   3. For each row, compute stripRtf(raw). If stripped !== raw, UPDATE the
//      row with the plain-text value via sqlText() (Latin-1 hex literal for
//      accented values — required by the HFSQL bridge).
//
// Usage:
//   pnpm exec tsx src/scripts/migrate-journal-rtf-to-plain.ts            # dry-run + backup dump only
//   pnpm exec tsx src/scripts/migrate-journal-rtf-to-plain.ts --apply    # actually write the UPDATEs
//
// The backup file is written even in dry-run mode so you can keep a baseline.
import dotenv from 'dotenv'
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: `.env.${env}` })
dotenv.config({ path: '.env' })
import { query, closeConnection } from '../lib/hfsql-auto.js'
import { stripRtf } from '../lib/rtf-utils.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const APPLY = process.argv.includes('--apply')

function esc(value: string): string {
  return value.replace(/'/g, "''")
}

// Mirrors sqlText() from commandes-sous-traitant.ts — Latin-1 hex literal
// for accented values so the HFSQL bridge doesn't choke on multi-byte UTF-8.
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
      const c = ch.codePointAt(0) ?? 0x3F
      return c <= 0xFF ? c : 0x3F
    }),
  )
  return `x'${bytes.toString('hex')}'`
}

interface Row {
  IDcommande_sous_traitant: number
  journal: string | null
}

async function main() {
  const mode = APPLY ? 'APPLY' : 'DRY-RUN'
  console.log(`[${mode}] migrate commande_sous_traitant.journal: RTF → plain`)
  console.log(`HFSQL: ${process.env.HFSQL_CONNECTION_STRING?.replace(/PWD=[^;]*/, 'PWD=****')}`)

  const rows = await query<Row>(
    `SELECT IDcommande_sous_traitant, journal FROM commande_sous_traitant WHERE journal IS NOT NULL ORDER BY IDcommande_sous_traitant`,
  )

  // Filter to rows that actually look like RTF (defensive — should be all)
  const candidates: { id: number; raw: string; plain: string }[] = []
  for (const r of rows as Row[]) {
    const raw = String(r.journal ?? '')
    if (raw === '') continue
    if (!/^\s*\{\\rtf/i.test(raw)) continue
    const plain = stripRtf(raw)
    if (plain === raw) continue // already plain (shouldn't happen for {\rtf rows but guard anyway)
    candidates.push({ id: Number(r.IDcommande_sous_traitant), raw, plain })
  }

  console.log(`\nTotal rows with non-null journal: ${rows.length}`)
  console.log(`Rows needing migration (RTF → plain): ${candidates.length}`)

  // Backup dump — written in both dry-run and apply modes
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
  const backupPath = `C:/Users/vince/AppData/Local/Temp/mps-journal-backup-${ts}.json`
  mkdirSync(dirname(backupPath), { recursive: true })
  writeFileSync(
    backupPath,
    JSON.stringify(
      candidates.map((c) => ({ id: c.id, raw: c.raw, plain: c.plain })),
      null,
      2,
    ),
    'utf8',
  )
  console.log(`Backup written: ${backupPath} (${candidates.length} rows)`)

  console.log(`\nFirst 5 conversions:`)
  for (const c of candidates.slice(0, 5)) {
    console.log(`  id=${c.id}`)
    console.log(`    before: ${JSON.stringify(c.raw.slice(0, 120))}`)
    console.log(`    after:  ${JSON.stringify(c.plain.slice(0, 120))}`)
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN complete. Re-run with --apply to execute the UPDATEs.`)
    await closeConnection()
    return
  }

  console.log(`\nApplying ${candidates.length} UPDATEs…`)
  let done = 0
  let failed = 0
  const failedIds: number[] = []
  const batchStart = Date.now()
  for (const c of candidates) {
    try {
      await query(`UPDATE commande_sous_traitant SET journal = ${sqlText(c.plain)} WHERE IDcommande_sous_traitant = ${c.id}`)
      done++
    } catch (err) {
      failed++
      failedIds.push(c.id)
      console.error(`  FAILED id=${c.id}: ${(err as Error).message}`)
    }
    if (done % 200 === 0 && done > 0) {
      const elapsed = Math.round((Date.now() - batchStart) / 1000)
      console.log(`  progress: ${done}/${candidates.length} (${elapsed}s)`)
    }
  }
  const totalElapsed = Math.round((Date.now() - batchStart) / 1000)
  console.log(`\nDONE: ${done} updated, ${failed} failed in ${totalElapsed}s`)
  if (failedIds.length > 0) {
    console.log(`Failed IDs: ${failedIds.join(', ')}`)
  }

  // Verification — sample 3 random updated rows and confirm they no longer look like RTF
  console.log(`\nVerification (3 sample reads):`)
  const sampleIds = candidates.slice(0, 3).map((c) => c.id)
  for (const id of sampleIds) {
    const verify = await query<Row>(`SELECT IDcommande_sous_traitant, journal FROM commande_sous_traitant WHERE IDcommande_sous_traitant = ${id}`)
    const v = verify[0]?.journal ?? ''
    console.log(`  id=${id} journal=${JSON.stringify(String(v).slice(0, 120))}`)
  }

  await closeConnection()
}

main().catch(async (err) => {
  console.error(err)
  await closeConnection().catch(() => {})
  process.exit(1)
})

// Trace where IDColoris=1094 resolves to "ecru" — it wasn't in colori_fil
// or colori_ecru on the first pass. Check ref_fini_colori too, and
// composition_ecru in case the legacy app stores the coloris under a
// different key.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function dumpAll(table: string, pk: string, id: number) {
  console.log(`--- ${table} ${pk}=${id} ---`)
  try {
    const rows = await query<Record<string, unknown>>(`SELECT * FROM ${table} WHERE ${pk} = ${id}`)
    if (rows.length === 0) { console.log('  (no row)'); return }
    for (const [k, v] of Object.entries(rows[0])) {
      const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
      console.log(`  ${k.padEnd(20)} = ${display === '' ? "''" : display}`)
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`)
  }
}

async function main() {
  await dumpAll('colori_fil', 'IDcolori_fil', 1094)
  await dumpAll('colori_ecru', 'IDcolori_ecru', 1094)
  await dumpAll('ref_fini_colori', 'IDref_fini_colori', 1094)

  console.log('\n--- composition_ecru rows for ref_ecru=146 ("029") ---')
  const compo = await query<Record<string, unknown>>(
    `SELECT * FROM composition_ecru WHERE IDref_ecru = 146`,
  )
  for (const r of compo) console.log(' ', r)
}

main().catch((e) => { console.error(e); process.exit(1) })

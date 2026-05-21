// Cross-check ID 146 across ref_fil, ref_ecru, ref_fini — same numeric ID
// can exist in multiple catalogs (legacy quirk noted in CLAUDE.md).
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  for (const table of ['ref_fil', 'ref_ecru', 'ref_fini']) {
    const pk = table === 'ref_fil' ? 'IDref_fil' : table === 'ref_ecru' ? 'IDref_ecru' : 'IDref_fini'
    try {
      const rows = await query<Record<string, unknown>>(
        `SELECT ${pk}, reference FROM ${table} WHERE ${pk} = 146`,
      )
      console.log(`${table} 146:`, rows.length === 0 ? '(none)' : rows[0])
    } catch (e: any) {
      console.log(`${table}: error ${e.message}`)
    }
  }

  console.log('\n--- All ref_ecru with reference matching 029 ---')
  const r = await query<Record<string, unknown>>(
    `SELECT IDref_ecru, reference FROM ref_ecru WHERE reference = '029' OR reference = '02' OR reference LIKE '029%'`,
  )
  for (const row of r) console.log(row)

  console.log('\n--- ref_ecru.reference for IDref_ecru = 146 ---')
  const e = await query<Record<string, unknown>>(
    `SELECT * FROM ref_ecru WHERE IDref_ecru = 146`,
  )
  if (e.length > 0) {
    const row = e[0]
    for (const [k, v] of Object.entries(row)) {
      const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
      console.log(`${k.padEnd(20)} = ${display}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

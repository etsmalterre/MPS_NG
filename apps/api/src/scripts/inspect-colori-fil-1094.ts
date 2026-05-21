// Look at colori_fil 1094 — the coloris of the tricoteur line 8558 — to
// see what the legacy app might display as "029".
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM colori_fil WHERE IDcolori_fil = 1094`,
  )
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
      console.log(`${k.padEnd(30)} = ${display === '' ? "''" : display}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

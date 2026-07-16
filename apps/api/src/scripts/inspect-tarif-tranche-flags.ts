import { query } from '../lib/hfsql-auto.js'

async function main() {
  const rows = (await query(
    `SELECT IDref_client_colori, lst_tranche FROM ref_client_colori`,
  )) as any[]
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = String(r.lst_tranche ?? '(null)')
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  console.log('total rows:', rows.length)
  for (const [v, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${JSON.stringify(v)} -> ${n} rows`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

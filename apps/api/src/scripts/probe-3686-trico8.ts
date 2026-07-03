// Probe 8: ordre_fabrication needs per yarn lot 1752/1646 — does
// stock − Σ(remaining OF need × pct) equal legacy 3322.29 / 307.65?
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const ofSample = await query<any>(`SELECT * FROM ordre_fabrication LIMIT 1`)
  console.log('ordre_fabrication columns:', Object.keys(ofSample[0] ?? {}))
  console.log(ofSample[0])

  for (const lotId of [1752, 1646]) {
    console.log(`\n===== lot ${lotId} =====`)
    const assoOf = await query<any>(
      `SELECT IDordre_fabrication AS ofid, pourcentage FROM asso_fil_of WHERE IDstock_fil = ${lotId}`,
    )
    console.log(`${assoOf.length} asso_fil_of rows`)
    for (const a of assoOf) {
      const ofid = Number(a.ofid)
      const of = await query<any>(`SELECT * FROM ordre_fabrication WHERE IDordre_fabrication = ${ofid}`)
      const prod = await query<any>(
        `SELECT COUNT(*) AS n, SUM(poids) AS kg FROM stock_ecru WHERE IDordre_fabrication = ${ofid}`,
      )
      const o = of[0] ?? {}
      console.log(
        `OF ${ofid}: pct=${a.pourcentage} | ${JSON.stringify(o)} | produced=${Number(prod[0]?.kg ?? 0).toFixed(2)} kg (${prod[0]?.n})`,
      )
    }
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

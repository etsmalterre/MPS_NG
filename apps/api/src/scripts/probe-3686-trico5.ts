// Probe 5: every lot of fil 5 and fil 8 (all coloris, all magasins) —
// hunting for legacy's 3322.29 (coton) and 307.65 (élasthanne).
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  for (const rf of [5, 8]) {
    const ref = await query<any>(`SELECT IDref_fil, reference FROM ref_fil WHERE IDref_fil = ${rf}`)
    console.log(`\n===== fil ${rf}: ${JSON.stringify(ref[0])} =====`)
    const lots = await query<any>(
      `SELECT IDstock_fil, lot, stock, stock_initial, IDMagasin, IDcolori_fil FROM stock_fil
       WHERE IDref_fil = ${rf} AND stock <> 0`,
    )
    const colIds = Array.from(new Set(lots.map((l: any) => Number(l.IDcolori_fil)).filter((x: number) => x > 0)))
    const colNames = new Map<number, string>()
    if (colIds.length > 0) {
      const cr = await query<any>(`SELECT IDcolori_fil, reference FROM colori_fil WHERE IDcolori_fil IN (${colIds.join(',')})`)
      for (const c of cr) colNames.set(Number(c.IDcolori_fil), String(c.reference ?? ''))
    }
    const agg = new Map<string, number>()
    for (const l of lots) {
      const key = `mag=${Number(l.IDMagasin) || 0} colori=${l.IDcolori_fil}(${colNames.get(Number(l.IDcolori_fil)) ?? '?'})`
      agg.set(key, (agg.get(key) ?? 0) + (Number(l.stock) || 0))
      console.log(`  lot ${l.IDstock_fil} (${l.lot}) ${key}: stock=${Number(l.stock).toFixed(2)} initial=${l.stock_initial}`)
    }
    console.log('  --- sums ---')
    for (const [k, v] of agg) console.log(`  ${k}: ${v.toFixed(2)} kg`)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

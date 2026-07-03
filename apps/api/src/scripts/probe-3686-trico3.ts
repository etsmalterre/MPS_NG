// Probe 3: all stock_fil lots (incl. <= 0) for the two yarns; legacy dispo test.
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  for (const [rf, cf] of [[5, 317], [8, 338]]) {
    const lots = await query<any>(
      `SELECT IDstock_fil, lot, stock, stock_initial, IDMagasin FROM stock_fil
       WHERE IDref_fil = ${rf} AND IDcolori_fil = ${cf}`,
    )
    console.log(`\nfil ${rf}/${cf}: ${lots.length} lots total`)
    const byMag = new Map<number, { all: number; pos: number }>()
    for (const l of lots) {
      const mag = Number(l.IDMagasin) || 0
      const s = Number(l.stock) || 0
      const e = byMag.get(mag) ?? { all: 0, pos: 0 }
      e.all += s
      if (s > 0) e.pos += s
      byMag.set(mag, e)
      if (s !== 0 && s <= 0) console.log(`  NEGATIVE lot ${l.IDstock_fil} (${l.lot}) mag=${mag}: ${s}`)
    }
    for (const [mag, v] of byMag) console.log(`  magasin ${mag}: sum(all)=${v.all.toFixed(2)} sum(stock>0)=${v.pos.toFixed(2)}`)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

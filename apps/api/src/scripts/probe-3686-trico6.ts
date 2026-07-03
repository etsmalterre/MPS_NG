// Probe 6: per-line écru roll breakdown (magasin, flags) for all lines
// reserving lots 1752/1646 — hunting exact legacy consumption metric.
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const one = await query<any>(`SELECT * FROM stock_ecru WHERE IDref_commande_source = 8464 LIMIT 1`)
  console.log('stock_ecru columns:', Object.keys(one[0] ?? {}))
  console.log(one[0])

  const lines = [8353, 8428, 8464, 8485, 8558, 7680, 7681, 7683, 7694, 7865, 7873, 8097, 8098, 8304, 8373]
  for (const lid of lines) {
    const rolls = await query<any>(
      `SELECT poids, IDmagasin, IDligne_commande_client AS lcc FROM stock_ecru WHERE IDref_commande_source = ${lid}`,
    )
    if (rolls.length === 0) { console.log(`lcs ${lid}: no rolls`); continue }
    const byMag = new Map<number, number>()
    let tot = 0
    for (const r of rolls) {
      const mag = Number(r.IDmagasin) || 0
      byMag.set(mag, (byMag.get(mag) ?? 0) + (Number(r.poids) || 0))
      tot += Number(r.poids) || 0
    }
    console.log(`lcs ${lid}: total=${tot.toFixed(2)} kg, byMagasin=${JSON.stringify(Array.from(byMag.entries()).map(([m, k]) => `${m}:${k.toFixed(1)}`))}`)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

// Remove the end-to-end test expedition created while validating the
// quick-ship endpoint (exp 11680, commande 3677 line 12589, rolls 48299-48300).
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const le = await query<any>(
    `SELECT IDligne_expedition FROM ligne_expedition WHERE IDexpedition = 11680`,
  )
  const leIds = le.map((r: any) => Number(r.IDligne_expedition)).filter((x: number) => x > 0)
  if (leIds.length > 0) {
    await query(`UPDATE stock_fini SET IDligne_expedition = 0 WHERE IDligne_expedition IN (${leIds.join(',')})`)
    await query(`UPDATE stock_ecru SET IDligne_expedition_ETM = 0 WHERE IDligne_expedition_ETM IN (${leIds.join(',')})`)
  }
  await query(`DELETE FROM ligne_expedition WHERE IDexpedition = 11680`)
  await query(`DELETE FROM expedition WHERE IDexpedition = 11680`)
  const rolls = await query<any>(
    `SELECT IDstock_fini AS id, IDligne_expedition AS le FROM stock_fini WHERE IDstock_fini IN (48299, 48300)`,
  )
  console.log('rolls after cleanup (expect le=0):', rolls)
  for (const [t, w] of [
    ['ligne_expedition', 'IDexpedition = 11680'],
    ['expedition', 'IDexpedition = 11680'],
  ]) {
    const r = await query<any>(`SELECT COUNT(*) AS n FROM ${t} WHERE ${w}`)
    console.log(`cleanup ${t}: ${r[0]?.n} remaining`)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

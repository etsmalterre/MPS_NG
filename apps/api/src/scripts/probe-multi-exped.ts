import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'
async function main() {
  const all = await query(`SELECT IDligne_commande_client AS lcc, IDexpedition AS eid FROM ligne_expedition WHERE IDligne_commande_client > 0`)
  const byLcc = new Map<number, number[]>()
  for (const r of all as any[]) {
    const lcc = Number(r.lcc)
    const arr = byLcc.get(lcc) ?? []
    arr.push(Number(r.eid))
    byLcc.set(lcc, arr)
  }
  const multi = Array.from(byLcc.entries()).filter(([, exps]) => exps.length > 1).sort((a, b) => b[0] - a[0])
  let shown = 0
  for (const [lcc, exps] of multi) {
    if (shown >= 8) break
    const l = await query(`SELECT IDcommande_client FROM ligne_commande_client WHERE IDligne_commande_client = ${lcc}`)
    const cid = Number((l[0] as any)?.IDcommande_client) || 0
    if (cid === 0) continue
    const c = await query(`SELECT numero, IDclient, est_soldee, IDsociete FROM commande_client WHERE IDcommande_client = ${cid}`)
    const h = c[0] as any
    if (Number(h?.IDsociete) !== 1) continue
    const cl = await query(`SELECT CONVERT(nom USING 'UTF-8') AS nom FROM client WHERE IDclient = ${Number(h?.IDclient) || 0}`)
    console.log(`commande N°${h?.numero} (id ${cid}, ${String((cl[0] as any)?.nom ?? '').trim()}, soldee=${h?.est_soldee}) — ligne ${lcc}: ${exps.length} expéditions [${exps.join(', ')}]`)
    shown++
  }
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })

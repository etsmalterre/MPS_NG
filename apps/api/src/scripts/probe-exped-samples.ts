// Find (a) a client line with existing expeditions, (b) a line with affected
// unshipped fini rolls — test subjects for the new Expédition tab endpoints.
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  // (a) recent ligne_expedition with rolls
  const le = await query<any>(
    `SELECT IDligne_expedition AS le, IDexpedition AS exp, IDligne_commande_client AS lcc
       FROM ligne_expedition ORDER BY IDligne_expedition DESC LIMIT 5`,
  )
  for (const r of le) {
    const l = await query<any>(
      `SELECT IDcommande_client FROM ligne_commande_client WHERE IDligne_commande_client = ${Number(r.lcc)}`,
    )
    const cc = l[0] ? await query<any>(
      `SELECT numero FROM commande_client WHERE IDcommande_client = ${Number(l[0].IDcommande_client)}`,
    ) : []
    const nf = await query<any>(`SELECT COUNT(*) AS n FROM stock_fini WHERE IDligne_expedition = ${Number(r.le)}`)
    console.log(`le=${r.le} exp=${r.exp} lcc=${r.lcc} commande_id=${l[0]?.IDcommande_client} numero=${cc[0]?.numero} fini_rolls=${nf[0]?.n}`)
  }

  // (b) EMPREINTE commande 3677 line — affected unshipped fini rolls?
  const c = await query<any>(`SELECT IDcommande_client FROM commande_client WHERE numero = 3677 AND IDsociete = 1`)
  const cid = Number(c[0]?.IDcommande_client)
  const lines = await query<any>(
    `SELECT IDligne_commande_client AS id FROM ligne_commande_client WHERE IDcommande_client = ${cid}`,
  )
  for (const l of lines) {
    const rolls = await query<any>(
      `SELECT IDstock_fini AS id, numero, IDligne_expedition AS le FROM stock_fini WHERE IDligne_commande_client = ${Number(l.id)}`,
    )
    console.log(`commande 3677 (id ${cid}) line ${l.id}: rolls`, rolls)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

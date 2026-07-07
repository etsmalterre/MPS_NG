// Probe: which stock tables carry IDcommande_donation and what legacy donation
// commandes have attached (feat: donation piece picker).
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  for (const t of ['stock_ecru', 'stock_fini', 'stock_divers']) {
    try {
      const rows = await query<any>(`SELECT TOP 1 * FROM ${t}`)
      console.log(`${t} columns:`, Object.keys(rows[0] ?? {}).join(', '))
    } catch (e: any) {
      console.log(`${t} error:`, e.message?.slice(0, 200))
    }
  }
  for (const t of ['stock_ecru', 'stock_fini']) {
    const n = await query<any>(
      `SELECT COUNT(*) AS nb FROM ${t} WHERE IDcommande_donation > 0`,
    )
    console.log(`${t} rows with IDcommande_donation>0:`, JSON.stringify(n))
  }
  // sample: latest donation commande and its attached pieces
  const cmds = await query<any>(
    `SELECT TOP 3 IDcommande_client, numero FROM commande_client WHERE donation = 1 AND IDsociete = 1 ORDER BY IDcommande_client DESC`,
  )
  console.log('donation commandes:', JSON.stringify(cmds))
  for (const c of cmds) {
    const id = Number(c.IDcommande_client)
    const e = await query<any>(`SELECT COUNT(*) AS nb FROM stock_ecru WHERE IDcommande_donation = ${id}`)
    const f = await query<any>(`SELECT COUNT(*) AS nb FROM stock_fini WHERE IDcommande_donation = ${id}`)
    console.log(`cmd ${id} (${c.numero}): ecru=${JSON.stringify(e)} fini=${JSON.stringify(f)}`)
  }
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })

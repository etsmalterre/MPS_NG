// What would POST /prov/generate pick up right now, and do any candidate
// commandes carry frais_port > 0?
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const exps = (await query(
    `SELECT IDexpedition, IDcommande_client, donation FROM expedition
     WHERE IDsociete = 1 AND (est_facture IS NULL OR est_facture = 0)`,
  )) as any[]
  console.log(`${exps.length} un-invoiced expeditions`)
  const cmdIds = Array.from(new Set(exps.map((e) => Number(e.IDcommande_client)).filter((x) => x > 0)))
  if (cmdIds.length === 0) return
  const cmds = (await query(
    `SELECT IDcommande_client, IDclient, numero, frais_port, donation FROM commande_client WHERE IDcommande_client IN (${cmdIds.join(',')})`,
  )) as any[]
  for (const c of cmds) {
    const expList = exps.filter((e) => Number(e.IDcommande_client) === Number(c.IDcommande_client)).map((e) => e.IDexpedition)
    console.log(`cmd ${c.IDcommande_client} (numero ${c.numero}, client ${c.IDclient}, frais_port ${c.frais_port}, don ${c.donation}) exps: ${expList.join(',')}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

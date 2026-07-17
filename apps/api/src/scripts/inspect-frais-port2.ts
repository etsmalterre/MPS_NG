// Probe: how do legacy factures carry "frais de port" lines? And sample
// commande_client.frais_port values.
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  console.log('=== ligne_facture with port-like designation (latest 15) ===')
  const rows = (await query(
    `SELECT TOP 400 IDligne_facture, IDfacture, IDligne_expedition, designation, quantite, unite, prix
     FROM ligne_facture ORDER BY IDligne_facture DESC`,
  )) as any[]
  const fixed = await fixEncoding(rows, 'ligne_facture', 'IDligne_facture', ['designation'])
  const portLines = fixed.filter((r: any) => /port/i.test(String(r.designation ?? '')))
  for (const r of portLines.slice(0, 15)) {
    console.log(`  fac=${r.IDfacture} le=${r.IDligne_expedition} qty=${r.quantite} ${r.unite} prix=${r.prix} desig=${JSON.stringify(String(r.designation))}`)
  }
  console.log(`(${portLines.length} port lines out of ${fixed.length} recent lines)`)

  console.log('\n=== commande_client frais_port > 0 (latest 10) ===')
  const cmds = (await query(
    `SELECT TOP 10 IDcommande_client, numero, frais_port FROM commande_client WHERE frais_port > 0 ORDER BY IDcommande_client DESC`,
  )) as any[]
  for (const c of cmds) console.log(`  cmd=${c.IDcommande_client} numero=${c.numero} frais_port=${c.frais_port}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

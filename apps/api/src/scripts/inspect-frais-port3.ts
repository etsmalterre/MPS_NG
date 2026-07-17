// Dump all lines of a few factures that carry "Frais de port" lines to see
// whether port is charged per commande or per expedition.
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  for (const facId of [5174, 5171, 5052, 5046]) {
    console.log(`\n=== facture ${facId} ===`)
    const rows = (await query(
      `SELECT IDligne_facture, IDligne_expedition, designation, quantite, unite, prix
       FROM ligne_facture WHERE IDfacture = ${facId} ORDER BY IDligne_facture`,
    )) as any[]
    const fixed = await fixEncoding(rows, 'ligne_facture', 'IDligne_facture', ['designation'])
    for (const r of fixed) {
      const d = String(r.designation ?? '').replace(/\r?\n/g, ' | ')
      console.log(`  le=${r.IDligne_expedition} qty=${r.quantite} prix=${r.prix} ${JSON.stringify(d.slice(0, 120))}`)
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

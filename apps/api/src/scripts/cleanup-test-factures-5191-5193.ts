// One-shot cleanup: remove the test definitive factures created by the
// e2e-factures verification run (local dev DB only).
import { query } from '../lib/hfsql-auto.js'

async function main() {
  for (const id of [5191, 5192, 5193]) {
    const rows = (await query(`SELECT IDfacture, numero, IDclient FROM facture WHERE IDfacture = ${id}`)) as any[]
    if (rows.length === 0) { console.log(`facture ${id}: not found`); continue }
    const lines = (await query(`SELECT IDligne_facture, designation FROM ligne_facture WHERE IDfacture = ${id}`)) as any[]
    const suspicious = lines.some((l) => !/^TEST /.test(String(l.designation ?? '')))
    if (suspicious) { console.log(`facture ${id}: SKIPPED (non-TEST lines present)`); continue }
    await query(`DELETE FROM ligne_facture WHERE IDfacture = ${id}`)
    await query(`DELETE FROM facture WHERE IDfacture = ${id}`)
    console.log(`facture ${id} (numero ${rows[0].numero}): deleted with ${lines.length} line(s)`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

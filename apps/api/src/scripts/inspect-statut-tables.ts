// One-off: confirm where order-status values live in HFSQL.
//   - commande_sous_traitant.est_soldee  → plain boolean, no lookup
//   - ligne_commande_sous_traitant.sstatut → varchar, no lookup table
//   - stock_fini.IDetat_stock_fini → FK to etat_stock_fini lookup
//   - commande_fil.etat → ??? (integer; lookup table or not?)
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  console.log('\n=== etat_stock_fini (the real DB lookup) ===')
  const r1 = (await query(`SELECT * FROM etat_stock_fini ORDER BY IDetat_stock_fini`)) as any[]
  const r1Fixed = await fixEncoding(r1 as any[], 'etat_stock_fini', 'IDetat_stock_fini', ['nom', 'designation', 'libelle']).catch(() => r1)
  for (const r of r1Fixed) console.log(' ', JSON.stringify(r))

  console.log('\n=== Search for sstatut lookup ===')
  // Try common candidate names
  for (const t of ['sstatut', 'statut', 'etat_commande', 'etat_ligne_sous_traitant', 'sstatut_ligne']) {
    try {
      const probe = (await query(`SELECT TOP 5 * FROM ${t}`)) as any[]
      console.log(`  Found table "${t}":`, probe.length, 'rows; keys:', Object.keys(probe[0] ?? {}).join(', '))
    } catch (_e) {
      console.log(`  (no table named "${t}")`)
    }
  }

  console.log('\n=== sstatut value distribution (the actual stored strings) ===')
  const r3 = (await query(
    `SELECT sstatut, COUNT(*) AS n FROM ligne_commande_sous_traitant GROUP BY sstatut ORDER BY n DESC`,
  )) as any[]
  for (const r of r3) console.log(' ', JSON.stringify(r))

  console.log('\n=== commande_fil etat ===')
  for (const t of ['etat_commande_fil', 'etat_fil', 'statut_commande_fil']) {
    try {
      const probe = (await query(`SELECT TOP 5 * FROM ${t}`)) as any[]
      console.log(`  Found "${t}":`, probe.length, 'rows; keys:', Object.keys(probe[0] ?? {}).join(', '))
    } catch (_e) {
      console.log(`  (no table named "${t}")`)
    }
  }
  const cf = (await query(
    `SELECT etat, COUNT(*) AS n FROM commande_fil GROUP BY etat ORDER BY n DESC`,
  )) as any[]
  console.log('  commande_fil.etat distribution:')
  for (const r of cf) console.log('   ', JSON.stringify(r))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

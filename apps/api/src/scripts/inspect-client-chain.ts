import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) ligne_commande_client 12629 → which IDcommande_client?
  console.log('\n=== ligne_commande_client 12629 (all columns) ===')
  const lcc = await query(`SELECT TOP 1 * FROM ligne_commande_client WHERE IDligne_commande_client = 12629`) as any[]
  if (lcc.length === 0) { console.log('no row'); return }
  console.log('keys:', Object.keys(lcc[0]))
  for (const k of Object.keys(lcc[0])) {
    if (/client|commande|IDref|IDentreprise/i.test(k)) console.log(`  ${k} = ${lcc[0][k]}`)
  }

  const IDcc = Number(lcc[0].IDcommande_client) || 0
  if (IDcc === 0) { console.log('IDcommande_client not present'); return }

  // 2) commande_client → IDentreprise (or IDclient)
  console.log(`\n=== commande_client ${IDcc} (all columns) ===`)
  const cc = await query(`SELECT TOP 1 * FROM commande_client WHERE IDcommande_client = ${IDcc}`) as any[]
  if (cc.length === 0) { console.log('no row'); return }
  console.log('keys:', Object.keys(cc[0]))
  for (const k of Object.keys(cc[0])) {
    if (/client|entreprise|IDsociete|IDfournisseur/i.test(k)) console.log(`  ${k} = ${cc[0][k]}`)
  }

  // 3) Try entreprise lookup for whichever id surfaced
  const IDent = Number(cc[0].IDentreprise) || Number(cc[0].IDclient) || 0
  if (IDent > 0) {
    console.log(`\n=== entreprise ${IDent} ===`)
    const e = await query(`SELECT IDentreprise, nom FROM entreprise WHERE IDentreprise = ${IDent}`) as any[]
    console.log(e)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

// One-off introspection for the Soumission Lot feature open items:
//   1. Does `contact` link to clients via IDclient or IDentreprise?
//   2. Does `stock_fini` have a separate `bain` column?
//   3. commande_client.numero vs IDcommande_client — which is the human number?
import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  console.log('\n=== contact (TOP 1 keys) ===')
  const c = (await query(`SELECT TOP 1 * FROM contact`)) as any[]
  if (c.length) console.log('keys:', Object.keys(c[0]).join(', '))

  console.log('\n=== contact soumission samples (envoi_soumission=1) ===')
  const cs = (await query(
    `SELECT TOP 8 IDcontact, IDclient, IDentreprise, IDfournisseur, IDsous_traitant,
            nom, prenom, mail, envoi_soumission, est_visible
     FROM contact WHERE envoi_soumission = 1 AND est_visible = 1`,
  )) as any[]
  const csFixed = await fixEncoding(cs as any[], 'contact', 'IDcontact', ['nom', 'prenom', 'mail'])
  for (const r of csFixed) console.log(' ', JSON.stringify(r))

  console.log('\n=== stock_fini (TOP 1 keys) ===')
  const sf = (await query(`SELECT TOP 1 * FROM stock_fini`)) as any[]
  if (sf.length) console.log('keys:', Object.keys(sf[0]).join(', '))

  console.log('\n=== commande_client recent rows ===')
  const cc = (await query(
    `SELECT TOP 5 IDcommande_client, IDclient, numero, date_commande, ref_client FROM commande_client ORDER BY IDcommande_client DESC`,
  )) as any[]
  const ccFixed = await fixEncoding(cc as any[], 'commande_client', 'IDcommande_client', ['ref_client'])
  for (const r of ccFixed) console.log(' ', JSON.stringify(r))

  console.log('\n=== Soumission-eligible probe (lots with rolls + designation_client.soumettre=1) ===')
  const probe = (await query(
    `SELECT TOP 10
       lcs.IDcommande_sous_traitant AS sst_id,
       sf.IDstock_fini, sf.IDref_fini, sf.IDColoris, sf.lot,
       sf.IDligne_commande_client AS lcc_id,
       lcc.IDcommande_client,
       cc.IDclient,
       dc.designation, dc.soumettre, dc.archivé
     FROM stock_fini sf
     JOIN ligne_commande_sous_traitant lcs
       ON lcs.IDligne_commande_sous_traitant = sf.IDref_commande_source
     JOIN ligne_commande_client lcc
       ON lcc.IDligne_commande_client = sf.IDligne_commande_client
     JOIN commande_client cc
       ON cc.IDcommande_client = lcc.IDcommande_client
     JOIN designation_client dc
       ON dc.IDclient = cc.IDclient AND dc.IDref_fini = sf.IDref_fini
     WHERE dc.soumettre = 1 AND dc.archivé = 0
     ORDER BY sf.IDstock_fini DESC`,
  )) as any[]
  const probeFixed = await fixEncoding(probe as any[], 'designation_client', 'IDcontact', ['designation'])
    .catch(() => probe)
  for (const r of probeFixed) console.log(' ', JSON.stringify(r))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

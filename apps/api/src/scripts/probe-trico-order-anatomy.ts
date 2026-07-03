// Probe: anatomy of a TRM tricotage order created from the legacy client-line
// Tricotage tab (8582), + does 8614 exist, + yarn "En Commande" source data.
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1. Does 8614 exist? (user had the modal open at 14:02)
  const c8614 = await query<any>(
    `SELECT * FROM commande_sous_traitant WHERE IDcommande_sous_traitant IN (8614, 8613, 8612)`,
  )
  console.log('=== commandes 8612-8614 ===')
  for (const c of c8614) console.log(c)

  // Max existing id
  const mx = await query<any>(`SELECT MAX(IDcommande_sous_traitant) AS mx FROM commande_sous_traitant`)
  console.log('max IDcommande_sous_traitant:', mx[0]?.mx)

  // 2. Full header of 8582 + its TRM mirror + line + asso rows
  const h = await query<any>(`SELECT * FROM commande_sous_traitant WHERE IDcommande_sous_traitant = 8582`)
  console.log('\n=== 8582 header ===', h[0])
  const mirror = await query<any>(
    `SELECT IDcommande_client, numero, IDclient, IDsociete, date_commande, ref_client, IDmode_paiement, IDecheance,
            IDadresse_livraison, IDadresse_facturation
       FROM commande_client WHERE IDcommande_ETM = 8582`,
  )
  console.log('=== 8582 TRM mirror ===', mirror)
  if (mirror.length > 0) {
    const ml = await query<any>(
      `SELECT * FROM ligne_commande_client WHERE IDcommande_client = ${Number(mirror[0].IDcommande_client)}`,
    )
    console.log('mirror lines:', ml)
  }
  const l = await query<any>(
    `SELECT * FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = 8582`,
  )
  console.log('=== 8582 sst line ===', l[0])

  // 3. Yarn orders pending ("En Commande"): explore commande_fil / ref_fil_commande
  const cf = await query<any>(`SELECT * FROM ref_fil_commande LIMIT 2`)
  console.log('\n=== ref_fil_commande sample ===', cf)
  const cfh = await query<any>(`SELECT * FROM commande_fil LIMIT 2`)
  console.log('=== commande_fil sample ===', cfh)

  // 4. stock_fil full columns (fournisseur resolution for lots)
  const sf = await query<any>(`SELECT * FROM stock_fil WHERE IDstock_fil = 1752`)
  console.log('\n=== stock_fil 1752 ===', sf[0])
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

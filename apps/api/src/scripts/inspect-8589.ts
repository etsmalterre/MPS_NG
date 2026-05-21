import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Catalog rows for sst=12 (FRANCE TEINTURE)
  console.log('\n=== tranche_tarif_ennoblissement rows for sst=12 (FRANCE TEINTURE) ===')
  const r = await query(`SELECT COUNT(*) AS n FROM tranche_tarif_ennoblissement WHERE IDsous_traitant = 12`) as any[]
  console.log('count:', r[0]?.n)

  // 2) Sample if any
  const sample = await query(`SELECT TOP 10 IDtranche_tarif_ennoblissement, IDtraitement, IDteinture, ListeTraitements, quantite_mini, quantite_maxi, prix FROM tranche_tarif_ennoblissement WHERE IDsous_traitant = 12`) as any[]
  for (const row of sample) console.log(' ', JSON.stringify(row))

  // 3) The actual line 8565 (commande 8589's only line) — full row
  console.log('\n=== ligne_commande_sous_traitant 8565 ===')
  const line = await query(`SELECT * FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = 8565`) as any[]
  for (const row of line) console.log(JSON.stringify(row))

  // 4) Same line but reading via the alias to confirm type column quirk
  console.log('\n=== ligne_commande_sous_traitant 8565 via aliased `type AS type_kind` ===')
  const aliased = await query(`SELECT IDligne_commande_sous_traitant, type AS type_kind, IDreference, IDColoris, prix FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = 8565`) as any[]
  for (const row of aliased) console.log(JSON.stringify(row))

  // 5) Distribution of `type` values across lines that resolve to a fini ref
  console.log('\n=== type distribution on lines where IDreference exists in ref_fini ===')
  const dist = await query(`
    SELECT lcs.type AS type_kind, COUNT(*) AS n
    FROM ligne_commande_sous_traitant lcs
    INNER JOIN ref_fini rf ON lcs.IDreference = rf.IDref_fini
    GROUP BY lcs.type
  `) as any[]
  for (const row of dist) console.log(' ', JSON.stringify(row))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

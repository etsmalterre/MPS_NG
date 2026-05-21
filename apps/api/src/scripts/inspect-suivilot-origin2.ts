import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

async function main() {
  // Real ref_fini columns (from the previous error): laizeHT_Moy, poids_Moy,
  // rendement, freinte, stab_hauteur, stab_largeur
  console.log('=== latest suivilot vs its ref_fini ===')
  const sui = await query<any>(
    `SELECT TOP 1 IDsuivilot, IDref_fini, IDColoris, laize_demandee, poids_demande,
            rendement_demande, freinte_demandée, stabL_demandée, stabH_demandée
     FROM suivilot ORDER BY IDsuivilot DESC`,
  )
  console.log('  suivilot:', JSON.stringify(sui[0]))
  if (sui[0]?.IDref_fini > 0) {
    const r = await query<any>(
      `SELECT IDref_fini, laizeHT_Moy, poids_Moy, rendement, freinte, stab_hauteur, stab_largeur
       FROM ref_fini WHERE IDref_fini = ${sui[0].IDref_fini}`,
    )
    console.log('  ref_fini:', JSON.stringify(r[0] ?? null))
  }

  console.log('\n=== IDetatLot distribution ===')
  const etat = await query<{ IDetatLot: number; n: number }>(
    `SELECT IDetatLot, COUNT(*) AS n FROM suivilot GROUP BY IDetatLot ORDER BY IDetatLot`,
  )
  for (const e of etat) console.log(`  IDetatLot=${e.IDetatLot}: ${e.n}`)

  console.log('\n=== etat_lot label table (if any) ===')
  for (const tbl of ['etat_lot', 'etatlot', 'etat_suivilot']) {
    try {
      const rows = await query<any>(`SELECT TOP 20 * FROM ${tbl}`)
      if (rows.length > 0) {
        console.log(`  ${tbl} cols:`, Object.keys(rows[0]).join(', '))
        for (const r of rows) console.log('   ', JSON.stringify(r))
        break
      }
    } catch (e) {
      console.log(`  ${tbl}: ${String((e as any).message ?? '').slice(0, 80)}`)
    }
  }

  console.log('\n=== how many (ligne, lot) pairs vs how many ligne ===')
  const pairs = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (SELECT IDligne_commande_sous_traitant, lot FROM suivilot GROUP BY IDligne_commande_sous_traitant, lot) AS x`,
  )
  const lignes = await query<{ n: number }>(
    `SELECT COUNT(DISTINCT IDligne_commande_sous_traitant) AS n FROM suivilot`,
  )
  const total = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM suivilot`)
  console.log(`  total suivilot rows = ${total[0].n}`)
  console.log(`  distinct (ligne, lot) pairs = ${pairs[0].n}`)
  console.log(`  distinct ligne = ${lignes[0].n}`)
  console.log(`  → ${total[0].n - pairs[0].n} duplicate (ligne, lot) pairs (= rows that share both)`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

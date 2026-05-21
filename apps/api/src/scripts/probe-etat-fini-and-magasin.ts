import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query, fixEncoding } from '../lib/hfsql.js'

async function main() {
  console.log('=== try fetching etat_stock_fini label table ===')
  for (const tbl of ['etat_stock_fini', 'etatstock_fini', 'etat_fini', 'etat_stockfini']) {
    try {
      const rows = await query<any>(`SELECT TOP 50 * FROM ${tbl}`)
      if (rows.length > 0) {
        console.log(`  ${tbl} cols:`, Object.keys(rows[0]).join(', '))
        for (const r of rows) console.log('   ', JSON.stringify(r))
        break
      }
      console.log(`  ${tbl}: query OK but empty`)
    } catch (e) {
      const msg = String((e as any)?.odbcErrors?.[0]?.message ?? (e as any)?.message ?? '').replace(/\s+/g, ' ').slice(0, 200)
      console.log(`  ${tbl} fail: ${msg}`)
    }
  }

  console.log('\n=== IDetat_stock_fini distribution in stock_fini ===')
  const dist = await query<{ IDetat_stock_fini: number; n: number }>(
    `SELECT IDetat_stock_fini, COUNT(*) AS n FROM stock_fini GROUP BY IDetat_stock_fini ORDER BY n DESC`,
  )
  for (const d of dist) console.log(`  IDetat_stock_fini=${d.IDetat_stock_fini}: ${d.n}`)

  console.log('\n=== sample: for a few sous-traitant commandes, is stock_fini.IDmagasin == commande.IDsous_traitant? ===')
  const sample = await query<{
    IDstock_fini: number; IDmagasin: number; IDsous_traitant: number; IDcommande_sous_traitant: number
  }>(
    `SELECT TOP 10 sf.IDstock_fini, sf.IDmagasin, cst.IDsous_traitant, cst.IDcommande_sous_traitant
     FROM stock_fini sf
     INNER JOIN ligne_commande_sous_traitant lcs ON sf.IDref_commande_source = lcs.IDligne_commande_sous_traitant
     INNER JOIN commande_sous_traitant cst ON lcs.IDcommande_sous_traitant = cst.IDcommande_sous_traitant
     WHERE sf.IDref_commande_source > 0
     ORDER BY sf.IDstock_fini DESC`,
  )
  for (const s of sample) {
    const match = s.IDmagasin === s.IDsous_traitant ? '✓' : `≠ (mag=${s.IDmagasin}, sst=${s.IDsous_traitant})`
    console.log(`  fini#${s.IDstock_fini} cmd#${s.IDcommande_sous_traitant} ${match}`)
  }

  console.log('\n=== aggregate match rate ===')
  const total = await query<{ n: number; matches: number }>(
    `SELECT COUNT(*) AS n,
            SUM(CASE WHEN sf.IDmagasin = cst.IDsous_traitant THEN 1 ELSE 0 END) AS matches
     FROM stock_fini sf
     INNER JOIN ligne_commande_sous_traitant lcs ON sf.IDref_commande_source = lcs.IDligne_commande_sous_traitant
     INNER JOIN commande_sous_traitant cst ON lcs.IDcommande_sous_traitant = cst.IDcommande_sous_traitant
     WHERE sf.IDref_commande_source > 0`,
  )
  console.log('  ', JSON.stringify(total[0]))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

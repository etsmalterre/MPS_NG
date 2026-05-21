import { query, fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Full MATEL row
  console.log('\n=== sous_traitant 9 (MATEL) — all columns ===')
  const r = await query(`SELECT * FROM sous_traitant WHERE IDsous_traitant = 9`) as any[]
  const fixed = await fixEncoding(r, 'sous_traitant', 'IDsous_traitant', ['nom', 'commentaire'])
  console.log(fixed)

  // 2) How many commande_sous_traitant point at MATEL?
  console.log('\n=== commande counts for MATEL ===')
  const counts = await query(`
    SELECT COUNT(*) AS total, MAX(date_commande) AS latest
    FROM commande_sous_traitant
    WHERE IDsous_traitant = 9
  `) as any[]
  console.log(counts)

  // (skipped: last-5-commande dump — commande_sous_traitant has no numero col)

  // 4) Any other ennoblisseurs to compare (do their prix have a different range?)
  console.log('\n=== average prix per ennoblisseur for lines with prix > 0 ===')
  const avg = await query(`
    SELECT cst.IDsous_traitant, COUNT(lcs.IDligne_commande_sous_traitant) AS n,
           MIN(lcs.prix) AS pmin, MAX(lcs.prix) AS pmax, AVG(lcs.prix) AS pavg
    FROM ligne_commande_sous_traitant lcs
    INNER JOIN commande_sous_traitant cst ON lcs.IDcommande_sous_traitant = cst.IDcommande_sous_traitant
    INNER JOIN sous_traitant st ON cst.IDsous_traitant = st.IDsous_traitant
    WHERE st.IDtype_sst = 2 AND lcs.prix > 0
    GROUP BY cst.IDsous_traitant
    ORDER BY n DESC
  `) as any[]
  for (const row of avg.slice(0, 10)) {
    // resolve sst name
    const s = await query(`SELECT nom FROM sous_traitant WHERE IDsous_traitant = ${row.IDsous_traitant}`) as any[]
    const sf = await fixEncoding(s, 'sous_traitant', 'IDsous_traitant', ['nom'])
    console.log(`  sst ${row.IDsous_traitant} (${(sf[0] as any)?.nom}): n=${row.n} prix [${row.pmin}, ${row.pmax}] avg=${Number(row.pavg).toFixed(2)}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

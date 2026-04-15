/**
 * Schema inspection for the new Fournisseurs > References screen.
 * Dumps sample rows for ref_fil, colori_fil, asso_fil_matiere,
 * matiere_premiere, unite_titrage so we can confirm accented column
 * names and nullable shape before coding the route.
 */
import { query, queryRaw, closeConnection } from '../lib/hfsql-auto.js'

async function dump(label: string, sql: string) {
  console.log(`\n========= ${label} =========`)
  console.log(sql)
  try {
    const rows = await queryRaw(sql)
    if (rows.length === 0) {
      console.log('(no rows)')
      return
    }
    console.log('Columns:', Object.keys(rows[0]))
    for (const [k, v] of Object.entries(rows[0])) {
      const repr = typeof v === 'string' ? JSON.stringify(v) : String(v)
      console.log(`  ${k}: ${repr}`)
    }
  } catch (err) {
    console.log('ERROR:', (err as Error).message)
  }
}

async function main() {
  await dump('ref_fil — one row', `SELECT * FROM ref_fil ORDER BY IDref_fil LIMIT 1`)
  await dump('ref_fil — count', `SELECT COUNT(*) AS n FROM ref_fil`)

  await dump('colori_fil — one row', `SELECT * FROM colori_fil WHERE IDref_fil IS NOT NULL ORDER BY IDcolori_fil LIMIT 1`)

  await dump('asso_fil_matiere — one row', `SELECT * FROM asso_fil_matiere LIMIT 1`)
  await dump('asso_fil_matiere — count', `SELECT COUNT(*) AS n FROM asso_fil_matiere`)

  await dump('matiere_premiere — three rows', `SELECT * FROM matiere_premiere LIMIT 3`)
  await dump('matiere_premiere — count', `SELECT COUNT(*) AS n FROM matiere_premiere`)

  await dump('unite_titrage — all rows', `SELECT * FROM unite_titrage`)

  // Check stock_fil aggregation shape for a known ref_fil
  const firstRef = await query<{ IDref_fil: number }>(`SELECT IDref_fil FROM ref_fil ORDER BY IDref_fil LIMIT 1`)
  if (firstRef.length > 0) {
    const rid = firstRef[0].IDref_fil
    await dump(
      `stock_fil aggregate for IDref_fil=${rid}`,
      `SELECT COUNT(*) AS nlots, SUM(stock) AS total_kg FROM stock_fil WHERE IDref_fil = ${rid}`,
    )
    await dump(
      `ref_fil_commande aggregate for IDref_fil=${rid}`,
      `SELECT COUNT(*) AS nlignes, SUM(quantite) AS total_qty FROM ref_fil_commande WHERE IDref_fil = ${rid}`,
    )
    await dump(
      `asso_colorisfil_frs supplier count for IDref_fil=${rid}`,
      `SELECT COUNT(DISTINCT a.IDfournisseur) AS nfrs FROM asso_colorisfil_frs a JOIN colori_fil cf ON a.IDcolori_fil = cf.IDcolori_fil WHERE cf.IDref_fil = ${rid}`,
    )
  }

  await closeConnection()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

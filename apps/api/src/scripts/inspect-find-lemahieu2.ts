import { query, queryRaw } from '../lib/hfsql-auto.js'

async function main() {
  // 1) entreprise — try variants & case-insensitive
  console.log('\n=== entreprise rows like %lemahieu%, %LEMA%, %MAHIEU% ===')
  for (const pat of ['%LEMAHIEU%', '%lemahieu%', '%LEMA%', '%MAHIEU%']) {
    const r = await query(`SELECT TOP 10 IDentreprise, nom FROM entreprise WHERE nom LIKE '${pat}'`) as any[]
    console.log(`pattern "${pat}" → ${r.length} rows`)
    for (const row of r) console.log(` ${row.IDentreprise} : ${row.nom}`)
  }

  // 2) Direct lookup by id 137 across plausible tables
  console.log('\n=== id=137 sanity across plausible tables ===')
  const tables = ['entreprise', 'client', 'fournisseur', 'sous_traitant']
  const idCols: Record<string, string> = {
    entreprise: 'IDentreprise',
    client: 'IDclient',
    fournisseur: 'IDfournisseur',
    sous_traitant: 'IDsous_traitant',
  }
  for (const t of tables) {
    try {
      const r = await query(`SELECT TOP 1 ${idCols[t]} AS id, nom FROM ${t} WHERE ${idCols[t]} = 137`) as any[]
      console.log(`${t}/137 → ${r.length === 0 ? 'no row' : JSON.stringify(r[0])}`)
    } catch (e) { console.log(`${t}/137 → err: ${(e as Error).message}`) }
  }

  // 3) client table size, columns
  console.log('\n=== client table — top 3 rows with columns ===')
  try {
    const r = await query(`SELECT TOP 3 * FROM client`) as any[]
    console.log(`row count returned: ${r.length}`)
    if (r.length > 0) {
      console.log('keys:', Object.keys(r[0]))
      console.log(r)
    }
  } catch (e) { console.log('client err:', (e as Error).message) }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

import { query } from '../lib/hfsql-auto.js'

async function main() {
  console.log('\n=== ged rows with CGV/conditions in nom ===')
  const r = await query(`
    SELECT IDged, nom, commentaire, IDtype_doc, IDreference, IDcommande_client, IDcommande_sous_traitant
    FROM ged
    WHERE nom LIKE '%cgv%' OR nom LIKE '%CGV%' OR nom LIKE '%ondition%'
  `) as any[]
  console.log(r)

  console.log('\n=== type_doc rows mentioning CGV/conditions ===')
  const t = await query(`SELECT * FROM type_doc`) as any[]
  console.log(t.filter((x) => /cgv|ondition/i.test(String(x.nom ?? ''))))
  console.log('\n=== all type_doc for reference ===')
  console.log(t.map((x) => `${x.IDtype_doc}: ${x.nom}`).join('\n'))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query, fixEncoding } from '../lib/hfsql.js'

async function main() {
  console.log('=== all ged rows with IDcommande_sous_traitant = 7925 ===')
  const all = await query<any>(
    `SELECT IDged, nom, IDtype_doc, IDcommande_sous_traitant, IDcommande_client, IDdossier, IDreference
     FROM ged WHERE IDcommande_sous_traitant = 7925`,
  )
  const fixed = await fixEncoding(all, 'ged', 'IDged', ['nom'])
  console.log(`  count = ${fixed.length}`)
  for (const r of fixed) console.log(' ', JSON.stringify(r))

  console.log('\n=== with IDreference = 7925 (alt discriminator pattern) ===')
  const byRef = await query<any>(
    `SELECT IDged, nom, IDtype_doc, IDcommande_sous_traitant, IDcommande_client, IDdossier, IDreference
     FROM ged WHERE IDreference = 7925`,
  )
  console.log(`  count = ${byRef.length}`)
  for (const r of byRef.slice(0, 10)) console.log(' ', JSON.stringify(r))

  console.log('\n=== type_doc names for the relevant IDtype_doc values ===')
  const types = await query<any>(`SELECT IDtype_doc, nom FROM type_doc WHERE IDtype_doc IN (1,2,3,4,5,6,15,16,17,18,19,20)`)
  const fixedTypes = await fixEncoding(types, 'type_doc', 'IDtype_doc', ['nom'])
  for (const r of fixedTypes) console.log(' ', JSON.stringify(r))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

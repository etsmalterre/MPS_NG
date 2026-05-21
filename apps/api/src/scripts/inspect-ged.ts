import { query } from '../lib/hfsql-auto.js'

async function main() {
  // 1. All type_doc rows
  console.log('\n=== type_doc catalog ===')
  const types = await query(`SELECT * FROM type_doc ORDER BY IDtype_doc`) as any[]
  console.log(types)

  // 2. All ged rows targeting commande_fil 672 via IDreference
  console.log('\n=== ged WHERE IDreference=672 AND IDcommande_client=0 AND IDcommande_sous_traitant=0 ===')
  const r = await query(`
    SELECT IDged, nom, commentaire, IDtype_doc, IDreference, IDcommande_client, IDcommande_sous_traitant, IDdossier
    FROM ged
    WHERE IDreference = 672 AND IDcommande_client = 0 AND IDcommande_sous_traitant = 0
  `) as any[]
  console.log(r)

  // 3. Also unconstrained by the zero filters — any ged referencing 672
  console.log('\n=== ged WHERE IDreference=672 (unfiltered) ===')
  const r2 = await query(`
    SELECT IDged, nom, IDtype_doc, IDreference, IDcommande_client, IDcommande_sous_traitant, IDdossier
    FROM ged WHERE IDreference = 672
  `) as any[]
  console.log(r2)

  // 4. Same for 670 (which we saw as 'facture')
  console.log('\n=== ged WHERE IDreference=670 ===')
  const r3 = await query(`
    SELECT IDged, nom, IDtype_doc, IDreference, IDcommande_client, IDcommande_sous_traitant, IDdossier
    FROM ged WHERE IDreference = 670
  `) as any[]
  console.log(r3)

  // 5. Look at all facture-type ged rows to see if IDreference consistently = IDcommande_fil
  console.log('\n=== top 20 ged with IDtype_doc in facture-like types ===')
  const r4 = await query(`
    SELECT TOP 20 g.IDged, g.nom, g.IDtype_doc, td.nom AS type_nom, g.IDreference, g.IDcommande_client, g.IDcommande_sous_traitant
    FROM ged g LEFT JOIN type_doc td ON g.IDtype_doc = td.IDtype_doc
    WHERE g.IDtype_doc = 1
    ORDER BY g.IDged DESC
  `) as any[]
  console.log(r4)

  // 6. Sanity — does commande_fil 670 exist and match ged 10132's IDreference?
  console.log('\n=== commande_fil 670 vs 672 ===')
  const c = await query(`SELECT IDcommande_fil, IDfournisseur, date_commande FROM commande_fil WHERE IDcommande_fil IN (670, 672)`) as any[]
  console.log(c)

  // 7. Also check the dossier table to see what IDdossier=1 (from our sample IDged=1) means
  console.log('\n=== dossier table sample ===')
  try {
    const d = await query(`SELECT TOP 20 * FROM dossier ORDER BY IDdossier`) as any[]
    console.log(d)
  } catch (e: any) { console.log(e.message) }

  // 8. Quick frequency: for IDtype_doc=1 (facture fil), how many rows have IDreference matching an actual commande_fil?
  console.log('\n=== facture-fil ged rows — does IDreference always point to commande_fil? ===')
  const r5 = await query(`
    SELECT COUNT(*) AS total FROM ged WHERE IDtype_doc = 1
  `) as any[]
  console.log(`  total ged rows with IDtype_doc=1 (facture fil): ${r5[0]?.total}`)
  const r6 = await query(`
    SELECT COUNT(*) AS n FROM ged g
    WHERE g.IDtype_doc = 1
      AND EXISTS (SELECT 1 FROM commande_fil cf WHERE cf.IDcommande_fil = g.IDreference)
  `) as any[]
  console.log(`  of those, IDreference matches an IDcommande_fil: ${r6[0]?.n}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

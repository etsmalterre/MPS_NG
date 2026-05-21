import { query } from '../lib/hfsql-auto.js'
import { fixEncoding } from '../lib/hfsql-auto.js'

async function main() {
  // 1) Search across sous_traitant for any "matel" name
  console.log('\n=== sous_traitant where nom LIKE %matel% ===')
  const sst = await query(`SELECT IDsous_traitant, nom FROM sous_traitant`) as any[]
  const sstFixed = await fixEncoding(sst, 'sous_traitant', 'IDsous_traitant', ['nom'])
  const matches = sstFixed.filter((r: any) => /matel/i.test(r.nom || ''))
  console.log(`  ${matches.length} matches out of ${sstFixed.length} sous-traitants`)
  for (const r of matches) console.log(`  ${JSON.stringify(r)}`)

  // 2) Search across ref_fini.finition (fixed encoding)
  console.log('\n=== ref_fini distinct finition (fixed encoding, top 80) ===')
  const finRows = await query(`SELECT DISTINCT IDref_fini, finition FROM ref_fini WHERE finition <> '' ORDER BY IDref_fini`) as any[]
  const finFixed = await fixEncoding(finRows, 'ref_fini', 'IDref_fini', ['finition'])
  const uniq = new Set<string>()
  for (const r of finFixed) if ((r as any).finition) uniq.add(((r as any).finition as string).trim())
  console.log(`  ${uniq.size} distinct finitions`)
  for (const v of Array.from(uniq).sort().slice(0, 80)) console.log(`  ${JSON.stringify(v)}`)

  // 3) Search ref_fini designation for "matel"
  console.log('\n=== ref_fini.designation containing "matel" (fixed encoding) ===')
  const desigRows = await query(`SELECT IDref_fini, reference, designation FROM ref_fini WHERE designation <> ''`) as any[]
  const desigFixed = await fixEncoding(desigRows, 'ref_fini', 'IDref_fini', ['designation', 'reference'])
  const desigMatches = (desigFixed as any[]).filter((r) => /matel/i.test(r.designation || ''))
  console.log(`  ${desigMatches.length} matches`)
  for (const r of desigMatches.slice(0, 20)) console.log(`  ${JSON.stringify(r)}`)

  // 4) Also check sous_traitant where IDtype_sst=2 (ennoblisseur) — list all
  console.log('\n=== all ennoblisseurs (IDtype_sst=2) ===')
  const enn = await query(`SELECT IDsous_traitant, nom, commentaire FROM sous_traitant WHERE IDtype_sst = 2 AND est_visible = 1`) as any[]
  const ennFixed = await fixEncoding(enn, 'sous_traitant', 'IDsous_traitant', ['nom', 'commentaire'])
  for (const r of ennFixed) console.log(`  ${JSON.stringify(r)}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

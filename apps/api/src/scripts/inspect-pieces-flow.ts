import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

/**
 * Verify how stock_ecru rolls and stock_fini rolls link back to a sous-traitant
 * commande line. The plan assumes:
 *   - stock_ecru.IDref_commande_affectation -> ligne_commande_sous_traitant.IDligne_commande_sous_traitant
 *   - stock_fini.IDref_commande_source     -> ligne_commande_sous_traitant.IDligne_commande_sous_traitant
 * If those don't match, fall back to stock_ecru.IDref_commande_source and
 * report which actually links.
 */

async function probeStockEcru() {
  console.log('\n=== stock_ecru — sample rows with non-zero affectation/source ===\n')
  // Only the 5 columns we care about. Keep query small to avoid encoding issues.
  const rows = await query<{
    IDstock_ecru: number
    IDref_commande_affectation: number | null
    IDref_commande_source: number | null
    IDligne_expedition_ETM: number | null
    IDordre_fabrication: number | null
  }>(
    `SELECT TOP 20 IDstock_ecru, IDref_commande_affectation, IDref_commande_source,
            IDligne_expedition_ETM, IDordre_fabrication
     FROM stock_ecru
     WHERE IDref_commande_affectation > 0 OR IDref_commande_source > 0`,
  )
  if (rows.length === 0) {
    console.log('  (no stock_ecru rows have IDref_commande_affectation or IDref_commande_source set)')
    return { rows, candidates: [] }
  }
  for (const r of rows) {
    console.log(
      `  ecru#${r.IDstock_ecru}  affect=${r.IDref_commande_affectation ?? 'null'}  source=${r.IDref_commande_source ?? 'null'}  expETM=${r.IDligne_expedition_ETM ?? 'null'}  OF=${r.IDordre_fabrication ?? 'null'}`,
    )
  }
  // Collect candidate ids to probe in ligne_commande_sous_traitant
  const candidates = new Set<number>()
  for (const r of rows) {
    if (r.IDref_commande_affectation && r.IDref_commande_affectation > 0) candidates.add(r.IDref_commande_affectation)
    if (r.IDref_commande_source && r.IDref_commande_source > 0) candidates.add(r.IDref_commande_source)
  }
  return { rows, candidates: Array.from(candidates) }
}

async function probeStockFini() {
  console.log('\n=== stock_fini — sample rows with non-zero source / source ecru ===\n')
  const rows = await query<{
    IDstock_fini: number
    IDref_commande_source: number | null
    IDstock_ecru: number | null
    IDligne_expedition: number | null
    IDref_fini: number | null
    IDColoris: number | null
  }>(
    `SELECT TOP 20 IDstock_fini, IDref_commande_source, IDstock_ecru,
            IDligne_expedition, IDref_fini, IDColoris
     FROM stock_fini
     WHERE IDref_commande_source > 0 OR IDstock_ecru > 0`,
  )
  if (rows.length === 0) {
    console.log('  (no stock_fini rows with IDref_commande_source or IDstock_ecru set)')
    return { rows, candidates: [] }
  }
  for (const r of rows) {
    console.log(
      `  fini#${r.IDstock_fini}  source=${r.IDref_commande_source ?? 'null'}  ecru=${r.IDstock_ecru ?? 'null'}  exp=${r.IDligne_expedition ?? 'null'}  ref_fini=${r.IDref_fini ?? 'null'}  coloris=${r.IDColoris ?? 'null'}`,
    )
  }
  const candidates = new Set<number>()
  for (const r of rows) {
    if (r.IDref_commande_source && r.IDref_commande_source > 0) candidates.add(r.IDref_commande_source)
  }
  return { rows, candidates: Array.from(candidates) }
}

async function probeLigneSST(ids: number[]) {
  if (ids.length === 0) return new Map<number, { type: number; IDreference: number; IDcommande: number }>()
  const rows = await query<{
    IDligne_commande_sous_traitant: number
    IDcommande_sous_traitant: number
    type: number | null
    IDreference: number | null
  }>(
    `SELECT IDligne_commande_sous_traitant, IDcommande_sous_traitant, type, IDreference
     FROM ligne_commande_sous_traitant
     WHERE IDligne_commande_sous_traitant IN (${ids.join(',')})`,
  )
  const map = new Map<number, { type: number; IDreference: number; IDcommande: number }>()
  for (const r of rows) {
    map.set(r.IDligne_commande_sous_traitant, {
      type: r.type ?? -1,
      IDreference: r.IDreference ?? -1,
      IDcommande: r.IDcommande_sous_traitant,
    })
  }
  return map
}

async function probeCmdSST(ids: number[]) {
  if (ids.length === 0) return new Map<number, number>()
  const rows = await query<{ IDcommande_sous_traitant: number; IDsous_traitant: number }>(
    `SELECT IDcommande_sous_traitant, IDsous_traitant FROM commande_sous_traitant WHERE IDcommande_sous_traitant IN (${ids.join(',')})`,
  )
  const m = new Map<number, number>()
  for (const r of rows) m.set(r.IDcommande_sous_traitant, r.IDsous_traitant)
  return m
}

async function probeSousTraitantTypes() {
  console.log('\n=== type_sst values ===\n')
  const rows = await query<{ IDtype_sst: number; type: string | null }>(
    `SELECT IDtype_sst, type FROM type_sst ORDER BY IDtype_sst`,
  )
  for (const r of rows) console.log(`  type_sst#${r.IDtype_sst}: ${r.type ?? 'null'}`)
}

async function probeLineTypeDistribution() {
  console.log('\n=== ligne_commande_sous_traitant.type distinct values + counts ===\n')
  const rows = await query<{ type: number | null; cnt: number }>(
    `SELECT type, COUNT(*) AS cnt FROM ligne_commande_sous_traitant GROUP BY type ORDER BY type`,
  )
  for (const r of rows) console.log(`  type=${r.type ?? 'null'}  count=${r.cnt}`)
}

async function probeEstSoldeeDistribution() {
  console.log('\n=== commande_sous_traitant.est_soldee distinct values + counts ===\n')
  const rows = await query<{ est_soldee: number | null; cnt: number }>(
    `SELECT est_soldee, COUNT(*) AS cnt FROM commande_sous_traitant GROUP BY est_soldee`,
  )
  for (const r of rows) console.log(`  est_soldee=${r.est_soldee ?? 'null'}  count=${r.cnt}`)
}

async function probeSstatutDistribution() {
  console.log('\n=== ligne_commande_sous_traitant.sstatut distinct values + counts ===\n')
  const rows = await query<{ sstatut: string | null; cnt: number }>(
    `SELECT sstatut, COUNT(*) AS cnt FROM ligne_commande_sous_traitant GROUP BY sstatut ORDER BY cnt DESC`,
  )
  for (const r of rows) console.log(`  sstatut="${r.sstatut ?? 'null'}"  count=${r.cnt}`)
}

async function probeTypeDocForSstDocs() {
  console.log('\n=== type_doc IDs used by ged rows linked to sous-traitant commandes ===\n')
  const rows = await query<{ IDtype_doc: number | null; cnt: number }>(
    `SELECT IDtype_doc, COUNT(*) AS cnt FROM ged
     WHERE IDcommande_sous_traitant > 0 AND IDcommande_client = 0
     GROUP BY IDtype_doc ORDER BY cnt DESC`,
  )
  if (rows.length === 0) {
    console.log('  (no ged rows have IDcommande_sous_traitant > 0)')
    return
  }
  // Look up names
  const ids = rows.map((r) => r.IDtype_doc).filter((x): x is number => x !== null && x > 0)
  const nameMap = new Map<number, string>()
  if (ids.length > 0) {
    const tdRows = await query<{ IDtype_doc: number; nom: string | null }>(
      `SELECT IDtype_doc, nom FROM type_doc WHERE IDtype_doc IN (${ids.join(',')})`,
    )
    for (const t of tdRows) nameMap.set(t.IDtype_doc, t.nom ?? '?')
  }
  for (const r of rows) {
    console.log(`  IDtype_doc=${r.IDtype_doc ?? 'null'}  count=${r.cnt}  name=${r.IDtype_doc ? nameMap.get(r.IDtype_doc) ?? '?' : '?'}`)
  }
}

async function main() {
  console.log('=== Pieces flow FK verification ===')

  await probeSousTraitantTypes()
  await probeEstSoldeeDistribution()
  await probeSstatutDistribution()
  await probeLineTypeDistribution()

  const ecru = await probeStockEcru()
  const fini = await probeStockFini()

  // Resolve candidate ids in ligne_commande_sous_traitant
  const allCandidates = Array.from(new Set([...ecru.candidates, ...fini.candidates]))
  console.log(`\n=== Resolving ${allCandidates.length} candidate ids in ligne_commande_sous_traitant ===\n`)
  const ligneMap = await probeLigneSST(allCandidates)
  console.log(`  matched ${ligneMap.size}/${allCandidates.length} candidate ids as real lignes\n`)

  // Group by source field — affectation vs source — to see which one matches lignes
  let ecruAffectMatches = 0
  let ecruSourceMatches = 0
  for (const r of ecru.rows) {
    if (r.IDref_commande_affectation && ligneMap.has(r.IDref_commande_affectation)) ecruAffectMatches++
    if (r.IDref_commande_source && ligneMap.has(r.IDref_commande_source)) ecruSourceMatches++
  }
  console.log(`  stock_ecru: affect→ligne matches = ${ecruAffectMatches} / source→ligne matches = ${ecruSourceMatches}`)

  let finiSourceMatches = 0
  for (const r of fini.rows) {
    if (r.IDref_commande_source && ligneMap.has(r.IDref_commande_source)) finiSourceMatches++
  }
  console.log(`  stock_fini: source→ligne matches = ${finiSourceMatches}`)

  // For matched ids, also resolve the parent commande to confirm link is to sous-traitant (not client)
  const cmdIds = Array.from(new Set(Array.from(ligneMap.values()).map((v) => v.IDcommande)))
  const cmdMap = await probeCmdSST(cmdIds)
  console.log(`\n  resolved ${cmdMap.size}/${cmdIds.length} parent commande_sous_traitant rows`)

  // Show a few resolved details
  console.log('\n  Sample resolved chain (ecru → ligne → cmd):')
  for (const r of ecru.rows.slice(0, 5)) {
    const id = r.IDref_commande_affectation && r.IDref_commande_affectation > 0 ? r.IDref_commande_affectation : r.IDref_commande_source
    if (!id) continue
    const ligne = ligneMap.get(id)
    if (!ligne) {
      console.log(`    ecru#${r.IDstock_ecru} affect=${r.IDref_commande_affectation} source=${r.IDref_commande_source} → NO MATCH`)
      continue
    }
    console.log(
      `    ecru#${r.IDstock_ecru} → ligne#${id} (type=${ligne.type}, IDreference=${ligne.IDreference}, IDcmd=${ligne.IDcommande}, IDsst=${cmdMap.get(ligne.IDcommande) ?? '?'})`,
    )
  }
  console.log('\n  Sample resolved chain (fini → ligne → cmd):')
  for (const r of fini.rows.slice(0, 5)) {
    const id = r.IDref_commande_source
    if (!id || id === 0) continue
    const ligne = ligneMap.get(id)
    if (!ligne) {
      console.log(`    fini#${r.IDstock_fini} source=${id} → NO MATCH`)
      continue
    }
    console.log(
      `    fini#${r.IDstock_fini} → ligne#${id} (type=${ligne.type}, IDreference=${ligne.IDreference}, IDcmd=${ligne.IDcommande}, IDsst=${cmdMap.get(ligne.IDcommande) ?? '?'})`,
    )
  }

  await probeTypeDocForSstDocs()

  console.log('\n=== DONE ===\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})

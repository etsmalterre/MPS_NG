/**
 * Read-only audit: for every fournisseur, compute which
 * (IDref_fil, IDcolori_fil) pairs appear in order history but are NOT
 * present in asso_colorisfil_frs. Reports:
 *   - total missing mappings
 *   - per-fournisseur count (top 20)
 *   - bucket of "ordered but colori_fil row is gone" (can't backfill)
 *   - sample of first 30 genuinely missing pairs
 *
 * NO WRITES.
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })
import { query, fixEncoding, closeConnection } from '../lib/hfsql-auto.js'

interface OrderTuple {
  IDfournisseur: number
  IDref_fil: number
  IDcolori_fil: number
  n_orders: number
}

interface AssoRow {
  IDfournisseur: number
  IDcolori_fil: number
}

interface ColoriRow {
  IDcolori_fil: number
  IDref_fil: number
  reference: string | null
}

interface RefFilRow {
  IDref_fil: number
  reference: string | null
}

interface FournisseurRow {
  IDfournisseur: number
  nom: string | null
}

async function main() {
  console.log('Audit: fournisseur (ref_fil, coloris) history vs asso_colorisfil_frs\n')

  // 1) Order history — distinct tuples
  const orderTuples = await query<OrderTuple>(`
    SELECT cf.IDfournisseur, rfc.IDref_fil, rfc.IDcolori_fil, COUNT(*) AS n_orders
    FROM ref_fil_commande rfc
    JOIN commande_fil cf ON rfc.IDcommande_fil = cf.IDcommande_fil
    WHERE rfc.IDref_fil IS NOT NULL AND rfc.IDcolori_fil IS NOT NULL
      AND cf.IDfournisseur > 0
    GROUP BY cf.IDfournisseur, rfc.IDref_fil, rfc.IDcolori_fil
  `)
  console.log(`Order tuples (distinct fournisseur, ref, colori): ${orderTuples.length}`)

  // 2) asso_colorisfil_frs — existing mappings
  const assoRows = await query<AssoRow>(
    `SELECT IDfournisseur, IDcolori_fil FROM asso_colorisfil_frs`
  )
  const assoSet = new Set<string>()
  for (const r of assoRows) {
    assoSet.add(`${Number(r.IDfournisseur)}|${Number(r.IDcolori_fil)}`)
  }
  console.log(`asso_colorisfil_frs rows: ${assoRows.length}`)

  // 3) Colori catalog — to map IDcolori_fil → IDref_fil, reference, and detect deletions
  const coloriRowsRaw = await query<ColoriRow>(
    `SELECT IDcolori_fil, IDref_fil, reference FROM colori_fil`
  )
  const coloriRows = (await fixEncoding(
    coloriRowsRaw as unknown as Record<string, unknown>[],
    'colori_fil',
    'IDcolori_fil',
    ['reference']
  )) as unknown as ColoriRow[]
  const coloriById = new Map<number, ColoriRow>()
  for (const c of coloriRows) coloriById.set(Number(c.IDcolori_fil), c)
  console.log(`colori_fil rows: ${coloriRows.length}`)

  // 4) ref_fil catalog — to show readable ref reference
  const refFilRowsRaw = await query<RefFilRow>(
    `SELECT IDref_fil, reference FROM ref_fil`
  )
  const refFilRows = (await fixEncoding(
    refFilRowsRaw as unknown as Record<string, unknown>[],
    'ref_fil',
    'IDref_fil',
    ['reference']
  )) as unknown as RefFilRow[]
  const refFilById = new Map<number, RefFilRow>()
  for (const r of refFilRows) refFilById.set(Number(r.IDref_fil), r)

  // 5) Fournisseur names
  const fournisseursRaw = await query<FournisseurRow>(
    `SELECT IDfournisseur, nom FROM fournisseur`
  )
  const fournisseurs = (await fixEncoding(
    fournisseursRaw as unknown as Record<string, unknown>[],
    'fournisseur',
    'IDfournisseur',
    ['nom']
  )) as unknown as FournisseurRow[]
  const nameById = new Map<number, string>()
  for (const f of fournisseurs) nameById.set(Number(f.IDfournisseur), String(f.nom ?? '?'))

  // 6) Classify every order tuple
  interface Missing {
    f: number
    refFilId: number
    coloriId: number
    refFilRef: string
    coloriRef: string
    n_orders: number
  }
  const missing: Missing[] = []
  const missingDeleted: Missing[] = []
  const missingPerFournisseur = new Map<number, number>()
  let alreadyLinked = 0

  for (const t of orderTuples) {
    const idf = Number(t.IDfournisseur)
    const idc = Number(t.IDcolori_fil)
    const key = `${idf}|${idc}`
    if (assoSet.has(key)) {
      alreadyLinked++
      continue
    }
    const source = coloriById.get(idc)
    const m: Missing = {
      f: idf,
      refFilId: Number(t.IDref_fil),
      coloriId: idc,
      refFilRef: refFilById.get(Number(t.IDref_fil))?.reference ?? '?',
      coloriRef: source?.reference ?? '(colori_fil deleted)',
      n_orders: Number(t.n_orders),
    }
    if (!source) {
      missingDeleted.push(m)
    } else {
      missing.push(m)
      missingPerFournisseur.set(idf, (missingPerFournisseur.get(idf) ?? 0) + 1)
    }
  }

  console.log(`\n--- Results ---`)
  console.log(`Already linked in asso:                     ${alreadyLinked}`)
  console.log(`Missing (colori_fil still exists):          ${missing.length}`)
  console.log(`Missing (colori_fil row is gone — skip):    ${missingDeleted.length}`)

  // Per-fournisseur top 20
  console.log(`\nTop 20 fournisseurs by missing pair count:`)
  const topFrs = Array.from(missingPerFournisseur.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
  for (const [idf, n] of topFrs) {
    console.log(`  ${n.toString().padStart(4)} missing   #${idf}   ${nameById.get(idf) ?? '?'}`)
  }

  // Sample of 30 missing pairs
  console.log(`\nSample of first 30 missing pairs:`)
  for (const m of missing.slice(0, 30)) {
    console.log(
      `  fournisseur "${nameById.get(m.f) ?? '?'}" (#${m.f})   ref_fil="${m.refFilRef}" (#${m.refFilId})   colori="${m.coloriRef}" (#${m.coloriId})   orders=${m.n_orders}`
    )
  }
  if (missing.length > 30) console.log(`  … and ${missing.length - 30} more`)

  // Sample of deleted-source cases
  if (missingDeleted.length > 0) {
    console.log(`\nSample of first 10 "colori_fil gone" cases:`)
    for (const m of missingDeleted.slice(0, 10)) {
      console.log(
        `  fournisseur "${nameById.get(m.f) ?? '?'}" (#${m.f})   ref_fil="${m.refFilRef}" (#${m.refFilId})   IDcolori_fil=${m.coloriId}`
      )
    }
  }

  await closeConnection()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

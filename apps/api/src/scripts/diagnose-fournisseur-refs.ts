/**
 * DIAGNOSTIC ONLY — no writes.
 *
 * Finds (IDfournisseur, IDref_fil, IDcolori_fil) tuples that appear in
 * historical orders (ref_fil_commande → commande_fil) but are not reflected
 * in the current colori_fil table for that fournisseur. Reports the root
 * cause per case (colori_fil deleted vs. re-attached to another fournisseur).
 *
 * Run with:  pnpm --filter @mps/api exec tsx src/scripts/diagnose-fournisseur-refs.ts
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })
import { query, closeConnection } from '../lib/hfsql-auto.js'

interface OrderTuple {
  IDfournisseur: number
  IDref_fil: number
  IDcolori_fil: number
  n_orders: number
}

interface ColoriRow {
  IDcolori_fil: number
  IDfournisseur: number
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
  console.log('🔍 Diagnosing fournisseur yarn-ref discrepancies...\n')

  // 1) Distinct (fournisseur, ref_fil, colori_fil) tuples seen in historical orders
  const orderTuples = await query<OrderTuple>(`
    SELECT cf.IDfournisseur, rfc.IDref_fil, rfc.IDcolori_fil, COUNT(*) AS n_orders
    FROM ref_fil_commande rfc
    JOIN commande_fil cf ON rfc.IDcommande_fil = cf.IDcommande_fil
    WHERE rfc.IDref_fil IS NOT NULL AND rfc.IDcolori_fil IS NOT NULL
    GROUP BY cf.IDfournisseur, rfc.IDref_fil, rfc.IDcolori_fil
  `)
  console.log(`Found ${orderTuples.length} distinct (fournisseur, ref_fil, coloris) tuples in order history.`)

  // 2) All colori_fil rows (full table) for cross-reference
  const coloriRows = await query<ColoriRow>(`
    SELECT IDcolori_fil, IDfournisseur, IDref_fil, reference FROM colori_fil
  `)
  console.log(`Found ${coloriRows.length} colori_fil rows in total.\n`)

  const coloriById = new Map<number, ColoriRow>()
  for (const c of coloriRows) coloriById.set(Number(c.IDcolori_fil), c)

  // 3) Lookup maps for human-readable output
  const refRows = await query<RefFilRow>(`SELECT IDref_fil, reference FROM ref_fil`)
  const refNameById = new Map<number, string>()
  for (const r of refRows) refNameById.set(Number(r.IDref_fil), String(r.reference ?? '?'))

  const fournisseurRows = await query<FournisseurRow>(`SELECT IDfournisseur, nom FROM fournisseur`)
  const fournisseurNameById = new Map<number, string>()
  for (const f of fournisseurRows) fournisseurNameById.set(Number(f.IDfournisseur), String(f.nom ?? '?'))

  // 4) Classify each order tuple
  const missingDeleted: OrderTuple[] = []   // colori_fil row no longer exists
  const missingReattached: (OrderTuple & { currentIDfournisseur: number })[] = [] // colori_fil exists but IDfournisseur differs
  const okTuples: OrderTuple[] = []

  for (const t of orderTuples) {
    const idf = Number(t.IDfournisseur)
    const idc = Number(t.IDcolori_fil)
    const row = coloriById.get(idc)
    if (!row) {
      missingDeleted.push(t)
    } else if (Number(row.IDfournisseur) !== idf) {
      missingReattached.push({ ...t, currentIDfournisseur: Number(row.IDfournisseur) })
    } else {
      okTuples.push(t)
    }
  }

  console.log(`✅ ${okTuples.length} tuples are OK (colori_fil exists and is attached to the right fournisseur).`)
  console.log(`⚠️  ${missingReattached.length} tuples where the colori_fil row exists but under a DIFFERENT fournisseur (re-attached).`)
  console.log(`❌ ${missingDeleted.length} tuples where the colori_fil row is DELETED (no longer in colori_fil).\n`)

  // 5) Detail: re-attached cases
  if (missingReattached.length > 0) {
    console.log('--- Re-attached colori_fil rows (coloris row exists but wrong IDfournisseur) ---')
    for (const t of missingReattached.slice(0, 50)) {
      const fromName = fournisseurNameById.get(Number(t.IDfournisseur)) ?? '?'
      const nowName = fournisseurNameById.get(Number(t.currentIDfournisseur)) ?? '?'
      const refName = refNameById.get(Number(t.IDref_fil)) ?? '?'
      const coloriInfo = coloriById.get(Number(t.IDcolori_fil))
      const coloriName = coloriInfo?.reference ?? '?'
      console.log(
        `  [${t.n_orders} cmd] IDcolori_fil=${t.IDcolori_fil} "${refName} / ${coloriName}" — orders by "${fromName}" (#${t.IDfournisseur}), now attached to "${nowName}" (#${t.currentIDfournisseur})`
      )
    }
    if (missingReattached.length > 50) console.log(`  … and ${missingReattached.length - 50} more`)
    console.log()
  }

  // 6) Detail: deleted cases
  if (missingDeleted.length > 0) {
    console.log('--- Deleted colori_fil rows (IDcolori_fil referenced by orders but no longer exists) ---')
    for (const t of missingDeleted.slice(0, 50)) {
      const fromName = fournisseurNameById.get(Number(t.IDfournisseur)) ?? '?'
      const refName = refNameById.get(Number(t.IDref_fil)) ?? '?'
      console.log(
        `  [${t.n_orders} cmd] IDcolori_fil=${t.IDcolori_fil} (gone) ref="${refName}" — orders by "${fromName}" (#${t.IDfournisseur})`
      )
    }
    if (missingDeleted.length > 50) console.log(`  … and ${missingDeleted.length - 50} more`)
    console.log()
  }

  // 7) Focus on aquafil for the user's concrete example
  const aquafilEntry = Array.from(fournisseurNameById.entries()).find(
    ([, name]) => name.toLowerCase().includes('aquafil')
  )
  if (aquafilEntry) {
    const [aquafilId, aquafilName] = aquafilEntry
    console.log(`--- Focus: fournisseur "${aquafilName}" (#${aquafilId}) ---`)
    const aquaTuples = orderTuples.filter((t) => Number(t.IDfournisseur) === aquafilId)
    console.log(`  Order tuples referencing aquafil: ${aquaTuples.length}`)
    const aquaCurrent = coloriRows.filter((c) => Number(c.IDfournisseur) === aquafilId)
    console.log(`  colori_fil rows currently attached to aquafil: ${aquaCurrent.length}`)
    const aquaMissing = aquaTuples.filter((t) => {
      const row = coloriById.get(Number(t.IDcolori_fil))
      return !row || Number(row.IDfournisseur) !== aquafilId
    })
    console.log(`  Missing from aquafil's refs section: ${aquaMissing.length}`)
    for (const t of aquaMissing.slice(0, 20)) {
      const row = coloriById.get(Number(t.IDcolori_fil))
      const refName = refNameById.get(Number(t.IDref_fil)) ?? '?'
      const coloriName = row?.reference ?? '(deleted)'
      const status = row
        ? `now attached to #${row.IDfournisseur} "${fournisseurNameById.get(Number(row.IDfournisseur)) ?? '?'}"`
        : 'DELETED'
      console.log(`    IDcolori_fil=${t.IDcolori_fil} "${refName} / ${coloriName}" [${t.n_orders} cmd] — ${status}`)
    }
    console.log()
  }

  await closeConnection()
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})

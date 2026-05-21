/**
 * Fix missing colori_fil entries so each fournisseur's "Références de fil"
 * section includes every (ref_fil, coloris) pair they have historically
 * ordered.
 *
 * For each (IDfournisseur_from_order, IDref_fil, IDcolori_fil) tuple in
 * the order history where colori_fil.IDfournisseur doesn't match, this
 * script creates a new colori_fil row (copy of the existing one) attached
 * to the correct fournisseur — unless a functionally equivalent row
 * already exists for that fournisseur (same IDref_fil + same reference
 * text), in which case the tuple is skipped.
 *
 * The original colori_fil row, ref_fil_commande, and stock_fil are NEVER
 * modified.  Only INSERTs are performed.
 *
 * Dry-run (default): prints what it would do.
 * Run with --apply to actually write.
 *
 *   pnpm --filter @mps/api exec tsx src/scripts/fix-fournisseur-refs.ts
 *   pnpm --filter @mps/api exec tsx src/scripts/fix-fournisseur-refs.ts --apply
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

interface ColoriRow {
  IDcolori_fil: number
  IDfournisseur: number
  IDref_fil: number
  reference: string | null
  prix_kg: number | null
  stock_mini: number | null
  commentaire: string | null
}

function esc(value: string): string {
  return value.replace(/'/g, "''")
}

/** Remove diacritics — fallback for the Linux iODBC bridge which rejects
 *  UTF-8 multi-byte sequences in INSERT literals. Lossy, used only on retry. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? '🛠  APPLY MODE (will INSERT rows)' : '🔍 DRY RUN (no writes)')
  console.log()

  // 1) Order tuples
  const orderTuples = await query<OrderTuple>(`
    SELECT cf.IDfournisseur, rfc.IDref_fil, rfc.IDcolori_fil, COUNT(*) AS n_orders
    FROM ref_fil_commande rfc
    JOIN commande_fil cf ON rfc.IDcommande_fil = cf.IDcommande_fil
    WHERE rfc.IDref_fil IS NOT NULL AND rfc.IDcolori_fil IS NOT NULL
      AND cf.IDfournisseur > 0
    GROUP BY cf.IDfournisseur, rfc.IDref_fil, rfc.IDcolori_fil
  `)
  console.log(`Found ${orderTuples.length} distinct (fournisseur, ref, colori) tuples in orders.`)

  // 2) All colori_fil rows — repair encoding on text fields so copies use clean UTF-8
  const coloriRowsRaw = await query<ColoriRow>(`
    SELECT IDcolori_fil, IDfournisseur, IDref_fil, reference, prix_kg, stock_mini, commentaire
    FROM colori_fil
  `)
  const coloriRows = await fixEncoding(
    coloriRowsRaw as unknown as Record<string, unknown>[],
    'colori_fil',
    'IDcolori_fil',
    ['reference', 'commentaire']
  ) as unknown as ColoriRow[]
  const coloriById = new Map<number, ColoriRow>()
  for (const c of coloriRows) coloriById.set(Number(c.IDcolori_fil), c)

  // Index: (IDfournisseur, IDref_fil, reference) -> exists
  const existsByTriplet = new Set<string>()
  for (const c of coloriRows) {
    const ref = (c.reference ?? '').trim().toLowerCase()
    existsByTriplet.add(`${Number(c.IDfournisseur)}|${Number(c.IDref_fil)}|${ref}`)
  }

  // 3) Build set of inserts to perform.
  // Dedup so we don't insert twice for the same (fournisseur, source row)
  interface Insert {
    targetFournisseur: number
    source: ColoriRow
    reasonTuples: OrderTuple[]
  }
  const insertsByKey = new Map<string, Insert>()
  let skippedAlreadyExists = 0
  let skippedDeleted = 0
  let skippedMatched = 0

  for (const t of orderTuples) {
    const idf = Number(t.IDfournisseur)
    const idc = Number(t.IDcolori_fil)
    const source = coloriById.get(idc)

    if (!source) {
      skippedDeleted++
      continue // Deleted row — cannot copy
    }
    if (Number(source.IDfournisseur) === idf) {
      skippedMatched++
      continue // Already correct
    }

    // Does a functionally equivalent row already exist for the target?
    const refText = (source.reference ?? '').trim().toLowerCase()
    const tripletKey = `${idf}|${Number(source.IDref_fil)}|${refText}`
    if (existsByTriplet.has(tripletKey)) {
      skippedAlreadyExists++
      continue
    }

    // Queue an insert
    const key = `${idf}|${idc}`
    const existing = insertsByKey.get(key)
    if (existing) {
      existing.reasonTuples.push(t)
    } else {
      insertsByKey.set(key, { targetFournisseur: idf, source, reasonTuples: [t] })
      // Mark triplet as "will exist" so we don't queue a second identical insert
      existsByTriplet.add(tripletKey)
    }
  }

  const inserts = Array.from(insertsByKey.values())
  console.log(`\nPlanned inserts: ${inserts.length}`)
  console.log(`  skipped (already matched):  ${skippedMatched}`)
  console.log(`  skipped (already exists):   ${skippedAlreadyExists}`)
  console.log(`  skipped (colori_fil gone):  ${skippedDeleted}`)
  console.log()

  // Sample preview
  console.log('Sample of planned inserts (first 20):')
  for (const ins of inserts.slice(0, 20)) {
    const s = ins.source
    console.log(
      `  fournisseur #${ins.targetFournisseur} ← copy of IDcolori_fil=${s.IDcolori_fil} (ref_fil=${s.IDref_fil}, reference="${s.reference}", prix_kg=${s.prix_kg}, stock_mini=${s.stock_mini})`
    )
  }
  if (inserts.length > 20) console.log(`  … and ${inserts.length - 20} more`)
  console.log()

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to perform writes.')
    await closeConnection()
    return
  }

  // 4) Apply
  console.log('Applying inserts...')
  let ok = 0
  let okStripped = 0
  let failed = 0
  for (const ins of inserts) {
    const s = ins.source
    const reference = s.reference ?? ''
    const commentaire = s.commentaire ?? ''
    const prix_kg = Number(s.prix_kg ?? 0)
    const stock_mini = Number(s.stock_mini ?? 0)
    const idref = Number(s.IDref_fil)
    const buildSql = (ref: string, com: string) =>
      `INSERT INTO colori_fil (reference, IDref_fil, prix_kg, stock_mini, commentaire, IDfournisseur) VALUES ('${esc(ref)}', ${idref}, ${prix_kg}, ${stock_mini}, '${esc(com)}', ${ins.targetFournisseur})`
    try {
      await query(buildSql(reference, commentaire))
      ok++
    } catch (err: unknown) {
      // Retry with stripped accents (Linux iODBC bridge can't handle UTF-8 in literals)
      const refAscii = stripAccents(reference)
      const comAscii = stripAccents(commentaire)
      if (refAscii !== reference || comAscii !== commentaire) {
        try {
          await query(buildSql(refAscii, comAscii))
          okStripped++
          console.log(
            `  ↻ retry-stripped OK: fournisseur #${ins.targetFournisseur}, source IDcolori_fil=${s.IDcolori_fil} ("${reference}" → "${refAscii}")`
          )
          continue
        } catch (err2: unknown) {
          failed++
          console.error(
            `  FAILED insert (even after strip) for fournisseur #${ins.targetFournisseur}, source IDcolori_fil=${s.IDcolori_fil}:`,
            err2 instanceof Error ? err2.message : err2
          )
          continue
        }
      }
      failed++
      console.error(
        `  FAILED insert for fournisseur #${ins.targetFournisseur}, source IDcolori_fil=${s.IDcolori_fil}:`,
        err instanceof Error ? err.message : err
      )
    }
  }

  console.log(`\nInserts OK: ${ok} (+ ${okStripped} via accent-stripped retry), Failed: ${failed}`)
  await closeConnection()
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})

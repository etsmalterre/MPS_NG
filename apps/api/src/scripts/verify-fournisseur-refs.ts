/**
 * Verification — checks that, for every (fournisseur, ref_fil, coloris) tuple
 * in order history, the fournisseur now has a colori_fil row with the same
 * IDref_fil and the same reference text (even if IDcolori_fil differs).
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })
import { query, fixEncoding, closeConnection } from '../lib/hfsql-auto.js'

interface OrderTuple {
  IDfournisseur: number
  IDref_fil: number
  IDcolori_fil: number
}

interface ColoriRow {
  IDcolori_fil: number
  IDfournisseur: number
  IDref_fil: number
  reference: string | null
}

async function main() {
  const orderTuples = await query<OrderTuple>(`
    SELECT cf.IDfournisseur, rfc.IDref_fil, rfc.IDcolori_fil
    FROM ref_fil_commande rfc
    JOIN commande_fil cf ON rfc.IDcommande_fil = cf.IDcommande_fil
    WHERE rfc.IDref_fil IS NOT NULL AND rfc.IDcolori_fil IS NOT NULL
      AND cf.IDfournisseur > 0
    GROUP BY cf.IDfournisseur, rfc.IDref_fil, rfc.IDcolori_fil
  `)

  const coloriRowsRaw = await query<ColoriRow>(
    `SELECT IDcolori_fil, IDfournisseur, IDref_fil, reference FROM colori_fil`
  )
  const coloriRows = await fixEncoding(
    coloriRowsRaw as unknown as Record<string, unknown>[],
    'colori_fil',
    'IDcolori_fil',
    ['reference']
  ) as unknown as ColoriRow[]

  const coloriById = new Map<number, ColoriRow>()
  for (const c of coloriRows) coloriById.set(Number(c.IDcolori_fil), c)

  // Index: (fournisseur|ref_fil|reference-lowercased) -> row
  const tripletIndex = new Set<string>()
  for (const c of coloriRows) {
    const ref = (c.reference ?? '').trim().toLowerCase()
    tripletIndex.add(`${Number(c.IDfournisseur)}|${Number(c.IDref_fil)}|${ref}`)
  }

  let ok = 0
  let stillMissing: Array<{ f: number; refFilId: number; reference: string; reason: string }> = []
  const fournisseurNames = await query<{ IDfournisseur: number; nom: string }>(
    `SELECT IDfournisseur, nom FROM fournisseur`
  )
  const nameById = new Map<number, string>()
  for (const r of fournisseurNames) nameById.set(Number(r.IDfournisseur), String(r.nom))

  for (const t of orderTuples) {
    const idf = Number(t.IDfournisseur)
    const idc = Number(t.IDcolori_fil)
    const source = coloriById.get(idc)
    const sourceRef = source ? (source.reference ?? '').trim().toLowerCase() : ''
    const refFilId = Number(t.IDref_fil)

    if (source) {
      const tripletKey = `${idf}|${refFilId}|${sourceRef}`
      if (tripletIndex.has(tripletKey)) {
        ok++
      } else {
        stillMissing.push({ f: idf, refFilId, reference: source.reference ?? '', reason: 'no matching triplet' })
      }
    } else {
      stillMissing.push({
        f: idf,
        refFilId,
        reference: '(source IDcolori_fil deleted)',
        reason: `IDcolori_fil=${idc} no longer exists`,
      })
    }
  }

  console.log(`OK:     ${ok} / ${orderTuples.length} order tuples now have a matching catalog row`)
  console.log(`Still missing: ${stillMissing.length}`)
  for (const m of stillMissing.slice(0, 20)) {
    console.log(
      `  fournisseur "${nameById.get(m.f) ?? '?'}" (#${m.f}) ref_fil=${m.refFilId} "${m.reference}" — ${m.reason}`
    )
  }
  if (stillMissing.length > 20) console.log(`  … and ${stillMissing.length - 20} more`)

  // Focus: aquafil
  const aqua = Array.from(nameById.entries()).find(([, n]) => n.toLowerCase().includes('aquafil'))
  if (aqua) {
    const [aquaId, aquaName] = aqua
    const aquaRows = coloriRows.filter((c) => Number(c.IDfournisseur) === aquaId)
    console.log(`\n--- ${aquaName} (#${aquaId}) colori_fil catalog now has ${aquaRows.length} rows ---`)
    for (const r of aquaRows.slice(0, 10)) {
      console.log(`  IDcolori_fil=${r.IDcolori_fil} ref_fil=${r.IDref_fil} reference="${r.reference}"`)
    }
  }

  await closeConnection()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

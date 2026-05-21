// Compare the 75 stock_fil rows our API returns for commande 8582 line 8558
// against the 2 legacy-app shows (lots 10485 and 10379). Hypothesis:
// legacy filters terminé=0 + maybe stock>0 + maybe magasin = tricoteur's
// site.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // 1) find composition_ecru for ref_ecru 146 → set of IDref_fil
  const compo = await query<{ IDref_fil: number }>(
    `SELECT DISTINCT IDref_fil FROM composition_ecru WHERE IDref_ecru = 146 AND IDref_fil > 0`,
  )
  const filIds = compo.map((r) => Number(r.IDref_fil)).filter((x) => x > 0)
  console.log('IDref_fil set for ref_ecru 146:', filIds)

  if (filIds.length === 0) return

  // 2) Locate the 2 lots the user mentioned.
  const targets = await query<Record<string, unknown>>(
    `SELECT * FROM stock_fil WHERE lot IN ('10485', '10379')`,
  )
  for (const r of targets) {
    console.log(`\n--- lot ${r.lot} (IDstock_fil=${r.IDstock_fil}) ---`)
    for (const [k, v] of Object.entries(r)) {
      const display = v instanceof ArrayBuffer ? `<blob ${v.byteLength}b>` : v
      console.log(`  ${k.padEnd(25)} = ${display === '' ? "''" : display}`)
    }
  }

  // 3) Summary of all rows we'd return — split by terminé, stock>0, magasin.
  // SELECT * to capture the mangled accented columns (terminé → termin on
  // the Linux bridge, terminé on Windows).
  const all = await query<Record<string, unknown>>(
    `SELECT * FROM stock_fil WHERE IDref_fil IN (${filIds.join(',')})`,
  )
  console.log(`\n--- summary of ${all.length} stock_fil rows ---`)

  let terminCount = 0
  let stockGt0 = 0
  let bothActive = 0
  for (const r of all) {
    const termin = Number((r as any).termin ?? (r as any)['terminé'] ?? 0)
    const stock = Number((r as any).stock) || 0
    if (termin === 1) terminCount++
    if (stock > 0) stockGt0++
    if (termin === 0 && stock > 0) bothActive++
  }
  console.log(`  terminé=1:           ${terminCount}`)
  console.log(`  stock > 0:           ${stockGt0}`)
  console.log(`  terminé=0 AND stock>0: ${bothActive}`)

  // 4) what magasins are represented
  const byMag = new Map<number, number>()
  for (const r of all) {
    const m = Number((r as any).IDMagasin) || 0
    byMag.set(m, (byMag.get(m) ?? 0) + 1)
  }
  console.log(`  IDMagasin distribution:`, Object.fromEntries(byMag))

  // 5) does any column point at the commande/line directly?
  // IDref_fil_commande — maybe the legacy app filters where IDref_fil_commande
  // is in the set of fil-commandes linked to the SST commande
  const linked = await query<Record<string, unknown>>(
    `SELECT IDstock_fil, lot, IDref_fil, IDref_fil_commande, stock, IDMagasin
     FROM stock_fil
     WHERE lot IN ('10485', '10379')`,
  )
  console.log('\n--- target lots: IDref_fil_commande pointers ---')
  for (const r of linked) console.log(' ', r)
}

main().catch((e) => { console.error(e); process.exit(1) })

// Try filters one by one to see which one matches the legacy app's
// 2-lot result for commande 8582.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  const filIds = [5, 8]

  const all = await query<Record<string, unknown>>(
    `SELECT IDstock_fil, lot, IDref_fil, IDcolori_fil, IDref_fil_commande, IDMagasin, stock, stock_initial, niveau, date_entree
     FROM stock_fil WHERE IDref_fil IN (${filIds.join(',')})
     ORDER BY stock DESC`,
  )
  console.log(`total rows IDref_fil IN (5,8): ${all.length}`)

  const stockPos = all.filter((r) => (Number((r as any).stock) || 0) > 0)
  console.log(`with stock > 0: ${stockPos.length}`)
  for (const r of stockPos) console.log(' ', r)

  console.log('\n--- breakdown of stock > 0 by magasin ---')
  const byMag = new Map<number, number>()
  for (const r of stockPos) {
    const m = Number((r as any).IDMagasin) || 0
    byMag.set(m, (byMag.get(m) ?? 0) + 1)
  }
  console.log(Object.fromEntries(byMag))

  console.log('\n--- now also try with the terminé alias ---')
  // Try SELECT * to capture the mangled or accented terminé.
  const termRows = await query<Record<string, unknown>>(
    `SELECT * FROM stock_fil WHERE IDref_fil = 5 AND IDstock_fil = 1752`,
  )
  if (termRows.length > 0) {
    const r = termRows[0]
    console.log('keys:', Object.keys(r).join(', '))
    console.log('  terminé:', (r as any)['terminé'], '  termin:', (r as any).termin)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

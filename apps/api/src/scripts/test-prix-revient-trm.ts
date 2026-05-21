import 'dotenv/config'
import { query } from '../lib/hfsql.js'
import { prixDeRevientTRM, loadRefEcruPrixFloor, trmLinePrix } from '../lib/pricing-trm.js'

async function main() {
  // Sample lines from earlier probe — IDsous_traitant=1 (TRM) lines
  // with both algo-wins and floor-wins cases.
  const cases = [
    { line: 8568, sst: 37, ref: 351, qty: 200, expected: 2.30, hint: 'EQ floor (external — but for testing)' },
    { line: 8567, sst: 1, ref: 189, qty: null, expected: 2.88, hint: 'EQ floor (TRM)' },
    { line: 8537, sst: 1, ref: 192, qty: null, expected: 4.64, hint: 'algo > floor (TRM)' },
    { line: 8536, sst: 1, ref: 328, qty: null, expected: 8.21, hint: 'algo >> floor (TRM)' },
    { line: 8528, sst: 1, ref: 149, qty: null, expected: 2.32, hint: 'algo slightly > floor (TRM)' },
    { line: 8508, sst: 1, ref: 3, qty: null, expected: 2.19, hint: 'algo > floor (TRM)' },
    { line: 8485, sst: 1, ref: 49, qty: null, expected: 2.17, hint: 'algo > floor (TRM)' },
    { line: 8480, sst: 1, ref: 278, qty: null, expected: 2.55, hint: 'algo > floor (TRM)' },
    { line: 8478, sst: 1, ref: 527, qty: null, expected: 2.83, hint: 'algo > floor (TRM)' },
    { line: 8520, sst: 1, ref: 4, qty: 500, expected: 2.07, hint: 'EQ floor (TRM)' },
  ]

  for (const c of cases) {
    // Look up the line's actual quantite if not supplied.
    let qty = c.qty
    if (qty == null) {
      const r = await query<{ quantite: number }>(`SELECT quantite FROM ligne_commande_sous_traitant WHERE IDligne_commande_sous_traitant = ${c.line}`)
      qty = Number(r[0]?.quantite) || 0
    }
    const algo = await prixDeRevientTRM(c.ref, qty)
    const floor = await loadRefEcruPrixFloor(c.ref)
    const final = await trmLinePrix(c.ref, qty)
    const matchSymbol = Math.abs(final - c.expected) < 0.01 ? '✓' : '✗'
    console.log(
      `${matchSymbol} line ${c.line} ref ${c.ref} qty ${qty}kg: algo=${algo.toFixed(4)}€ floor=${floor.toFixed(2)}€ final=${final.toFixed(2)}€ expected=${c.expected.toFixed(2)}€ — ${c.hint}`,
    )
  }
}
main().catch(e => { console.error(e); process.exit(1) })

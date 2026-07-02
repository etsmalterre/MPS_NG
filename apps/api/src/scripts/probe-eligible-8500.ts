// Verify the per-coloris designation fix on commande 8500.
import { findEligibleLots } from '../routes/commandes-sous-traitant.js'

async function main() {
  const lots = await findEligibleLots(8500)
  for (const l of lots) {
    console.log(JSON.stringify({
      kind: l.kind, lot: l.lot, IDColoris: l.IDColoris,
      coloris: l.coloris_reference, ref: l.ref_malterre,
      client: l.client_nom, designation: l.client_designation,
    }))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

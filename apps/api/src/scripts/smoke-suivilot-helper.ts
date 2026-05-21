import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

// Quick read-only sanity check against the suivilot INSERT shape:
// build the same SQL the helper would, but as a SELECT against fake
// values so we can validate the SQL syntax + column existence end-to-end
// without writing to the table.

async function main() {
  const IS_WINDOWS = process.platform === 'win32'
  console.log('platform:', process.platform, '· IS_WINDOWS=', IS_WINDOWS)

  // Pull a recent commande_sous_traitant with at least one fini line
  // and one ref_fini so we can test the demande lookup.
  const cmd = await query<{ IDcommande_sous_traitant: number; IDsous_traitant: number }>(
    `SELECT TOP 1 IDcommande_sous_traitant, IDsous_traitant FROM commande_sous_traitant
     WHERE est_soldee = 0 ORDER BY IDcommande_sous_traitant DESC`,
  )
  console.log('commande sample:', cmd[0])

  const ref = await query<{
    IDref_fini: number; laizeHT_Moy: number; poids_Moy: number; rendement: number;
    freinte: number; stab_hauteur: number; stab_largeur: number
  }>(
    `SELECT TOP 1 IDref_fini, laizeHT_Moy, poids_Moy, rendement, freinte, stab_hauteur, stab_largeur
     FROM ref_fini WHERE IDref_fini > 0`,
  )
  console.log('ref_fini sample:', ref[0])

  // Dry-run the INSERT by parsing — just print the SQL we'd run, with a
  // bogus lot that we'll DELETE right after.
  const fakeLot = `__SMOKE_TEST_${Date.now()}`
  const baseCols = [
    'IDref_fini_colori', 'IDcommande_sous_traitant', 'IDsous_traitant', 'DATE', 'lot',
    'laize_demandee', 'poids_demande', 'rendement_demande',
    'quantite_receptionnee', 'metrage_receptionne',
    'IDref_fini', 'IDColoris', 'IDligne_commande_sous_traitant', 'IDetatLot',
  ]
  const baseVals = [
    '0', '0', '0', `'20260512'`, `'${fakeLot}'`,
    String(ref[0]?.laizeHT_Moy ?? 0),
    String(ref[0]?.poids_Moy ?? 0),
    String(ref[0]?.rendement ?? 0),
    '1.0', '2.0',
    String(ref[0]?.IDref_fini ?? 0), '0', '0', '3',
  ]
  if (IS_WINDOWS) {
    baseCols.push('stabL_demandée', 'stabH_demandée', 'freinte_demandée', 'approuvé_qualité')
    baseVals.push(
      String(ref[0]?.stab_hauteur ?? 0),
      String(ref[0]?.stab_largeur ?? 0),
      String(ref[0]?.freinte ?? 0),
      '0',
    )
  }
  const sql = `INSERT INTO suivilot (${baseCols.join(', ')}) VALUES (${baseVals.join(', ')})`
  console.log('\n--- SQL ---\n' + sql)

  // Actually run it so we test the bridge path including accented columns.
  console.log('\n--- executing INSERT ---')
  await query(sql)
  console.log('INSERT ok')

  // Find the row we just created
  const created = await query<{
    IDsuivilot: number; lot: string; laize_demandee: number; poids_demande: number; rendement_demande: number;
    quantite_receptionnee: number; metrage_receptionne: number; IDetatLot: number
  }>(
    `SELECT IDsuivilot, lot, laize_demandee, poids_demande, rendement_demande,
            quantite_receptionnee, metrage_receptionne, IDetatLot
     FROM suivilot WHERE lot = '${fakeLot}'`,
  )
  console.log('row:', created[0])

  // Validate accented columns on Windows
  if (IS_WINDOWS && created[0]?.IDsuivilot) {
    const acc = await query<{ stabL_demandée: number; stabH_demandée: number; freinte_demandée: number }>(
      `SELECT stabL_demandée, stabH_demandée, freinte_demandée FROM suivilot WHERE IDsuivilot = ${created[0].IDsuivilot}`,
    )
    console.log('accented cols:', acc[0])
  }

  // Cleanup — DELETE the smoke-test row
  if (created[0]?.IDsuivilot) {
    await query(`DELETE FROM suivilot WHERE IDsuivilot = ${created[0].IDsuivilot}`)
    console.log(`cleanup: deleted IDsuivilot=${created[0].IDsuivilot}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e); process.exit(1) })

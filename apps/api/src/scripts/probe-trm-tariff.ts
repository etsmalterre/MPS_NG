// "FEN_Tarif_TRM.wdw" / "FEN_Gestion_tarif_TRM.wdw" suggest a TRM tariff table.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'
async function main() {
  for (const t of [
    'tarif_TRM','tarif_trm','TarifTRM',
    'tarif_ETM','tarif_etm',
    'tarif_machine','tarif_tricotage_TRM',
    'taux_horaire','taux_machine',
    'combinaison_tarif','combinaison_tarif_TRM',
    'tarif_matiere','tarif_main_oeuvre','prix_machine',
    'cout_machine','cout_main_oeuvre',
    'tarif','tarifs',
  ]) {
    try {
      const r = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ${t}`)
      console.log(`  ✓ ${t}: cols=${r.length === 0 ? '(empty)' : Object.keys(r[0]).join(', ')}`)
      if (r.length > 0) console.log('    sample:', r[0])
    } catch {}
  }
}
main().catch(e => { console.error(e); process.exit(1) })

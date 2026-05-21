import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  const lines = await query<Record<string, unknown>>(
    `SELECT IDligne_commande_sous_traitant, IDreference, IDColoris, quantite
     FROM ligne_commande_sous_traitant WHERE IDcommande_sous_traitant = 8593`,
  )
  console.log('sst 8593 lines:', lines)

  for (const l of lines) {
    const IDref_ecru = Number((l as any).IDreference)
    const IDcolori_ecru = Number((l as any).IDColoris)
    const ecru = await query<{ reference: string }>(`SELECT reference FROM ref_ecru WHERE IDref_ecru = ${IDref_ecru}`)
    const col = await query<{ reference: string }>(`SELECT reference FROM colori_ecru WHERE IDcolori_ecru = ${IDcolori_ecru}`)
    console.log(`\nline ${(l as any).IDligne_commande_sous_traitant}: ref_ecru ${IDref_ecru}="${ecru[0]?.reference}", colori_ecru ${IDcolori_ecru}="${col[0]?.reference}"`)

    const pairs = await query<{ IDref_fil: number; IDcolori_fil: number; pourcentage: number }>(
      `SELECT IDref_fil, IDcolori_fil, pourcentage FROM composition_ecru
       WHERE IDref_ecru = ${IDref_ecru} AND IDcolori_ecru = ${IDcolori_ecru}`,
    )
    console.log('  composition pairs:')
    for (const p of pairs) {
      const fil = await query<{ reference: string }>(`SELECT reference FROM ref_fil WHERE IDref_fil = ${p.IDref_fil}`)
      const cfil = await query<{ reference: string }>(`SELECT reference FROM colori_fil WHERE IDcolori_fil = ${p.IDcolori_fil}`)
      console.log(`    ref_fil ${p.IDref_fil}="${fil[0]?.reference}", colori_fil ${p.IDcolori_fil}="${cfil[0]?.reference}", ${p.pourcentage}%`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })

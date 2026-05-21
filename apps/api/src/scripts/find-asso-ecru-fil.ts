// Hypothesis: tricoteur sst-commande lines store IDreference = IDref_ecru
// (the output écru), not IDref_fil. The legacy "Stock fil" tab in the
// drawer must then look up which fils compose the output ecru. Find the
// junction table.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  // 1. Verify the hypothesis on more tricoteur lines.
  console.log('--- Other tricoteur lines: do their IDreference values exist in ref_ecru? ---')
  const lines = await query<Record<string, unknown>>(
    `SELECT TOP 10 lcs.IDligne_commande_sous_traitant, lcs.IDcommande_sous_traitant, lcs.IDreference, lcs.type AS type_kind
     FROM ligne_commande_sous_traitant lcs
     WHERE lcs.type = 1`,
  )
  for (const l of lines) {
    const id = Number(l.IDreference)
    if (!(id > 0)) { console.log('  line', l.IDligne_commande_sous_traitant, 'no ref'); continue }
    const [ef, eb] = await Promise.all([
      query<{ reference: string | null }>(`SELECT reference FROM ref_fil WHERE IDref_fil = ${id}`),
      query<{ reference: string | null }>(`SELECT reference FROM ref_ecru WHERE IDref_ecru = ${id}`),
    ])
    console.log(`  line ${l.IDligne_commande_sous_traitant} (cmd ${l.IDcommande_sous_traitant}) ref=${id}  fil=${ef[0]?.reference ?? '(no)'} | ecru=${eb[0]?.reference ?? '(no)'}`)
  }

  // 2. Find any junction table mapping ref_ecru -> ref_fil.
  console.log('\n--- Candidate junction tables ---')
  const candidates = [
    'asso_ref_ecru_ref_fil',
    'asso_refecru_reffil',
    'asso_ecru_fil',
    'composition_ecru',
    'composition_fil',
    'composition_ref_ecru',
    'ref_ecru_fil',
    'fil_ecru',
    'ref_ecru_compo',
  ]
  for (const t of candidates) {
    try {
      const rows = await query<Record<string, unknown>>(`SELECT * FROM ${t} LIMIT 1`)
      console.log(`  ${t}: ${rows.length === 0 ? '(empty)' : Object.keys(rows[0]).join(', ')}`)
    } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

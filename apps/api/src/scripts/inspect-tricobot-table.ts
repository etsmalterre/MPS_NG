import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

// Inspect the data_bl_tricotbot table populated by the Tricobot AI agent
// from sous-traitant BL PDFs received by email. We need to know which
// columns map to a (commande_sous_traitant, ligne, écru) so the frontend
// "Tricobot fill" button can pre-populate the batch reception dialog.

async function main() {
  console.log('=== data_bl_tricotbot — first 3 rows ===')
  let rows: Record<string, unknown>[]
  try {
    rows = await query<Record<string, unknown>>(`SELECT TOP 3 * FROM data_bl_tricotbot`)
  } catch (e) {
    console.log('  table query failed — table may not exist or be named differently:', (e as any).message)
    return
  }
  if (rows.length === 0) {
    console.log('  (table is empty — printing column names from a 0-row SELECT)')
    const cols = await query<Record<string, unknown>>(`SELECT * FROM data_bl_tricotbot WHERE 1=0`)
    console.log('  columns:', cols.length > 0 ? Object.keys(cols[0]).join(', ') : '(none returned)')
    return
  }
  console.log('  columns:', Object.keys(rows[0]).join(', '))
  for (const r of rows) {
    console.log(' ', JSON.stringify(r, (_k, v) => typeof v === 'bigint' ? Number(v) : v))
  }

  console.log('\n=== row count ===')
  const cnt = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM data_bl_tricotbot`)
  console.log('  total rows:', cnt[0]?.n)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

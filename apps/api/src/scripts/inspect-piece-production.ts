import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

async function main() {
  console.log('=== piece_production sample rows ===')
  const rows = await query<Record<string, unknown>>(
    `SELECT TOP 3 * FROM piece_production`,
  )
  if (rows.length === 0) { console.log('  (empty)'); return }
  console.log('  columns:', Object.keys(rows[0]).join(', '))
  for (const r of rows) console.log(' ', JSON.stringify(r, (_k, v) => typeof v === 'bigint' ? Number(v) : v))

  console.log('\n=== Is there a link from piece_production to stock_fini? ===')
  const cols = Object.keys(rows[0])
  const candidates = cols.filter((c) => /stock|fini|ecru|ligne|commande/i.test(c))
  console.log('  candidate link columns:', candidates.join(', ') || '(none)')

  // Is defaut_qualite.Type_Reference=1 actually piece_production?
  console.log('\n=== Cross-check: defaut_qualite Type_Reference=1 sample → piece_production? ===')
  const dqSamples = await query<{ reference: string }>(
    `SELECT TOP 30 reference FROM defaut_qualite WHERE Type_Reference = 1`,
  )
  const ids = Array.from(new Set(dqSamples.map((s) => Number(s.reference)).filter((x) => x > 0))).slice(0, 20)
  if (ids.length > 0) {
    const ppHits = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM piece_production WHERE IDpiece_production IN (${ids.join(',')})`,
    )
    console.log(`  piece_production.IDpiece_production: ${ppHits[0]?.n ?? 0}/${ids.length} hit`)
    const sfHits = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM stock_fini WHERE IDstock_fini IN (${ids.join(',')})`,
    )
    console.log(`  stock_fini.IDstock_fini:           ${sfHits[0]?.n ?? 0}/${ids.length} hit`)
  }

  console.log('\n=== stock_fini sample (first 1 row, columns only) ===')
  const sfRow = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM stock_fini`)
  if (sfRow.length > 0) console.log('  columns:', Object.keys(sfRow[0]).join(', '))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

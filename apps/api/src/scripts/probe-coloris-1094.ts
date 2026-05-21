// Direct probe: try different ways of looking up IDcolori_ecru=1094 to
// see why resolveColoris returned "ecru" when the simple `WHERE = 1094`
// query came back empty.
import 'dotenv/config'
import { query } from '../lib/hfsql.js'

async function main() {
  console.log('-- variant 1: WHERE = 1094 --')
  const a = await query<Record<string, unknown>>(
    `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDcolori_ecru = 1094`,
  )
  console.log(a)

  console.log('\n-- variant 2: WHERE IN (1094) --')
  const b = await query<Record<string, unknown>>(
    `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE IDcolori_ecru IN (1094)`,
  )
  console.log(b)

  console.log('\n-- variant 3: SELECT * around 1094 --')
  const c = await query<Record<string, unknown>>(
    `SELECT * FROM colori_ecru WHERE IDcolori_ecru >= 1090 AND IDcolori_ecru <= 1100`,
  )
  for (const r of c) console.log(' ', r.IDcolori_ecru, JSON.stringify(r))

  console.log('\n-- variant 4: SELECT TOP 1 with reference=ecru --')
  const d = await query<Record<string, unknown>>(
    `SELECT IDcolori_ecru, reference FROM colori_ecru WHERE reference = 'ecru'`,
  )
  console.log(d)
}

main().catch((e) => { console.error(e); process.exit(1) })

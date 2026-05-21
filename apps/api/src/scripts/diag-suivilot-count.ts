import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })

import { query } from '../lib/hfsql.js'

async function main() {
  const cnt = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM suivilot`)
  console.log('total suivilot rows:', cnt[0].n)
  const smoke = await query<any>(`SELECT IDsuivilot, lot, DATE FROM suivilot WHERE lot LIKE '__SMOKE_TEST_%'`)
  console.log('smoke-test rows:', smoke.length)
  for (const s of smoke) console.log(' ', JSON.stringify(s))

  // Cleanup any leftover from earlier broken smoke tests
  for (const s of smoke) {
    await query(`DELETE FROM suivilot WHERE IDsuivilot = ${s.IDsuivilot}`)
    console.log('  deleted', s.IDsuivilot)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

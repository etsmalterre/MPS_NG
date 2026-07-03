// List knitting sous-traitants (IDtype_sst = 1).
import 'dotenv/config'
import { query } from '../lib/hfsql-auto.js'

async function main() {
  const rows = await query<any>(
    `SELECT IDsous_traitant, CONVERT(nom USING 'UTF-8') AS nom, IDtype_sst FROM sous_traitant WHERE IDtype_sst = 1`,
  )
  console.log(rows)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

// Dev helper: render the commande-client PDF for a given numero to a file so
// layout changes can be inspected without driving the web UI.
// Usage: pnpm exec tsx src/scripts/render-cc-pdf.ts <numero> <out.pdf>
import 'dotenv/config'
import * as fs from 'fs'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { query } from '../lib/hfsql-auto.js'
import { buildClientPdfData } from '../routes/commandes-client.js'
import { CommandeClientPdf } from '../lib/pdf/CommandeClientPdf.js'

async function main() {
  const numero = parseInt(process.argv[2] ?? '3692', 10)
  const out = process.argv[3] ?? 'cc.pdf'
  const rows = await query<{ IDcommande_client: number }>(
    `SELECT IDcommande_client FROM commande_client WHERE numero = ${numero} AND IDsociete = 1 ORDER BY IDcommande_client DESC`,
  )
  const id = Number(rows[0]?.IDcommande_client) || 0
  if (!id) { console.error(`numero ${numero} not found`); process.exit(1) }
  const data = await buildClientPdfData(id)
  if (!data) { console.error('no pdf data'); process.exit(1) }
  const buf = await renderToBuffer(React.createElement(CommandeClientPdf, { data }) as any)
  fs.writeFileSync(out, buf)
  console.log(`wrote ${out} (${buf.length} bytes) for commande ${numero} (id ${id})`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })

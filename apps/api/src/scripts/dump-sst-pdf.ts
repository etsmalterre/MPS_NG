// Render the bon de commande sous-traitant PDF for a given id to disk.
// Usage: tsx src/scripts/dump-sst-pdf.ts <id> [outPath]
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { CommandeSoustraitantPdf } from '../lib/pdf/CommandeSoustraitantPdf.js'
import { buildCommandePdfData } from '../routes/commandes-sous-traitant.js'

async function main() {
  const id = parseInt(process.argv[2] ?? '4929', 10)
  const out = process.argv[3] ?? path.join(os.homedir(), 'Downloads', `cmd-sst-${id}.pdf`)

  const data = await buildCommandePdfData(id)
  if (!data) throw new Error('commande not found')
  const totalPieces = data.lignes.reduce((s, l) => s + (l.pieces?.length ?? 0), 0)
  console.log('numero', data.numero, 'lignes', data.lignes.length, 'pieces', totalPieces)

  const buf = await renderToBuffer(
    React.createElement(CommandeSoustraitantPdf, { data }) as any,
  )
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, buf)
  console.log('wrote', out, buf.length, 'bytes')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

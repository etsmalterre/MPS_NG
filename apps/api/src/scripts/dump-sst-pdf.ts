// Render the bon de commande sous-traitant PDF for a given id to disk.
// Usage: tsx src/scripts/dump-sst-pdf.ts <id> [version] [outPath]
import * as fs from 'fs'
import * as path from 'path'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { CommandeSoustraitantPdf, type CommandeSoustraitantPdfVersion } from '../lib/pdf/CommandeSoustraitantPdf.js'
import { buildCommandePdfData } from '../routes/commandes-sous-traitant.js'

async function main() {
  const id = parseInt(process.argv[2] ?? '4929', 10)
  const version = (parseInt(process.argv[3] ?? '1', 10) === 2 ? 2 : 1) as CommandeSoustraitantPdfVersion
  const out = process.argv[4] ?? `C:/Users/vince/Downloads/cmd-sst-${id}-v${version}.pdf`

  const data = await buildCommandePdfData(id)
  if (!data) throw new Error('commande not found')
  console.log('numero', data.numero, 'lignes', data.lignes.length, 'version', version)

  const buf = await renderToBuffer(
    React.createElement(CommandeSoustraitantPdf, { data, version }) as any,
  )
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, buf)
  console.log('wrote', out, buf.length, 'bytes')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

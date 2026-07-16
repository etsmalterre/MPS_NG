// Render a Rapport de contrôle PDF for visual inspection. Two modes:
//  - synthetic (default): data mirroring the legacy RC12162 sample
//  - live: --exp <id> builds from HFSQL via the exported builder
// Usage: tsx src/scripts/dump-rapport-controle-pdf.ts [out.pdf] [--exp 11669]
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { RapportControlePdf, type RapportControlePdfData } from '../lib/pdf/RapportControlePdf.js'

const synthetic: RapportControlePdfData = {
  numero: 12162,
  dateLong: '16 juillet 2026',
  clientNom: 'Le slip Francais',
  commandeNumero: 3788,
  refClient: 'Commande 45868 du 15/06/2026',
  articles: [
    {
      titre: '228/122 - 0481 rouge intense 61221/1',
      sousTitre: 'Jersey Coton 115g',
      lots: [
        {
          lot: 'MA108821',
          hasSuivilot: true,
          rows: [
            { parametre: 'Laize HT', min: 147, max: 153, releve: 150 },
            { parametre: 'Poids', min: 108, max: 122, releve: 117 },
            { parametre: 'Stab H', min: -8, max: null, releve: -5 },
            { parametre: 'Stab L', min: -8, max: null, releve: -4 },
          ],
        },
        {
          lot: 'MA108822',
          hasSuivilot: false,
          rows: [
            { parametre: 'Laize HT', min: 147, max: 153, releve: null },
            { parametre: 'Poids', min: 108, max: 122, releve: null },
            { parametre: 'Stab H', min: -8, max: null, releve: null },
            { parametre: 'Stab L', min: -8, max: null, releve: null },
          ],
        },
      ],
    },
    {
      titre: '180A - 0612 marine pant. 19-3922 TCX',
      sousTitre: '100% lin',
      lots: [
        {
          // Out-of-tolerance values on purpose — verifies the red rendering
          // (laize above max, stab below min); poids stays green.
          lot: 'MA107976',
          hasSuivilot: true,
          rows: [
            { parametre: 'Laize HT', min: 150, max: 160, releve: 165 },
            { parametre: 'Poids', min: 200, max: 220, releve: 217 },
            { parametre: 'Stab H', min: -5, max: null, releve: -7 },
            { parametre: 'Stab L', min: -5, max: null, releve: -5 },
          ],
        },
      ],
    },
  ],
}

async function main() {
  const expArgIdx = process.argv.indexOf('--exp')
  let data = synthetic
  if (expArgIdx !== -1) {
    const dotenv = await import('dotenv')
    dotenv.config({ path: '.env' })
    dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` })
    const { buildRapportControlePdfData } = await import('../routes/expeditions.js')
    const id = parseInt(process.argv[expArgIdx + 1], 10)
    const live = await buildRapportControlePdfData(id)
    if (!live) { console.error(`No rapport de contrôle data for expedition ${id}`); process.exit(1) }
    data = live
  }

  const out = process.argv.find((a) => a.endsWith('.pdf')) ?? path.join(os.tmpdir(), 'rapport-controle-preview.pdf')
  const buffer = await renderToBuffer(
    React.createElement(RapportControlePdf, { data }) as unknown as React.ReactElement<
      import('@react-pdf/renderer').DocumentProps
    >,
  )
  fs.writeFileSync(out, buffer)
  console.log(`Wrote ${out} (${buffer.length} bytes)`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

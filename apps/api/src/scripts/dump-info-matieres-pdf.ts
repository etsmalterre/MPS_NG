// Render an Information matières PDF for visual inspection. Two modes:
//  - synthetic (default): data mirroring the legacy Info_Matière sample
//  - live: --exp <id> builds from HFSQL via the exported builder
// Usage: tsx src/scripts/dump-info-matieres-pdf.ts [out.pdf] [--exp 11669]
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { InfoMatieresPdf, type InfoMatieresPdfData } from '../lib/pdf/InfoMatieresPdf.js'

const synthetic: InfoMatieresPdfData = {
  numero: 12162,
  dateLong: '16 juillet 2026',
  clientNom: 'Le slip Francais',
  articles: [
    {
      titre: '228/122 - 0481 rouge intense 61221/1',
      sousTitre: 'Jersey Coton 115g',
      tissuFini: [
        { titre: 'Lot MA108821', nom: 'MATEL', pays: 'France', transportDocs: ['MA108821.pdf'] },
      ],
      tombeMetier: [
        { titre: 'jersey - ecru · Jauge 5 - Ø 2"', nom: 'Tricotage Malterre', pays: 'France', transportDocs: ['BL8461.pdf'] },
      ],
      fils: [
        { titre: 'coton - ecru', nom: 'Weber & Heusseur', pays: 'France', certifications: ['OEKO-TEX', 'GOTS'], transportDocs: ['bl'] },
      ],
    },
    {
      titre: '180A - 0612 marine pant. 19-3922 TCX',
      sousTitre: '100% lin',
      tissuFini: [
        { titre: 'Lot MA107976', nom: 'MATEL', pays: 'France', transportDocs: ['MA107976.pdf'] },
        { titre: 'Lot MA107977', nom: 'MATEL', pays: 'France', transportDocs: ['MA107977.pdf'] },
      ],
      tombeMetier: [
        { titre: 'jersey lin - ecru', nom: 'Tricotage Malterre', pays: 'France', transportDocs: [] },
      ],
      fils: [
        { titre: '1/26 LIN', nom: 'Safilin', pays: 'France', certifications: [], transportDocs: [] },
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
    const { buildInfoMatieresPdfData } = await import('../routes/expeditions.js')
    const id = parseInt(process.argv[expArgIdx + 1], 10)
    const live = await buildInfoMatieresPdfData(id)
    if (!live) { console.error(`No info matières data for expedition ${id}`); process.exit(1) }
    data = live
  }

  const out = process.argv.find((a) => a.endsWith('.pdf')) ?? path.join(os.tmpdir(), 'info-matieres-preview.pdf')
  const buffer = await renderToBuffer(
    React.createElement(InfoMatieresPdf, { data }) as unknown as React.ReactElement<
      import('@react-pdf/renderer').DocumentProps
    >,
  )
  fs.writeFileSync(out, buffer)
  console.log(`Wrote ${out} (${buffer.length} bytes)`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

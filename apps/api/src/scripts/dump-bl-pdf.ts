// Render a Bon de Livraison PDF with synthetic data (no DB) so we can inspect
// the header band, top cards, and multi-page table breaks visually.
// Mirrors the shape of BL-11672 (1 article, 6 lots, 80 pieces → ~5 pages).
// Usage: tsx src/scripts/dump-bl-pdf.ts [out]
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { BonLivraisonPdf, type BonLivraisonPdfData, type BlLot } from '../lib/pdf/BonLivraisonPdf.js'

function makeLot(lot: string, prefix: string, start: number, count: number): BlLot {
  return {
    lot,
    pieces: Array.from({ length: count }, (_, i) => ({
      numero: `${prefix}/${start + i}`,
      poids: 19.5 + (i % 5) * 0.2,
      metrage: 68 + (i % 9),
      observations: null,
    })),
  }
}

const data: BonLivraisonPdfData = {
  numero: 11672,
  dateLong: '24 mars 2026',
  clientNom: 'Le slip Francais',
  refClient: 'Commande 0006384LS révisée du 18/12/2025',
  commandeNumero: 3578,
  transporteurNom: 'Divers',
  contactNom: 'Léa Marie',
  donation: false,
  showObservations: true,
  observationBl: null,
  adresseLivraison: {
    nom: 'BONNE NOUVELLE',
    adresse1: ' ', // whitespace-only, like the real row — must NOT render a blank line
    adresse2: '127 RUE CHARLES TILLON',
    adresse3: null,
    cp: '93001',
    ville: 'AUBERVILLIERS',
    pays: 'France',
  },
  articles: [
    {
      titre: '227A - 0612 marine pant. 19-3922 TCX 63052/1',
      sousTitre: 'Jersey cot/elast - 0612 marine pant. 19-3922 TCX 63052/1',
      finition: 'OUVERT AU LARGE',
      refClientArticle: '227A',
      lots: [
        makeLot('MA107889', '3386', 35, 2),
        makeLot('MA107951', '3390', 45, 16),
        makeLot('MA107963', '3386', 69, 18),
        makeLot('MA107964', '3386', 87, 18),
        makeLot('MA107965', '3385', 65, 16),
        makeLot('MA108005', '3385', 8, 10),
      ],
    },
  ],
}

async function main() {
  const out = process.argv[2] ?? path.join(os.homedir(), 'Downloads', 'bl-preview.pdf')
  const buf = await renderToBuffer(React.createElement(BonLivraisonPdf, { data }) as any)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, buf)
  console.log('wrote', out, buf.length, 'bytes')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

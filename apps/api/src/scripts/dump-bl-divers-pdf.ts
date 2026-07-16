// Render a Bon de Livraison divers PDF with synthetic data (no DB) so we can
// inspect the header band, top cards, carton blocks, and price-column toggle
// visually. Usage: tsx src/scripts/dump-bl-divers-pdf.ts [out] [--no-prices]
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { BonLivraisonDiversPdf, type BonLivraisonDiversPdfData } from '../lib/pdf/BonLivraisonDiversPdf.js'

const noPrices = process.argv.includes('--no-prices')
const p = (v: number) => (noPrices ? 0 : v)

const data: BonLivraisonDiversPdfData = {
  numero: 597,
  dateLong: '16 juillet 2026',
  clientNom: 'Le slip Francais',
  refClient: 'Réassort échantillons boutique',
  transporteurNom: 'Chronopost',
  adresseLivraison: {
    nom: 'BONNE NOUVELLE',
    adresse1: '127 RUE CHARLES TILLON',
    adresse2: null,
    adresse3: null,
    cp: '93001',
    ville: 'AUBERVILLIERS',
    pays: 'FRANCE',
  },
  cartons: [
    {
      detail: 'CARTON 1\nÉchantillons collection été',
      items: [
        { designation: 'Tee-shirt col rond', variations: 'Marine · Taille M', quantite: 12, unite: 4, unite_label: 'unité', prix: p(9.5) },
        { designation: 'Tee-shirt col rond', variations: 'Écru · Taille L', quantite: 1, unite: 4, unite_label: 'unité', prix: p(9.5) },
        { designation: 'Coupon jersey coton', variations: null, quantite: 2.5, unite: 3, unite_label: 'Ml', prix: p(14.2) },
      ],
    },
    {
      detail: 'enveloppe',
      items: [
        { designation: 'Nuancier coloris teints', variations: 'Édition 2026', quantite: 1, unite: 4, unite_label: 'unité', prix: p(0) },
      ],
    },
    { detail: 'CARTON 3 (documentation)', items: [] },
  ],
}

const out = process.argv.find((a) => a.endsWith('.pdf')) ?? path.join(os.tmpdir(), 'bl-divers-preview.pdf')
const buffer = await renderToBuffer(
  React.createElement(BonLivraisonDiversPdf, { data }) as unknown as React.ReactElement<
    import('@react-pdf/renderer').DocumentProps
  >,
)
fs.writeFileSync(out, buffer)
console.log(`Wrote ${out} (${buffer.length} bytes)`)

// Render a Devis PDF with synthetic data (no DB) so we can inspect the header
// layout visually. Usage: tsx src/scripts/dump-devis-pdf.ts [out]
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { DevisEtmPdf, DevisEtmPdfData } from '../lib/pdf/DevisEtmPdf.js'

const data: DevisEtmPdfData = {
  numero: '25-0042',
  dateDevis: '25 juin 2026',
  dateExpiration: '31 janvier 2025',
  clientNom: 'LATER',
  refClient: 'Mail Jules du 03/01/25',
  adresseFacturation: {
    nom: 'Benjamin Hooge', adresse1: '6 rue Lenoir', adresse2: null, adresse3: null,
    cp: '35000', ville: 'RENNES', pays: 'FRANCE',
  },
  adresseLivraison: {
    nom: 'LATER', adresse1: '6 rue Lenoir', adresse2: null, adresse3: null,
    cp: '35000', ville: 'RENNES', pays: 'FRANCE',
  },
  modePaiement: 'VIREMENT',
  echeance: 'Sous 10 jours',
  commentaire: null,
  remise: 0.05,
  fraisPort: 0,
  tvaRate: 20,
  lignes: [
    { ref_label: '040A Jersey coton', colori_reference: 'Marine 1056', quantite: 120, unite_label: 'Kg', prix: 10.43, montant: 1251.6, date_livraison: '15/07/2026' },
    { ref_label: '825 Molleton', colori_reference: 'Gris chiné', quantite: 80, unite_label: 'Kg', prix: 12.10, montant: 968, date_livraison: '22/07/2026' },
  ],
}

async function main() {
  const out = process.argv[2] ?? path.join(os.homedir(), 'Downloads', 'devis-preview.pdf')
  const buf = await renderToBuffer(React.createElement(DevisEtmPdf, { data }) as any)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, buf)
  console.log('wrote', out, buf.length, 'bytes')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

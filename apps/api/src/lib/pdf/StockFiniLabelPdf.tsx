// Dymo "étiquette" label for a finished-goods roll (rouleau fini).
//
// Reproduces the legacy WinDev report ETAT_Etiquette_SP.wde (a compiled
// binary — its source can't be read). Printed on a Dymo 99012 "Large
// Address" label, 89 × 36 mm. Layout from a physical sample:
//   - a left vertical band carrying the Malterre logo
//   - six right-side lines: N° (large/bold), Réf., Col., Poids, Métrage, Lot
//
// Self-contained: uses the built-in Helvetica family (no Font.register) so
// the tiny label has no font-path dependency. The photo's typeface is a
// plain bold sans, which Helvetica matches.

import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

// 89 × 36 mm in PostScript points (1 mm = 2.834646 pt).
const PAGE_WIDTH = 89 * 2.834646 // ≈ 252.3
const PAGE_HEIGHT = 36 * 2.834646 // ≈ 102.05

// Malterre logo (white script + tricolore on gold) — reused from the shared
// PDF assets; identical to the brand wordmark used elsewhere.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ASSETS = path.resolve(__dirname, '../../assets')
const LOGO_BUFFER: Buffer = fs.readFileSync(path.join(ASSETS, 'logo-malterre.png'))

// ── Input shape ──────────────────────────────────────────

export interface StockFiniLabelData {
  numero: string | null
  ref_fini: string | null
  coloris_reference: string | null
  poids: number | string | null
  metrage: number | string | null
  lot: string | null
}

// Format a numeric quantity for the label: round to one decimal, blank for
// null/NaN. "5 Kg", "27 ML".
function fmtQty(value: number | string | null, unit: string): string {
  if (value == null || value === '') return ''
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return ''
  const rounded = Math.round(n * 10) / 10
  return `${rounded} ${unit}`
}

function clean(value: string | null): string {
  return value == null ? '' : value
}

// ── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    flexDirection: 'row',
    fontFamily: 'Helvetica',
    color: '#000000',
    paddingVertical: 5,
    paddingRight: 8,
  },

  // Left vertical band — the Malterre logo rotated to read bottom-to-top.
  band: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pre-rotation the logo is laid out wide (88 × ~33, the wordmark's ~2.7:1
  // ratio); rotate(-90deg) stands it up so it occupies ~33 wide × 88 tall,
  // fitting inside the 38pt band.
  logo: {
    width: 88,
    height: 33,
    transform: 'rotate(-90deg)',
  },

  // Right column — the six data lines.
  body: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingLeft: 6,
  },
  numero: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 16,
    marginBottom: 1,
  },
  line: {
    fontSize: 11,
    lineHeight: 1.18,
  },
})

// ── Component ─────────────────────────────────────────────

export function StockFiniLabelPdf({ data }: { data: StockFiniLabelData }): React.ReactElement {
  return (
    <Document>
      <Page size={[PAGE_WIDTH, PAGE_HEIGHT]} style={styles.page}>
        <View style={styles.band}>
          <Image src={LOGO_BUFFER} style={styles.logo} />
        </View>
        <View style={styles.body}>
          <Text style={styles.numero}>N° : {clean(data.numero)}</Text>
          <Text style={styles.line}>Réf. : {clean(data.ref_fini)}</Text>
          <Text style={styles.line}>Col. : {clean(data.coloris_reference)}</Text>
          <Text style={styles.line}>Poids : {fmtQty(data.poids, 'Kg')}</Text>
          <Text style={styles.line}>Métrage : {fmtQty(data.metrage, 'ML')}</Text>
          <Text style={styles.line}>Lot : {clean(data.lot)}</Text>
        </View>
      </Page>
    </Document>
  )
}

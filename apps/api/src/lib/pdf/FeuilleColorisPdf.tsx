// Internal "Feuille coloris" working document. Unlike the Soumission and
// Demande d'étude coloris PDFs (which go out to the client / sous-traitant),
// this one stays in-house — ateliers keep a paper copy on the workshop
// board with the initial "Type" sample stapled in the top-left, the
// approved coloris stapled in the middle, and production samples below.
//
// Unlike the other PDFs, this document has no Malterre header band and
// no company footer — the paper is intended to be handled and stapled
// to, not to serve as a legal/external document.

import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
// Side-effect import: MalterreDocument registers the Lato font at module
// load time. We don't use its wrapper component (this PDF has no header
// or footer) but we still rely on the font being registered.
import './MalterreDocument.js'
import { colors, sizes, company } from './theme.js'

// ── Input shape ──────────────────────────────────────────

export interface FeuilleColorisPdfData {
  numero: string
  dateDocument: string              // long-form French, e.g. "23 avril 2026"
  clientNom: string | null
  refFini: string | null
  refFiniDesignation: string | null
  codeClient: string | null         // étude.desig_client — "0593 LILAS"
  codeMalterre: string | null       // étude.libelle — "2304 Coffee"
  sousTraitantNom: string | null
}

// ── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  // Full-bleed page — no header, no footer, generous padding so the
  // stapled samples don't sit against the paper edge.
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 36,
    fontSize: sizes.fontBase,
    color: colors.text,
    fontFamily: 'Lato',
    fontWeight: 400,
    lineHeight: 1.45,
    flexDirection: 'column',
  },

  // Top row: type placeholder left + stacked cards right.
  topRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },

  // Left: dashed placeholder for stapling the "Type" sample.
  typeCol: {
    width: '45%',
  },
  typeBox: {
    borderWidth: 1.25,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: colors.bgTotal,
    padding: 14,
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  typeBadge: {
    position: 'absolute',
    top: 8,
    left: 10,
    fontSize: sizes.fontLg,
    color: colors.primary,
    fontWeight: 900,
    letterSpacing: 0.8,
  },
  typePrimary: {
    fontSize: sizes.fontLg,
    color: colors.primary,
    fontWeight: 900,
    letterSpacing: 0.6,
    textAlign: 'center',
    marginBottom: 4,
  },
  typeSecondary: {
    fontSize: sizes.fontSm,
    color: colors.muted,
    textAlign: 'center',
  },

  // Right: two stacked cards that together match the TYPE box height.
  rightCol: {
    flex: 1,
    flexDirection: 'column',
    gap: 10,
  },

  // Manual-fill card: pre-prints the current coloris name (e.g. "2304 Coffee")
  // on the left and leaves an underlined area on the right the user fills
  // in with a pen when the soumission is approved.
  manualCard: {
    backgroundColor: colors.white,
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
    borderLeftStyle: 'solid',
    borderRadius: 6,
    padding: 12,
  },
  manualLabel: {
    fontSize: sizes.fontXs,
    color: colors.primary,
    fontWeight: 900,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  manualValue: {
    fontSize: sizes.fontLg,
    color: colors.text,
    fontWeight: 900,
    letterSpacing: 0.4,
    flexShrink: 0,
    maxWidth: '45%',
  },
  manualLine: {
    flex: 1,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.muted,
    borderBottomStyle: 'dashed',
    height: 14,
    alignSelf: 'flex-end',
  },

  // General-info card (client, réf fini, code client, sous-traitant).
  infoCard: {
    flex: 1,
    backgroundColor: colors.bgCream,
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
    borderLeftStyle: 'solid',
    borderRadius: 6,
    padding: 12,
  },
  infoTitle: {
    fontSize: sizes.fontXs,
    color: colors.primary,
    fontWeight: 900,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 2,
  },
  infoLabel: {
    fontSize: sizes.fontBase,
    color: colors.muted,
    fontWeight: 700,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: sizes.fontBase,
    color: colors.text,
    fontWeight: 700,
    textAlign: 'right',
    flexShrink: 1,
  },

  // Approved-coloris placeholder — taller than the type box since the
  // sample stapled here is what the user will reference for production.
  approvedBox: {
    flexShrink: 0,
    borderWidth: 1.25,
    borderColor: colors.gold,
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: '#FFFDF5',
    padding: 18,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  approvedTitle: {
    fontSize: sizes.fontLg,
    color: colors.primary,
    fontWeight: 900,
    letterSpacing: 0.8,
    marginBottom: 4,
    textAlign: 'center',
  },
  approvedSubtitle: {
    fontSize: sizes.fontSm,
    color: colors.muted,
    textAlign: 'center',
  },

  // Production-sample area — fills whatever is left, gently framed so the
  // user knows it's intended for stapling multiple samples over time.
  productionWrap: {
    flexGrow: 1,
    borderWidth: 0.75,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 14,
    minHeight: 150,
  },
  productionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  productionTitle: {
    fontSize: sizes.fontXs,
    color: colors.muted,
    fontWeight: 900,
    letterSpacing: 0.6,
  },
  productionHint: {
    fontSize: sizes.fontXs,
    color: colors.subtle,
  },
})

// ── Component ────────────────────────────────────────────

export function FeuilleColorisPdf({ data }: { data: FeuilleColorisPdfData }) {
  const refFiniLine = [data.refFini, data.refFiniDesignation]
    .filter((s) => s && String(s).trim().length > 0)
    .join(' — ') || '—'

  return (
    <Document
      title={`Feuille coloris ${data.numero}`}
      author={company.legalName}
    >
      <Page size="A4" style={styles.page}>
        {/* Top row: Type placeholder (left) + stacked cards (right) */}
        <View style={styles.topRow}>
          <View style={styles.typeCol}>
            <View style={styles.typeBox}>
              <Text style={styles.typeBadge}>TYPE</Text>
              <Text style={styles.typePrimary}>ÉCHANTILLON CLIENT</Text>
              <Text style={styles.typeSecondary}>
                Agrafer l'échantillon fourni initialement
              </Text>
            </View>
          </View>

          <View style={styles.rightCol}>
            {/* Manual-fill coloris card — pre-printed name + dashed line */}
            <View style={styles.manualCard}>
              <Text style={styles.manualLabel}>CODE MALTERRE</Text>
              <View style={styles.manualRow}>
                <Text style={styles.manualValue}>{data.codeMalterre || '—'}</Text>
                <View style={styles.manualLine} />
              </View>
            </View>

            {/* General info card */}
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>INFORMATIONS</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Client</Text>
                <Text style={styles.infoValue}>{data.clientNom || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Référence fini</Text>
                <Text style={styles.infoValue}>{refFiniLine}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Code client</Text>
                <Text style={styles.infoValue}>{data.codeClient || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Sous-traitant</Text>
                <Text style={styles.infoValue}>{data.sousTraitantNom || '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Approved-coloris placeholder */}
        <View style={styles.approvedBox}>
          <Text style={styles.approvedTitle}>COLORIS APPROUVÉ PAR LE CLIENT</Text>
          <Text style={styles.approvedSubtitle}>
            Agrafer l'échantillon validé par le client
          </Text>
        </View>

        {/* Open production-sample area — fills the remaining space */}
        <View style={styles.productionWrap}>
          <View style={styles.productionHeaderRow}>
            <Text style={styles.productionTitle}>ÉCHANTILLONS PRODUCTION</Text>
            <Text style={styles.productionHint}>
              Agrafer les échantillons au fil de la production
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

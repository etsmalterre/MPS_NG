// PDF document for a "Demande d'étude coloris" (coloris study request
// sent to a sous-traitant / dyeing lab). Reuses MalterreDocument so the
// branding stays aligned with the rest of the MPS documents.
//
// The main area is a dashed-outlined placeholder where the employee
// will staple a yarn / fabric sample before handing the paper off.

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import {
  MalterreDocument,
  type AddressBlockData,
  type MetadataCardData,
} from './MalterreDocument.js'
import { colors, sizes } from './theme.js'

// ── Input shape ──────────────────────────────────────────

export interface DemandeEtudeColorisPdfData {
  numero: string
  dateDocument: string              // long-form French, e.g. "14 Avril 2026"
  sousTraitantNom: string | null
  sousTraitantAdresse: {
    nom: string | null
    adresse1: string | null
    adresse2: string | null
    adresse3: string | null
    cp: string | null
    ville: string | null
    pays: string | null
  } | null
  clientNom: string | null
  refFini: string | null
  refFiniDesignation: string | null
  libelle: string | null            // étude libellé / coloris title, e.g. "0405 vert amande"
  commentaire: string | null
}

// ── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  // Short intro line just above the placeholder.
  intro: {
    fontSize: sizes.fontBase,
    color: colors.text,
    lineHeight: 1.5,
    marginBottom: 14,
  },

  // Commentaire block (optional) — gold-accented cream box.
  commentaireBox: {
    flexShrink: 0,
    marginBottom: 14,
    padding: 12,
    backgroundColor: colors.bgCream,
    borderWidth: 0.75,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
    borderLeftStyle: 'solid',
    borderRadius: 6,
  },
  commentaireTitle: {
    fontSize: sizes.fontXs,
    color: colors.primary,
    fontWeight: 900,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  commentaireText: {
    fontSize: sizes.fontBase,
    color: colors.text,
    lineHeight: 1.45,
  },

  // Placeholder for the stapled sample — fills the remaining vertical
  // space so the box ends just above the footer. Dashed border conveys
  // "attach something here" without looking like a real table cell.
  samplePlaceholder: {
    flexGrow: 1,
    borderWidth: 1.25,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: colors.bgTotal,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  samplePrimary: {
    fontSize: sizes.fontLg,
    color: colors.primary,
    fontWeight: 900,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 6,
  },
  sampleSecondary: {
    fontSize: sizes.fontSm,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 1.5,
  },
})

// ── Helpers ──────────────────────────────────────────────

function buildSousTraitantAddress(data: DemandeEtudeColorisPdfData): AddressBlockData {
  const a = data.sousTraitantAdresse
  const lines: string[] = []
  if (a) {
    // Include adresse.nom as the first line — it's the recipient label on
    // file (often a trading name distinct from sous_traitant.nom, e.g.
    // "Matel Couleurs Textiles" vs "Matel").
    if (a.nom) lines.push(a.nom)
    if (a.adresse1) lines.push(a.adresse1)
    if (a.adresse2) lines.push(a.adresse2)
    if (a.adresse3) lines.push(a.adresse3)
    const cityLine = [a.cp, a.ville].filter(Boolean).join(' ')
    if (cityLine) lines.push(cityLine)
    if (a.pays) lines.push(a.pays)
  }
  return {
    title: 'À l\'attention de',
    name: '',
    lines: lines.length > 0 ? lines : ['—'],
    icon: 'factory',
  }
}

function buildInfoCard(data: DemandeEtudeColorisPdfData): MetadataCardData {
  return {
    title: 'Informations',
    items: [
      {
        icon: 'tag',
        label: 'Référence fini',
        value: [data.refFini, data.refFiniDesignation].filter(Boolean).join(' — ') || '—',
      },
      { icon: 'user', label: 'Client', value: data.clientNom || '—' },
      { icon: 'card', label: 'Code coloris', value: data.libelle || '—' },
    ],
  }
}

// ── Component ────────────────────────────────────────────

export function DemandeEtudeColorisPdf({ data }: { data: DemandeEtudeColorisPdfData }) {
  const sousTraitantAddress = buildSousTraitantAddress(data)
  const infoCard = buildInfoCard(data)

  return (
    <MalterreDocument
      documentType="Demande d'étude coloris"
      reference={`N°${data.numero}`}
      documentDate={data.dateDocument || ''}
      topLeftAddress={sousTraitantAddress}
      topRightInfo={infoCard}
      title={`Demande d'étude coloris ${data.numero}`}
    >
      <Text style={styles.intro}>
        Nous vous prions de bien vouloir réaliser une étude coloris à partir de l'échantillon
        agrafé ci-dessous. Merci de nous retourner vos propositions à réception.
      </Text>

      {data.commentaire && data.commentaire.trim() ? (
        <View style={styles.commentaireBox} wrap={false}>
          <Text style={styles.commentaireTitle}>COMMENTAIRE</Text>
          <Text style={styles.commentaireText}>{data.commentaire.trim()}</Text>
        </View>
      ) : null}

      <View style={styles.samplePlaceholder}>
        <Text style={styles.samplePrimary}>ÉCHANTILLON</Text>
        <Text style={styles.sampleSecondary}>
          Agrafer l'échantillon dans cet espace
        </Text>
      </View>
    </MalterreDocument>
  )
}

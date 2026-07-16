// PDF document for the ETS Malterre CGV (Conditions Générales de Vente).
// Attached to every client order-confirmation email and served by
// GET /commandes-client/cgv/pdf. The text below is the legal source of truth
// (provided verbatim by Vincent Malterre, 2026-07-16 — mirrors the legacy
// WinDev report ETAT_CGV_ETM); renders inside the shared MalterreDocument
// frame in compact legal print.

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { MalterreDocument } from './MalterreDocument.js'
import { colors, sizes } from './theme.js'

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'bullets'; items: string[] }

interface Section {
  title: string
  blocks: Block[]
}

const SECTIONS: Section[] = [
  {
    title: 'I. GENERALITES',
    blocks: [
      { kind: 'p', text: "Toute commande est soumise aux présentes conditions, nonobstant toutes clauses complémentaires ou contraires pouvant figurer sur les bons de commande ou autres documents de l'acheteur. Pour être valable, toute renonciation ou modification aux présentes conditions devra être stipulée par écrit et porter la signature d'une personne pouvant engager notre Société. Le défaut d'exercer un droit prévu par les présentes conditions ne pourra être considéré comme une renonciation à exercer un droit similaire ou tout autre droit prévu par ces conditions à une date ultérieure. Le fait qu'une disposition s'avère nulle ou non applicable, n'empêche pas les autres de continuer à lier les parties." },
    ],
  },
  {
    title: 'II. COMMANDES ET OFFRES',
    blocks: [
      { kind: 'p', text: "Les transactions engagées par nos représentants, les accords verbaux ou téléphoniques ne sont valables qu'après confirmation écrite de notre part." },
    ],
  },
  {
    title: 'III. LIVRAISONS',
    blocks: [
      { kind: 'p', text: "Sauf convention contraire, les délais de livraison ne sont donnés qu'à titre indicatif. Aucun retard, en dehors de cette éventuelle convention, ne saurait engager notre responsabilité, ni même justifier une annulation, même partielle de la commande. L'incendie, la panne, la grève, les difficultés d'approvisionnement sont assimilés par les parties à la force majeure." },
    ],
  },
  {
    title: 'IV. CONDITIONS DE PRIX',
    blocks: [
      { kind: 'p', text: "Les prix sont fixés sur le Bon de Commande. Toute modification des taxes fiscales applicables au contrat fera l'objet d'une répercussion sur le prix convenu. Enfin, sauf convention contraire, nos prix s'entendent franco de port et d'emballage." },
    ],
  },
  {
    title: 'V. EXPEDITION',
    blocks: [
      { kind: 'p', text: "Quelles que soient les conditions de vente et la destination des marchandises même expédiées franco de port, celles-ci sont réputées livrées départ magasin et voyagent aux risques et périls du destinataire. La livraison est réputée effectuée au moment de la remise de la marchandise au transporteur. Le récépissé de remise au transporteur correspondant à la facture constitue la preuve de la livraison et le paiement est dû à partir de cette date. En cas d'avarie ou de manquant, le client devra :" },
      { kind: 'bullets', items: [
        'Indiquer sur les documents de transport des réserves claires, significatives, précises et complètes,',
        'Confirmer ces réserves au transporteur par lettre recommandée avec avis de réception dans les 3 jours qui suivent la réception des marchandises, et nous en transmettre copie.',
      ] },
      { kind: 'p', text: "Au cas où le client ne respecterait pas cette clause, sa responsabilité serait engagée. Dans tous les cas, notre responsabilité est strictement limitée au remplacement des marchandises reconnues défectueuses à l'exclusion de toute indemnité ou frais annexes." },
    ],
  },
  {
    title: 'VI. REPRISE',
    blocks: [
      { kind: 'p', text: "En aucun cas, les marchandises livrées conformément à la commande ne seront reprises, sauf accord préalable de notre part. Dans cette hypothèse, les frais de transports éventuels seront à la charge de l'acheteur." },
    ],
  },
  {
    title: 'VII. RECLAMATIONS',
    blocks: [
      { kind: 'p', text: "Sous réserve des dispositions de l'article 5 ci-dessus :" },
      { kind: 'bullets', items: [
        "En cas de livraison non conforme ou sujette à litige, les réclamations doivent nous être adressées, par courrier recommandé avec accusé de réception, dans les 48 heures qui suivent la réception de la marchandise et avant toute mise en œuvre.",
        "Les caractéristiques de certaines matières soumises à des variations inhérentes à leur nature ou à leur fabrication, bénéficient des tolérances d'usage.",
        "Les matières devront être employées conformément aux règles de l'art. Nous déclinons toute responsabilité dans le cas contraire.",
        "En cas de livraison reconnue défectueuse par suite de vice caché, notre responsabilité est strictement limitée au remplacement des produits reconnus défectueux à l'exclusion de toute indemnité ou frais annexes.",
        'Toute manipulation ou transformation opérée par un tiers implique sa responsabilité.',
      ] },
      { kind: 'p', text: "En cas de défaut constaté sur la marchandise, un avoir pourra être émis uniquement après le retour et la récupération des articles concernés par nos services." },
    ],
  },
  {
    title: 'VIII. CONDITIONS DE REGLEMENT',
    blocks: [
      { kind: 'p', text: "Quel que soit le mode de règlement et sauf dérogation expresse, nos ventes sont réputées effectuées au comptant et nos factures sont payables à notre siège social. Aucun escompte ne sera accepté pour paiement anticipé. Toute somme non payée à l'échéance entraînera :" },
      { kind: 'bullets', items: [
        "Le paiement d'intérêts de retard au taux égal à 3 fois le taux d'intérêt légal conformément à la réglementation en vigueur. Ces intérêts courront jusqu'au paiement effectif encaissé.",
        "L'exigibilité immédiate de la totalité de la dette en cas de paiement échelonné",
        "L'exigibilité immédiate de toutes les factures non encore échues",
        'La suspension ou l\'annulation, au choix du vendeur, de toute commande en cours.',
      ] },
      { kind: 'p', text: "Toute facture recouvrée par service contentieux sera majorée d'une indemnité fixée forfaitairement à 30% des sommes dues avec un minimum de 750€" },
    ],
  },
  {
    title: 'IX. RESERVE DE PROPRIETE',
    blocks: [
      { kind: 'p', text: "Par dérogation expresse aux dispositions de l'article 1583 du Code Civil, bien qu'il assume la totalité des risques, l'acquéreur ne devient propriétaire des marchandises qu'après règlement de l'intégralité du prix convenu, majoré des frais et des pénalités éventuels. A défaut de paiement à la date d'exigibilité de toute somme due, comme en cas d'inexécution de l'un quelconque des engagements de l'acquéreur, les ventes en cours seront résolues de plein droit sans que nous ayons à accomplir aucune formalité judiciaire, huit jours après une simple mise en demeure, par lettre recommandée avec accusé de réception restée sans effet. D'ores et déjà, si une telle éventualité venait à se produire, l'acheteur nous autorise à reprendre la marchandise où qu'elle se trouve et quels que soient les travaux réalisés sur celle-ci, ces travaux pouvant éventuellement être pris en charge par nos soins sous conditions de récupération des matières. D'autre part, tout tiers détenteur effectuant des opérations de quelque nature que ce soit - et après une date d'interdiction clairement fixée par nous et confirmée par fax ou courrier recommandé avec accusé de réception se verra attribuer la responsabilité de la marchandise et de la transformation effectuée. Enfin, la reprise de biens revendiqués imposera à l'acquéreur l'obligation de réparer le préjudice résultant de la résolution de la vente, de la dépréciation éventuelle et en tout état de cause, de l'indisponibilité des biens concernés. En conséquence, il devra, à titre de clause pénale, une indemnité fixée à dix pour cent du prix convenu par mois de détention des biens repris. Si la résolution du contrat nous rend débiteurs d'acomptes préalablement reçus, nous serons en droit de procéder à la compensation de cette dette avec la créance née de l'application de la clause pénale ci-dessus stipulée." },
    ],
  },
  {
    title: 'X. CLAUSE ATTRIBUTIVE DE JURIDICTION',
    blocks: [
      { kind: 'p', text: "Le Tribunal de Commerce de notre siège social est seul compétent pour connaître tous litiges relatifs à nos ventes, quel que ce soit le pays auquel nos marchandises sont destinées. En cas de transaction internationale, le droit français et la langue française sont seuls applicables. Toute clause contraire est réputée non écrite et s'efface devant la présente attribution de compétence qui s'applique à toute contestation, de même qu'en cas d'appel en garantie et de pluralité de défendeurs." },
    ],
  },
]

const styles = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    gap: sizes.gap4,
  },
  column: {
    flex: 1,
  },
  section: {
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 7.5,
    fontWeight: 900,
    color: colors.primary,
    letterSpacing: 0.3,
    lineHeight: 1.2,
    marginBottom: 1.5,
  },
  paragraph: {
    fontSize: 6.8,
    color: colors.text,
    lineHeight: 1.35,
    textAlign: 'justify',
  },
  bulletRow: {
    flexDirection: 'row',
    marginTop: 1,
  },
  bulletDot: {
    fontSize: 6.8,
    color: colors.text,
    lineHeight: 1.35,
    width: 8,
    paddingLeft: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 6.8,
    color: colors.text,
    lineHeight: 1.35,
    textAlign: 'justify',
  },
})

function SectionBlock({ section }: { section: Section }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.blocks.map((b, i) =>
        b.kind === 'p' ? (
          <Text key={i} style={styles.paragraph}>{b.text}</Text>
        ) : (
          <View key={i}>
            {b.items.map((item, j) => (
              <View key={j} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  )
}

export function CgvPdf() {
  // Classic CGV layout: two columns of small legal print so the whole
  // document fits on one page. The split index (I–VII left, VIII–X right) is
  // hand-balanced for the current text — rebalance if sections are edited.
  const left = SECTIONS.slice(0, 7)
  const right = SECTIONS.slice(7)
  return (
    <MalterreDocument
      // No accent on purpose — the uppercased É renders badly in the header font.
      documentType="Conditions Generales de Vente"
      reference=""
      documentDate=""
      title="Conditions Générales de Vente - ETS Malterre"
    >
      <View style={styles.columns}>
        <View style={styles.column}>
          {left.map((s) => <SectionBlock key={s.title} section={s} />)}
        </View>
        <View style={styles.column}>
          {right.map((s) => <SectionBlock key={s.title} section={s} />)}
        </View>
      </View>
    </MalterreDocument>
  )
}

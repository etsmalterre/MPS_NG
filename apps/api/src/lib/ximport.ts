// XImport — fixed-width accounting export (Sage "XImport.txt") for the day's
// definitive invoices. Ports the legacy WinDev FI_Facturation_ETM export.
//
// One invoice = one "mouvement" of exactly THREE lines, all sharing the same
// mouvement number, journal code (VT), écriture date and pièce number:
//   1. compte tiers    (client.compte, e.g. "411GANT")  — TTC, libellé = client name
//   2. compte de vente (code_comptable.numero, "707300") — HT,  libellé = code_comptable.libelle
//   3. compte de TVA   (tva.compte, "445717")            — TVA, libellé = tva.libelle_compte
//
// Sens (D/C): a facture debits the client and credits the sales + TVA accounts;
// an AVOIR reverses all three (verified against a legacy-generated file with a
// mixed facture/avoir day). An avoir also carries NO échéance date.
//
// A 0% (exonération) invoice still emits the third line: the TVA compte is
// empty, the amount is 0.00, the libellé is "Exoneration" — that's just what
// the tva row holds, so no special-casing is needed here.
//
// Every record is exactly 142 chars, CRLF-terminated (including the last line),
// pure ASCII — accents are stripped, since the legacy file is Latin-1 ASCII.

/** One invoice, already resolved to accounts / labels / rounded amounts. */
export interface XImportEntry {
  /** facture.numero — the "n° de pièce", repeated in three columns. */
  numero: number
  /** Écriture date, YYYYMMDD. */
  date: string
  /** Échéance date, YYYYMMDD. Empty string for an avoir (no échéance). */
  dateEcheance: string
  /** TYPE = 2 → reverses the D/C sens on all three lines. */
  isAvoir: boolean
  compteTiers: string
  libelleTiers: string
  compteVente: string
  libelleVente: string
  compteTva: string
  libelleTva: string
  /** Rounded to 2 decimals by the caller; ttc must equal ht + tva. */
  ht: number
  tva: number
  ttc: number
}

const RECORD_LEN = 142

// Column offsets (0-based), reverse-engineered byte-for-byte from a legacy
// XImport.txt. Every field is space-padded; unlisted columns stay blank.
const COL = {
  mouvement: 0,   // width 5, right-aligned
  journal: 5,     // width 2 — always "VT"
  dateEcriture: 7,
  dateEcheance: 15,
  piece: 23,
  compte: 35,     // width 11, left-aligned
  piece2: 46,
  montantEnd: 83, // amount is "%10.2f", right-aligned, ending on this column
  sens: 84,
  piece3: 85,
  libelle: 103,   // width 34, left-aligned
  footer: 137,    // width 5 — constant "O2003"
} as const

const MONTANT_WIDTH = 10
const LIBELLE_WIDTH = 34
const COMPTE_WIDTH = 11
const FOOTER = 'O2003'

/** Latin-1 accents → ASCII, anything else non-printable → space. The legacy
 *  file writes "Tva collectee 20 %" and "Le slip Francais". */
export function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ŒŒ]/g, 'OE')
    .replace(/œ/g, 'oe')
    .replace(/Æ/g, 'AE')
    .replace(/æ/g, 'ae')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
}

function place(buf: string[], at: number, value: string, width: number): void {
  const s = value.slice(0, width)
  for (let i = 0; i < s.length; i++) buf[at + i] = s[i]
}

function placeRight(buf: string[], endCol: number, value: string, width: number): void {
  const s = value.slice(-width).padStart(width, ' ')
  place(buf, endCol - width + 1, s, width)
}

/** One 142-char accounting line. */
function record(
  mouvement: number,
  entry: XImportEntry,
  compte: string,
  libelle: string,
  montant: number,
  sens: 'D' | 'C',
  withEcheance: boolean,
): string {
  const buf = new Array<string>(RECORD_LEN).fill(' ')
  const piece = String(entry.numero)

  placeRight(buf, COL.journal - 1, String(mouvement), 5)
  place(buf, COL.journal, 'VT', 2)
  place(buf, COL.dateEcriture, entry.date, 8)
  if (withEcheance && entry.dateEcheance) place(buf, COL.dateEcheance, entry.dateEcheance, 8)
  place(buf, COL.piece, piece, COL.compte - COL.piece)
  place(buf, COL.compte, stripAccents(compte), COMPTE_WIDTH)
  place(buf, COL.piece2, piece, COL.montantEnd - MONTANT_WIDTH - COL.piece2 + 1)
  placeRight(buf, COL.montantEnd, montant.toFixed(2), MONTANT_WIDTH)
  place(buf, COL.sens, sens, 1)
  place(buf, COL.piece3, piece, COL.libelle - COL.piece3)
  place(buf, COL.libelle, stripAccents(libelle).trim(), LIBELLE_WIDTH)
  place(buf, COL.footer, FOOTER, FOOTER.length)

  return buf.join('')
}

/** Full XImport.txt body. Entries are emitted in the order given (the legacy
 *  export sorts by facture numero) and numbered 1..N. */
export function buildXImportFile(entries: XImportEntry[]): string {
  const lines: string[] = []
  entries.forEach((entry, index) => {
    const mouvement = index + 1
    // Facture: debit the client, credit the sales + TVA accounts. Avoir: reverse.
    const tiersSens: 'D' | 'C' = entry.isAvoir ? 'C' : 'D'
    const contreSens: 'D' | 'C' = entry.isAvoir ? 'D' : 'C'
    // The échéance date only ever appears on the tiers line, and never on an avoir.
    lines.push(record(mouvement, entry, entry.compteTiers, entry.libelleTiers, entry.ttc, tiersSens, !entry.isAvoir))
    lines.push(record(mouvement, entry, entry.compteVente, entry.libelleVente, entry.ht, contreSens, false))
    lines.push(record(mouvement, entry, entry.compteTva, entry.libelleTva, entry.tva, contreSens, false))
  })
  return lines.map((l) => `${l}\r\n`).join('')
}

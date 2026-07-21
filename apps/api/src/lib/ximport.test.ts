import { describe, it, expect } from 'vitest'
import { buildXImportFile, stripAccents, type XImportEntry } from './ximport.js'

// Fixture reproduced from a legacy WinDev-generated XImport.txt (13/07/2026),
// which contains four factures and one AVOIR (9173) — that's what pins down the
// reversed D/C sens and the missing échéance on an avoir.
const LEGACY_SAMPLE = [
  '    1VT20260713202607139170        411DPD     9170                           2540.65D9170              Douze Point Dix                   O2003',
  '    1VT20260713        9170        707300     9170                           2117.21C9170              VENTE ARTICLE FINI                O2003',
  '    1VT20260713        9170        445717     9170                            423.44C9170              Tva collectee 20 %                O2003',
  '    2VT20260713202608319171        411AGAP    9171                           1470.01D9171              AGAPE                             O2003',
  '    2VT20260713        9171        707305     9171                           1470.01C9171              VENTE ARTICLE FINI INTERNATIONAL  O2003',
  '    2VT20260713        9171                   9171                              0.00C9171              Exoneration                       O2003',
  '    3VT20260713202608319172        411AGAP    9172                            737.06D9172              AGAPE                             O2003',
  '    3VT20260713        9172        707305     9172                            737.06C9172              VENTE ARTICLE FINI INTERNATIONAL  O2003',
  '    3VT20260713        9172                   9172                              0.00C9172              Exoneration                       O2003',
  '    4VT20260713        9173        411AGAP    9173                           1470.01C9173              AGAPE                             O2003',
  '    4VT20260713        9173        707305     9173                           1470.01D9173              VENTE ARTICLE FINI INTERNATIONAL  O2003',
  '    4VT20260713        9173                   9173                              0.00D9173              Exoneration                       O2003',
  '    5VT20260713202608319174        411AGAP    9174                            732.95D9174              AGAPE                             O2003',
  '    5VT20260713        9174        707305     9174                            732.95C9174              VENTE ARTICLE FINI INTERNATIONAL  O2003',
  '    5VT20260713        9174                   9174                              0.00C9174              Exoneration                       O2003',
].map((l) => `${l}\r\n`).join('')

const VENTE_INTL = { compteVente: '707305', libelleVente: 'VENTE ARTICLE FINI INTERNATIONAL' }
const EXO = { compteTva: '', libelleTva: 'Exonération' }

const ENTRIES: XImportEntry[] = [
  {
    numero: 9170, date: '20260713', dateEcheance: '20260713', isAvoir: false,
    compteTiers: '411DPD', libelleTiers: 'Douze Point Dix',
    compteVente: '707300', libelleVente: 'VENTE ARTICLE FINI',
    compteTva: '445717', libelleTva: 'Tva collectée 20 %',
    ht: 2117.21, tva: 423.44, ttc: 2540.65,
  },
  {
    numero: 9171, date: '20260713', dateEcheance: '20260831', isAvoir: false,
    compteTiers: '411AGAP', libelleTiers: 'AGAPE', ...VENTE_INTL, ...EXO,
    ht: 1470.01, tva: 0, ttc: 1470.01,
  },
  {
    numero: 9172, date: '20260713', dateEcheance: '20260831', isAvoir: false,
    compteTiers: '411AGAP', libelleTiers: 'AGAPE', ...VENTE_INTL, ...EXO,
    ht: 737.06, tva: 0, ttc: 737.06,
  },
  {
    // The avoir: reversed sens, and its échéance is dropped even though the
    // client's échéance rule would have produced one.
    numero: 9173, date: '20260713', dateEcheance: '20260831', isAvoir: true,
    compteTiers: '411AGAP', libelleTiers: 'AGAPE', ...VENTE_INTL, ...EXO,
    ht: 1470.01, tva: 0, ttc: 1470.01,
  },
  {
    numero: 9174, date: '20260713', dateEcheance: '20260831', isAvoir: false,
    compteTiers: '411AGAP', libelleTiers: 'AGAPE', ...VENTE_INTL, ...EXO,
    ht: 732.95, tva: 0, ttc: 732.95,
  },
]

describe('buildXImportFile', () => {
  it('reproduces the legacy file byte-for-byte', () => {
    expect(buildXImportFile(ENTRIES)).toBe(LEGACY_SAMPLE)
  })

  it('emits 3 CRLF-terminated 142-char records per invoice', () => {
    const out = buildXImportFile(ENTRIES)
    const lines = out.split('\r\n')
    expect(lines.pop()).toBe('') // trailing CRLF on the last record
    expect(lines).toHaveLength(ENTRIES.length * 3)
    for (const l of lines) expect(l).toHaveLength(142)
  })

  it('returns an empty string when there is nothing to export', () => {
    expect(buildXImportFile([])).toBe('')
  })

  it('truncates an over-long libellé to the 34-char column', () => {
    const [line] = buildXImportFile([{ ...ENTRIES[0], libelleTiers: 'X'.repeat(60) }]).split('\r\n')
    expect(line.slice(103, 137)).toBe('X'.repeat(34))
    expect(line.slice(137)).toBe('O2003')
  })
})

describe('stripAccents', () => {
  it('flattens the accents the legacy export drops', () => {
    expect(stripAccents('Tva collectée 20 %')).toBe('Tva collectee 20 %')
    expect(stripAccents('Le slip Français')).toBe('Le slip Francais')
    expect(stripAccents('Exonération')).toBe('Exoneration')
  })
})

import { describe, it, expect } from 'vitest'
import { buildMimeMessage, signatureToPlain, type SendMailOptions } from './gmail.js'

const baseOpts: SendMailOptions = {
  from: 'vincent@etsmalterre.com',
  to: ['dest@example.com'],
  subject: 'Test',
  body: 'Bonjour,\nvoici le **document**.',
}

const SIG = '<p>Vincent Malterre<br>ETS Malterre &amp; Cie</p>'

describe('buildMimeMessage signature handling', () => {
  it('appends the signature to the HTML part and its text form to the plain part', () => {
    const mime = buildMimeMessage({ ...baseOpts, signatureHtml: SIG }).toString('utf8')
    expect(mime).toContain('<div class="mps-signature">' + SIG + '</div>')
    expect(mime).toContain('Vincent Malterre\nETS Malterre & Cie')
  })

  it('keeps the message unchanged when signature is null or undefined', () => {
    const withNull = buildMimeMessage({ ...baseOpts, signatureHtml: null }).toString('utf8')
    const without = buildMimeMessage(baseOpts).toString('utf8')
    for (const mime of [withNull, without]) {
      expect(mime).not.toContain('mps-signature')
    }
  })

  it('treats a whitespace-only signature as absent', () => {
    const mime = buildMimeMessage({ ...baseOpts, signatureHtml: '   \n ' }).toString('utf8')
    expect(mime).not.toContain('mps-signature')
  })

  it('keeps **bold** rendering intact with a signature present', () => {
    const mime = buildMimeMessage({ ...baseOpts, signatureHtml: SIG }).toString('utf8')
    expect(mime).toContain('<strong>document</strong>')
  })
})

describe('signatureToPlain', () => {
  it('converts block tags to newlines, strips the rest, decodes entities', () => {
    expect(signatureToPlain('<div>Ligne 1</div><div>A &amp; B&nbsp;&lt;ok&gt;</div>'))
      .toBe('Ligne 1\nA & B <ok>')
  })

  it('drops style blocks and collapses blank lines', () => {
    const html = '<style>p { color: red; }</style><p>Nom</p><p></p><p></p><p>Tel</p>'
    expect(signatureToPlain(html)).toBe('Nom\n\nTel')
  })
})

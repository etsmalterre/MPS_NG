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

describe('buildMimeMessage inline images (cid:)', () => {
  const LOGO = {
    cid: 'logo-malterre@etsmalterre.com',
    contentType: 'image/png',
    filename: 'logo-malterre.png',
    content: Buffer.from('fake-png-bytes'),
  }

  it('wraps the alternative pair in multipart/related and embeds the image', () => {
    const mime = buildMimeMessage({
      ...baseOpts,
      signatureHtml: SIG,
      inlineImages: [LOGO],
    }).toString('utf8')
    expect(mime).toContain('multipart/related')
    expect(mime).toContain('type="multipart/alternative"')
    expect(mime).toContain('Content-ID: <logo-malterre@etsmalterre.com>')
    expect(mime).toContain('Content-Disposition: inline; filename="logo-malterre.png"')
    expect(mime).toContain(LOGO.content.toString('base64'))
  })

  it('nests related inside mixed when attachments are present', () => {
    const mime = buildMimeMessage({
      ...baseOpts,
      signatureHtml: SIG,
      inlineImages: [LOGO],
      attachments: [
        { filename: 'doc.pdf', content: Buffer.from('%PDF-fake'), contentType: 'application/pdf' },
      ],
    }).toString('utf8')
    expect(mime).toContain('multipart/mixed')
    expect(mime).toContain('multipart/related')
    expect(mime).toContain('Content-ID: <logo-malterre@etsmalterre.com>')
    expect(mime).toContain('Content-Disposition: attachment; filename="doc.pdf"')
  })

  it('drops inline images when the signature is absent', () => {
    const mime = buildMimeMessage({
      ...baseOpts,
      signatureHtml: null,
      inlineImages: [LOGO],
    }).toString('utf8')
    expect(mime).not.toContain('multipart/related')
    expect(mime).not.toContain('Content-ID:')
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

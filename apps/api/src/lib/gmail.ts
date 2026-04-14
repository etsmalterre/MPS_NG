// Gmail send helper — uses Google domain-wide delegation to impersonate any
// @etsmalterre.com user via a single service account. One caller → one JWT
// client cached per impersonated subject.
//
// Env vars (read lazily — dotenv.config() runs in index.ts, and ESM import
// hoisting means we cannot read process.env at module load time):
//   GOOGLE_SERVICE_ACCOUNT_KEY_FILE — absolute path to the service account
//     JSON key file. The service account must have domain-wide delegation
//     enabled in GCP, AND its client ID must be authorised in the Google
//     Workspace Admin Console for scope
//     https://www.googleapis.com/auth/gmail.send.
//
// Production / dev: drop the JSON file outside the repo (it's gitignored via
// the .env pattern but you should still keep the raw key out of version
// control), and point the env var at it. The service account itself has no
// mailbox — every call must specify the `impersonate` email.

import * as fs from 'node:fs'
import { google } from 'googleapis'

type JwtClient = InstanceType<typeof google.auth.JWT>

const SCOPES = ['https://www.googleapis.com/auth/gmail.send']

/** One JWT client per impersonated user, keyed by email. The JWT itself
 *  caches its access token internally, so re-using the instance avoids a
 *  fresh OAuth round-trip on every send. */
const clientCache = new Map<string, JwtClient>()

interface KeyFile {
  client_email: string
  private_key: string
}

let cachedKeyFile: KeyFile | null = null

function loadKeyFile(): KeyFile {
  if (cachedKeyFile) return cachedKeyFile
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
  if (!keyPath) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY_FILE env var is not set — cannot send emails via Gmail API',
    )
  }
  const raw = fs.readFileSync(keyPath, 'utf8')
  const parsed = JSON.parse(raw) as KeyFile
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      `Service account key file at ${keyPath} is missing client_email or private_key`,
    )
  }
  cachedKeyFile = parsed
  return parsed
}

function getClientForSubject(impersonate: string): JwtClient {
  const existing = clientCache.get(impersonate)
  if (existing) return existing
  const key = loadKeyFile()
  const client = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
    subject: impersonate,
  })
  clientCache.set(impersonate, client)
  return client
}

// ── MIME message building ────────────────────────────────

export interface SendMailAttachment {
  filename: string
  content: Buffer
  /** MIME type, e.g. 'application/pdf' */
  contentType: string
}

export interface SendMailOptions {
  /** Email address to impersonate (must be on the delegated domain). */
  from: string
  /** Display name shown next to the From address. Optional. */
  fromName?: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  /** Plain-text body. Line breaks are preserved. */
  body: string
  attachments?: SendMailAttachment[]
}

/** Encode a header value using MIME "encoded-word" (RFC 2047) when it
 *  contains any non-ASCII character, so accented names / subjects survive
 *  transport. Simple base64-UTF8 encoding — Gmail renders this natively. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  const b64 = Buffer.from(value, 'utf8').toString('base64')
  return `=?UTF-8?B?${b64}?=`
}

function formatFrom(email: string, name?: string): string {
  if (!name) return email
  return `${encodeHeader(name)} <${email}>`
}

/** Build a RFC 2822 MIME message as a single Buffer. Uses multipart/mixed
 *  when there are attachments, otherwise a plain text/plain body. */
function buildMimeMessage(opts: SendMailOptions): Buffer {
  const boundary = `----=_MPS_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const hasAttachments = (opts.attachments?.length ?? 0) > 0
  const crlf = '\r\n'

  const headers: string[] = []
  headers.push(`From: ${formatFrom(opts.from, opts.fromName)}`)
  headers.push(`To: ${opts.to.join(', ')}`)
  if (opts.cc && opts.cc.length > 0) headers.push(`Cc: ${opts.cc.join(', ')}`)
  if (opts.bcc && opts.bcc.length > 0) headers.push(`Bcc: ${opts.bcc.join(', ')}`)
  headers.push(`Subject: ${encodeHeader(opts.subject)}`)
  headers.push('MIME-Version: 1.0')

  if (!hasAttachments) {
    headers.push('Content-Type: text/plain; charset="UTF-8"')
    headers.push('Content-Transfer-Encoding: 8bit')
    return Buffer.from(headers.join(crlf) + crlf + crlf + opts.body, 'utf8')
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)

  const parts: (string | Buffer)[] = []
  parts.push(headers.join(crlf) + crlf + crlf)

  // Text body part
  parts.push(`--${boundary}${crlf}`)
  parts.push(`Content-Type: text/plain; charset="UTF-8"${crlf}`)
  parts.push(`Content-Transfer-Encoding: 8bit${crlf}${crlf}`)
  parts.push(opts.body + crlf)

  // Attachment parts
  for (const att of opts.attachments!) {
    parts.push(`--${boundary}${crlf}`)
    parts.push(`Content-Type: ${att.contentType}; name="${att.filename}"${crlf}`)
    parts.push(`Content-Transfer-Encoding: base64${crlf}`)
    parts.push(`Content-Disposition: attachment; filename="${att.filename}"${crlf}${crlf}`)
    // Base64-encode in 76-char lines (RFC 2045)
    const b64 = att.content.toString('base64')
    const wrapped = b64.match(/.{1,76}/g)?.join(crlf) ?? b64
    parts.push(wrapped + crlf)
  }

  parts.push(`--${boundary}--${crlf}`)

  return Buffer.concat(
    parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : p)),
  )
}

// ── Public send function ─────────────────────────────────

/** Send an email via the Gmail API, impersonating `opts.from`. Returns the
 *  Gmail message ID on success. Throws on auth/send failure — the caller
 *  should map that to a 5xx response. */
export async function sendMail(opts: SendMailOptions): Promise<string> {
  if (!opts.to || opts.to.length === 0) {
    throw new Error('At least one recipient required')
  }

  const client = getClientForSubject(opts.from)
  const mime = buildMimeMessage(opts)

  // Gmail expects the raw message base64url-encoded (not plain base64).
  const raw = mime
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const gmail = google.gmail({ version: 'v1', auth: client })
  const result = await gmail.users.messages.send({
    userId: 'me', // 'me' resolves to the impersonated subject
    requestBody: { raw },
  })

  return result.data.id ?? ''
}

// Minimal RTF helpers for commentaire / journal fields stored by the legacy
// WinDev app as RTF. We do NOT preserve formatting on edit — Phase 1 reads
// RTF as plain text, lets the user edit plain text, and saves the result
// back wrapped in a tiny RTF document so the legacy app keeps reading it.
//
// Caveat: legacy bold / colour / font formatting is lost the first time a
// commentaire is saved through the new app. Adding a real WYSIWYG RTF
// editor is Phase 2 work.

const RTF_HEADER_RE = /^\s*\{\\rtf/i

/** Decode the `\'XX` escape — a hex byte in RTF, interpreted as cp1252 (the
 *  only charset legacy MPS commentaires actually use, per the rtf prelude). */
const CP1252_TOP: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š',
  0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ',
  0x9E: 'ž', 0x9F: 'Ÿ',
}
function cp1252ToChar(byte: number): string {
  if (byte < 0x80) return String.fromCharCode(byte)
  if (byte >= 0xA0) return String.fromCharCode(byte) // shared with Latin-1
  return CP1252_TOP[byte] ?? '?'
}

/** Pull the human-visible text out of an RTF document. Strips control words,
 *  decodes \'XX hex escapes, and translates \par into newlines. */
export function stripRtf(input: string | null | undefined): string {
  if (input == null) return ''
  const s = String(input)
  if (!RTF_HEADER_RE.test(s)) return s

  let out = ''
  let i = 0
  // Track depth so we can SKIP destination groups like {\fonttbl ...}, {\colortbl ...}, {\*\generator ...}
  type Frame = { skip: boolean }
  const stack: Frame[] = [{ skip: false }]
  const cur = () => stack[stack.length - 1]
  const emit = (c: string) => { if (!cur().skip) out += c }

  while (i < s.length) {
    const ch = s[i]
    if (ch === '{') {
      // peek next control word — if it's a destination we want to skip,
      // mark this frame as skip
      let j = i + 1
      let skipFrame = false
      // skip whitespace
      while (j < s.length && /\s/.test(s[j])) j++
      if (s[j] === '\\') {
        // read control word
        let k = j + 1
        // \* prefix indicates a destination
        const isDestPrefix = s[k] === '*'
        if (isDestPrefix) k++
        let word = ''
        while (k < s.length && /[a-zA-Z]/.test(s[k])) { word += s[k]; k++ }
        if (isDestPrefix
          || word === 'fonttbl' || word === 'colortbl' || word === 'stylesheet'
          || word === 'info' || word === 'pict' || word === 'object'
          || word === 'header' || word === 'footer' || word === 'generator'
          || word === 'filetbl' || word === 'listtable' || word === 'listoverridetable'
          || word === 'rsidtbl' || word === 'datafield') {
          skipFrame = true
        }
      }
      stack.push({ skip: cur().skip || skipFrame })
      i++
      continue
    }
    if (ch === '}') {
      if (stack.length > 1) stack.pop()
      i++
      continue
    }
    if (ch === '\\') {
      // Escapes
      const next = s[i + 1]
      if (next === '\\' || next === '{' || next === '}') {
        emit(next)
        i += 2
        continue
      }
      if (next === '~') { emit(' '); i += 2; continue }
      if (next === '-' || next === '_') { i += 2; continue }
      if (next === '\n' || next === '\r') {
        emit('\n')
        i += 2
        continue
      }
      if (next === "'") {
        // \'XX — hex byte
        const hex = s.slice(i + 2, i + 4)
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          emit(cp1252ToChar(parseInt(hex, 16)))
          i += 4
          continue
        }
        i += 2
        continue
      }
      if (next === 'u' && (s[i + 2] === '-' || /\d/.test(s[i + 2] ?? ''))) {
        // \uNNNN? — unicode codepoint (signed 16-bit; negative = + 65536).
        // Note: only triggers when followed by a digit or minus, so the
        // unrelated control word \uc<n> falls through to the generic
        // control-word handler below.
        let k = i + 2
        let sign = 1
        if (s[k] === '-') { sign = -1; k++ }
        let num = ''
        while (k < s.length && /\d/.test(s[k])) { num += s[k]; k++ }
        let code = sign * parseInt(num, 10)
        if (code < 0) code += 65536
        emit(String.fromCharCode(code))
        // optional substitution char follows — skip one byte
        if (s[k] === ' ') k++
        if (s[k] === '?') k++
        else if (s[k] && s[k] !== '\\' && s[k] !== '{' && s[k] !== '}') k++
        i = k
        continue
      }
      // Regular control word
      if (next && /[a-zA-Z]/.test(next)) {
        let k = i + 1
        let word = ''
        while (k < s.length && /[a-zA-Z]/.test(s[k])) { word += s[k]; k++ }
        // optional numeric parameter
        let param = ''
        if (s[k] === '-') { param += '-'; k++ }
        while (k < s.length && /\d/.test(s[k])) { param += s[k]; k++ }
        // skip a single trailing space delimiter
        if (s[k] === ' ') k++

        // Translate text-relevant control words
        if (word === 'par' || word === 'line') emit('\n')
        else if (word === 'tab') emit('\t')
        else if (word === 'lquote') emit('‘')
        else if (word === 'rquote') emit('’')
        else if (word === 'ldblquote') emit('“')
        else if (word === 'rdblquote') emit('”')
        else if (word === 'emdash') emit('—')
        else if (word === 'endash') emit('–')
        else if (word === 'bullet') emit('•')
        // Most other control words are formatting we just drop.
        i = k
        continue
      }
      // Lone backslash — drop
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      // Raw newlines inside RTF are layout noise — skip
      i++
      continue
    }
    emit(ch)
    i++
  }

  return out.trim()
}

/** Wrap a plain string in a minimal RTF document so the legacy WinDev app
 *  still recognises it as RTF. Empty input → empty string (no RTF wrapper),
 *  matching the legacy convention. */
export function wrapRtf(plain: string | null | undefined): string {
  if (plain == null) return ''
  const text = String(plain).trim()
  if (text === '') return ''

  // Escape RTF metacharacters and encode non-ASCII as \uNNNN? sequences.
  let body = ''
  for (const ch of text) {
    if (ch === '\\' || ch === '{' || ch === '}') {
      body += '\\' + ch
    } else if (ch === '\n') {
      body += '\\par\r\n'
    } else if (ch === '\r') {
      // skip — will be re-emitted by the \n above if paired
    } else {
      const code = ch.codePointAt(0) ?? 0
      if (code < 0x80) {
        body += ch
      } else if (code <= 0xFFFF) {
        // signed 16-bit per RTF spec
        const signed = code >= 0x8000 ? code - 0x10000 : code
        body += `\\u${signed}?`
      } else {
        // surrogate pair — RTF doesn't support BMP-outside, emit as ?
        body += '?'
      }
    }
  }

  return `{\\rtf1\\ansi\\ansicpg1252\\deff0 ${body}\\par\r\n}`
}

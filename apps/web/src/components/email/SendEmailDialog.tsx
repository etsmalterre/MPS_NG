import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AtSign,
  Mail,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  User,
  Plus,
  X,
  Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  EMAIL_REGEX,
  parseEmailList,
  formatFileSize,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type EmailDefaults,
  type EmailRecipient,
  type SendPayload,
} from '@/lib/email'

/** User-uploaded attachment, managed internally by the dialog. The public
 *  `SendPayload.userAttachments` API still takes plain `File[]` — this richer
 *  shape only lives in dialog state so we can track stable ids for preview
 *  selection and pair each File with a blob URL for inline previews. */
interface UserAttachment {
  id: string
  file: File
  blobUrl: string
}

function makeAttachmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface SendEmailDialogProps {
  open: boolean
  onClose: () => void

  /** Free-text context chip shown in the dialog header (e.g. fournisseur name). */
  contextLabel?: string

  /** React-query cache key for the defaults fetch. Must be stable per open-id. */
  queryKey: readonly unknown[]
  /** Async loader for pre-fill defaults. Called on dialog open. */
  loadDefaults: () => Promise<EmailDefaults>

  /** Async send handler. Caller wires its own endpoint + payload transform. */
  onSend: (payload: SendPayload) => Promise<void>

  /** Optional PDF preview URL. If undefined, the right pane shows an empty
   *  state and no server-rendered PDF chip is added to the attachment list. */
  pdfUrl?: string
  /** Display label for the server-rendered PDF chip (e.g. "Bon de commande
   *  675.pdf"). Only shown when pdfUrl is set. */
  pdfAttachmentLabel?: string
}

export function SendEmailDialog({
  open,
  onClose,
  contextLabel,
  queryKey,
  loadDefaults,
  onSend,
  pdfUrl,
  pdfAttachmentLabel = 'document.pdf',
}: SendEmailDialogProps) {
  // ── Form state ───────────────────────────────────────
  const [selectedRecipients, setSelectedRecipients] = useState<EmailRecipient[]>([])
  const [suggestions, setSuggestions] = useState<EmailRecipient[]>([])
  const [manualInput, setManualInput] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  /** Whether the server-rendered PDF is still in the attachment list. Starts
   *  true when pdfUrl is set; flipped to false when the user clicks ✕ on the
   *  default PDF chip. Never true when there's no pdfUrl. */
  const [attachPdf, setAttachPdf] = useState(true)
  /** User-uploaded attachments. Each carries a stable id (for preview
   *  selection) and a blob URL (so we can iframe/<img> it without reading
   *  the file again). Blob URLs are created on add and revoked on remove
   *  or on dialog close. */
  const [userAttachments, setUserAttachments] = useState<UserAttachment[]>([])
  /** Which attachment is currently shown in the right-pane viewer.
   *  'server' → the pdfUrl prop; a string id → a user attachment by id;
   *  null → empty state. */
  const [previewedId, setPreviewedId] = useState<'server' | string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [isSending, setIsSending] = useState(false)

  // ── Defaults fetch ───────────────────────────────────
  const {
    data: defaults,
    isLoading: loadingDefaults,
    isError: defaultsError,
  } = useQuery<EmailDefaults>({
    queryKey,
    queryFn: loadDefaults,
    enabled: open,
  })

  // Hydrate form fields once defaults arrive, then leave them editable.
  // Also set the initial preview target: 'server' when a pdfUrl is present,
  // otherwise null (user will add a file or stay with the empty state).
  useEffect(() => {
    if (!open || !defaults || hydrated) return
    setSelectedRecipients(defaults.recipients.selected)
    setSuggestions(defaults.recipients.suggestions)
    setCc((defaults.cc ?? []).join(', '))
    setSubject(defaults.subject)
    setBody(defaults.body)
    setPreviewedId(pdfUrl ? 'server' : null)
    setHydrated(true)
  }, [open, defaults, hydrated, pdfUrl])

  // Reset all local state when the dialog closes so re-opening fetches fresh
  // defaults and starts from a clean slate. Blob URLs for user attachments
  // are revoked before the list is cleared — otherwise they'd leak.
  useEffect(() => {
    if (open) return
    setSelectedRecipients([])
    setSuggestions([])
    setManualInput('')
    setCc('')
    setSubject('')
    setBody('')
    setAttachPdf(true)
    setUserAttachments((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.blobUrl))
      return []
    })
    setPreviewedId(null)
    setErrorMessage(null)
    setSuccessMessage(null)
    setHydrated(false)
    setIsSending(false)
  }, [open])

  // ── Chip operations ──────────────────────────────────
  const allKnownEmails = useMemo(() => {
    const s = new Set<string>()
    for (const r of selectedRecipients) s.add(r.email.toLowerCase())
    for (const r of suggestions) s.add(r.email.toLowerCase())
    return s
  }, [selectedRecipients, suggestions])

  const removeRecipient = useCallback((email: string) => {
    setSelectedRecipients((prev) => {
      const found = prev.find((r) => r.email === email)
      if (!found) return prev
      const next = prev.filter((r) => r.email !== email)
      // Contact-sourced recipients go back to suggestions so the user can
      // re-add them without retyping. Manual recipients just vanish.
      if (found.source === 'contact') {
        setSuggestions((s) => [...s, found])
      }
      return next
    })
  }, [])

  const addFromSuggestion = useCallback((recipient: EmailRecipient) => {
    setSuggestions((prev) => prev.filter((r) => r.email !== recipient.email))
    setSelectedRecipients((prev) => [...prev, recipient])
  }, [])

  const addManual = useCallback(() => {
    const raw = manualInput.trim()
    if (!raw) return
    if (!EMAIL_REGEX.test(raw)) {
      setErrorMessage(`L'adresse « ${raw} » n'est pas valide`)
      return
    }
    if (allKnownEmails.has(raw.toLowerCase())) {
      // Already present — just clear the input silently.
      setManualInput('')
      return
    }
    setSelectedRecipients((prev) => [...prev, { email: raw, source: 'manual' }])
    setManualInput('')
    setErrorMessage(null)
  }, [manualInput, allKnownEmails])

  // ── Attachment operations ────────────────────────────
  const totalUserAttachmentBytes = useMemo(
    () => userAttachments.reduce((sum, a) => sum + a.file.size, 0),
    [userAttachments],
  )

  const handleFilePick = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    setErrorMessage(null)
    const incoming = Array.from(files).map((file) => ({
      id: makeAttachmentId(),
      file,
      blobUrl: URL.createObjectURL(file),
    }))
    setUserAttachments((prev) => {
      const next = [...prev, ...incoming]
      const total = next.reduce((sum, a) => sum + a.file.size, 0)
      if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
        // Reject the addition — revoke the brand-new blob URLs we just
        // created so they don't leak.
        incoming.forEach((a) => URL.revokeObjectURL(a.blobUrl))
        setErrorMessage(
          `Les pièces jointes dépassent la limite de ${formatFileSize(MAX_TOTAL_ATTACHMENT_BYTES)}.`,
        )
        return prev
      }
      return next
    })
    // Auto-preview the first newly added file when nothing is currently
    // previewed (e.g. user just removed the server PDF, or we're in the
    // entreprise empty-viewer case).
    setPreviewedId((curr) => (curr === null ? incoming[0]?.id ?? null : curr))
  }, [])

  const removeUserAttachment = useCallback((id: string) => {
    setUserAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (!target) return prev
      URL.revokeObjectURL(target.blobUrl)
      const next = prev.filter((a) => a.id !== id)
      // If the removed attachment was the active preview, fall through to
      // the next remaining user file, then the server PDF (if still in the
      // list), then null.
      setPreviewedId((curr) => {
        if (curr !== id) return curr
        if (next.length > 0) return next[0].id
        if (pdfUrl && attachPdf) return 'server'
        return null
      })
      return next
    })
  }, [pdfUrl, attachPdf])

  const removeServerPdf = useCallback(() => {
    setAttachPdf(false)
    // If the server PDF was the active preview, fall through to the first
    // user attachment, or null if none.
    setPreviewedId((curr) => {
      if (curr !== 'server') return curr
      return userAttachments[0]?.id ?? null
    })
  }, [userAttachments])

  const selectPreview = useCallback((id: 'server' | string) => {
    setPreviewedId(id)
  }, [])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // ── Send ─────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    setErrorMessage(null)
    setSuccessMessage(null)
    const to = selectedRecipients.map((r) => r.email)
    if (to.length === 0) {
      setErrorMessage('Ajoutez au moins un destinataire dans le champ « À »')
      return
    }
    const trimmedSubject = subject.trim()
    if (!trimmedSubject) {
      setErrorMessage("L'objet ne peut pas être vide")
      return
    }
    const ccList = parseEmailList(cc)
    setIsSending(true)
    try {
      await onSend({
        to,
        cc: ccList,
        subject: trimmedSubject,
        body,
        attachPdf: pdfUrl ? attachPdf : false,
        userAttachments: userAttachments.map((a) => a.file),
      })
      setSuccessMessage('Email envoyé avec succès')
      setTimeout(() => onClose(), 1200)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Échec de l'envoi")
    } finally {
      setIsSending(false)
    }
  }, [selectedRecipients, subject, cc, body, attachPdf, userAttachments, pdfUrl, onSend, onClose])

  // Dev-only "Faux envoi" — short-circuits to vincent@etsmalterre.com with
  // dev_skip_send=true so the backend logs envoi_email + flips sstatut
  // without actually calling Gmail. Lets the operator exercise status
  // transitions in dev without spamming real ennoblisseurs.
  const handleDevFakeSend = useCallback(async () => {
    setErrorMessage(null)
    setSuccessMessage(null)
    const trimmedSubject = subject.trim() || '[Faux envoi dev]'
    setIsSending(true)
    try {
      await onSend({
        to: ['vincent@etsmalterre.com'],
        cc: [],
        subject: trimmedSubject,
        body: body || '[Faux envoi dev — pas de corps]',
        attachPdf: false,
        userAttachments: [],
        devSkipSend: true,
      })
      setSuccessMessage('Faux envoi enregistré (statut mis à jour, aucun email réel envoyé)')
      setTimeout(() => onClose(), 1200)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Échec du faux envoi')
    } finally {
      setIsSending(false)
    }
  }, [subject, body, onSend, onClose])

  // ── Preview resolution ───────────────────────────────
  // Resolve what the right-pane viewer should render based on previewedId.
  // Kept as a tagged union so the render branch below is a flat switch.
  type ActivePreview =
    | { kind: 'server-pdf'; url: string }
    | { kind: 'user-pdf'; url: string; name: string }
    | { kind: 'user-image'; url: string; name: string }
    | { kind: 'user-unsupported'; name: string; type: string }
    | { kind: 'empty' }

  const activePreview = useMemo<ActivePreview>(() => {
    if (previewedId === 'server' && pdfUrl && attachPdf) {
      return { kind: 'server-pdf', url: `${pdfUrl}#view=FitH` }
    }
    if (previewedId && previewedId !== 'server') {
      const att = userAttachments.find((a) => a.id === previewedId)
      if (att) {
        const type = att.file.type
        if (type === 'application/pdf') {
          return { kind: 'user-pdf', url: `${att.blobUrl}#view=FitH`, name: att.file.name }
        }
        if (type.startsWith('image/')) {
          return { kind: 'user-image', url: att.blobUrl, name: att.file.name }
        }
        return { kind: 'user-unsupported', name: att.file.name, type }
      }
    }
    return { kind: 'empty' }
  }, [previewedId, pdfUrl, attachPdf, userAttachments])

  // ── Render ───────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        className="max-w-6xl w-[92vw] h-[85vh] flex flex-col p-0 overflow-hidden"
        onClose={onClose}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b bg-gradient-to-r from-gold/25 via-gold/10 to-transparent">
          <DialogTitle className="flex items-center gap-2">
            <AtSign className="h-5 w-5 text-accent" />
            <span>Envoyer un email</span>
            {contextLabel && (
              <span className="text-muted-foreground font-normal text-base truncate">— {contextLabel}</span>
            )}
          </DialogTitle>
        </div>

        {/* Body — two-pane split */}
        <div className="flex-1 min-h-0 flex">
          {/* ── Left pane: form ── */}
          <div className="w-1/2 border-r flex flex-col min-w-0">
            {loadingDefaults ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            ) : defaultsError ? (
              <div className="flex-1 flex flex-col items-center justify-center text-destructive">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p className="text-sm">Impossible de charger les destinataires par défaut</p>
              </div>
            ) : (
              <>
                <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
                  {/* À — chip picker */}
                  <div className="space-y-1 flex-shrink-0">
                    <label className="text-xs font-medium text-muted-foreground">À</label>
                    <div className="rounded-md border border-input bg-white p-2 space-y-2">
                      {selectedRecipients.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedRecipients.map((r) => (
                            <span
                              key={r.email}
                              className="inline-flex items-center gap-1 rounded-md bg-accent/10 border border-accent/30 text-xs py-1 pl-2 pr-1 text-accent"
                              title={r.email}
                            >
                              {r.source === 'contact' && <User className="h-3 w-3 flex-shrink-0" />}
                              <span className="max-w-[180px] truncate">{r.name || r.email}</span>
                              <button
                                type="button"
                                onClick={() => removeRecipient(r.email)}
                                className="rounded-full hover:bg-accent/20 p-0.5 transition-colors"
                                title="Retirer"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic px-1">Aucun destinataire sélectionné</p>
                      )}

                      {suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                          {suggestions.map((r) => (
                            <button
                              key={r.email}
                              type="button"
                              onClick={() => addFromSuggestion(r)}
                              className="inline-flex items-center gap-1 rounded-md bg-zinc-100 border border-border/60 text-xs py-1 px-2 text-muted-foreground hover:bg-accent/10 hover:border-accent/30 hover:text-accent transition-colors"
                              title={r.email}
                            >
                              <Plus className="h-3 w-3 flex-shrink-0" />
                              <span className="max-w-[180px] truncate">{r.name || r.email}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 pt-2 border-t border-border/40">
                        <input
                          type="email"
                          value={manualInput}
                          onChange={(e) => setManualInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              addManual()
                            }
                          }}
                          placeholder="ajouter une adresse…"
                          className="flex-1 h-7 px-2 text-xs rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-accent hover:text-accent hover:bg-accent/10"
                          onClick={addManual}
                          disabled={!manualInput.trim()}
                          title="Ajouter"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Cc — comma text */}
                  <div className="space-y-1 flex-shrink-0">
                    <label className="text-xs font-medium text-muted-foreground">Cc (facultatif)</label>
                    <input
                      type="text"
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      placeholder="copie@exemple.com"
                      className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                      autoComplete="off"
                    />
                  </div>

                  {/* Subject */}
                  <div className="space-y-1 flex-shrink-0">
                    <label className="text-xs font-medium text-muted-foreground">Objet</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                      autoComplete="off"
                    />
                  </div>

                  {/* Body — anchored: fills remaining vertical space in the left pane */}
                  <div className="flex-1 min-h-0 flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground flex-shrink-0">Message</label>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="flex-1 min-h-0 w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-sans scrollbar-transparent"
                    />
                  </div>
                </div>

                {/* Left pane footer — banners + actions */}
                <div className="flex-shrink-0 p-4 border-t bg-zinc-200/50 space-y-3">
                  {errorMessage && (
                    <div className="flex items-start gap-2 p-2.5 rounded-md border border-destructive/30 bg-destructive/5 text-destructive text-xs">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <p className="flex-1">{errorMessage}</p>
                    </div>
                  )}
                  {successMessage && (
                    <div className="flex items-start gap-2 p-2.5 rounded-md border border-green-500/30 bg-green-500/5 text-green-700 text-xs">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <p className="flex-1">{successMessage}</p>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 items-center">
                    {import.meta.env.DEV && (
                      <Button
                        variant="outline"
                        onClick={handleDevFakeSend}
                        disabled={isSending || loadingDefaults || !!successMessage}
                        title="Dev only — n'envoie pas réellement, mais déclenche les transitions de statut côté serveur"
                        className="mr-auto border-dashed border-amber-500/60 text-amber-700 hover:bg-amber-500/10"
                      >
                        Faux envoi (dev)
                      </Button>
                    )}
                    <Button variant="outline" onClick={onClose} disabled={isSending}>
                      Annuler
                    </Button>
                    <Button
                      onClick={handleSend}
                      disabled={isSending || loadingDefaults || !!successMessage}
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          Envoi…
                        </>
                      ) : (
                        <>
                          <Mail className="h-3.5 w-3.5 mr-1.5" />
                          Envoyer
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Right pane: viewer (top) + attachment strip (bottom) ── */}
          <div className="w-1/2 flex flex-col bg-zinc-200/50 min-w-0">
            {/* Viewer area — renders whichever attachment is currently selected */}
            <div className="flex-1 min-h-0 flex">
              {activePreview.kind === 'server-pdf' || activePreview.kind === 'user-pdf' ? (
                <iframe
                  key={activePreview.url}
                  src={activePreview.url}
                  className="w-full h-full border-0"
                  title="Aperçu du document"
                />
              ) : activePreview.kind === 'user-image' ? (
                <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
                  <img
                    src={activePreview.url}
                    alt={activePreview.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : activePreview.kind === 'user-unsupported' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-6 text-center">
                  <FileText className="h-12 w-12 opacity-30 mb-3" />
                  <p className="text-sm font-medium">Aperçu non disponible pour ce type de fichier</p>
                  <p className="text-xs mt-1 max-w-[280px] truncate" title={activePreview.name}>
                    {activePreview.name}
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                  <FileText className="h-12 w-12 opacity-30 mb-3" />
                  <p className="text-sm">Aucun document à prévisualiser</p>
                </div>
              )}
            </div>

            {/* Attachment strip */}
            <div className="flex-shrink-0 border-t border-border/60 bg-white/70 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-1.5" />
                <div className="flex-1 min-w-0 flex flex-wrap gap-1.5 items-center">
                  {/* Server-rendered PDF chip (only when pdfUrl && still included).
                      Clicking the pill body selects it as the preview target;
                      clicking the inner ✕ removes it from the send. */}
                  {pdfUrl && attachPdf && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => selectPreview('server')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selectPreview('server')
                        }
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md bg-white border shadow-sm text-xs py-1 pl-2 pr-1 text-foreground cursor-pointer transition-colors',
                        previewedId === 'server'
                          ? 'border-accent ring-2 ring-accent/60'
                          : 'border-border/60 hover:bg-zinc-50',
                      )}
                      title={pdfAttachmentLabel}
                    >
                      <FileText className="h-3 w-3 text-accent flex-shrink-0" />
                      <span className="max-w-[180px] truncate">{pdfAttachmentLabel}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeServerPdf() }}
                        className="rounded-full hover:bg-destructive/20 hover:text-destructive p-0.5 transition-colors"
                        title="Retirer la pièce jointe"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {/* User-uploaded attachment chips — same click-to-preview +
                      inner ✕-to-remove mechanics. */}
                  {userAttachments.map((a) => (
                    <div
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectPreview(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selectPreview(a.id)
                        }
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md bg-white border shadow-sm text-xs py-1 pl-2 pr-1 text-foreground cursor-pointer transition-colors',
                        previewedId === a.id
                          ? 'border-accent ring-2 ring-accent/60'
                          : 'border-border/60 hover:bg-zinc-50',
                      )}
                      title={`${a.file.name} — ${formatFileSize(a.file.size)}`}
                    >
                      <FileText className="h-3 w-3 text-accent flex-shrink-0" />
                      <span className="max-w-[160px] truncate">{a.file.name}</span>
                      <span className="text-[10px] text-muted-foreground">{formatFileSize(a.file.size)}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeUserAttachment(a.id) }}
                        className="rounded-full hover:bg-destructive/20 hover:text-destructive p-0.5 transition-colors"
                        title="Retirer la pièce jointe"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {/* Add file button */}
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-accent/40 text-xs py-1 px-2 text-muted-foreground hover:bg-accent/10 hover:border-accent hover:text-accent cursor-pointer transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Ajouter un fichier
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
                    onChange={(e) => handleFilePick(e.target.files)}
                  />

                  {totalUserAttachmentBytes > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                      {formatFileSize(totalUserAttachmentBytes)} / {formatFileSize(MAX_TOTAL_ATTACHMENT_BYTES)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

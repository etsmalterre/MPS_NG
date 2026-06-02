# PDF Generation & Email Send

## PDF generation

Server-side PDF rendering for documents (`Bon de commande` shipped, `Devis` / `Facture` / `Bon de livraison` slot in next).

- **Library**: `@react-pdf/renderer` (pure Node, no Chromium). Lato fonts (Light/Regular/Bold/Black) bundled in `apps/api/src/assets/fonts/`. Logo bundled in `apps/api/src/assets/logo-malterre-wide.png`.
- **Reusable base**: `apps/api/src/lib/pdf/MalterreDocument.tsx` — every MPS PDF wraps content in this. Provides yellow Malterre header band (`#EFA633`) with logo + document title block (top-right, white text), thin dark-blue separator, content area, footer band with horizontal tricolore stripe + legal info.
- **Specific docs**: `apps/api/src/lib/pdf/CommandeFournisseurPdf.tsx` — line items table (framed, rounded), totals box, conditions de paiement metadata card, optional commentaire card, Adresse de Livraison card. Uses the reusable `AddressCard` and `MetadataCard` exported from `MalterreDocument.tsx` (which also exports inline icon SVGs: `MailIcon`, `CreditCardIcon`, `CalendarIcon`, `ClockIcon`, `TruckIcon`, `FactoryIcon`, `HashIcon`, `MapPinIcon`, `MessageSquareIcon`).
- **Endpoint**: `GET /api/commandes-fil/:id/pdf` — fetches the commande detail, renders via `renderToBuffer`, streams as `application/pdf` inline. The frontend Print button calls `window.open(${API_URL}/commandes-fil/${id}/pdf, '_blank')`.
- **Theme**: `apps/api/src/lib/pdf/theme.ts` — gold `#EFA633`, French blue `#002395`, plus `bgCream`, `bgFlagWhite`, etc. Company info (legal name, address, SIRET, TVA, capital, RCS, payment notice) lives here too.
- **Iframe-embedding requirement (mandatory for any PDF endpoint)**: helmet's default headers block cross-origin iframe embedding. In dev, web runs on `localhost:5174` and API on `localhost:3002` — different origins, so every PDF endpoint used by the `SendEmailDialog` viewer MUST strip the three restrictive headers before sending the buffer:
  ```ts
  res.removeHeader('X-Frame-Options')          // was SAMEORIGIN
  res.removeHeader('Content-Security-Policy')  // had frame-ancestors 'self'
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')  // was same-origin
  ```
  This is already applied in `commandes-fil.ts` `GET /:id/pdf`. Any new document screen that adds a PDF endpoint consumed by the email dialog must do the same, or the right-pane iframe will silently fall back to the empty state. Referenced in `mps_designer §21`.

### Critical gotchas

- **`Font.register` needs file path strings, not Buffers** — `tsx watch` + ESM hoists imports before `dotenv.config()`, so any auth/font loading that depends on env vars must read them lazily.
- **`textTransform: 'uppercase'` strips accents** in `@react-pdf/renderer` — pre-uppercase strings (`'RÉFÉRENCE'`) instead of relying on the CSS transform.
- **Stacking `<Text>` with very different font sizes overlaps** — wrap each in its own `<View>` with `width: '100%'` to force clean stacking.
- **`<Page paddingBottom>` is respected by the wrap engine; inner `<View paddingBottom>` is not** — for absolute footers, set padding on the Page so flow content stops before the footer area.
- **`textTransform` accent stripping affects every label** — the canonical pattern is to pre-uppercase strings + drop the `textTransform` style. See `MalterreDocument.tsx`.

### Pagination & page numbers (`MalterreDocument` `secondPage` / sst stock section)

Hard-won footguns from wiring "Page X/Y" + the multi-page stock section (commits `3ac2c3d`, `ce74df6`). See memory `project_reactpdf_pagenumber_lineheight.md`.

- **Never put `lineHeight` on the `Page` style.** It's inherited by the `fixed`+`render` page-number `Text`, whose layout-time content is empty (text comes from `render` at paint time); the box then stretches to full page height and the text paints off-screen behind the header — i.e. page numbers silently don't render. Put `lineHeight` on the body containers (`content` / `contentLean`) instead. Overriding `lineHeight` on the Text itself does NOT fix it.
- **An absolute `Text` with only `right` (no `left`/width) collapses to a zero-width box** and never paints. Use both `left` + `right` + `textAlign: 'right'` (mirrors the footer).
- **`wrap={false}` blocks spill a phantom/near-empty page when they end within ~25-30pt of the page-height boundary** — not just on true overflow. Symptoms seen: the stock-section title orphaned alone on a page with the first piece table bumped to the next; blank trailing pages after short lists; the front-page totals card on its own sparse page. Fixes: tighten content (piece-table rows use `paddingVertical: 4` + per-row `lineHeight: 1.2`, not the inherited 1.45 body leading — the biggest space lever); keep the page's bottom reserve modest (`paddingBottom: 80`, clears the ~66pt footer + page-number line); never bottom-pin a `wrap={false}` block with a `flexGrow` spacer or `marginTop: 'auto'` (let it flow). Test the boundary case: a single-line order with ~10-16 pieces.
- **`secondPage.withHeader` continuation pages need `paddingTop = HEADER_HEIGHT + ~10`** (`HEADER_PAGE_PADDING_TOP`), else flow content butts directly against the repeated branded header on every physical overflow page.
- **Rasterizing a PDF to verify output**: no poppler on the box. Use the pure-JS `pdf-to-img` + `sharp` from a temp dir (`npm i` outside the workspace — `workspace:*` refs break in-repo installs). Harness: `apps/api/src/scripts/dump-sst-pdf.ts <id>`.

## Email send (Gmail API via domain-wide delegation)

Document-centric screens (bons de commande shipped; devis / facture / BL / expédition to follow) send email from within the app using a single Google service account with domain-wide delegation — no per-user OAuth flow. Full pattern documented in `.claude/skills/mps_designer/SKILL.md` §32.

- **GCP setup (one-time, already in place)**: project **MPS-Desktop**, service account **OAuth_Sender** (`oauth-sender@mps-desktop.iam.gserviceaccount.com`), domain-wide delegation authorised in Google Workspace Admin Console (Client ID `106332337770635660405`) for scope `https://www.googleapis.com/auth/gmail.send`. The service account has no mailbox — every send specifies the impersonated subject.
- **Env var**: `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` in `apps/api/.env.{development,production}` — absolute path to the JSON key. Read lazily inside `gmail.ts` because dotenv runs inside `index.ts` and ESM imports hoist before `dotenv.config()`. Key file lives in `apps/api/secrets/` locally (gitignored via `secrets/` rule) and `/home/debian/mps_api/secrets/oauth-sender.json` on the prod API server.
- **Lib**: `apps/api/src/lib/gmail.ts` exports `sendMail({ from, fromName, to, cc, bcc, subject, body, attachments })`. Builds an RFC 2822 multipart/mixed MIME message manually (text part + base64-wrapped attachments), base64url-encodes it, and sends via `google.gmail('v1').users.messages.send()`. One `JWT` instance cached per impersonated email (`clientCache`) so each user's access token is reused. MIME encoded-word for non-ASCII headers via `encodeHeader`.
- **User → email mapping**: `apps/api/src/lib/user-emails.ts` + `apps/api/data/user-emails.json` (gitignored). JSON-file backed, mirrors `permissions.ts` shape. ⚠️ **TODO migration**: move to a real DB column on `utilisateur` (or a dedicated table) once the data migration phase completes.
- **Admin routes**: `apps/api/src/routes/user-emails.ts` — `GET /me` (current user's mapped email), admin-gated `GET /users` (every deduped user + email) and `PUT /users/:id` (set/clear one user's email with regex validation).
- **Per-document endpoints** (template to follow for every document screen):
  - `GET /:id/email-defaults` returns `{ recipients: { selected, suggestions }, subject, body, ...contextFields }`. `selected` = contacts whose relevant `envoi_*` flag = 1 (or `est_defaut` = 1 for entreprises, which have no `envoi_*` flags). `suggestions` = remaining visible contacts with a valid email. Each recipient is `{ email, name?, source: 'contact', contactId }`. Filter: `est_visible != 0`, email passes `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, deduped lowercase. Display names built from `prenom + nom`.
  - `POST /:id/email` body: `{ to: string[], cc?: string[], subject, body, attach_pdf?: boolean, extra_attachments?: [{ filename, content_base64, content_type }] }`. Validates via Zod, looks up the acting user's mapped email (400 `no_sender_email` with user-facing French message if missing), re-renders the server PDF via the shared helper (if `attach_pdf !== false`), decodes each `extra_attachments[].content_base64` to a Buffer, merges both into one `attachments` array, and calls `sendMail`. From header is formatted as `"Prénom Nom — ETS Malterre" <email>` using `utilisateur.prenom + nom`.
  - **Express body limit**: `apps/api/src/index.ts` sets `express.json({ limit: '25mb' })` — required because user-uploaded attachments travel inline as base64. Gmail's hard ceiling per message is 25 MB raw, and base64 inflates by ~33 %, so the frontend caps total user-attachment bytes at 18 MB via `MAX_TOTAL_ATTACHMENT_BYTES` in `apps/web/src/lib/email.ts`.
- **PDF helper refactor (mandatory pattern)**: every document type that gains email endpoints must split its PDF rendering into `buildXxxPdfData(id)` + `renderXxxPdfBuffer(data)` helpers so both `/pdf` and `/email` reuse the same pipeline. See `commandes-fil.ts` for the reference.
- **Shared frontend dialog**: `apps/web/src/components/email/SendEmailDialog.tsx` is the single reusable component used by every email button in the app. Replaces the earlier per-screen-fork pattern (`EmailCommandeDialog` etc.) — deleted April 2026 once there were 2 call sites and a third (sous-traitants/client docs) on the way. Props:
  ```ts
  interface SendEmailDialogProps {
    open: boolean
    onClose: () => void
    contextLabel?: string              // shown in header, e.g. fournisseur name
    queryKey: readonly unknown[]       // react-query cache key for defaults fetch
    loadDefaults: () => Promise<EmailDefaults>
    onSend: (payload: SendPayload) => Promise<void>
    pdfUrl?: string                    // optional; if omitted the right pane shows empty state
    pdfAttachmentLabel?: string        // filename-like label for the server PDF chip
  }
  ```
  Layout: `max-w-6xl w-[92vw] h-[85vh]`, two-pane 50/50 split inside `flex p-0`. **Left pane** (form): column with À chip picker (selected chips + suggestion chips + manual entry regex-validated), Cc text, Objet, Message textarea. Top three blocks are `flex-shrink-0`, the Message is `flex-1 min-h-0 resize-none` so it fills the remaining vertical space anchored to the left-pane footer. Footer holds the error/success banners and the Annuler/Envoyer buttons — Envoyer uses the default (blue) variant per `mps_designer §12`, NOT gold. **Right pane**: viewer area (flex-1) + attachment strip (flex-shrink-0, `bg-white/70`, leading `Paperclip` icon).
- **Attachment strip UX**: the strip shows clickable pills — (1) the server-rendered PDF chip when `pdfUrl` is set and still included, (2) one pill per user-uploaded file, (3) a dashed `+ Ajouter un fichier` button that opens a hidden multi-file `<input type="file">`. Clicking a pill body calls `selectPreview(id)` which sets `previewedId`, and the viewer switches to render that file. Clicking the inner ✕ removes the attachment (server PDF: `setAttachPdf(false)`; user file: `URL.revokeObjectURL` + filter) and falls through the preview to the next remaining attachment → server PDF → null. Active pill has `border-accent ring-2 ring-accent/60` (gold ring). Pills are `<div role="button">` because HTML forbids nested `<button>`s — the inner ✕ uses `stopPropagation()`.
- **Viewer render kinds** (tagged union resolved by an `activePreview` `useMemo`): `server-pdf` / `user-pdf` → `<iframe src={url + '#view=FitH'}>`; `user-image` → centered `<img object-contain>`; `user-unsupported` (anything that isn't `application/pdf` or `image/*`) → `FileText h-12 w-12 opacity-30` + "Aperçu non disponible pour ce type de fichier" + filename; `empty` → default empty state.
- **User attachment state** (internal to the dialog): `UserAttachment[] = { id, file, blobUrl }` where `id = ${Date.now()}-${random}` and `blobUrl = URL.createObjectURL(file)`. Blob URLs are revoked on remove AND on dialog close cleanup — the close effect `setUserAttachments(prev => { prev.forEach(a => URL.revokeObjectURL(a.blobUrl)); return [] })`. Public `SendPayload.userAttachments` is plain `File[]` — `handleSend` calls `userAttachments.map(a => a.file)` before handing off.
- **`postEmail` helper** in `apps/web/src/lib/email.ts` wraps raw `fetch` (NOT `apiFetch`) because `apiFetch` discards the response body on non-2xx, and we need the server's French `no_sender_email` message surfaced to the user in the error banner. Serializes user files to base64 via a binary-safe chunked `Uint8Array` → `btoa` loop, packages them as `extra_attachments: [{ filename, content_base64, content_type }]`, and sends.
- **Admin UI for the mapping**: `SettingsUtilisateurs.tsx` has an `EmailEditor` card above the permission list — draft state, client-side regex check, Enregistrer disabled when the draft equals the persisted value or is invalid. Non-admins don't see Settings at all.
- **Contact flag → document map**: `envoi_commande` → commande_fil, `envoi_facture` → facture, `envoi_bl` → bon de livraison, `envoi_soumission` → devis. Entreprise contacts have NO `envoi_*` flag — the entreprise endpoint splits by `est_defaut=1` instead.

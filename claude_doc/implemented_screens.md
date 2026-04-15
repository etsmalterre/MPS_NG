# Implemented Screens

Canonical reference screens. When adding a feature to any data screen, grep these files first — the pattern almost certainly already exists.

## Entreprises (`/reseau/entreprises`)

First fully implemented data screen. 3-panel layout with:
- **Left**: Searchable enterprise list, "Nouveau" button in footer (edit mode only)
- **Center**: Company header (name, competence badges, @ email button, Modifier button), notes card, competences card, recommandations card
- **Detail API**: `GET /api/entreprises/:id` returns enterprise + adresses + contacts + competences + recommandations
- **CRUD endpoints**: Full CRUD for all sub-entities under `/api/entreprises/:id/{contacts,adresses,competences,recommandations}`
- **Email endpoints** (no PDF — entreprise has no document type): `GET /:id/email-defaults` splits contacts by `est_defaut=1` (→ `recipients.selected`) vs rest (→ `recipients.suggestions`) — entreprise contacts have no `envoi_*` flag, unlike fournisseur contacts. `POST /:id/email` uses the same shared `sendMail` helper with no attachments by default, but accepts `extra_attachments` for user-uploaded files. Wired to the shared `SendEmailDialog` with no `pdfUrl` so the right pane shows the empty state until the user attaches something.
- **Edit mode**: Inline forms, hover-reveal edit/delete, labeled inputs
- **HFSQL tables**: `entreprise`, `adresse`, `contact`, `competence`, `entreprise_competence`, `recommandation`

## Fournisseurs (`/fournisseurs/gestion`)

**Gold-standard reference** for all future data screens. The `mps_designer` skill (`.claude/skills/mps_designer/SKILL.md`) documents every pattern from this screen. Supplier management screen, 3-panel layout with:
- **Left**: Searchable supplier list (Factory icon, name only, no phone/fax in cards)
- **Center**: Supplier header (name, Modifier button), collapsible certificats card (clickable: view mode opens PDF viewer, edit mode opens edit dialog with document upload), collapsible references de fil card (BobineIcon, grouped by base ref with Bio/Recycle badges), collapsible commandes card (order lines with ref/coloris/qty/price, total weight/price summary)
- **Right sidebar**: 3 tabs — Info (commentaire), Contacts (with envoi_bl/facture/commande/soumission flags), Adresses (with facturation/livraison default flags)
- **Detail API**: `GET /api/fournisseurs/:id` returns fournisseur + adresses + contacts + refsFil + certificats (with `has_fichier`, `IDtype_doc`) + commandes (with lignes)
- **Certificat endpoints**: `GET /fournisseurs/certificats/:certId/fichier` (serves PDF blob with MIME detection), `PUT /fournisseurs/certificats/:certId` (multipart update), `POST /fournisseurs/:id/certificats` (multipart create), `DELETE /fournisseurs/certificats/:certId`, `GET /fournisseurs/type-doc` (document type list)
- **CRUD endpoints**: Full CRUD for fournisseurs + sub-entity CRUD under `/api/fournisseurs/:id/{contacts,adresses}`
- **Edit mode**: Inline forms for contacts/adresses, commentaire editable in Info tab, certificate edit dialog with document viewer/upload
- **HFSQL tables**: `fournisseur`, `adresse`, `contact`, `colori_fil`, `ref_fil`, `certificat`, `type_doc`, `commande_fil`, `ref_fil_commande`

## Fournisseurs Commandes (`/fournisseurs/commandes`)

**Reference for the in-screen contained drawer pattern** (mps_designer §31). Bons de commande fournisseurs management screen, 3-panel layout with:
- **Left**: Searchable commandes list with delivery-urgency left edge (red = past/missing date, amber = within 3 days, none = normal). Selection ring + hover ring use the same urgency color or zinc-400 for normal.
- **Center**: Header (N°/fournisseur, Print + Email gold + **Modifier (gold)** buttons), commande lignes section. Click a line in view mode → in-screen drawer slides up below shrunk lines list (40%) and fills the bottom 60%, listing linked + available stock_fil lots for that ref/colori/fournisseur. Drawer click-to-toggle. Auto-closes when entering edit mode.
- **Right sidebar**: 4 tabs — Info, Adresses, **Docs** (placeholder), Journal — with `StatusFooter` at the bottom (solid colored bar: blue "En cours" / green "Terminée" with toggle button).
- **Detail API**: `GET /api/commandes-fil/:id` returns commande + adresses + lignes (with `nb_lots_lies`/`total_kg_lie` aggregates from stock_fil)
- **Stock linkage endpoints**: `GET /commandes-fil/:cId/lignes/:lId/stock`, `PUT .../stock/:stockId` (link), `DELETE .../stock/:stockId` (unlink) — strict ref/colori/fournisseur matching, single-FK `stock_fil.IDref_fil_commande`
- **PDF endpoint**: `GET /api/commandes-fil/:id/pdf` — see `claude_doc/pdf_email.md`. Endpoint strips `X-Frame-Options` / `Content-Security-Policy` and sets `Cross-Origin-Resource-Policy: cross-origin` so the shared `SendEmailDialog` iframe can embed it across origins in dev.
- **Email endpoints**: `GET /api/commandes-fil/:id/email-defaults` returns the shared `EmailDefaults` shape `{ recipients: { selected, suggestions }, subject, body, fournisseurNom, numero }` — selected = `envoi_commande=1` contacts with `"Prénom Nom"` display names, suggestions = every other visible contact with a valid email. `POST /api/commandes-fil/:id/email` body `{ to, cc?, subject, body, attach_pdf?, extra_attachments? }` sends impersonating the acting user; `extra_attachments` is base64-decoded and merged with the server-rendered PDF. PDF generation refactored into shared `buildCommandePdfData` + `renderCommandePdfBuffer` helpers consumed by both `/pdf` and `/email`. **This is also the reference screen for the shared `SendEmailDialog` (mps_designer §32 / `claude_doc/pdf_email.md`)** — the old per-screen `EmailCommandeDialog` fork was replaced with `<SendEmailDialog pdfUrl={...} pdfAttachmentLabel="commande-fournisseur-${id}.pdf" />` wired via `postEmail`.
- **HFSQL tables**: `commande_fil`, `ref_fil_commande`, `stock_fil` (linkage), `mode_paiement`, `echeance`, `adresse`, `fournisseur`

## Fournisseurs Stock (`/fournisseurs/stock`)

**Reference for table-centric screens** — first screen in MPS_NG that does NOT use `MasterDetailLayout`. Mirrors the legacy `FEN_Stock_fil.wdw` window. Layout:
- **Toolbar** (top): full-width search input + "Masquer les lots terminés" toggle pinned right (default ON)
- **Table** (fills remaining height): rounded card with split header/body — header is a non-scrolling `<table>`, body is a separate `<table>` inside an `overflow-auto` div, both share the same `colgroup` with explicit percentage widths via `table-layout: fixed`. Sortable columns: Référence, Coloris, Lot interne, Lot fournisseur, Fournisseur, Stock (kg), Stock initial, Emplacement, Date entrée. Trailing icons: Bio (Leaf), Recyclé (Recycle), T (terminé).
- **Right slide-in drawer** (`fixed right-0 top-14 bottom-0 w-[440px]`): opens on row click, contains Stock / Provenance / Stockage / Notes / Certificats cards. Modifier/Annuler/Enregistrer buttons sit in the top-right of the drawer header (no separate close X). Edit-mode whitelist: `commentaire`, `observation_freinte`, `emplacement`, `niveau`, `terminé`, `controlé`, `dernier_pointage`.
- **Drawer dismissal**: click outside drawer (closes), click same row again (toggles), click another row (switches). Implemented via document `mousedown` listener that ignores clicks inside the drawer ref or on `tr[data-stock-row]`.
- **API endpoints** (in `apps/api/src/routes/stock.ts`):
  - `GET /api/stock/fil?fournisseur=<id>&termine=all&q=<text>` — list with joined display columns
  - `GET /api/stock/fil/:id` — single row + `has_certif_bio` / `has_certif_recycle` flags
  - `PATCH /api/stock/fil/:id` — whitelisted-field update
  - `GET /api/stock/fil/:id/certif/:type` — serves bio/recycle blob with MIME detection (same pattern as fournisseurs cert serving)
- **Accented columns (platform-specific SQL)**: see `claude_doc/hfsql_odbc.md § Accented column names`. The route has a `repairAliased()` helper that runs targeted `CONVERT(col USING 'UTF-8')` on aliased text fields when U+FFFD is detected.
- **HFSQL tables**: `stock_fil`, `ref_fil`, `colori_fil`, `fournisseur`

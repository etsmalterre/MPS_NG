# MPS Next Generation

## Project Overview

MPS_NG is the next-generation ERP system for **ETS Malterre**, a French textile/knitting manufacturing company (bonnetterie/tricotage). This project migrates the legacy WinDev/HFSQL application to a modern web-based solution.

> **Note**: `MPS_NG` is a temporary name used during the migration period. Once the legacy WinDev app is fully migrated, this project will be renamed to simply **MPS**.

## Company Context

- **Company**: ETS Malterre
- **Industry**: Textile manufacturing (bonnetterie/tricotage - knitting)
- **Location**: France
- **Website**: https://etsmalterre.fr
- **Owner**: Vincent Malterre

## Branding

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary Blue** | #143D6B | Sidebar, navigation, headers |
| **Vivid Gold** | #F2B80A | CTAs, highlights, active states |
| **Accent Blue** | #3B7DC9 | Links, alternative accent |

See `.claude/skills/mps_designer/SKILL.md` for complete design system documentation.

## Legacy System

The original MPS is a WinDev-based ERP:
- **Location**: `C:\Mes Projets\MPS\`
- **IDE**: WinDev (PCSoft)
- **Database**: HFSQL (HyperFileSQL)
- **Language**: French (UI and code)
- **Scale**: 204 tables, 318 windows

## Project Phases

### Phase 1: UI Shell (Complete)
Create the user interface without data:
- Navigation structure
- Dashboard placeholder
- Page placeholders for all routes
- MPS branding (gold/navy color scheme)

### Phase 2: Database (Architecture Decided)
Connect the new web app directly to HFSQL via ODBC:
- **Decision**: Web app connects to HFSQL directly — no PostgreSQL migration needed during transition
- **Reason**: PostgreSQL migration caused column casing issues between the native connector (quoted mixed-case) and manual SQL queries (unquoted). HFSQL ODBC avoids this entirely.
- **POC validated**: Node.js → ODBC → HFSQL Client/Server works (2026-03-25)
- **Connection**: `DRIVER={HFSQL};Server Name=localhost;Server Port=4900;Database=MPS;UID=Admin;PWD=;`
- WinDev app stays on HFSQL as-is — both apps share the same live data
- PostgreSQL migration scripts remain in `data_migration/` for reference

### Phase 3: Features (Future)
Implement features screen by screen:
- Match functionality of legacy WinDev application
- Modern UX improvements where appropriate
- Maintain familiarity for existing users

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript 5.7 |
| Build | Vite 6 |
| Styling | Tailwind CSS 3.4 |
| UI Components | Radix primitives (shadcn-style) |
| Icons | Lucide React |
| State | TanStack React Query 5 |
| Monorepo | pnpm + Turborepo |
| Testing | Vitest |
| API | Express |
| Database | HFSQL Client/Server (via ODBC) |
| DB Client | odbc (npm package) |
| Auth | Cookie-based (HMAC-signed, no JWT lib) — `cookie-parser` |
| PDF | `@react-pdf/renderer` (server-side, Lato fonts bundled) |

## Project Structure

```
MPS_NG/
├── apps/
│   ├── api/           # Express API server
│   │   ├── data/      # Runtime JSON data (gitignored) — currently permissions.json
│   │   └── src/
│   │       ├── assets/
│   │       │   ├── logo-malterre.png       # Gold-bg script logo (PDF use)
│   │       │   ├── logo-malterre-wide.png  # Wide horizontal logo (PDF header)
│   │       │   └── fonts/                  # Lato Light/Regular/Bold/Black TTFs (PDF)
│   │       ├── lib/
│   │       │   ├── hfsql.ts                # HFSQL ODBC connection singleton + encoding fix
│   │       │   ├── auth.ts                 # HMAC cookie sign/verify, attachUser middleware, requireAdmin, isEffectiveAdmin
│   │       │   ├── permissions.ts          # JSON-file-backed per-user permissions (TODO: migrate to DB)
│   │       │   ├── permission-keys.ts      # Catalog of permission keys (e.g. create_stock_fil)
│   │       │   └── pdf/
│   │       │       ├── theme.ts            # PDF colors (gold #EFA633, French blue, etc.)
│   │       │       ├── MalterreDocument.tsx       # Reusable doc frame: yellow header, flag stripe, footer
│   │       │       └── CommandeFournisseurPdf.tsx # Bon de commande layout
│   │       ├── routes/
│   │       │   ├── entreprises.ts # Full CRUD: entreprises, contacts, adresses, competences, recommandations
│   │       │   ├── fournisseurs.ts # Full CRUD: fournisseurs, contacts, adresses + yarn refs, certificates, commandes
│   │       │   ├── stock.ts        # Yarn stock list/detail/patch + per-lot bio/recycle certificate blobs (gated: create_stock_fil)
│   │       │   ├── commandes-fil.ts # Commandes fournisseurs CRUD + PDF endpoint + stock-link sub-routes + delivery-line aggregates
│   │       │   ├── auth.ts         # /users (deduped picker list), /me, /login, /logout (admin cookie persistence)
│   │       │   └── permissions.ts  # /me, /keys, admin /users + PUT /users/:id (per-user permissions)
│   │       └── index.ts
│   └── web/           # React frontend
│       ├── src/
│       │   ├── components/
│       │   │   ├── auth/      # UserPickerGate, UserPicker (fullscreen first-visit picker)
│       │   │   ├── icons/     # Custom SVG icon components (BobineIcon)
│       │   │   ├── layout/    # AppShell, Sidebar, Header, MobileNav, MasterDetailLayout
│       │   │   ├── shared/    # PagePlaceholder, etc.
│       │   │   └── ui/        # Radix-based components (Button has 'gold' variant)
│       │   ├── config/
│       │   │   └── navigation.ts          # SubMenuItem.adminOnly flag for admin-only entries
│       │   ├── contexts/
│       │   │   ├── UserContext.tsx        # Cookie auth: useUser, login/logout, canSwitchUser
│       │   │   └── PermissionsContext.tsx # usePermissions, useHasPermission (effective-admin bypass)
│       │   ├── hooks/
│       │   │   └── useResponsiveLayout.ts  # Responsive 3-panel layout (full/compact/stacked)
│       │   ├── lib/
│       │   │   ├── api.ts    # SHARED apiFetch with credentials: 'include' — DO NOT duplicate per page
│       │   │   ├── utils.ts
│       │   │   ├── dates.ts  # HFSQL date helpers (formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql)
│       │   │   └── format.ts # fmtNum (French number formatting with space separator)
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Entreprises.tsx        # First real data screen with edit mode
│       │   │   ├── Fournisseurs.tsx       # Supplier management with yarn refs & certificates
│       │   │   ├── FournisseursStock.tsx  # Yarn stock — table-centric layout (gated: create_stock_fil)
│       │   │   ├── FournisseursCommandes.tsx # Bons de commande with in-screen drawer + PDF print
│       │   │   └── SettingsUtilisateurs.tsx  # Admin-only per-user permissions editor
│       │   ├── main.tsx                   # QueryClient → UserProvider → PermissionsProvider → UserPickerGate → RouterProvider
│       │   ├── router.tsx
│       │   └── index.css
│       ├── tailwind.config.js
│       └── vite.config.ts
├── data_migration/    # Legacy PostgreSQL migration scripts (reference)
├── packages/
│   ├── shared/        # Shared types/utilities
│   └── db/            # Database connection (PostgreSQL — legacy, unused)
├── .claude/
│   └── skills/
│       ├── mps_designer/
│       │   └── SKILL.md    # Complete design system (colors, layout, components, patterns)
│       └── terminate_mps/
│           └── SKILL.md    # Session termination: update CLAUDE.md, commit, push
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── CLAUDE.md
```

## Navigation Structure

### Main Sections

1. **Tableau de bord** (`/`) - Dashboard
2. **Clients** (`/clients`)
   - Commandes (`/clients/commandes`)
   - Devis (`/clients/devis`)
   - Facturation (`/clients/facturation`)
   - Gestion (`/clients/gestion`)
3. **Fournisseurs** (`/fournisseurs`)
   - Références (`/fournisseurs/references`)
   - Stock (`/fournisseurs/stock`) — **table-centric screen, see Implemented Screens**
   - Commandes (`/fournisseurs/commandes`)
   - Gestion (`/fournisseurs/gestion`)
   - Prévisions (`/fournisseurs/previsions`)
4. **Sous-traitants** (`/sous-traitants`)
   - Commandes (`/sous-traitants/commandes`)
   - Gestion (`/sous-traitants/gestion`)
5. **Production** (`/production`)
   - Tricotage (`/production/tricotage`)
   - Teinture (`/production/teinture`)
   - Confection (`/production/confection`)
   - Contrôle qualité (`/production/controle-qualite`)
6. **Stock** (`/stock`)
   - Matières premières (`/stock/matieres-premieres`)
   - Produits finis (`/stock/produits-finis`)
   - Mouvements (`/stock/mouvements`)
7. **Produits** (`/produits`)
   - Références (`/produits/references`)
   - Coloris (`/produits/coloris`)
8. **Transport** (`/transport`)
   - Expéditions (`/transport/expeditions`)
   - Livraisons (`/transport/livraisons`)
9. **Réseau** (`/reseau`)
   - Entreprises (`/reseau/entreprises`) — **first implemented data screen**
10. **Paramètres** (`/settings`)
    - Utilisateurs (`/settings/utilisateurs`) — **admin-only**, per-user permission editor

## HFSQL ODBC Connection (Web App → HFSQL)

The MPS_NG web app connects to the HFSQL server via ODBC:
- **Driver**: `HFSQL` (installed from `C:\PC SOFT\WINDEV Suite 2026\Install\ODBC\WX310PACKODBC.exe`)
- **Connection string**: `DRIVER={HFSQL};Server Name=localhost;Server Port=4900;Database=MPS;UID=Admin;PWD=;`
- **npm package**: `odbc`
- **ODBC connection helper**: `apps/api/src/lib/hfsql.ts` — singleton connection, `query()` wrapper, `queryRaw()` (preserves binary ArrayBuffers), `fixEncoding()`, `closeConnection()`, `getConnection()`
- **Known issues**:
  - Accented table names cause "fichier de données est déjà décrit" error — avoid accents in HFSQL table names
  - HFSQL backup folders with accented file names trigger the same error — delete backups before connecting
  - Empty memo fields return as `\x00` — cleaned automatically by `query()` in hfsql.ts
  - BigInt fields return with `n` suffix — converted to Number automatically by `query()`
  - **Encoding**: HFSQL ODBC driver corrupts accented characters (é→U+FFFD). Fix: use `fixEncoding()` which calls `CONVERT(field USING 'UTF-8')` per-row for affected fields. Returns ArrayBuffer decoded as UTF-8.
  - **No parameterized queries**: `?` placeholders cause "SQLGetDescribeParam non supportée" error. Use string interpolation with `esc()` (single-quote doubling) for strings, `parseInt` for IDs. For binary blobs, use hex literals: `x'${buffer.toString('hex')}'`.
  - **No `RETURNING *`**: HFSQL SQL doesn't support it. Use follow-up SELECT after INSERT/UPDATE.
  - **Booleans as numbers**: HFSQL returns `0`/`1` not `true`/`false`. In React, always use `!!value &&` to avoid rendering `0` as text.
  - **BinMemo `IS NOT NULL`**: Unreliable for checking if a document is attached — empty blobs pass the check. For file-serving endpoints, return 404 if the buffer is empty. For UI, use a HEAD pre-check before rendering iframes.
  - **Accented column names through bridge — PLATFORM-SPECIFIC SQL REQUIRED**: The Linux iODBC bridge (`wd310hfo64.so`) completely **rejects any accented identifier token** in the SQL text — `sf.terminé`, `rf.recyclé`, `[terminé]`, `"terminé"`, UTF-8 bytes, Latin-1 bytes, `SELECT terminé AS x`, `UPDATE ... SET terminé = 0`, `WHERE terminé = 0` — all fail with tokenizer errors like `sf file not found in FROM statement` or `Unexpected word`. The HFSQL SQL parser on Linux simply cannot handle é/è/à/ç/etc. inside an identifier. Meanwhile the **Windows ODBC driver** has the opposite problem: it silently returns zero rows when a JOIN uses `alias.*` expansion. So the two paths need different SQL:
    - **Linux path**: `SELECT sf.*` — the bridge returns accented columns with their last char truncated (`terminé→termin`, `controlé→control`, `certif_recyclé→certif_recycl`, `recyclé→recycl`). Filter/update via non-accented fields only; any predicate or SET on an accented column must be done in JS or skipped.
    - **Windows path**: list every column explicitly with `alias.terminé AS termine` style aliases — `alias.*` in a JOIN returns nothing.
    - **Both paths**: post-process rows via a normaliser that maps both shapes to the same ASCII keys (`termine`/`controle`/`recycle`) so the HTTP response is platform-agnostic.
    - **Source of truth**: `apps/api/src/routes/stock.ts` has the canonical pattern, branching on `process.platform === 'win32'` via an `IS_WINDOWS` constant. The route also fetches `ref_fil.recyclé` via a separate `SELECT * FROM ref_fil` call and joins it in JS, since neither platform can reference that column explicitly.
    - **PATCH/UPDATE**: `UPDATE stock_fil SET terminé = …` works on Windows but not on Linux. stock.ts' PATCH silently skips those fields on Linux and returns a descriptive error if the user tries to set only those fields.
  - **Bridge binary blob support**: The C bridge (`hfsql_bridge`) outputs binary columns as base64 with `"b64:"` prefix. `hfsql-bridge.ts` has two decoders: `cleanRow()` decodes b64 to **UTF-8 strings** (used by `query()` for normal text/CONVERT results), while `cleanRowRaw()` decodes b64 to **raw Buffers** (used by `queryRaw()` for binary blob retrieval like PDFs). Without this split, JSON-serialized Buffers become `{type:"Buffer",data:[...]}` objects that crash React with error #31. To recompile the bridge: `gcc -o hfsql_bridge src/hfsql_bridge.c -I/usr/include/iodbc -liodbc -liodbcinst`
  - **Bridge auto-reconnect**: The bridge process holds a single ODBC connection that can die after long idle periods. `query()` and `queryRaw()` detect connection-lost errors (state `[01000]`, "Connection reset by peer", etc.), kill the bridge, and retry once — no manual restart needed.

## WinDev ↔ PostgreSQL Connection (Legacy Reference)

> **Note**: PostgreSQL migration was attempted but abandoned due to column casing issues. Kept for reference.

- **Native PostgreSQL Connector**: column casing mismatch between native connector (quoted mixed-case) and manual SQL (unquoted)
- **Bulk migration scripts**: `data_migration/scripts/bulk_migrate.txt` — migrates all 204 HFSQL tables to PostgreSQL
- **Skipped tables** (cross-server HFSQL FK constraints): `lst_prev`, `lst_info_sal_annee`, `lst_lissage`, `lst_message`

## Conventions

- **"check last screenshot"** → read the latest file in `C:\Users\vince\Pictures\Screenshots`

## Development Guidelines

### Language
- **Code**: English
- **UI**: French (to match existing ERP)
- **Comments**: English

### Design System

**CRITICAL — read before any UI/UX work**: Before building or modifying any user-facing screen, component, button, tab, card, dialog, or interaction pattern, you MUST invoke the `mps_designer` skill via the Skill tool (`Skill(skill: "mps_designer")`). This is not optional. The skill encodes every UI/UX convention the project has accumulated — colors, layouts, detail-header button trios, placeholder dialogs, drawer patterns, deadline indicators, status footers, etc. — and new additions must conform to it, not reinvent it.

**Invoke the skill when**:
- Building a new screen or page
- Adding a button, tab, card, section, badge, or dialog to an existing screen
- Touching anything the user describes in visual / interaction terms ("add a print button", "make it red", "slide a drawer in", "show a tab for X")
- Deciding on a color, icon, font size, spacing value, or component shape
- The user says something like "should we…", "make it look…", or "how should I display…"

**Before inventing a pattern, grep the gold-standard reference screens first**:
- `apps/web/src/pages/Entreprises.tsx` — first data screen, canonical MasterDetail + edit mode
- `apps/web/src/pages/Fournisseurs.tsx` — gold-standard for every data-screen pattern (see §2 of the skill)
- `apps/web/src/pages/FournisseursStock.tsx` — canonical table-centric screen
- `apps/web/src/pages/FournisseursCommandes.tsx` — canonical in-screen drawer + deadline indicator

If the user asks for something like "add a print button" or "add an email action", always `Grep` for the same action verb across these files **before** writing new code. Existing screens almost always have the pattern — use the exact same icon, the exact same strings, the exact same dialog structure. Do not invent.

**Core visual language** (the skill has the full list):
- Vivid Gold accent (`#F2B80A`), not orange
- Medium-dark Blue primary (`#143D6B`), not dark navy
- Premium card styles with gold borders
- Icon boxes with gradient backgrounds
- **Panel backgrounds**: `bg-zinc-100/80` for list/sidebar panels, `bg-zinc-200/50` for header/footer areas, `bg-white` for item cards
- **Scrollbar**: Use `scrollbar-transparent` class on scrollable panel areas
- **Never hardcode color hex values** — use Tailwind CSS variable classes (`text-accent`, `bg-primary`, `border-gold/30`) so colors are consistent and themeable

### Typography

**Fonts** (loaded via `@import` in `index.css`):
- **Anton**: Display font for headings (`font-heading`)
- **Lato**: Body text (`font-sans`)

**Important**: Do NOT add `<link>` tags for Google Fonts in `index.html` - use CSS `@import` only.

**Heading pattern**:
```tsx
<h1 className="text-3xl font-heading font-bold tracking-tight">Title</h1>
```

**Header gradient**:
```tsx
className="bg-gradient-to-r from-gold/40 via-gold/15 to-transparent"
```

### Stale .js Build Artifacts (Resolved)

Previously, `apps/web/src/` contained compiled `.js` files alongside `.tsx` source — Vite picked `.js` before `.tsx`, serving stale code. **Fixed**: all stale `.js`/`.js.map`/`.d.ts`/`.d.ts.map` files deleted; `.gitignore` now blocks `apps/web/src/**/*.js` etc. If stale `.js` files reappear (e.g. from an accidental `tsc -b` via `pnpm --filter @mps/web build`), delete them — they will cause production builds to use outdated code.

**Important**: Running vite caches the resolved file extension in its module graph. If `tsc -b` creates `.js` files mid-session, vite will resolve `import { X } from '@/pages/X'` to `X.js` and keep that resolution even after the `.js` file is deleted — leading to a 404 white screen on next reload. **Fix**: kill the vite dev process and restart it (deleting `node_modules/.vite` is not enough). Symptom: console shows `Failed to load resource: 404` for a `*.js` file under `/src/pages/`.

### React Component Rules

- **Hooks before early returns**: All `useState`, `useMutation`, `useMemo`, `useQuery` calls must come before any conditional `return`. React requires stable hook order across renders — violating this causes "Rendered more hooks" crashes in production builds (minified error #310).
- **Service Worker**: The PWA service worker has a `navigateFallbackDenylist` for `/api/`. Never remove this — without it, the SW intercepts iframe/fetch navigations to `/api/` and serves `index.html`, causing React Router 404 errors.
- **Shared `apiFetch`**: All fetch calls go through `apps/web/src/lib/api.ts` (sets `credentials: 'include'` for cookie auth). NEVER duplicate `apiFetch` per page file — the cookie won't be sent if `credentials: 'include'` is missing.
- **Modifier button**: The view-mode "Modifier" button on every detail screen MUST use `<Button variant="gold">`. The gold CTA is the canonical "enter edit mode" affordance — never `variant="outline"` or `variant="default"`. Documented in mps_designer §6.1 + §12.

### Screen Layout Pattern (MasterDetailLayout)

New data screens should use the 3-panel `MasterDetailLayout` component (`apps/web/src/components/layout/MasterDetailLayout.tsx`):
- **Left panel** (`w-72`): Searchable list with selection
- **Center**: Detail header + main content area
- **Right panel** (`w-96`): Sidebar with tabs (e.g. contacts, adresses)
- Responsive: full (1400px+), compact (1240-1400px, sidebar as drawer), stacked (<1240px)

### Edit Mode Pattern

Follow the Entreprises screen pattern for edit mode:
- `isEditing` state toggle via "Modifier" button → "Annuler" / "Enregistrer"
- **Visual indicator**: `border-l-4 border-l-accent/70 bg-accent/[0.03]` on editable cards
- **Header**: Gold "Mode edition" badge, name becomes input field
- **Forms**: Only shown on demand (click "+" to add), not always visible
- **Hover-reveal actions**: `opacity-0 group-hover:opacity-100` for edit/delete buttons
- **Labeled inputs**: Use `LabeledInput` component (label above field)
- **InlineForm wrapper**: Shared component with uppercase gold title, save/cancel buttons
- **View cards**: `bg-zinc-100/80 rounded-lg border border-border/60` for section items (certificats, refs, commandes, recommandations)

### Related Project

MPS_NG follows the architecture of **MFProd_NG** (`C:\dev\mfprod\mfprod_erp`):
- Same tech stack
- Same layout patterns (MasterDetailLayout, edit mode, sidebar tabs)
- Different branding (gold vs orange)
- Different business domain (textile vs fencing)

### Sidebar Logo

- **Expanded**: `public/logo-full.png` (Malterre full logo, `h-10 mx-auto`)
- **Collapsed**: `public/logo-small.png` (Malterre icon, `h-8 mx-auto`)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Dev Ports

| Service | Port | Notes |
|---------|------|-------|
| MPS_NG API | 3002 | Set in `apps/api/.env.development` |
| MPS_NG Web | 5175 | Vite (5173 and 5174 taken by MFProd) |
| MFProd API | 8080 | Separate project, do not conflict |
| MFProd Web | 5173 | Separate project |

## Reference Documentation

Detailed docs are in `claude_doc/` — load only when needed:

| File | Description |
|------|-------------|
| `legacy_tables.md` | All 204 HFSQL tables with fields, organized by domain |
| `legacy_windows.md` | All 319 windows + 49 reports, organized by functional area |
| `navigation_mapping.md` | Legacy windows → new MPS_NG routes mapping |
| `business_glossary.md` | Complete domain vocabulary, production flow, business terms |

## Implemented Screens

### Entreprises (`/reseau/entreprises`)
First fully implemented data screen. 3-panel layout with:
- **Left**: Searchable enterprise list, "Nouveau" button in footer (edit mode only)
- **Center**: Company header (name, competence badges, @ email button, Modifier button), notes card, competences card, recommandations card
- **Detail API**: `GET /api/entreprises/:id` returns enterprise + adresses + contacts + competences + recommandations
- **CRUD endpoints**: Full CRUD for all sub-entities under `/api/entreprises/:id/{contacts,adresses,competences,recommandations}`
- **Edit mode**: Inline forms, hover-reveal edit/delete, labeled inputs
- **HFSQL tables**: `entreprise`, `adresse`, `contact`, `competence`, `entreprise_competence`, `recommandation`

### Fournisseurs (`/fournisseurs/gestion`)
**Gold-standard reference** for all future data screens. The mps_designer skill (`.claude/skills/mps_designer/SKILL.md`) documents every pattern from this screen. Supplier management screen, 3-panel layout with:
- **Left**: Searchable supplier list (Factory icon, name only, no phone/fax in cards)
- **Center**: Supplier header (name, Modifier button), collapsible certificats card (clickable: view mode opens PDF viewer, edit mode opens edit dialog with document upload), collapsible references de fil card (BobineIcon, grouped by base ref with Bio/Recycle badges), collapsible commandes card (order lines with ref/coloris/qty/price, total weight/price summary)
- **Right sidebar**: 3 tabs — Info (commentaire), Contacts (with envoi_bl/facture/commande/soumission flags), Adresses (with facturation/livraison default flags)
- **Detail API**: `GET /api/fournisseurs/:id` returns fournisseur + adresses + contacts + refsFil + certificats (with `has_fichier`, `IDtype_doc`) + commandes (with lignes)
- **Certificat endpoints**: `GET /fournisseurs/certificats/:certId/fichier` (serves PDF blob with MIME detection), `PUT /fournisseurs/certificats/:certId` (multipart update), `POST /fournisseurs/:id/certificats` (multipart create), `DELETE /fournisseurs/certificats/:certId`, `GET /fournisseurs/type-doc` (document type list)
- **CRUD endpoints**: Full CRUD for fournisseurs + sub-entity CRUD under `/api/fournisseurs/:id/{contacts,adresses}`
- **Edit mode**: Inline forms for contacts/adresses, commentaire editable in Info tab, certificate edit dialog with document viewer/upload
- **HFSQL tables**: `fournisseur`, `adresse`, `contact`, `colori_fil`, `ref_fil`, `certificat`, `type_doc`, `commande_fil`, `ref_fil_commande`

### Fournisseurs Commandes (`/fournisseurs/commandes`)
**Reference for the in-screen contained drawer pattern** (mps_designer §31). Bons de commande fournisseurs management screen, 3-panel layout with:
- **Left**: Searchable commandes list with delivery-urgency left edge (red = past/missing date, amber = within 3 days, none = normal). Selection ring + hover ring use the same urgency color or zinc-400 for normal.
- **Center**: Header (N°/fournisseur, Print + Email gold + **Modifier (gold)** buttons), commande lignes section. Click a line in view mode → in-screen drawer slides up below shrunk lines list (40%) and fills the bottom 60%, listing linked + available stock_fil lots for that ref/colori/fournisseur. Drawer click-to-toggle. Auto-closes when entering edit mode.
- **Right sidebar**: 4 tabs — Info, Adresses, **Docs** (placeholder), Journal — with `StatusFooter` at the bottom (solid colored bar: blue "En cours" / green "Terminée" with toggle button).
- **Detail API**: `GET /api/commandes-fil/:id` returns commande + adresses + lignes (with `nb_lots_lies`/`total_kg_lie` aggregates from stock_fil)
- **Stock linkage endpoints**: `GET /commandes-fil/:cId/lignes/:lId/stock`, `PUT .../stock/:stockId` (link), `DELETE .../stock/:stockId` (unlink) — strict ref/colori/fournisseur matching, single-FK `stock_fil.IDref_fil_commande`
- **PDF endpoint**: `GET /api/commandes-fil/:id/pdf` — see "PDF generation" section below
- **HFSQL tables**: `commande_fil`, `ref_fil_commande`, `stock_fil` (linkage), `mode_paiement`, `echeance`, `adresse`, `fournisseur`

### Fournisseurs Stock (`/fournisseurs/stock`)
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
- **Accented columns (platform-specific SQL)**: Linux uses `SELECT sf.*` and accepts the truncated column names (`termin`/`control`/`certif_recycl`), Windows uses explicit `alias.terminé AS termine` aliases. Both paths are post-processed by `normalizeStockRow()` to the same ASCII keys. See the "Accented column names through bridge" note above for the full picture. The route also has a `repairAliased()` helper that runs targeted `CONVERT(col USING 'UTF-8')` on aliased text fields when U+FFFD is detected.
- **HFSQL tables**: `stock_fil`, `ref_fil`, `colori_fil`, `fournisseur`

## Authentication (cookie-based picker)

Replaces the legacy WinDev hostname → user lookup. Browsers cannot read the client hostname, so we use a **fullscreen first-visit picker** that lists every user from `utilisateur` (deduped by `(prenom, nom)` to one tile per person) and stores the picked `IDutilisateur` in a signed HttpOnly cookie. Subsequent visits are zero-click.

- **Cookie helpers**: `apps/api/src/lib/auth.ts` — `signUserId`, `verifyUserCookie`, `attachUser()` middleware (best-effort: attaches `req.userId` and `req.adminId`, never 401s), `requireAdmin(req, res)` route guard, `isEffectiveAdmin(req)` helper, `isAdminUtilisateur(u)` (currently hardcoded to Vincent Malterre).
- **Cookies**: `mps_uid` (current acting user) + `mps_uid_admin` (original admin user — persists across switches so an admin can always switch back). Both signed with HMAC-SHA256 + `AUTH_COOKIE_SECRET` (env var, required at runtime; lazy-read because ESM imports hoist before `dotenv.config()`).
- **Routes**: `apps/api/src/routes/auth.ts` — `GET /api/auth/users` (deduped picker list, public), `GET /api/auth/me` (current user + `isAdmin` flag), `POST /api/auth/login` (sets both cookies; admin cookie persists if already present, else established only when picked user is admin), `POST /api/auth/logout` (clears `mps_uid` only, **preserves `mps_uid_admin`** so admins return to admin mode after the next pick).
- **Frontend context**: `apps/web/src/contexts/UserContext.tsx` — `useUser()` hook + `canSwitchUser(user)` helper (checks `user.isAdmin === true`).
- **First-visit picker**: `apps/web/src/components/auth/UserPicker.tsx` — fullscreen takeover with the gold Malterre header. `UserPickerGate` mounts inside `main.tsx` between `UserProvider` and `RouterProvider`.
- **Sidebar/header**: User info + initials avatar lives in the **top-right header** popover (avatar uses `bg-gold` + `text-gold-foreground`). The sidebar has NO user chip. The avatar popover shows the name + a "Changer d'utilisateur" button **only when `canSwitchUser(user)` is true** (admin-only — Vincent).
- **Effective vs session admin**: `isAdmin` (session-level, admin cookie present) is true even when an admin impersonates another user — keeps the "Changer d'utilisateur" button visible. `isEffectiveAdmin` (`req.userId === req.adminId`) is **false during impersonation** — this is what gates permission bypasses, the Settings menu, and the `requireAdmin` middleware. Impersonation = "see exactly what they see".
- **CORS**: `index.ts` reads `CORS_ORIGIN` env var (comma-separated origin list), passes to `cors({ origin: [...], credentials: true })`. **Cannot be `*` with credentials.** Default dev = `http://localhost:5174`.
- **CRITICAL — shared `apiFetch`**: All web fetch calls MUST go through `apps/web/src/lib/api.ts` which sets `credentials: 'include'`. **Never duplicate `apiFetch` per page.** The shared helper has `<T = any>` so existing untyped call sites keep working.

## Permissions (per-user, JSON-backed)

Per-user action permissions managed from the admin-only **Settings → Utilisateurs** screen. **Default closed** — non-admins with no permission record cannot perform gated actions. **Effective admins (Vincent acting as himself, NOT impersonating)** bypass all checks automatically.

- **Storage**: `apps/api/data/permissions.json` (gitignored). Shape: `{ version: 1, users: { [IDutilisateur]: PermissionKey[] } }`. Created lazily on first write, cached in memory at module load, atomic writes via `.tmp` + rename.
- **⚠️ TODO migration**: Once the data migration phase is complete, move this to a real DB table. The plan + migration recipe live in the user's plan file (`zesty-singing-waterfall.md`) and `apps/api/src/lib/permissions.ts` has a `// TODO migration:` comment at the top.
- **Catalog**: `apps/api/src/lib/permission-keys.ts` exports `PERMISSION_KEYS = [{ key, label, description, category }]`. **Adding a new gated action requires 3 edits**: (1) append to `PERMISSION_KEYS`, (2) gate the API route via `userHasPermission(req.userId, isEffectiveAdmin(req), 'key')`, (3) hide the UI element via `useHasPermission('key')`.
- **Currently gated**: `create_stock_fil` only. The **`POST /api/stock/fil`** endpoint and the **"Nouveau" button** in `FournisseursStock.tsx` are both gated.
- **Lib helpers**: `apps/api/src/lib/permissions.ts` — `loadPermissions`, `getUserPermissions`, `setUserPermissions`, `userHasPermission(userId, isEffectiveAdmin, key)` (admin bypass inside), `getAllPermissions`.
- **Routes**: `apps/api/src/routes/permissions.ts` — `GET /me` (returns `{ isAdmin, isEffectiveAdmin, granted }`), `GET /keys` (catalog), `GET /users` (admin-only), `PUT /users/:id` (admin-only).
- **Frontend context**: `apps/web/src/contexts/PermissionsContext.tsx` — `usePermissions()` exposes `granted`, `isAdmin`, `isEffectiveAdmin`, `has(key)`, `refresh()`. `useHasPermission('key')` is the convenience hook for gated UI. **`has()` uses `isEffectiveAdmin` for bypass — admins who impersonate lose their bypass**, matching the "see as user X" UX.
- **Admin guard**: `requireAdmin` middleware checks `isEffectiveAdmin(req)` (NOT just `req.adminId !== undefined`). Sidebar `visibleSettings` filter and the `SettingsUtilisateurs` page guard both use `isEffectiveAdmin` from `usePermissions()` — when Vincent impersonates someone, the Settings menu vanishes and direct URL hits redirect to `/`.
- **adminOnly submenu flag**: `SubMenuItem.adminOnly?: boolean` in `apps/web/src/config/navigation.ts`. Sidebar filters them out when `!isEffectiveAdmin`. Settings menu hides entirely when no submenus remain.

## PDF generation

Server-side PDF rendering for documents (`Bon de commande` shipped, `Devis` / `Facture` / `Bon de livraison` slot in next).

- **Library**: `@react-pdf/renderer` (pure Node, no Chromium). Lato fonts (Light/Regular/Bold/Black) bundled in `apps/api/src/assets/fonts/`. Logo bundled in `apps/api/src/assets/logo-malterre-wide.png`.
- **Reusable base**: `apps/api/src/lib/pdf/MalterreDocument.tsx` — every MPS PDF wraps content in this. Provides yellow Malterre header band (`#EFA633`) with logo + document title block (top-right, white text), thin dark-blue separator, content area, footer band with horizontal tricolore stripe + legal info.
- **Specific docs**: `apps/api/src/lib/pdf/CommandeFournisseurPdf.tsx` — line items table (framed, rounded), totals box, conditions de paiement metadata card, optional commentaire card, Adresse de Livraison card. Uses the reusable `AddressCard` and `MetadataCard` exported from `MalterreDocument.tsx` (which also exports inline icon SVGs: `MailIcon`, `CreditCardIcon`, `CalendarIcon`, `ClockIcon`, `TruckIcon`, `FactoryIcon`, `HashIcon`, `MapPinIcon`, `MessageSquareIcon`).
- **Endpoint**: `GET /api/commandes-fil/:id/pdf` — fetches the commande detail, renders via `renderToBuffer`, streams as `application/pdf` inline. The frontend Print button calls `window.open(${API_URL}/commandes-fil/${id}/pdf, '_blank')`.
- **Theme**: `apps/api/src/lib/pdf/theme.ts` — gold `#EFA633`, French blue `#002395`, plus `bgCream`, `bgFlagWhite`, etc. Company info (legal name, address, SIRET, TVA, capital, RCS, payment notice) lives here too.
- **Critical gotchas**:
  - **`Font.register` needs file path strings, not Buffers** — `tsx watch` + ESM hoists imports before `dotenv.config()`, so any auth/font loading that depends on env vars must read them lazily.
  - **`textTransform: 'uppercase'` strips accents** in `@react-pdf/renderer` — pre-uppercase strings (`'RÉFÉRENCE'`) instead of relying on the CSS transform.
  - **Stacking `<Text>` with very different font sizes overlaps** — wrap each in its own `<View>` with `width: '100%'` to force clean stacking.
  - **`<Page paddingBottom>` is respected by the wrap engine; inner `<View paddingBottom>` is not** — for absolute footers, set padding on the Page so flow content stops before the footer area.
  - **`textTransform` accent stripping affects every label** — the canonical pattern is to pre-uppercase strings + drop the textTransform style. See `MalterreDocument.tsx`.

## Business Domain (Quick Reference)

Full glossary in `claude_doc/business_glossary.md`. Key terms:

| French | English |
|--------|---------|
| Bonnetterie | Hosiery/Knitwear |
| Tricotage | Knitting |
| Teinture | Dyeing |
| Confection | Assembly/Manufacturing |
| Matières premières | Raw materials |
| Produits finis | Finished goods |
| Commande | Order |
| Devis | Quotation |
| Facture | Invoice |
| Livraison | Delivery |
| Expédition | Shipment |
| Fournisseur | Supplier |
| Sous-traitant | Subcontractor |

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

## Project Structure

```
MPS_NG/
├── apps/
│   ├── api/           # Express API server
│   │   └── src/
│   │       ├── lib/
│   │       │   └── hfsql.ts       # HFSQL ODBC connection singleton + encoding fix
│   │       ├── routes/
│   │       │   ├── entreprises.ts # Full CRUD: entreprises, contacts, adresses, competences, recommandations
│   │       │   └── fournisseurs.ts # Full CRUD: fournisseurs, contacts, adresses + yarn refs, certificates, commandes
│   │       └── index.ts
│   └── web/           # React frontend
│       ├── src/
│       │   ├── components/
│       │   │   ├── icons/     # Custom SVG icon components (BobineIcon)
│       │   │   ├── layout/    # AppShell, Sidebar, Header, MobileNav, MasterDetailLayout
│       │   │   ├── shared/    # PagePlaceholder, etc.
│       │   │   └── ui/        # Radix-based components
│       │   ├── config/
│       │   │   └── navigation.ts
│       │   ├── hooks/
│       │   │   └── useResponsiveLayout.ts  # Responsive 3-panel layout (full/compact/stacked)
│       │   ├── lib/
│       │   │   └── utils.ts
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Entreprises.tsx  # First real data screen with edit mode
│       │   │   └── Fournisseurs.tsx # Supplier management with yarn refs & certificates
│       │   ├── main.tsx
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
   - Commandes (`/fournisseurs/commandes`)
   - Gestion (`/fournisseurs/gestion`)
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
10. **Paramètres** (`/parametres`)

## HFSQL ODBC Connection (Web App → HFSQL)

The MPS_NG web app connects to the HFSQL server via ODBC:
- **Driver**: `HFSQL` (installed from `C:\PC SOFT\WINDEV Suite 2026\Install\ODBC\WX310PACKODBC.exe`)
- **Connection string**: `DRIVER={HFSQL};Server Name=localhost;Server Port=4900;Database=MPS;UID=Admin;PWD=;`
- **npm package**: `odbc`
- **ODBC connection helper**: `apps/api/src/lib/hfsql.ts` — singleton connection, `query()` wrapper, `fixEncoding()`, `closeConnection()`
- **Known issues**:
  - Accented table names cause "fichier de données est déjà décrit" error — avoid accents in HFSQL table names
  - HFSQL backup folders with accented file names trigger the same error — delete backups before connecting
  - Empty memo fields return as `\x00` — cleaned automatically by `query()` in hfsql.ts
  - BigInt fields return with `n` suffix — converted to Number automatically by `query()`
  - **Encoding**: HFSQL ODBC driver corrupts accented characters (é→U+FFFD). Fix: use `fixEncoding()` which calls `CONVERT(field USING 'UTF-8')` per-row for affected fields. Returns ArrayBuffer decoded as UTF-8.
  - **No parameterized queries**: `?` placeholders cause "SQLGetDescribeParam non supportée" error. Use string interpolation with `esc()` (single-quote doubling) for strings, `parseInt` for IDs.
  - **No `RETURNING *`**: HFSQL SQL doesn't support it. Use follow-up SELECT after INSERT/UPDATE.
  - **Booleans as numbers**: HFSQL returns `0`/`1` not `true`/`false`. In React, always use `!!value &&` to avoid rendering `0` as text.

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
Follow the MPS design system defined in `.claude/skills/mps_designer/SKILL.md`:
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

### Stale .js Build Artifacts

The `apps/web/src/` directory contains compiled `.js` files alongside `.ts`/`.tsx` source files (caused by `tsconfig` with no `outDir`). **Vite picks up `.js` before `.tsx`**, so when modifying source files, the corresponding `.js` file must also be updated or Vite will serve stale code. This affects `router.js`, `navigation.js`, and other files.

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
Supplier management screen. 3-panel layout with:
- **Left**: Searchable supplier list (Factory icon, name only, no phone/fax in cards)
- **Center**: Supplier header (name, Modifier button), collapsible certificats card (validity badges), collapsible references de fil card (BobineIcon, grouped by base ref with Bio/Recycle badges and coloris), collapsible commandes card (order lines with ref/coloris/qty/price, status badges)
- **Right sidebar**: 3 tabs — Info (commentaire), Contacts (with envoi_bl/facture/commande/soumission flags), Adresses (with facturation/livraison default flags)
- **Detail API**: `GET /api/fournisseurs/:id` returns fournisseur + adresses + contacts + refsFil + certificats + commandes (with lignes)
- **CRUD endpoints**: Full CRUD for fournisseurs + sub-entity CRUD under `/api/fournisseurs/:id/{contacts,adresses}`
- **Edit mode**: Inline forms for contacts/adresses, commentaire editable in Info tab
- **HFSQL tables**: `fournisseur`, `adresse`, `contact`, `colori_fil`, `ref_fil`, `certificat`, `type_doc`, `commande_fil`, `ref_fil_commande`

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

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
| **Primary Navy** | #00243E | Sidebar, navigation, headers |
| **Accent Gold** | #E8AD33 | CTAs, highlights, active states |
| **Accent Blue** | #046BD2 | Links, alternative accent |
| **Secondary Gold** | #F1B439 | Hover states, warm accents |

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

### Phase 2: Database (POC Complete, In Progress)
Rebuild PostgreSQL database from legacy HFSQL:
- Schema design based on 204 legacy tables
- Data migration scripts
- Drizzle ORM schemas
- POC validated: `entreprise` table migrated, WinDev connected to PostgreSQL via native connector

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
| API | Express (placeholder) |
| ORM | Drizzle (Phase 2) |

## Project Structure

```
MPS_NG/
├── apps/
│   ├── api/           # Express API server
│   │   └── src/
│   │       └── index.ts
│   └── web/           # React frontend
│       ├── src/
│       │   ├── components/
│       │   │   ├── layout/    # AppShell, Sidebar, Header, MobileNav
│       │   │   ├── shared/    # PagePlaceholder, etc.
│       │   │   └── ui/        # Radix-based components
│       │   ├── config/
│       │   │   └── navigation.ts
│       │   ├── lib/
│       │   │   └── utils.ts
│       │   ├── pages/
│       │   │   └── Dashboard.tsx
│       │   ├── main.tsx
│       │   ├── router.tsx
│       │   └── index.css
│       ├── tailwind.config.js
│       └── vite.config.ts
├── packages/
│   ├── shared/        # Shared types/utilities
│   └── db/            # Drizzle schemas (Phase 2)
├── .claude/
│   └── skills/
│       └── mps_designer/
│           └── SKILL.md
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
9. **Paramètres** (`/parametres`)

## WinDev ↔ PostgreSQL Connection

The legacy WinDev app connects to the PostgreSQL dev database via the **Native PostgreSQL Connector**:
- **Connector DLLs**: `C:\PC SOFT\WINDEV Suite 2026\Programs\Framework\Win64x86\`
- **Client DLLs**: `libpq.dll` + dependencies from PostgreSQL 18 Windows x64 binaries
- **Connection**: `HDécritConnexion` + `HOuvreConnexion` (not `HChangeConnexion` — incompatible with native connector)
- **Port config**: Use `Server port=5435` in extended info ("Infos étendues")
- **Column casing**: PostgreSQL columns must use quoted mixed-case names to match WinDev analysis fields (e.g., `"IDentreprise"` not `identreprise`)

## Conventions

- **"check last screenshot"** → read the latest file in `C:\Users\vince\Pictures\Screenshots`

## Development Guidelines

### Language
- **Code**: English
- **UI**: French (to match existing ERP)
- **Comments**: English

### Design System
Follow the MPS design system defined in `.claude/skills/mps_designer/SKILL.md`:
- Gold accent color (not orange)
- Navy primary color
- Premium card styles with gold borders
- Icon boxes with gradient backgrounds

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

### Related Project

MPS_NG follows the architecture of **MFProd_NG** (`C:\dev\MFProd_NG`):
- Same tech stack
- Same layout patterns
- Different branding (gold vs orange)
- Different business domain (textile vs fencing)

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

## Reference Documentation

Detailed docs are in `claude_doc/` — load only when needed:

| File | Description |
|------|-------------|
| `legacy_tables.md` | All 204 HFSQL tables with fields, organized by domain |
| `legacy_windows.md` | All 319 windows + 49 reports, organized by functional area |
| `navigation_mapping.md` | Legacy windows → new MPS_NG routes mapping |
| `business_glossary.md` | Complete domain vocabulary, production flow, business terms |

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

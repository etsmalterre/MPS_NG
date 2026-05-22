# MPS Next Generation

## Project Overview

MPS_NG is the next-generation ERP system for **ETS Malterre**, a French textile/knitting manufacturing company (bonnetterie/tricotage). This project migrates the legacy WinDev/HFSQL application to a modern web-based solution.

> **Note**: `MPS_NG` is a temporary name used during the migration period. Once the legacy WinDev app is fully migrated, this project will be renamed to simply **MPS**.

- **Company**: ETS Malterre — https://etsmalterre.fr
- **Industry**: Textile manufacturing (bonnetterie/tricotage — knitting)
- **Owner**: Vincent Malterre
- **Legacy system**: `C:\Mes Projets\MPS\` — WinDev (PCSoft) + HFSQL, French UI, 204 tables, 318 windows

## Branding

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary Blue** | #143D6B | Sidebar, navigation, headers |
| **Vivid Gold** | #F2B80A | CTAs, highlights, active states |
| **Accent Blue** | #3B7DC9 | Links, alternative accent |

Full design system in `.claude/skills/mps_designer/SKILL.md`.

## Project Phases

- **Phase 1 — UI Shell**: complete.
- **Phase 2 — Database**: web app connects directly to HFSQL via ODBC. POC validated 2026-03-25. PostgreSQL migration was attempted and abandoned (column casing issues); legacy scripts remain in `data_migration/` for reference. WinDev app stays on HFSQL as-is — both apps share the same live data.
- **Phase 3 — Features**: match legacy WinDev functionality screen by screen.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript 5.7, Vite 6, Tailwind CSS 3.4 |
| UI | Radix primitives (shadcn-style), Lucide icons |
| State | TanStack React Query 5 |
| Monorepo | pnpm + Turborepo, Vitest |
| API | Express |
| Database | HFSQL Client/Server via `odbc` npm package |
| Auth | Cookie-based (HMAC-signed, no JWT lib) — `cookie-parser` |
| PDF | `@react-pdf/renderer` (server-side, Lato fonts bundled) |
| Email | Gmail API via `googleapis` + domain-wide delegation |

## Project Structure

```
MPS_NG/
├── apps/
│   ├── api/           # Express API
│   │   ├── data/      # Runtime JSON (gitignored): permissions.json, user-emails.json
│   │   ├── secrets/   # Gitignored: Google service account key
│   │   └── src/
│   │       ├── assets/           # fonts/, logo-malterre-wide.png (PDF)
│   │       ├── lib/
│   │       │   ├── hfsql.ts              # ODBC singleton, query(), queryRaw(), fixEncoding()
│   │       │   ├── auth.ts               # Cookie HMAC, attachUser, requireAdmin, isEffectiveAdmin
│   │       │   ├── permissions.ts        # JSON-backed per-user permissions (TODO: DB)
│   │       │   ├── permission-keys.ts    # PERMISSION_KEYS catalog
│   │       │   ├── user-emails.ts        # JSON-backed per-user emails (TODO: DB)
│   │       │   ├── gmail.ts              # Gmail API send helper (JWT + DWD)
│   │       │   ├── pricing-sst.ts        # Ennoblisseur auto-pricing (see HFSQL rules)
│   │       │   ├── pricing-trm.ts        # Tricoteur auto-pricing — PrixDeRevientTRM port
│   │       │   └── pdf/                  # theme.ts, MalterreDocument.tsx, CommandeFournisseurPdf, CommandeSoustraitantPdf, SoumissionLotPdf, DemandeEtudeColorisPdf, SoumissionPdf, FeuilleColorisPdf
│   │       ├── routes/                   # entreprises, fournisseurs, references-fil, stock, commandes-fil, commandes-sous-traitant, etudes-coloris, auth, permissions, user-emails
│   │       └── index.ts
│   └── web/           # React frontend
│       └── src/
│           ├── components/
│           │   ├── auth/         # UserPickerGate, UserPicker
│           │   ├── email/        # SendEmailDialog (shared two-pane send dialog)
│           │   ├── icons/        # BobineIcon, KnitIcon, FabricRollIcon, FiniRollIcon, TmRollIcon
│           │   ├── layout/       # AppShell, Sidebar, Header, MobileNav, MasterDetailLayout
│           │   └── ui/           # Radix-based (Button has 'gold' variant)
│           ├── config/navigation.ts      # SubMenuItem.adminOnly flag
│           ├── contexts/
│           │   ├── UserContext.tsx       # useUser, canSwitchUser
│           │   └── PermissionsContext.tsx # usePermissions, useHasPermission
│           ├── hooks/useResponsiveLayout.ts
│           ├── lib/
│           │   ├── api.ts        # SHARED apiFetch (credentials: 'include') — do NOT duplicate
│           │   ├── email.ts      # Types + postEmail helper for SendEmailDialog
│           │   ├── dates.ts      # HFSQL date helpers
│           │   └── format.ts     # fmtNum (French formatting)
│           ├── pages/            # Dashboard, Entreprises, FilsGestion, FilsReferences, FilsStock, FilsCommandes, SousTraitantsCommandes, EtudesColoris, SettingsUtilisateurs
│           ├── main.tsx          # QueryClient → UserProvider → PermissionsProvider → UserPickerGate → RouterProvider
│           └── router.tsx
├── claude_doc/                   # Detailed reference docs (load on demand, see below)
├── data_migration/               # Legacy PostgreSQL migration scripts (reference)
├── packages/                     # shared/, db/ (legacy PostgreSQL, unused)
├── .claude/skills/               # mps_designer/, terminate_mps/, mps_deploy/, ssh_context/
└── CLAUDE.md
```

## Navigation Structure

Mirrors the legacy WinDev main menu (top → bottom):

1. **Tableau de bord** (`/`)
2. **Marketing** — placeholder
3. **Clients** — Commandes, Devis, Facturation, Gestion
4. **Sous-traitants** — **Commandes** (ennoblisseur; see `sous_traitants_status_model.md`), Gestion
5. **Transferts** — placeholder
6. **Fils** (route `/fils/*`, renamed from `/fournisseurs/*`) — Références, Stock (table-centric), Commandes, Gestion, Prévisions
7. **Tombé Métier** — placeholder, custom `TmRollIcon`
8. **Finis** — Références, Stock, **Études coloris** (implemented), Tarifs, Coloris Teint, Prévisions — custom `FiniRollIcon`
9. **Divers** — placeholder
10. **Qualité** — placeholder
11. **Rapports** — placeholder
12. **Réseau** — Entreprises
13. **Paramètres** — Utilisateurs (**admin-only**: per-user permissions + per-user email for Gmail impersonation)

## Reference Documentation

Load these on demand when working on the matching topic:

| File | When to load |
|------|--------------|
| `claude_doc/hfsql_odbc.md` | HFSQL connection details, driver install, bridge, platform-specific SQL, accented columns |
| `claude_doc/implemented_screens.md` | Canonical reference screens (Entreprises, Fournisseurs, Commandes, Stock) — grep first before inventing patterns |
| `claude_doc/auth_permissions.md` | Cookie auth picker, effective vs session admin, permission catalog, admin guard |
| `claude_doc/pdf_email.md` | `@react-pdf/renderer` gotchas, Gmail DWD setup, per-document email endpoint pattern |
| `claude_doc/legacy_tables.md` | All 204 HFSQL tables with fields |
| `claude_doc/legacy_windows.md` | All 319 windows + 49 reports |
| `claude_doc/navigation_mapping.md` | Legacy windows → MPS_NG routes |
| `claude_doc/business_glossary.md` | Domain vocabulary, production flow |
| `claude_doc/sous_traitants_status_model.md` | Sst commandes computed-phase model, card urgency frames + pills, Soumission Lot Client flow, Historique tab, Reprise flow, type_doc codes |

## HFSQL rules (footguns — always apply)

Full details in `claude_doc/hfsql_odbc.md`. These are the non-negotiable rules for every route that touches HFSQL:

- **No parameterized queries**: `?` placeholders fail. Use string interpolation with `esc()` (single-quote doubling) for strings, `parseInt` for IDs, hex literals `x'${buffer.toString('hex')}'` for blobs.
- **No `RETURNING *`**: use follow-up `SELECT` after INSERT/UPDATE.
- **Booleans are `0`/`1`**: in React always `!!value &&` to avoid rendering `0` as text.
- **Accented identifiers are platform-specific**: Linux bridge rejects them entirely (use `sf.*` + ASCII-truncated column names); Windows silently returns 0 rows on `alias.*` in JOINs (use explicit `alias.terminé AS termine`). Branch on `process.platform === 'win32'` via `IS_WINDOWS`. Canonical pattern in `apps/api/src/routes/stock.ts`.
- **Encoding (reads)**: ODBC corrupts accents (é→U+FFFD). Use `fixEncoding()` / `CONVERT(field USING 'UTF-8')` per affected field.
- **Encoding (writes)**: raw multi-byte UTF-8 in a SQL string corrupts the Linux bridge pipeline (→ `[HY090]` / HFSQL "string without end" / 500). HFSQL text columns are Latin-1 natively — emit accented values as a hex literal of their Latin-1 bytes (`x'${Buffer.from(v,'latin1').toString('hex')}'`), not `'${esc(v)}'`; pure-ASCII values keep the normal quoted literal. Helper: `sqlText()` in `commandes-sous-traitant.ts`.
- **BinMemo `IS NOT NULL`**: unreliable — empty blobs pass. File-serving endpoints return 404 if buffer is empty; UI does HEAD pre-check before rendering iframes.
- **Polymorphic `ged` rows**: a single `ged` row can be linked to multiple parents at once (a GOTS cert is shared by the fournisseur / client / sous-traitant commandes in the same chain). The discriminator is `IDtype_doc`, **not** which `IDcommande_*` columns are zero. **Never** add an `IDcommande_<other> = 0` clause to scope a query to one parent type — that silently hides shared rows (e.g. an sst-doc whose parent commande also has a sibling client commande filled in). Whitelist by `IDtype_doc` instead. Per-screen whitelists live in the route files (`commandes-fil.ts`, `commandes-sous-traitant.ts`).
- **Avoid accents in HFSQL table names and in HFSQL backup folder file names** — both cause "fichier de données est déjà décrit" errors at connection time.
- **Fournisseur ↔ coloris lives in `asso_colorisfil_frs`, NOT `colori_fil.IDfournisseur`**: `colori_fil` is the global catalog (ref_fil, coloris-reference); one coloris can be sold by many fournisseurs via the M:N join `asso_colorisfil_frs (IDfournisseur, IDcolori_fil)`. The legacy `colori_fil.IDfournisseur` is misleading — never read or write it. Pattern in `references-fil.ts` / `fournisseurs.ts`.
- **JOIN + `CONVERT()` collapses result sets**: `SELECT a.col, CONVERT(b.text USING 'UTF-8') FROM a JOIN b WHERE …` returns **one row** instead of all matches. Split into two flat queries and merge in JS. Same shape kills `CONVERT(tel)` even single-table when `tel` is empty on some rows — read phone-like cols raw. Reference: `commandes-sous-traitant.ts` `/lookups/sous-traitants`.
- **Reserved-word column `type` returns uppercased**: `SELECT lcs.type FROM ligne_commande_sous_traitant lcs` returns the column key as `TYPE` in the result row, not `type`. Always alias: `lcs.type AS type_kind`. Affected anywhere a `type` column exists (e.g. `ligne_commande_sous_traitant`, `ligne_commande_client`).
- **Polymorphic `IDreference` on `ligne_commande_sous_traitant`** (same numeric ID can exist in 3 catalogs): ALWAYS route by `type` SMALLINT (alias `type_kind`). Line stores the **output** the sst produces, NOT the input: `2 → ref_fini`, `1 → ref_ecru` (tricoteur — yarn inputs via `composition_ecru WHERE IDref_ecru = …`), `0 → ref_ecru`. Matching `IDColoris`: `type=2 → ref_fini_colori`, `type=1 → colori_ecru`, `type=0 → colori_ecru`. Reference `resolveRef` in `commandes-sous-traitant.ts`. Memory [[project-sst-line-polymorphic]] has the legacy commande 8582 evidence.
- **`IDColoris` on fini stock is `ref_fini_colori`, NOT `colori_fini`**: `colori_fini` is a junction (`IDcolori_fini`, `IDgamme_coloris`, `IDcolori_ecru`, `IDref_fini_colori`) with NO `IDColoris` column and NO `reference` column. The actual fini-coloris catalog is `ref_fini_colori` (PK `IDref_fini_colori`, label `reference`, FK `IDref_fini`) — that's what `stock_fini.IDColoris` and `ligne_commande_sous_traitant.IDColoris` reference for fini lines.
- **Sous-traitant `commentaire` / `journal` are RTF**: read via `stripRtf()`, write via `wrapRtf()` (`rtf-utils.ts`) so the legacy WinDev app keeps reading. Plain-text round-trip — formatting lost on first MPS_NG edit.
- **Ennoblisseur lines (sst, `type=2`)**: `quantite=Ml`, `prix=€/Kg` — never multiply directly; € total = `Σ(stock_ecru.poids) × prix`. `prix` auto-computed by `pricing-sst.ts` (`recalcLignePrix` on every écru link/unlink; ports legacy `CalculTarifSST` with MATEL/ESAT rendement multipliers). Out-of-catalog ssts keep manual entry — `auto_pricing_enabled` gates the lock. Breakdown: `GET /:cId/lignes/:lId/prix-breakdown`. Algo in memory `project_pricing_calcultarifsst.md`.
- **Tricoteur lines (sst, `type=1`)**: `quantite=kg` (output écru), `prix=€/Kg`, € total = `qty × prix` (knowable up front). `prix` auto-computed by `pricing-trm.ts` `trmLinePrix` (POST/PUT line + "Finir le lot X") = `max(PrixDeRevientTRM(IDref_ecru, qty) / 0.7, ref_ecru.prix)`. Cost model in `tarif_TRM` (50 params) + `ref_ecru_machine` (per-machine cycles). Yarn affectations: `asso_fil_lignecmdsst (IDstock_fil, IDligne_commande_sous_traitant, quantite)`. Gate on `line.type=1` — ALL tricoteurs, not TRM-only. Memory `project_pricing_prixderevient_trm.md`.
- **ETM↔TRM cross-ledger bridge** (TRM = Tricotage Malterre, IDsous_traitant=1, IDsociete=2): auto-mirrors tricoteur sst as TRM `commande_client` with `IDcommande_ETM` / `IDligne_commande_ETM` back-pointers. **Only** fires for IDsous_traitant=1; external tricoteurs (37, 10, 66) get NO mirror. TRM-side rolls surface via `stock_ecru.IDref_commande_source`. DELETE refused (409) when a mirror exists. Gate via `isTricotageMalterreSst(sstId)`. Memory `project_etm_trm_bridge.md`.
- **`defaut_qualite` polymorphic via `Type_Reference` + `reference`**: integer discriminator (1=piece_production, 2=stock_ecru) with the parent id stringified in `reference` (varchar-typed FK). Écru defects: `WHERE Type_Reference = 2 AND reference IN ('id1','id2',...)`. Coexists with `stock_ecru.second_choix` + `observations` — rendered together in the red `RollNotes` banner. Pattern in `commandes-sous-traitant.ts` `fetchPiecesPayload`.
- **`envoi_email.IDreference` is polymorphic by `IDtype_doc`**: `13/15` → `commande_sous_traitant`, `14` → `expedition`, `27` → étude soumission. **Never** query without an `IDtype_doc IN (...)` whitelist — sst and expedition IDs collide. Sst-soumission convention: `IDtype_doc=15`, `notes=lot id`. Detail in `claude_doc/sous_traitants_status_model.md`.

**Connection**: `DRIVER={HFSQL};Server Name=localhost;Server Port=4900;Database=MPS;UID=Admin;PWD=;`

## React / frontend rules

- **Hooks before early returns**: all `use*` hooks must come before any conditional `return` — violating this crashes production builds (minified React error #310).
- **Shared `apiFetch`**: all fetch calls go through `apps/web/src/lib/api.ts` (sets `credentials: 'include'` for cookie auth). **Never duplicate per page** — the cookie won't be sent without `credentials: 'include'`.
- **SW denylist for `/api/`**: the PWA SW has `navigateFallbackDenylist` for `/api/`. Never remove — without it, the SW intercepts `/api/` navigations and serves `index.html`, breaking React Router.
- **Modifier button = `variant="gold"`**: the view-mode "Modifier" CTA on every detail screen MUST use `<Button variant="gold">`. Never `outline` or `default`. Canonical "enter edit mode" affordance.
- **Stale `.js` build artifacts**: `apps/web/src/**/*.js` is gitignored. If an accidental `tsc -b` creates `.js` alongside `.tsx`, Vite resolves the `.js` first and serves stale code — delete the files AND restart the Vite dev process (deleting `node_modules/.vite` is not enough). Symptom: `404` on a `*.js` file under `/src/pages/`.
- **Boolean rendering**: because HFSQL returns `0`/`1`, always `!!value && <JSX/>` — bare `value && …` renders `0` as text.

## Design system rule

**Before building or modifying any user-facing screen, component, button, tab, card, dialog, or interaction pattern, you MUST invoke the `mps_designer` skill via the Skill tool (`Skill(skill: "mps_designer")`).** This is not optional. The skill encodes every UI/UX convention — colors, layouts, detail-header button trios, placeholder dialogs, drawer patterns, deadline indicators, status footers, etc.

**Invoke the skill when**: building a new screen; adding a button/tab/card/dialog to an existing screen; touching anything the user describes in visual terms ("add a print button", "make it red", "slide a drawer in"); deciding a color/icon/size/spacing/shape.

**Before inventing a pattern, grep the gold-standard reference screens**: `Entreprises.tsx`, `FilsGestion.tsx`, `FilsStock.tsx`, `FilsCommandes.tsx`, `EtudesColoris.tsx`. Existing screens almost always have the pattern — use the exact same icon, strings, and dialog structure. See `claude_doc/implemented_screens.md` for what each reference covers.

**Core visual language**: panel backgrounds `bg-zinc-100/80` (list/sidebar) / `bg-zinc-200/50` (header/footer) / `bg-white` (cards), `scrollbar-transparent` on scrollable panels. **Never hardcode hex values** — use Tailwind CSS variable classes (`text-accent`, `bg-primary`, `border-gold/30`). Colors in §Branding above.

**Typography**: OS system stack via `system-ui`. Both `font-sans` and `font-heading` resolve to the same stack. **No web fonts are loaded** — no `@import`, no `<link>`, no `@font-face`. Heading pattern: `<h1 className="text-3xl font-heading font-bold tracking-tight">`. Header gradient: `bg-gradient-to-r from-gold/40 via-gold/15 to-transparent`. **Do not re-add Google Fonts `@import`** — earlier Anton/Lato attempts were silently broken; see `mps_designer §2`.

**Edit mode pattern** (follow `Entreprises.tsx`): `isEditing` toggle, gold "Mode edition" badge, `border-l-4 border-l-accent/70 bg-accent/[0.03]` on editable cards, hover-reveal actions (`opacity-0 group-hover:opacity-100`), `LabeledInput` + `InlineForm` components.

**Layout**: 3-panel `MasterDetailLayout` for master-detail screens (left `w-72`, right `w-96`, responsive full/compact/stacked). Table-centric screens do NOT use `MasterDetailLayout` — see `FilsStock.tsx`.

**Status management**: user-controlled primary state goes to the **sidebar footer pill** (not a header badge), regardless of how many values it can take. Binary → split toggle button (`FilsCommandes`); 3+ values → menu button + popover (`EtudesColoris`). See `mps_designer §29`.

**"+ Nouveau" button**: at the bottom of every master-detail left list, visible **only in view mode** (`{!isEditing && ...}`). Click either inline-creates a placeholder row (Entreprises, FilsGestion, FilsReferences) or opens a small initial-data modal (FilsCommandes, EtudesColoris) — pick based on whether the row needs real data up front. After save: `setSelectedId(newId)` + auto-enter edit mode. `FilsStock` is exempt (table layout, header button, permission-gated). See `mps_designer §5`.

**Sidebar logo**: `public/logo-full.png` (expanded, `h-10 mx-auto`) / `public/logo-small.png` (collapsed, `h-8 mx-auto`).

## Conventions

- **Code**: English. **UI**: French. **Comments**: English.
- **"check last screenshot"** → read the latest file in `C:\Users\vince\Pictures\Screenshots`
- **Related project**: MPS_NG follows the architecture of **MFProd_NG** (`C:\dev\mfprod\mfprod_erp`) — same tech stack, same layout patterns, different branding (gold vs orange) and domain (textile vs fencing).

## Quick Start

```bash
pnpm install
pnpm dev          # start dev servers
pnpm build        # build all packages
pnpm test         # run tests
```

### First-time setup on a new Windows machine

The factory PC has everything pre-installed; on a fresh machine you also need:

1. **HFSQL Client/Server** running on `localhost:4900` with the `MPS` database.
2. **HFSQL ODBC driver** — install once via `C:\PC SOFT\WINDEV Suite <year>\Install\ODBC\WX310PACKODBC.exe` (admin required). Without this, the API throws ODBC `IM002` ("Source de données introuvable") on every query and the user picker shows "Impossible de charger la liste".
3. **`apps/api/.env.development`** with at minimum `PORT=3002`, `CORS_ORIGIN=http://localhost:5174`, `AUTH_COOKIE_SECRET=<32-byte hex>`, `HFSQL_CONNECTION_STRING=DRIVER={HFSQL};Server Name=localhost;Server Port=4900;Database=MPS;UID=Admin;PWD=;`. Gitignored. Gmail send/draft is disabled until `apps/api/secrets/<service-account>.json` exists and `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` points at it.

### Dev Ports

| Service | Port | Notes |
|---------|------|-------|
| MPS_NG API | 3002 | Set in `apps/api/.env.development` |
| MPS_NG Web | 5175 | Vite (5173/5174 taken by MFProd) |
| MFProd API | 8080 | Separate project |
| MFProd Web | 5173 | Separate project |

## Business Domain (Quick Reference)

Full glossary in `claude_doc/business_glossary.md`.

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

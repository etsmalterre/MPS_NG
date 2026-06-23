# Worktree merge log

Newest first. `/feature-complete` prepends one entry per screen it lands on `master`, so
other worktrees see what changed when they rebase. Format:

```
## <date> — feat/<name>
<one-paragraph note: what the screen does / what changed>
```

<!-- entries below -->

## 2026-06-23 — feat/ref-tm
Tombé Métier › Références (`apps/web/src/pages/TombeMetierReferences.tsx` + `apps/api/src/routes/references-ecru.ts`) refinements + a new **Coût de tricotage** breakdown. **Jauge/Diamètre** are stored as 1-based ordinals indexing legacy combos (`gtaJauge`: 2→14, 3→18, 4→20, 5→28, no unit — needles/inch; `gtaDiametreMachine`: 2→26", 3→30") — both now display the real value and edit via dropdowns (the raw ordinal is never shown; ordinal 1/`-1`/0 = unset). **Search** is multi-criteria (space-separated AND across reference, désignation, contexture, jauge, diamètre — list endpoint now returns `Jauge`/`diametre`); the footer count tracks the filtered list. Identification header subtitle falls back to contexture when no désignation; Composition/Coloris cards collapse by default per selection. **"+ Nouveau"** auto-generates the next free 3-digit zero-padded reference server-side; duplicate references are rejected on rename (409); fixed the create-selection race (new card stays selected + scrolls into view) and stale-detail-after-delete. **Safeguards**: composition must total 100 % to leave edit mode (empty allowed); the composition AND five fabric-defining header fields (contexture, jauge, diamètre, bio, recyclé) are **frozen** once rolls (`stock_ecru`) or tricoteur orders (`ligne_commande_sous_traitant` type 0/1) exist — UI locks + backend 409/silent-keep; a coloris can't be deleted while affected to a roll, order, or its own composition (per-coloris in-use flags drive a greyed lock affordance + 409 guard). Statistiques gained "Rouleaux créés" + "Poids total" (Σ `stock_ecru.poids`); "Réglages par métier" "+" now opens a modal (`MachineFormDialog`); "Tombé du métier" is a Rouleaux/Plis dropdown. **Coût de tricotage**: refactored `apps/api/src/lib/pricing-trm.ts` to expose `prixDeRevientTRMDetail()` (full per-component breakdown — Frais de structure / Frais de production / Main d'œuvre — with `prixDeRevientTRM`/`trmLinePrix` as thin wrappers, line pricing byte-identical, regression `test-prix-revient-trm.ts` still 9/10); new `GET /api/references-ecru/:id/cout-tricotage?qty=` (default 1000) + a sidebar card and read-only modal with an editable debounced quantity, the three sections, subtotals, and the totals chain (coût → prix de vente ×1/0.7 → prix plancher → prix retenu).

## 2026-06-23 — feat/stock-ecru
Tombé Métier › Stock — new table-centric screen (`apps/web/src/pages/TombeMetierStock.tsx` +
`apps/api/src/routes/stock-ecru.ts`, mounted at `/api/stock`; the `router.tsx` placeholder was
replaced). Mirrors finis/stock: split sortable table, single fuzzy search, status filter,
multi-select edit mode, right slide-in drawer edit, batch edit ("Édition groupée"), cut-roll, and
Nouveau create. **Data/semantics**: `stock_ecru` (écru/tombé-de-métier fabric rolls). The "in
stock" base population every view operates on = `IDsociete=1` (ETM only — TRM rolls belong to the
sister company) AND `IDligne_expedition_ETM=0` (not shipped out) AND no `stock_fini` child (not yet
dyed/consumed into a finished roll) — this bounds ~52k historical rows to the ~1.5k live working
set, without which "Tous" would time out hydrating. Status filter = Disponible
(`IDref_commande_affectation=0`) / En teinture (`>0`) / Tous, plus a 2ᵉ-choix toggle.
(`IDligne_expedition_TRM` records TRM→ETM provenance, NOT a stock signal — don't filter on it.)
**Columns**: Référence (ref_ecru), Coloris (colori_ecru), Numéro, Poids (kg), Lot, Magasin
(sous_traitant via IDmagasin), N° Cmd + Client (IDligne_commande_client → ligne_commande_client →
commande_client → client, resolved as flat queries merged in JS), Date saisie, 2ᵉ choix, Visiteur
(free-text column, not an FK), Observations, Défauts (defaut_qualite Type_Reference=2). Provenance
drawer card reuses finis's resolvers — `resolveSstLine`/`resolveProvenanceFils` are now **exported**
from `stock-fini.ts` — via `GET /api/stock/ecru/:id/provenance` → Fils (ref_fil · fournisseur ·
Commande N°) + Tricotage (knitter · Commande N°); no ennoblissement row (dyeing is the écru's
destination, not its origin). **Permissions** (`permission-keys.ts`, category Tombé Métier):
`create_stock_ecru` (Nouveau), `cut_stock_ecru` (Couper), and `edit_stock_ecru` "Édition rouleau(x)"
— the edit permission gates the drawer "Modifier" AND the "Édition groupée" batch button, plus the
backend `PATCH /ecru/:id` and `PATCH /ecru/batch` (401/403, effective admins bypass); the top-right
edit-mode "Modifier" shows only when the user can edit OR cut. HFSQL footguns honoured throughout:
accent-safe reads (batched `repairAliased`/`fixEncoding`), writes via `sqlText()` (Latin-1 hex), no
CONVERT-in-JOIN, integer-only `IN` lists, empty text → `''` not NULL, and every named column
verified to exist (no bridge-storm risk).

## 2026-06-23 — feat/rapport
Rapports › Commandes sous-traitants — added a column-picker dialog to the Excel export on the
table-centric `apps/web/src/pages/RapportCommandesSst.tsx` report (no API change). Clicking
"Exporter Excel" now opens a modal (`mps_designer §18.A` basic-form Dialog: gold `Columns3`
title icon, "Colonnes à exporter") instead of exporting immediately. The 18 export columns were
extracted into a single `EXPORT_COLUMNS` catalog (stable `key`, label, value getter, Excel
`wch` width); the export builds headers/rows/widths from whichever columns are selected, always
in canonical order regardless of click order. The modal lists each column as a plain checkbox
(multi-select, per `§35.4`) with a live count and "Tout sélectionner / Tout désélectionner"
shortcuts, plus Annuler + a primary Exporter button (spinner while writing, disabled when no
column is selected). The selection is persisted to `localStorage`
(`mps:rapport-sst:export-columns`) on a successful export and restored on load — since user
identity is station-based, per-browser localStorage is effectively per-user. The loader is
defensive: drops unknown keys, preserves canonical order, and falls back to "all columns" on
missing/corrupt data or privacy-mode errors. Export still operates on the currently visible
(search-filtered + sorted) rows; quantity FP-noise rounding (`qty1`) was hoisted to module scope
and reused.

## 2026-06-23 — feat/stock-fini
Finis › Stock — enrichment pass on the existing table-centric stock_fini screen
(`apps/web/src/pages/FinisStock.tsx` + `apps/api/src/routes/stock-fini.ts`). Five changes:
(1) **New `edit_stock_fini` permission** — appended to `permission-keys.ts` (category Finis),
gates the `PATCH /api/stock/fini/:id` route (401/403 like `create_stock_fini`) and hides the
detail-drawer "Modifier" button via `useHasPermission`; effective admins bypass. (2) **État is
now read-only** in the detail drawer — the Statut `<select>` was removed (always renders the
read-only pill); dropped the now-dead `editEtat` state, the `etats` lookup in the drawer, and
`IDetat_stock_fini` from the PATCH payload + dirty-check (table-level "Édition groupée" batch
still edits emplacement/observations, unaffected). (3) **Drawer header + provenance rework** —
the bold title is now the roll number (`numero`, e.g. 3465/99); ref/coloris/lot moved to the
subtitle. New read-only endpoint `GET /api/stock/fini/:id/provenance` traces the origin chain:
stock_fini.IDstock_ecru → stock_ecru.IDref_commande_source (tricoteur sst line) → its
`asso_fil_lignecmdsst` yarn lots → stock_fil → ref_fil (designation) + fournisseur + commande_fil
(order N°); stock_fini.IDref_commande_source = the dyeing (ennoblisseur) sst line. The Provenance
card lists each fil (designation · supplier · Commande N°), the Tricotage origin (knitter ·
Commande N°), and the Ennoblissement origin (dyer · Commande N°, hidden when same commande as
tricotage). Removed the "Rouleau écru source" field; renamed "Date saisie" → "Date réception";
replaced `#` id prefixes with `N°`. (4) **Legacy columns restored on the table** — added
Contexture (ref_fini → ref_ecru → contexture.nom), Grammage (ref_fini.poids_Moy, g/m²), Client
(IDligne_commande_client → commande_client → client.nom) and N° Cmd (commande_client.numero) via a
new batched `enrichListExtras()` helper; columns reordered to mirror the legacy WinDev grid (kept
the app's État column + existing totals footer). Contexture/Client also searchable. (5) **Denser
table** — body text `text-sm`→`text-xs`, cell padding `px-3 py-2`→`px-2 py-1.5`, headers
normal-case (no uppercase/tracking) that wrap at spaces (not mid-word), "N° Cmd" abbreviated to
stay one line. HFSQL footguns honoured throughout: `STOCK_FINI_SELECT`/`JOINS` left untouched
(shared with detail+label endpoints) — all new joins done as batched flat queries + JS merge with
integer-only `IN` lists (no CONVERT-in-JOIN collapse, no bridge-storm risk); accented name columns
(sous_traitant/fournisseur/contexture/client `.nom`, ref_fil.reference) read raw + repaired via
`fixEncoding`, never named in a WHERE.

## 2026-06-23 — feat/rapport (refinements)
Polish pass on Rapports › Commandes sous-traitants (`/rapports/commandes-sst`, screen base
landed earlier same day). Changes: (1) removed the page-title `<h1>` — table-centric screens
take no screen-name heading (identity comes from the nav/submenu tab); codified this in
`mps_designer` §27.1 + §27.7 checklist so it isn't re-added. (2) Dropped the "Actualiser"
button; the report query now uses `staleTime: 0` so it refetches on every mount (each consult)
with `refetchOnWindowFocus: false` to spare the shared HFSQL bridge. (3) Shrank the table body
to `text-[13px]` with tighter cell padding (`px-2.5 py-2`) to fit more rows on screen. (4) Added
an "Exporter Excel" button (top-right of the toolbar) that builds the `.xlsx` client-side via a
lazy `await import('xlsx')` (keeps SheetJS out of the main bundle), exporting the currently
visible (search-filtered + sorted, soldées-toggle-aware) rows across all 18 columns; quantities
rounded to 1 decimal but kept numeric so Excel can sum them. Frontend-only — no API changes.

## 2026-06-23 — feat/suivilot
Qualité › Suivi Lots — new quality-control lot-tracking screen (first real Qualité screen;
the menu's other 3 submenus — Dossiers, Actions, Analyse — remain placeholders). Also adds the
4 Qualité submenus to the sidebar + router (`/qualite/suivi-lots` real, the rest placeholders).
Master-detail screen over the `suivilot` table (one row per (ligne_commande_sous_traitant, lot),
created on reception by `upsertSuivilot()` in commandes-sous-traitant.ts): left list with search +
En cours / Terminé / Tous filter (Terminé = archived via `fin_archivage`); center "Récapitulatif
de la commande" (date commande, N°, référence, coloris via the `avec_teinture` wash/dye rule,
spec banner Laize/Poids/Freinte/Rendement/Stab) + read-only "Pièces du lot" sub-table sourced from
`stock_fini` with per-roll Rdt = metrage/poids and a Moyenne footer; right sidebar tabs Contrôles
(editable SST + Tirelle measurements, observations, emplacement, fin d'archivage) / Documents
(read-only, reuses the commande-sst `ged` endpoints) / Défauts (read-only, `defaut_qualite`
aggregated over the lot's source écrus) / Client. A multi-state état footer pill (En contrôle /
En reprise / Validé / Expédié / Attente, persisted immediately) and a header archive/lock button.
Full Modifier→Enregistrer edit flow wired into the shared unsaved-changes guard. New API route
`apps/api/src/routes/suivi-lots.ts` (`/api/suivi-lots`: list, detail, PUT controls, POST etat,
POST archive, GET defauts). HFSQL footguns honoured: editable columns are all ASCII so writes are
Linux-bridge-safe; the only accented write (`approuvé_qualité`) is gated on `IS_WINDOWS` with
`IDetatLot` carrying validation state on the bridge; accented spec columns read via `SELECT *` +
pickKey; magasin resolved without `alias.*`. Permissions deferred to a later session. Known
flagged-but-deferred: SST "Freinte" shows `freinte_demandée` (no `freinte_sst` column exists); the
legacy Tricotage/Ennoblissement/Visiteur bottom block was not ported (no backing `suivilot`
columns — low-confidence mapping left for follow-up).

## 2026-06-23 — feat/rapport
Rapports › Commandes sous-traitants — new read-only report screen at
`/rapports/commandes-sst`, porting the legacy `FEN_Rapport_commandes_sous_traitants.wdw`
(which is non-decompilable — WinDev stores WLanguage in a proprietary encrypted blob, so the
screen was reconstructed from the production screenshot + the already-migrated MPS_NG
sous-traitant domain model). Also adds the three Rapports submenus (Commandes clients,
Commandes sst, Commandes fils) to the nav + router; clients/fils are placeholders for now.
The screen is a flat, table-centric grid (FilsStock pattern, no master-detail/drawer): one
row per `ligne_commande_sous_traitant`, with Statut, Numéro, Sous-traitant, Référence,
Coloris, Qté commandée/affectée/réceptionnée, Date commande, Délai initial/actuel/client,
Retard, Marge, Client, Relance, Commentaire. Sortable sticky-header columns (17, horizontal
scroll), French search across statut/n°/sous-traitant/réf/coloris/client/commentaire, a "Voir
les commandes soldées" toggle, an "Actualiser" button, and a totalizer (line count + late/
soon counts). Statut renders as polished MPS_NG pills (`LINE_STATUT_META`, friendly labels +
solid colors) from the per-line `sstatut`; rows tint red (late) / amber (soon) per MPS_NG
urgency language (attente_delai anchors on `date_notif`, else on `date_livraison`). Key
column derivations (verified against local HFSQL): **Marge = Délai Client − Délai Actuel in
DAYS** (not €); Délai Actuel = `lcs.date_livraison`, Délai Initial = frozen `lcs.date_delai`;
**Délai Client = `ligne_commande_client.date_livraison`** reached via
`stock_fini.IDref_commande_source` / `stock_ecru.IDref_commande_affectation` →
`IDligne_commande_client` → `commande_client` → `client.nom` (earliest valid lcc per line);
the bell column = `commande_sous_traitant.date_notif` (relance); Qté affectée sums
`stock_ecru.metrage` (ennoblisseur, Ml) or `poids` (tricoteur, Kg), Qté réceptionnée sums
`stock_fini.metrage` (type 2) or produced `stock_ecru.poids` (type 1/0). Backend:
`apps/api/src/routes/rapports.ts` (`GET /commandes-sst?soldees=0|1`) — entirely bulk,
set-based, chunked `IN(...)` queries (CHUNK 400, cap 2000 commandes), bounded query count with
no per-line fan-out (HFSQL bridge-storm safety). The reusable pure sst primitives (esc, n,
dateDigits, addWorkingDays, lineStatutRank, STATUT_* constants, IS_WINDOWS) were extracted to
`apps/api/src/lib/sst-shared.ts` and are now imported by both `rapports.ts` and
`commandes-sous-traitant.ts` (no copy-paste drift). Registered in `index.ts`. Frontend:
`apps/web/src/pages/RapportCommandesSst.tsx`. Permissions deferred (to be added later).

## 2026-06-23 — feat/stock-fini
Finis › Stock — new "Surteinture" (over-dye) multi-select action, porting the legacy
`FEN_Surteinture` window. In edit mode the user selects finished rolls of the **same ref +
coloris** (1 or more) and clicks the Paintbrush button; a wide two-table modal shows the
finished pieces to delete (left, rendered struck-through in muted red) and their source
tombé-de-métier écru rows to modify (right, read-only display of numéro/réf/coloris/poids/
magasin + the auto-generated trace observation). Validating appends
`"<lot> - <ref> - <coloris> a surteindre"` to each linked `stock_ecru.observations` and
deletes the finished `stock_fini` rows, so the écru returns to available stock for a fresh
dyeing cycle with a record of where it came from. The écru's coloris and magasin are left
untouched (no editable fields — earlier iterations had pickers; removed per spec). New
dedicated permission `surteindre_stock_fini` (added to `permission-keys.ts`, auto-surfaces in
Paramètres › Utilisateurs and gates both the button and the API). Backend adds two endpoints
to `stock-fini.ts`: `POST /fini/surteindre/preview` (drives the modal — resolves each roll's
linked écru via `stock_fini.IDstock_ecru`, plus ref_ecru/colori_ecru/magasin/client labels via
flat `IN(...)` queries + `fixEncoding`, never JOIN+CONVERT; builds the trace observation
server-side so preview and write can't drift; flags rolls with no écru as `skipped`) and
`POST /fini/surteindre` (gated; per valid non-shipped roll: appends the trace via `sqlText`,
then deletes the fini). Shares a `loadSurteintFiniRows` helper that reuses the list's
SELECT/JOIN/repair path so coloris labels match. Frontend is `SurteindreDialog` in
`FinisStock.tsx`, following the existing `CutRollDialog`/`BatchEditDialog` pattern; on success
invalidates `['stock-fini']` and exits edit mode.

## 2026-06-23 — feat/stock-ecru
Tombé Métier › Références screen — new master-detail screen for écru (loom-output) knitting-fabric
references (`ref_ecru`), porting the legacy WinDev `FI_Ref_TombéMetier.wdw`. Also adds the two
Tombé Métier submenus (Références + Stock placeholder) to the nav. New API router
`apps/api/src/routes/references-ecru.ts` (`/api/references-ecru`): list (En cours / Archivé filter),
full detail, create, update (auto-stamps `date_maj_ft`), archive/unarchive, deep **duplicate**
(copies composition + coloris + machine grid + liage diagram with id remapping), guarded delete,
plus sub-resource CRUD for composition (`composition_ecru`, base `IDcolori_ecru=0`), coloris
(`colori_ecru`), the per-machine technical grid (`ref_ecru_machine`), and the binding diagram
(`chute_liage` + `schema_liage`), and lookups (contextures, clients, refs-fil, machines, symboles).
New page `apps/web/src/pages/TombeMetierReferences.tsx`: 3-panel `MasterDetailLayout` with header
trio (Imprimer/Email placeholders + Dupliquer + Archiver + gold Modifier), editable Identification /
Composition / Coloris cards, and a 3-tab technical area — **Données Technique** (LFA-tour, pignons,
machine grid with computed Compteur Saisie/Calculé, écarteur/laize/rendement/vitesse/poids,
maille-d'ouverture/ouvert-au-large/sonneter pills, observations), **Obs OF** (read-only
`obs_ref_ecru`), and a paint-style **Schéma de liage** editor (chutes × symbol cells, custom inline
SVG knit glyphs). Full unsaved-changes guard (header draft + per-key sub-form dirty registry) and
ConfirmDialogs. Reverse-engineered formulas (memory `project_tombe_metier_references`):
**Coût/kg** = `ref_ecru.prix` + Σ(`composition_ecru.pourcentage` × `ref_fil.prix_kg`)/100 over the
base composition; **Compteur Saisie** = `round((trs_10kg_chute/nb_chutes) × (poids/20) / 10) × 10`
(Compteur Calculé = 0, needs an OF). HFSQL footguns honoured: `ref_ecru` accented column names
(`archivé`/`diamètre`/`recyclé`) read via `SELECT *`+`pickKey`, written named on Windows / archive via
positional reinsert on Linux; `colori_ecru` explicit columns only; no `IDsociete` on `ref_ecru`;
`client` has no `ville`. Out of scope this pass: permissions, Circulaire/Rectiligne filter,
Print/Email (placeholders), Obs OF editing.

## 2026-06-23 — feat/etude-coloris
Finis › Études coloris — search auto-select fix. The left-list auto-select effect only
fired on first load (gated on `selectedId === null`), so narrowing the list via the search
bar to a single result never selected it — unlike every other master-detail screen. Replaced
it with the canonical pattern (from `FilsCommandes.tsx`): an effect driven off the
search-filtered `filteredEtudes` array that re-selects the first visible row whenever the
current selection drops out of the results, skipped while editing so unsaved changes are never
discarded. Typing e.g. "2012 marin 63403" down to one match now auto-selects it. Also
documented this as a mandatory convention in the `mps_designer` skill's Search Bar section
(canonical effect snippet + the `selectedId === null` anti-pattern to avoid), since the bug was
a missing cross-screen convention rather than a one-off.

## 2026-06-23 — feat/gestion-sst
Sous-traitants/Gestion: tricoteur yarn-lots, ennoblisseur tariff editor, info relayout, shared type chip.
(1) **Tricoteur lots de fil** — new "Lots de fil présents sur le site" table shown for tricoteur
sous-traitants (`IDtype_sst = 1`), mirroring the ennoblisseur rolls table: every `stock_fil` lot with
`IDMagasin = sst AND stock > 0` (ref/coloris/fournisseur/lot/lot frs/stock kg/entrée), searchable +
sortable with a count·total-kg footer. Backed by `GET /api/sous-traitants/:id/rolls`'s sibling
`GET /:id/yarn-lots` (explicit ASCII columns, batched ref_fil/colori_fil/fournisseur label lookups, no
JOIN+CONVERT collapse). (2) **Ennoblisseur tariff editor** — a center-panel segmented toggle
"Rouleaux sur le site | Tarifs" (ennoblisseur only) reveals a two-pane editor over
`tranche_tarif_ennoblissement` (`apps/web/src/pages/sous-traitants/TariffsSection.tsx`): left lists
every dye (4) + treatment (20) + existing combinations; right edits that subject's quantity bands
(min/max/prix €/Kg) with an "au-delà"=999999 toggle, inline add/edit, `ConfirmDialog` deletes, server-side
overlap guard. Full combination support incl. a new-combination dialog (dye context + multi-treatment
checklist) and re-scope; a "Copier" dialog seeds an empty ennoblisseur from another sst or the
`IDsous_traitant=0` default catalog (9 of 12 ennoblisseurs start empty). New endpoints on
`sous-traitants.ts`: GET (grouped catalog), POST band, PUT band, DELETE band, PUT `/combinaison/rescope`,
POST `/copier`. This is the exact table `pricing-sst.ts` reads, so edits flow into auto-pricing of NEW
order lines (existing lines not retro-repriced; matches legacy). Confirmed: table is 8 ASCII columns,
PK auto-increments; combos keyed on `(IDteinture, sorted ListeTraitements)`. (3) **Info relayout** — the
center "Coordonnées" card is gone; Type + Statut moved into the right sidebar's Info tab (a new
"Informations" card above Commentaire); the zombie `tel`/`fax` fields are hidden in the UI but still
round-tripped on save so existing values aren't blanked. Non-ennoblisseur/non-tricoteur types now show a
"info is in the right panel" placeholder instead of a bare card. (4) **Shared type chip** — the
hue-per-type sous-traitant chip (Ennoblisseur=sky, Tricoteur=amber, Confectionneur=teal, Autre=stone)
was extracted from Commandes into `apps/web/src/lib/sst-type.tsx` (`sstTypeTagClasses` + `<SstTypeTag>`)
and adopted in Gestion (list card, header, Info row), replacing the grey secondary Badge; documented as
mps_designer §36.

## 2026-06-22 — feat/gestion-sst
Sous-traitants/Gestion screen enhancements. (1) Left-list status filter: a 3-way
segmented control (Actifs / Inactifs / Tous, default Actifs) under the search field,
filtering on `est_visible`; the auto-select-first effect now reads the filtered list.
The "Inactif" tag moved to the top-right corner of each list card as a red destructive
badge. (2) New "Rouleaux présents sur le site" table shown only for ennoblisseur
sous-traitants (`IDtype_sst = 2`): lists every fabric roll physically located at that
subcontractor — "tombé métier" (écru) rolls awaiting dyeing + finished (fini) rolls not
yet shipped back — in one unified, searchable, sortable table with a Tous/Tombé
métier/Finis filter and a count + total-kg footer. Backed by a new
`GET /api/sous-traitants/:id/rolls` endpoint: location resolved via
`stock_ecru.IDmagasin` / `stock_fini.IDmagasin` → `sous_traitant.IDsous_traitant`
(updated on physical transfer); écru already dyed into a fini are dropped to avoid
double-counting; fini already shipped (IDligne_expedition set or état 4) are hidden;
fini coloris obeys the `ref_fini.avec_teinture` rule by reusing the now-exported
`repairAliased`/`repairAllJoins` helpers from `stock-fini.ts`. The fini "État" renders
as the same pill tag used in Finis/Stock — its colour logic was extracted to the shared
`lib/etat-stock-fini.ts` and now maps "Validé" (and Disponible/Prêt) to green in both
screens. Also: documented the canonical left-list filter-button group pattern in the
mps_designer skill.

## 2026-06-22 — feat/stock-fini
Finis › Stock enhancements. (1) **Dymo étiquette printing**: a new white icon-only Printer button in the roll drawer header (view mode, left of "Modifier") opens an 89×36 mm label PDF in a new tab to print to the Dymo. New `StockFiniLabelPdf.tsx` (@react-pdf/renderer, built-in Helvetica, rotated `logo-malterre.png` band + N°/Réf./Col./Poids/Métrage/Lot lines, reproducing legacy `ETAT_Etiquette_SP.wde` from a physical sample) and a read-only `GET /api/stock/fini/:id/label` endpoint reusing the detail route's SELECT/JOINs/repair. (2) **Édition groupée**: a Pencil icon button appears in the edit-mode toolbar when >1 roll is selected, opening a modal to batch-set `emplacement` and/or `observations` (each gated by a toggle so one field can be set without wiping the other) across all selected rolls via a new `PATCH /api/stock/fini/batch` endpoint (accented-safe `sqlText()`, registered before `/fini/:id`). (3) **Shift-click range deselect**: shift-clicking an already-selected row now removes the inclusive range, not just adds. (4) **Performance**: stabilized `handleClose`/`handleRowClick` on `guard.guardAction` (was `[guard]`, a fresh object each render that busted the `StockRow` memo); removed `isEditing` from per-row props so the edit-mode toggle re-renders zero rows (view↔edit presentation now CSS-driven via `data-editing` on `<tbody className="group">` + `group-data-` variants, click unified into one stable `onRowClick` reading an `isEditingRef`); cached one `Intl.Collator` for sorting; `useDeferredValue` on the search term. Eliminates the ~1s edit-mode lag and the general re-render thrash on a ~1.4k-row table.

## 2026-06-22 — feat/ref-fini
Finis › Références screen (`/finis/references`) — the technical datasheet (fiche technique) for finished-fabric references (`ref_fini`, 43 cols). New `apps/web/src/pages/FinisReferences.tsx` (master-detail mirroring `FilsReferences`) + `apps/api/src/routes/references-fini.ts` (mounted `/api/references-fini`), replacing the router placeholder. Full CRUD on the ASCII datasheet fields (designation, conditionnement, rendement, freinte, temp. lavage, poids/laize HT/laize utile min·moy·max, stability & elongation, SST control flags, observations/technique/commercial, responsable, en_developpement) plus an écru picker (`IDref_ecru`). Coloris (polymorphic by `avec_teinture`: dye→`ref_fini_colori` / wash→`colori_ecru`), traitements (`traitement_ref_fini`) and stock aggregate (`stock_fini`) are READ-ONLY; `avec_teinture`/`archivé`/`catalogue_privé`/dates are read-only (structural / accented-write-unsafe). Archived refs filtered out of the list in JS. Notable HFSQL footguns handled: `ref_fini` accented column NAMES (`dateCréation`/`archivé`/`catalogue_privé`) resolved by prefix regex, never named in SQL; `SELECT *` FAILS on `ref_fini_colori`/`colori_ecru` so those are read with explicit columns only; list accent-repair is batched (one `CONVERT … WHERE id IN (…)` per column) to avoid the Linux-bridge N+1 storm. Verified: web tsc + vite build clean, full CRUD round-trip over HTTP, accented write/read round-trips exactly at the DB layer.

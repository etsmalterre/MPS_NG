# Worktree merge log

Newest first. `/feature-complete` prepends one entry per screen it lands on `master`, so
other worktrees see what changed when they rebase. Format:

```
## <date> — feat/<name>
<one-paragraph note: what the screen does / what changed>
```

<!-- entries below -->

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

# Worktree merge log

Newest first. `/feature-complete` prepends one entry per screen it lands on `master`, so
other worktrees see what changed when they rebase. Format:

```
## <date> — feat/<name>
<one-paragraph note: what the screen does / what changed>
```

<!-- entries below -->

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

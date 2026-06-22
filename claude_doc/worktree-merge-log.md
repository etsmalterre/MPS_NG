# Worktree merge log

Newest first. `/feature-complete` prepends one entry per screen it lands on `master`, so
other worktrees see what changed when they rebase. Format:

```
## <date> — feat/<name>
<one-paragraph note: what the screen does / what changed>
```

<!-- entries below -->

## 2026-06-22 — feat/ref-fini
Finis › Références screen (`/finis/references`) — the technical datasheet (fiche technique) for finished-fabric references (`ref_fini`, 43 cols). New `apps/web/src/pages/FinisReferences.tsx` (master-detail mirroring `FilsReferences`) + `apps/api/src/routes/references-fini.ts` (mounted `/api/references-fini`), replacing the router placeholder. Full CRUD on the ASCII datasheet fields (designation, conditionnement, rendement, freinte, temp. lavage, poids/laize HT/laize utile min·moy·max, stability & elongation, SST control flags, observations/technique/commercial, responsable, en_developpement) plus an écru picker (`IDref_ecru`). Coloris (polymorphic by `avec_teinture`: dye→`ref_fini_colori` / wash→`colori_ecru`), traitements (`traitement_ref_fini`) and stock aggregate (`stock_fini`) are READ-ONLY; `avec_teinture`/`archivé`/`catalogue_privé`/dates are read-only (structural / accented-write-unsafe). Archived refs filtered out of the list in JS. Notable HFSQL footguns handled: `ref_fini` accented column NAMES (`dateCréation`/`archivé`/`catalogue_privé`) resolved by prefix regex, never named in SQL; `SELECT *` FAILS on `ref_fini_colori`/`colori_ecru` so those are read with explicit columns only; list accent-repair is batched (one `CONVERT … WHERE id IN (…)` per column) to avoid the Linux-bridge N+1 storm. Verified: web tsc + vite build clean, full CRUD round-trip over HTTP, accented write/read round-trips exactly at the DB layer.

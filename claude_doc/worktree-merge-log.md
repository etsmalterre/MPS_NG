# Worktree merge log

Newest first. `/feature-complete` prepends one entry per screen it lands on `master`, so
other worktrees see what changed when they rebase. Format:

```
## <date> — feat/<name>
<one-paragraph note: what the screen does / what changed>
```

<!-- entries below -->

## 2026-07-07 — feat/facturation
Clients › Facturation — **batch proforma generation & wipe from expeditions**
(`apps/api/src/routes/factures.ts`, `apps/web/src/pages/ClientsFacturation.tsx`).
**(1) `POST /prov/generate`** ports legacy `FI_Facturation_ETM`: scans formelle ETM expeditions
(`IDsociete=1`, `est_facture` null/0), groups by client, creates one proforma per client. Lines
mirror expedition lines — designation from the article catalog (fini vs écru honoring
`avec_teinture`), `V/ref` / commande / `Avis` lines, quantity = summed shipped Kg/Ml from rolls,
price+unit from `ligne_commande_client`; contributing expeditions flip `est_facture=1`. Skips
clients internes, donations, and roll-less expeditions (left open); returns `{created, skipped}`.
Chunked `IN` lookups (500), catalog caches, `fixEncoding`, numero-collision retry ×3.
**(2) `DELETE /prov/all`** deletes every OPEN proforma (`IDexpedition_divers=0`) + lines, keeps
converted proformas as history, resets `est_facture=0` only on expeditions without a definitive
`ligne_facture` link; registered before the generic `/:kind/:id` route. Shared
`clientBillingDefaults()` extracted (used by manual create + generator). **(3) UI**: two batch
buttons pinned above the proforma list footer ("Générer les factures" / "Supprimer toutes les
factures", prov bucket only, disabled in edit mode), each behind a `ConfirmDialog`, with a
`BatchResultDialog` summarizing created proformas and skip counts (internes / donations / sans
marchandise) or deletion results.

## 2026-07-07 — feat/cmd-client
Clients › Commandes — **permission-gated Donation flag + CommandeClient PDF layout rework**
(`apps/api/src/lib/permission-keys.ts`, `apps/api/src/routes/commandes-client.ts`,
`apps/api/src/routes/expeditions.ts`, `apps/web/src/pages/ClientsCommandes.tsx`,
`apps/api/src/lib/pdf/CommandeClientPdf.tsx`, `apps/api/src/lib/pdf/MalterreDocument.tsx`).
**(1) Donation**: new `donation_commande_client` permission key (category "Commandes client");
`GET /:id` returns `donation`, `PUT /:id` accepts it but enforces the permission only when the
value actually changes (echoing the unchanged flag is fine). The UI shows a `TogglePill`
"Donation" switch in the Info tab (edit mode, permission-gated; field omitted from the save
payload when unprivileged). Donation propagates downstream: `POST /:id/lignes/:ligneId/expedier`
and formelle expedition creation now default the shipment's `donation` to the parent order's flag
(previously hardcoded 0 / explicit-only), so donation orders never spawn proformas.
**(2) PDF**: the acknowledgement's right "combo" card is split — payment terms move to the top
row next to the client card; the livraison address becomes its own card pinned to the bottom of
the last page (`wrap={false}`, grows into leftover space). Shared compact cream `card` style,
`lineHeight: 1` on icon-adjacent text (also in `MalterreDocument` card title/meta styles),
and a `pushLine` helper that trims HFSQL single-space "empty" address columns. Dev scripts:
`render-cc-pdf.ts` (render a commande's PDF to file by numero), `probe-donation-flag.ts`
(one-off donation-column probe).

## 2026-07-06 — feat/cmd-sst
Sous-traitants › Commandes — **per-lot tooltip on the totals-footer "Ml reçus"**
(`apps/api/src/routes/commandes-sous-traitant.ts`, `apps/web/src/pages/SousTraitantsCommandes.tsx`).
The detail endpoint's received-rolls aggregate now also reads each `stock_fini` roll's `lot`
(`fixEncoding` keyed on `IDstock_fini`) and returns a per-line `fini_lots: {lot, nb, metrage}[]`
(lot-less rolls group under `''`). The frontend merges `fini_lots` across lines (`finiLotsMerged`
useMemo in `LignesSection`); the green "· X Ml reçus" span in the totals footer gains a
`FiniRollIcon` + `cursor-pointer` and, on hover, the shared `Tooltip` (side top) titled
"Métrage reçu par lot" listing "Lot <n> — N rouleaux · X Ml" per lot ("Sans lot" for empty).
Falls back to the plain span when no breakdown exists. Verified against dev commande 8607
(4 rolls sans lot · 107 Ml + 3 rolls MA1234 · 25 Ml = 132 Ml total, matches
`total_metrage_fini_recu`).

## 2026-07-06 — feat/suivilot
Qualité › Suivi des lots — **"Pièces du lot" table footer now totals Poids & Métrage**
(`apps/web/src/pages/QualiteSuiviLots.tsx`, `RecapSection`). The read-only per-roll sub-table
previously showed only a single "Moyenne" row spanning the first 4 columns with the average Rdt.
It now shows a `Total` label with the summed `poids` (` Kg`) and `metrage` (` Ml`) in their own
columns (client-side `pieces.reduce`, `p.poids || 0` / `p.metrage || 0` guards), while the
existing average Rdt is preserved — its "Moyenne" label moved to the Magasin column, right-aligned
before the Rdt value in `text-accent`. Presentation-only; no API/data changes.

## 2026-07-03 — feat/expe
Clients › Expéditions — **facture lock model + Factures tab + Avis d'expédition PDF + email**
(`apps/api/src/routes/expeditions.ts`, `apps/api/src/lib/pdf/BonLivraisonPdf.tsx`,
`apps/web/src/pages/ClientsExpeditions.tsx`). **(1) Legacy validé/dévalider RETIRED**: an expedition
is either "non facturée" (fully editable) or "facturée" (fully locked). Lock = `est_facture=1` OR a
definitive facture actually references it — formelle via `ligne_facture.IDligne_expedition` →
`ligne_expedition`, divers via the `facture.IDexpedition_divers` header back-pointer
(`facture_prov.IDexpedition_divers` deliberately excluded — repurposed as the converted-proforma
marker). Every write path 409s `expedition_facturee`; `POST /:kind/:id/validate` removed; `est_valide`
is never read (still zero-filled on INSERT for legacy). UI: status footer pill removed (derived state
→ header badge Facturée/Non facturée per mps_designer §29.6), list pills recolored, Modifier hidden
when locked. **(2) Factures tab**: right panel now tabbed Info | Factures; detail returns `factures[]`
(numero/date/type incl. Avoir) + `locked`. **(3) Legacy-parity line list** (verified vs expedition
11644 / commande 6677, 12 lines across ~15 expeditions): only lines with a `ligne_expedition` row on
THIS expedition belong to it; other commande lines render as a collapsed "Autres lignes de la
commande" candidates group, only while editable — a locked expedition shows exactly the legacy view.
**(4) Roll icons**: FiniRollIcon / TmRollIcon per stock kind on line cards + roll drawer. **(5) Avis
d'expédition PDF** (`GET /expeditions/formelle/:id/pdf`, byte-matched vs legacy BL 11645): MalterreDocument
frame, livraison address + meta cards, the two fixed legacy quality notices, per-article identity block
(ref - coloris, designation, finition label from the WinDev `gtaFinition` enum {1: OUVERT AU LARGE,
2/3: TUBULAIRE…}, `V/réf.` from `designation_client`), per-lot pieces tables (obs column gated on
`affiche_observations`, prints `stock_fini.observations` NOT `observation_sst`), lot/article/avis
totals; écru lines supported via `IDligne_expedition_ETM`. **(6) Email**: `GET/POST
/formelle/:id/email-defaults|email` per the §32 pattern — contacts split by `envoi_bl`, Gmail DWD send,
BL PDF attachment, `envoi_email` audit with `IDtype_doc=14` ("avis expedition"; 16 = divers, reserved);
`SendEmailDialog` mounted on the Textile bucket (divers keeps placeholders for print + email). Also
fixed `loadContactName` (missing `IDcontact` in SELECT silently disabled fixEncoding accent repair).

## 2026-07-03 — feat/cmd-client
Clients › Commandes — line drawer **supply accuracy pass + Tricotage/Ennoblissement order creation +
Expédition tab + quick-ship** (`apps/api/src/routes/commandes-client.ts`, `commandes-sous-traitant.ts`,
`apps/web/src/pages/ClientsCommandes.tsx`). **(1) Supply semantics fixed against legacy (commande 3686,
validated to the cent)**: Ennoblissement "affecté" counts only écru rolls reserved to THIS client line;
the Tricotage grid reads the `affectation_cmd_tricotage` planning table (affecté = allocation to this
line, dispo = quantité − ALL allocations, métrage = affecté × rendement) instead of produced stock_ecru;
the "Stock de fil disponible" panel subtracts yarn still needed by open `ordre_fabrication`s
(`asso_fil_of`, `est_termine=0`: remaining × pourcentage — factored as `openOfPendingByLot`). Legacy
WinDev sources are PCS-compressed — all formulas reverse-engineered from HFSQL data. **(2) Combined
affecté gauge**: `lineReservationAggregates` now sums stock_fini rolls + stock_ecru rolls × rendement +
tricotage allocations (fixes 0/800 → 854,5/800 Ml); exposed as `affecte_total` on the `/pieces` payload
and used by the line bar, drawer, and modal footers (shared `AffecteGauge` w/ full-width progress bar).
"Ml" (mètres linéaires) capitalized app-wide. **(3) Knit-order creation** (legacy "Commande de Tricotage
Malterre" modal): per-tricoteur "Nouvelle commande" launcher on the stock-fil location bands
(`is_tricoteur` flag via IDtype_sst=1); modal has affecté/stock kg inputs with live Ml hints, net yarn
stock + pending yarn orders (`ref_fil_commande.etat=0`) tables; POST creates commande + line (unite=1,
prix via `trmLinePrix`) via exported `createKnitOrder` — TRM gets Attente_Delai + cross-ledger mirror,
external tricoteurs get Non_Envoye and no mirror — plus `affectation_cmd_tricotage` (input may be
negative, legacy parity) and one `asso_fil_lignecmdsst` per composition yarn against the knitter's lot.
**(4) Tricotage row-click modal** adjusts the (sst line, client line) allocation via new
`PUT …/supply/tricotage/:sstLineId/affectation` (over-allocation guarded). **(5) Expédition tab**:
expeditions carrying the line (`ligne_expedition`) with Facturée/Non facturée pill, per-expedition roll
list + transporteur/adresse info via new `GET …/lignes/:ligneId/expeditions`. **(6) Quick-ship**:
checkbox-select affected unshipped rolls in the Affectation tab → Expédier (ConfirmDialog) → new
`POST …/lignes/:ligneId/expedier` creates the expedition (address from commande, carrier from client,
est_valide=0) + `ligne_expedition` + points the rolls at it, then jumps to the Expédition tab.
**(7) Terminée = read-only Affectation tab**: lock banner, no available pool / affect / remove / ship /
observation edits (obs endpoint gained the missing `refuseIfSoldee`). All flows exercised end-to-end
against live HFSQL with test rows cleaned up afterwards; probe scripts under `apps/api/src/scripts/`.

## 2026-07-02 — feat/expe
Clients › Expéditions — filter + labelling + pagination pass (`apps/web/src/pages/ClientsExpeditions.tsx`,
`apps/api/src/routes/expeditions.ts`). **(1) Bucket labels**: the two category tabs "Formelles"/"Diverses"
now read **"Textile"/"Diverses"** (the internal `Kind` codes `formelle`/`divers` are unchanged; only the
French display strings + the create-modal Type toggle label). **(2) Invoiced filter**: the left-list state
filter was "Toutes / Brouillons / Validées" (on `est_valide`) and is now **"Non facturées / Facturées"**
(on `est_facture`), defaulting to **Non facturées**; "Toutes" was dropped and the two buttons split the row
50/50 with `whitespace-nowrap` so "Non facturées" stays on one line. API `?state=` accepts `facture` /
`nonfacture` (non-facturées guarded as `est_facture IS NULL OR est_facture = 0` per the HFSQL empty-flag=0
rule); legacy `all` still accepted but the UI never sends it. This matches the legacy app, where only 4
diverses are not-yet-invoiced (595/596/599/600). **(3) Load-more pagination**: the list was hard-capped at
`TOP 200`; it now pages via `useInfiniteQuery` (200/page) with a cursor `?before=<lastId>` (`IDexpedition <
before`, ignored while searching), a ghost "Charger plus" button under the last card when a full page came
back, and a `200+` footer count. Fixes the Textile/Facturées view showing exactly 200 when far more exist.
Verified `tsc --noEmit` clean on web (API baseline errors only, none in expeditions.ts).

## 2026-07-02 — feat/cmd-client
Clients › Commandes — line-item **Affectation drawer** upgrades plus supply-view accuracy fixes
(`apps/api/src/routes/commandes-client.ts`, `apps/web/src/pages/ClientsCommandes.tsx`). **(1) Roll cards
now show the fini/écru domain icon** (`FiniRollIcon` green box for fini lines, `TmRollIcon` for écru) instead
of a generic box, mirroring the sst pieces drawer. **(2) Défauts + observations are visible on each roll** via
the new shared `apps/web/src/components/shared/RollNotes.tsx` (blue observation banner / red défaut banner) —
extracted from `SousTraitantsCommandes.tsx` (which now imports it; its local copy was deleted). The `/pieces`
payload gained `observation_sst` (the ennoblisseur's defect report). **(3) Observations are editable** per roll
via a pencil → dialog, saved through new `PUT /commandes-client/:id/lignes/:ligneId/pieces/:kind/:stockId/observations`
(guards ref match + line ownership, writes via `sqlText()` for Linux-bridge-safe accents). **(4) Shipped rolls
are locked** — the "Retirer" button is hidden when a roll is expédié (fini état 4 or `IDligne_expedition` set;
écru `IDligne_expedition_ETM` set), and both unlink `DELETE` endpoints refuse with 409 server-side. **(5) New
"Stock de fil disponible" panel in the Tricotage tab** (`GET …/supply/tricotage/stock-fil`): yarn on hand usable
to knit the line's écru, scoped by `composition_ecru`, aggregated per holding location (`stock_fil.IDMagasin` →
sous_traitant), with métrage potentiel = poids / (pourcentage/100) × rendement. Composition pairs with no
on-hand lot still render under a synthetic "Sans stock" group so the full composition is always visible.
**(6) Tricotage orders now filter by écru coloris** — `buildTricotage` gained an `IDColoris IN (…)` restriction
(same `ennoInputColoriIds` rule as the écru-disponible pool) so a 029/gris-anthracite knitting order no longer
leaks into a line that needs 029/ecru (matches legacy; verified on commande 3686 / sst 8524). **(7) Supply tables
harmonized** — the enno location groups and the new stock-fil list now use the same table grammar as
"Commandes … en cours" (shared `GroupBandRow`, zinc band headers, right-aligned tabular numbers, bold métrage).
**(8) `KnitIcon`** (`apps/web/src/components/icons/KnitIcon.tsx`) — filled in the knit-mesh lattice: the hidden
`opacity="0"` connector was made visible and the missing rows-2→3 vertical connectors added, so the icon reads
as a closed diamond mesh rather than one filled loop.

## 2026-07-02 — feat/bug-pierrot
Sous-traitants › Reprise / Qualité › Suivi Lots (`apps/api/src/routes/commandes-sous-traitant.ts`) —
**correcting a roll's lot number in the Reprise modal now migrates the suivilot tracking** (bug reported by
Pierre-Emmanuel: Tricobot received commande 8801 under the truncated lot "MA"; after a reprise re-reception
with the right number, the "MA" lot stayed stuck "En reprise" with zero pieces in Qualité while the corrected
lot never appeared there at all). Root cause: `suivilot` is keyed on (ligne, lot), but the reprise PATCH only
updated `stock_fini.lot` and then synced `IDetatLot` against the NEW lot value (matching zero rows);
`upsertSuivilot()` only ran on the reception POST. New `migrateSuivilotLot()` runs on every lot-changing
PATCH: while rolls remain under the old lot it just ensures the new lot is tracked; when the last roll leaves,
the old suivilot is renamed onto the new lot. When old and new rows both exist, whichever carries
operator-entered contrôles survives (`suivilotHasControles()`, ASCII columns only) and a data-less placeholder
is deleted — so the modal's one-PATCH-per-roll batch ends with a single row that preserves measurements, and
operator input is never destroyed (worst case both rows survive + console.warn). Verified end-to-end on the
local DB (commande 8518, 7 rolls, suivilot with contrôles). Deployed to prod 2026-07-02 + one-shot data
repair: ligne 8776 rolls normalized `"MA 108715"`→`MA108715`, suivilot #5810 re-keyed MA→MA108715 état 2→1.

## 2026-07-02 — feat/cmd-client
Clients › Commandes line-drawer accuracy pass + shared état pill. **(1) `EtatPill`**: the stock_fini état
pill (green Validé / amber Contrôle / orange Reprise / red Refusé) is now a shared component in
`apps/web/src/lib/etat-stock-fini.tsx` (file renamed from `.ts`); the Affectation-tab roll rows in
`ClientsCommandes.tsx` (previously a plain grey outline Badge), `FinisStock.tsx` (table + drawer) and
`SousTraitantsGestion.tsx` all render it — rule recorded as mps_designer §37. **(2) `IDcommande_donation`
availability guard**: écru/fini rolls reserved to a donation-type commande client are no longer counted as
available anywhere — Affectation drawer (écru + fini pools), Ennoblissement per-location totals +
create-order roll picker (`fetchEnnoLocations`/`fetchEnnoAvailableRolls`), `buildEnnoblissement` (donation →
affecté bucket), create-order defensive filter, the sst écru picker in `commandes-sous-traitant.ts`, and
Tombé Métier/Stock "Disponible" (`stock-ecru.ts`; still visible under "Tous"). Verified: ref 040 phantom
44.7 kg gone, legacy-validated ref 029 totals unchanged. **(3) Wash-only enno input coloris** (user-found):
for `ref_fini.avec_teinture=0` the line's IDcolori IS a colori_ecru id, so the Ennoblissement écru pool
filters to that exact coloris (e.g. 040A/gris8985 ← écru 040/gris8985), not the natural "ecru" base (which
remains correct for dyed finis) — helper `ennoInputColoriIds`; panel title now shows the real coloris via
`ecru_coloris_label`; `computeTombeMetier` (sidebar "Tombé de métier commandé" card) aggregates per
(écru ref, input coloris) instead of hardcoding "/ecru". Verified: cmd 3692 (040A gris8985) now shows an
empty pool titled "040 /gris8985", matching legacy. **(4) Fiche client**: commande detail returns
`client_fiche` (= `client.commentaire`, fixEncoding + defensive stripRtf) and the Info tab shows it in a
read-only ClipboardList card — customer handling procedures visible on every commande like legacy.
**(5) Line commentaire**: `LineCard` renders the line's commentaire with the §24 MessageSquare pattern
(trim-guarded, ml-9, italic muted).

## 2026-07-02 — feat/cmd-sst
Sous-traitants › Commandes (`apps/web/src/pages/SousTraitantsCommandes.tsx`) — **"Couper en deux" is now
available in the Reprise reception modal** (was create-only: the toggle was gated `{!isReprise && …}` with a
comment claiming a reprise can't split rolls). The two-piece editor, preview list (scissors on both halves),
per-piece lot+métrage validation and progress counter were already mode-generic, so the toggle simply renders
in both modes. Submit for a split reprise roll: the existing `stock_fini` row is **PATCHed** into piece 1 —
renamed `<base>-1` (base trimmed to 18 chars for the 20-char numero column), new poids/métrage, état reset to
1 (En contrôle) — and piece 2 **POSTs** as a new roll `<base>-2` through the existing `pieces/fini` create
endpoint, passing the original's `IDstock_ecru`/`IDColoris`/`IDmagasin` explicitly so both halves match apart
from poids/métrage (the POST also inherits the écru's client reservation and upserts the suivilot
idempotently). No API changes — the PATCH already accepted `numero`. Doc updated in
`sous_traitants_status_model.md §Reprise flow`.

## 2026-07-02 — feat/prospect
Prospects › Demandes (`apps/web/src/pages/ProspectsDemandes.tsx`) — **search now auto-selects the top
visible result**. The screen's auto-select effect predated the mps_designer §5 guideline: it ran only on
first load (gated on `selectedId === null`) and against the raw list, so narrowing the search to a single
demande left the previous selection in place and the detail panel never switched. Replaced with the
canonical effect from `FilsCommandes.tsx`/`EtudesColoris.tsx`: it watches the **filtered** list, re-selects
`filtered[0]` whenever the current selection drops out of the visible set, and skips while `isEditing` so
unsaved changes are never discarded. No skill/doc update needed — the behaviour was already recorded in
mps_designer §5.

## 2026-07-02 — feat/cmd-sst
Sous-traitants › Commandes (`apps/web/src/pages/SousTraitantsCommandes.tsx` + `apps/api/src/routes/commandes-sous-traitant.ts`) —
**Tricobot autofill now works in the Reprise reception modal** (was create-only). When rolls "En reprise" are
multi-selected in the Réception tab and reopened via "Reprendre", the Tricobot mascot appears in the
`BatchReceptionDialog` header and pre-fills Lot / Poids / Métrage / Défaut from `data_bl_tricotbot`, matching BL
`num_piece` against the **fini** roll numeros (create mode keeps matching écru numeros) — a reprise sends the same
physical rolls back to the sst, so the corrected BL lists the same piece numbers incl. `-1`/`-2` split suffixes.
Overwrite semantics hardened for both modes: only **non-empty** BL values overwrite a field, so a hole in the BL
can't wipe the reprise pre-fill (or a user-typed value in create mode). API tricobot endpoint now `ORDER BY
IDdata_bl_tricotbot` so when the same num_piece exists twice (original + corrected reprise BL) the frontend's
last-write-wins map deterministically keeps the newest row. Doc updated in `sous_traitants_status_model.md §Reprise`.

## 2026-07-02 — feat/suivilot
Soumission Lot Client — per-coloris "Ref client" fix (`apps/api/src/routes/commandes-sous-traitant.ts`,
`findEligibleLots`). A client can hold SEVERAL `designation_client` rows for the same ref_fini, one per
coloris, each linked to its coloris through `ref_client_colori` (THUASNE has three for ref 1732:
65511008000→coloris 3520 Blanc, 65511227000→3521, 65511019000→3522). The eligibility map keyed only on
`(IDclient, IDref_fini)`, so an arbitrary sibling row overwrote the right one — commande 8500's soumission
PDF printed 65511019000 instead of 65511008000. Fix: also load the non-archived `ref_client_colori` rows for
the soumettre=1 designations and build a per-coloris map `client|ref|coloris → designation` (dye refs link via
`IDref_fini_colori`, wash via `IDcolori_ecru`), consulted first at assembly; the old `(client, ref)` map stays
as fallback for coloris without a `ref_client_colori` row. Flows into the eligible-lot card AND the soumission
PDF/email (shared data). Verified live: probe on 8500 now returns 65511008000 for Blanc 54508/1. Probe scripts
`inspect-soumission-8500-refclient.ts` / `probe-eligible-8500.ts` committed alongside.

## 2026-07-02 — feat/rapport-sst
Rapports › Commandes sous-traitants (`apps/web/src/pages/RapportCommandesSst.tsx`) — the Excel-export
column selection is now remembered **per user**, not per PC: the localStorage key is suffixed with the
logged-in `IDutilisateur` (`mps:rapport-sst:export-columns:<id>`), so users sharing or switching accounts
on one station no longer overwrite each other's choice (reported by an employee as "selection not
memorized"). Loader falls back to the old shared key so existing saved selections carry over; a
`useEffect` re-reads the selection when the logged-in user changes without a remount (user picker /
admin impersonation). Save still happens only on a successful export. Marked temporary — to be replaced
by a server-side per-user preference once proper user management lands post-migration.

## 2026-06-25 — feat/cmd-client
Clients › Commandes (`apps/web/src/pages/ClientsCommandes.tsx` + `apps/api/src/routes/commandes-client.ts`) —
polish + correctness pass on the line affectation drawer's **Ennoblissement** supply tab plus the right-panel
Info tab. **(1) Line pin-to-top drawer**: clicking a ligne now collapses the lines list to that line's height and
smooth-scrolls it to the very top so the affectation drawer always claims the space below it (was using a
max-height CSS transition that clamped the scroll and left the line short; now collapses height instantly and
scrolls to an absolute target). **(2) "Écru disponible" by location — three correctness fixes** in
`fetchEnnoLocations` / `fetchEnnoAvailableRolls`, all validated against the live legacy "029 - écru disponible"
panel (ref_fini 639 "029A" → écru ref 146, cmd 3686): (a) **natural-écru filter** — restrict source écru to the
`colori_ecru.reference = 'ecru'` base (helper `naturalEcruColoriIds`; fallback = whole pool if a ref has no
'ecru' coloris) because color-knitted variants ("Gris clair C5010" etc.) can't be re-dyed; this dropped MATEL
485→256.30 kg; (b) **"à l'usine" group** — dropped the old `IDsociete=1 AND IDmagasin>0` restriction so factory
écru (`IDmagasin=0`) surfaces, grouped by owning company via new `resolveSocieteNames` (1=Ets Malterre, 2=Tricotage
Malterre, 3=Malterre Confection); à-l'usine rows are read-only (no create button, synthetic `IDsous_traitant=-IDsociete`
React key); (c) **orphan-roll filter `IDLigne_Commande_TRM > 0`** — only écru traceable to a TRM knitting order counts,
which legacy applies uniformly (splits Tricotage Malterre 233.30→198.90 while leaving MATEL 256.30 intact; it is NOT a
second_choix filter — MATEL's 256.30 includes a 2nd-choix roll). **(3) UI polish on the location table**: larger/bolder
poids+métrage values with a gold icon box; the per-row button is now a ghost-accent "+ Nouvelle commande" matching the
left-list "+ Nouvelle"; the section title reads "{écru} /ecru — tombé de métier disponible" via a new `ecru_ref_label`
payload field. **(4) Info tab**: new "Tombé de métier commandé" card listing total écru kg ordered per écru ref
(`computeTombeMetier`: Kg lines count quantite, Ml lines convert kg = ml / rendement; fini lines trace through
`ref_fini.IDref_ecru`); and fixed Mode-paiement/Échéance showing "—" in view mode by removing the `enabled: isEditing`
gate on the two enum lookups (they're needed to resolve the labels outside edit mode).
## 2026-06-25 — feat/expeditions
Clients › Expéditions (`apps/web/src/pages/ClientsExpeditions.tsx` + `apps/api/src/routes/expeditions.ts`,
registered at `/api/expeditions`) — new screen combining the legacy `FEN_Gestion_expédition_ETMV2` (formal,
order-tied) and `FEN_Expéditions_diverses` (miscellaneous) windows into one master-detail with a **Formelles |
Diverses** bucket toggle (same `Kind`/`TBL` config shape as factures). **Formelle** = `expedition` +
`ligne_expedition`, tied to a `commande_client`: full create (pick a commande; transporteur + livraison
address auto-filled from client/order) / edit / **roll picking** — clicking a commande line opens an in-screen
drawer (mps_designer §31) to assign/free received rolls. Rolls point BACK at the shipment line via
`stock_fini.IDligne_expedition` (fini lines, type 2) or `stock_ecru.IDligne_expedition_ETM` (écru lines,
type 1); the `ligne_expedition` row is created **lazily** on first assign and deleted when emptied; deleting a
shipment frees all its rolls first. **Diverses** = `expedition_divers` + `ligne_expedition_divers` (no
`IDsociete` column; recipient = a registered `IDclient` or free-text `ref_client`), free-text `detail_ligne`
lines (RTF via stripRtf/wrapRtf). A sidebar **status-footer pill** drives `est_valide` (Brouillon → Validée);
a validated shipment is locked (header/line/roll writes return 409, like a definitive facture) but its lines
still open read-only to view shipped rolls. HFSQL footguns baked in: `date` is reserved (write/read as `DATE`);
`expedition.envoyé_client`/`envoyé_sst` are accented → never named (explicit column lists omit them, INSERT
zero-fills); empty FK = 0 not NULL; `expedition` has **no `numero`** (document № = PK; new-id resolved via
MAX-before + `TOP 1 > before DESC`); `IDsociete=1` on formelle reads/writes only. Per-line **dispo count is
per the line's own stock kind** — écru rolls merely *reserved* to a fini line (ennoblissement dyeing input)
are NOT shippable finished goods (bug found + fixed during build). Print / Email are "En developpement"
placeholders for V1 (real Bon de Livraison PDF + Gmail send — `envoi_email` type_doc 14, contact flag
`envoi_bl` — deferred; this screen also unblocks Facturation's génération-auto-from-expeditions). No conflict
with the `facture_prov.IDexpedition_divers` overload (that's a column on `facture_prov`, never a real
`expedition_divers` row). Verified end-to-end on local HFSQL — full formelle (create → assign/unassign roll →
delete, rolls freed) and divers (create → line CRUD → validate-lock 409 → reopen → delete) write roundtrips,
all reverted cleanly; web + api `tsc --noEmit` clean (api shows only the known baseline errors).

## 2026-06-25 — feat/facturation
Clients › Facturation (`apps/web/src/pages/ClientsFacturation.tsx` + `apps/api/src/routes/factures.ts` +
`apps/api/src/lib/pdf/FacturePdf.tsx`) — added the **proforma vs definitive** two-table model on top of the
existing manual-invoicing screen. The API routes are now generalized over a `Kind` config (`TBL` map) and
moved under `/factures/:kind/...` (`kind` = `prov` → `facture_prov`/`ligne_facture_prov`, `def` →
`facture`/`ligne_facture`); the list is `GET /factures?status=prov|def`. Each table keeps an **independent
`numero` sequence** (MAX+1 per table, retry loop). A proforma is fully editable; converting it
(`POST /factures/prov/:id/convert`) copies the header + lines into `facture` with a fresh definitive numero.
Because `facture_prov` has no spare flag, a converted proforma is marked by **overloading
`facture_prov.IDexpedition_divers`** (else always 0) as a back-pointer to the resulting `facture.IDfacture`
(`0` = open/editable, `>0` = converted/locked). Write-path **locks** (server 409 `DEF_LOCK` / `PROV_CONVERTED`,
FE hides the buttons): definitive is read-only AND non-deletable; a converted proforma is read-only. **Email +
historique are definitive-only** (prov/def share the `envoi_email` `IDtype_doc` 19 + a numeric id space, so
emailing a proforma would cross-contaminate histories). Proforma still prints via a `FacturePdf` `isProforma`
variant ("Facture proforma" title + "Document non contractuel" mention; no italic — bundled Lato has no italic
face). FE: the create dialog now picks `prov`/`def`; the detail header shows a Proforma/Définitive/Converti
badge, a "Convertir en facture" action on open proformas, and a "Voir la facture N°…" jump on converted ones.
**Left-panel redesign** (this session's ask): the proforma/definitive selector is now a prominent bordered
segmented control (`Proforma | Définitives` — renamed from "Factures" to kill the collision with the type
filter's "Factures"), and the type filter below it (`Tous | Factures | Avoirs`) uses the standard left-list
filter button group, so the category switch reads as dominant and the filter as subordinate. Verified end-to-end
on local HFSQL; web `tsc --noEmit` clean.

## 2026-06-25 — feat/gestion-client
Clients › Gestion (`apps/web/src/pages/ClientsGestion.tsx`) — right-panel reorganization (UI only, no
API/data changes). The master-data form that previously lived in the **center** panel was moved into the
right sidebar as two new tabs, so the sidebar now reads **Info / Commercial / Contacts / Adresses**:
- **Info** tab (new) holds Général (téléphone, fax, remise %, % AJEOL, secteur, activité, the *client
  interne* / *inclure rapports contrôle* toggles), Facturation (mode de paiement, échéance, TVA, N° TVA,
  code comptable, compte client), and Commentaire — rendered as `InfoCard` + `KVRow` (label-left /
  value-right; `size="sm"` `SearchableCombobox`/`PopoverSelect` in edit mode) wired straight through the
  existing `draft`/`onPatch` state, so the unsaved-changes guard and Enregistrer/Annuler flow cover it.
- **Commercial** tab (new) holds Dernier contact + Journal commercial (same `draft`/`onPatch` plumbing).
- The **center** panel is now purely the read-only history collapsibles (Références / Historique /
  Marchandise); `DetailMain` lost its now-unused `draft`/`onPatch`/lookup props.
The sidebar root width went `w-96` → `w-[26rem]` (one-off for this screen, not recorded in mps_designer)
to fit four tabs, and the per-tab count **pill** was replaced with a compact inline number so "Contacts"
and "Adresses" labels stop truncating against `flex-1` equal widths. Removed the now-dead `Field`,
`SelectField`, and `SectionCard` helpers.

## 2026-06-25 — feat/devis
Clients › Devis PDF (`apps/api/src/lib/pdf/DevisEtmPdf.tsx`) — CONDITIONS header card redesign (follow-up to
the 2026-06-24 header-height work). Three fixes: (1) **icon alignment** — every `flexDirection:'row'`+
`alignItems:'center'` icon+title row in this file rendered the Svg visually *below* its text, because the
content area inherits `lineHeight:1.45`, inflating each line box so glyphs sit at the top while the icon
centers in the tall box. Added tight `lineHeight:1` on the meta labels/values and the card/livraison/
commentaire titles so icons center against the real glyphs. (2) **relevant, distinct icons** — the old card
reused a chat bubble for Réf. client and the calendar for both Validité and Échéance, so at ~10px they read
as identical rectangles; now tag (réf. client) / calendar (validité) / credit-card (paiement) / clock
(échéance), built from a typed `metaItems` array. (3) **vertical space** — conditions moved from 4 full-width
stacked rows to a compact **2×2 grid** (icon beside a stacked caps-label + value), so the conditions card no
longer drives the header height (the client address does). Added a dev script
`apps/api/src/scripts/dump-devis-pdf.ts` (mirrors `dump-soumission-pdf.ts`/`dump-sst-pdf.ts`) that renders a
devis PDF from synthetic data for offline layout inspection. Pure PDF layout — no API/data changes.

## 2026-06-25 — feat/stock-finis
Finis › Stock table (`apps/web/src/pages/FinisStock.tsx`) — cosmetic weight fix. The Poids column cell in
`StockRow` carried a `font-medium` class that bolded every weight value relative to the surrounding columns.
Removed it so the Poids values render at normal weight, consistent with the rest of the table row.

## 2026-06-25 — feat/cmd-client
Clients › Commandes — Ennoblissement supply tab: affectation modal, état pills, and the **create-ennoblisseur-order
from a client line** flow (`apps/web/src/pages/ClientsCommandes.tsx` + `apps/api/src/routes/commandes-client.ts`).
The line-drawer Ennoblissement/Tricotage supply tables gained **N°** + **Date** columns and a solid-hue
`SupplyEtatPill` (En cours / Attente délai / Non envoyé), and single-clicking an ennoblisseur row opens
`EnnoblissementAffectationDialog` (two-panel transfer) to reserve a dyer's input écru rolls to the client fini line
— with a coloris-match fix on `buildEnnoblissement` (`lcs.IDColoris = ctx.coloriId`) so a dye order for a different
coloris of the same ref_fini no longer leaks in. New this branch: below the in-progress orders table, an
**EnnoLocationTable** ports the legacy "029 - écru disponible" panel — tombé-de-métier (écru) of this fini's écru ref
(`ref_fini.IDref_ecru`) available, aggregated by sous-traitant location and grouped **Chez les ennoblisseurs**
(IDtype_sst=2) vs **À l'usine** (other ssts), each row showing Poids (kg) + Métrage potentiel (poids×raw-rendement).
Only ennoblisseur rows carry a gold **Commande** button that opens a location-scoped `CreateEnnoblisseurOrderDialog`
("Disponible chez X" rolls, all pre-selected, Shift-range + Tout/Aucun, date commande/livraison). Creating commissions
a `commande_sous_traitant` + one `type=2` line (IDreference=ref_fini, IDColoris=coloris, quantite=Σpoids×rendement Ml,
unite=0, sstatut=Non_Envoye — INSERT shapes copied verbatim from commandes-sous-traitant.ts), affects the chosen écru
rolls (`stock_ecru.IDref_commande_affectation`), auto-reserves the FREE ones to the client line
(`IDligne_commande_client`, guarded so rolls reserved elsewhere keep their reservation), and auto-prices via
`calcTarifSST` (€/Kg, best-effort). **Affect-only** — `IDmagasin` untouched (physical shipment stays a separate step).
Backend endpoints (all scoped to a fini client line): `GET …/supply/ennoblissement/available-by-location`
(`fetchEnnoLocations` + `resolveSousTraitantTypes`; factory `IDmagasin=0` excluded — only sous-traitant locations),
`GET …/available-rolls[?magasin=<id>]` (`fetchEnnoAvailableRolls`; coloris NOT filtered — dyer dyes any source coloris;
`reserved_elsewhere` surfaced not excluded; available = ref match + not-dyer-affected + not-shipped + not-consumed-by-fini),
`GET/PUT/DELETE …/supply/ennoblissement/:sstLineId/rolls[/:stockId]` (`fetchEnnoRollsPayload`), and
`POST …/supply/ennoblissement/orders` (`ennoOrderBody`). Ennoblisseurs are external → no TRM mirror / no bridge-storm.
Reads verified live (cmd 6899/ligne 12648/040A → MATEL 2 rolls / 26.26 kg / 63 ml). (Memory:
project_clients_line_supply_tabs.)

## 2026-06-24 — feat/devis
Clients › Devis PDF (`apps/api/src/lib/pdf/DevisEtmPdf.tsx`) — header height reduction + delivery-address
relocation. The delivery address (`ADRESSE DE LIVRAISON`) was removed from the top-right combo card and now
renders as its own gold-accent box pinned to the **bottom** of the page, just above the footer band — pushed
down by a `flexGrow` `bottomSpacer`. The top row was reorganized into two tighter cards (`CLIENT` left,
`CONDITIONS` right) sharing a compact `headerCard` style (padding 14→10, tighter line-height, conditions as
a tight label/value grid with 10px icons) so the header band is noticeably shorter. The old `comboCard`/
`AddressCard` usage was dropped in favor of local compact card markup; `buildClientAddress` now returns a
plain `{ name, lines }` shape. No API/data changes — pure PDF layout.
Rapports › Commandes sous-traitants — Excel export date-sort fix (`apps/web/src/pages/RapportCommandesSst.tsx`).
The five date columns (Date commande, Délai initial, Délai actuel, Délai client, Relance) were exported as
French **text** strings (`"24/06/2026"`), so Excel sorted them lexically (by day-of-month) instead of
chronologically. New `dateVal()` helper parses the HFSQL `YYYYMMDD` string into a real JS `Date` (local
midnight; empty/invalid → `null` for a blank cell). Export columns gained a `kind?: 'date'` flag; the date
columns now emit `Date` values and `handleExport` builds the sheet with `aoa_to_sheet(aoa, { cellDates: true })`
so SheetJS writes true date cells (`t:'d'`). Each date cell then gets `z = 'dd/mm/yyyy'` so it still *displays*
in French format while the underlying serial makes the column sortable/filterable in Excel. Quantity/day
columns were already real numbers and unaffected.

## 2026-06-24 — feat/gestion-client
Clients › Gestion (`apps/web/src/pages/ClientsGestion.tsx` + `apps/api/src/routes/clients.ts`, wired in
`router.tsx` replacing the placeholder and `index.ts` under `/api/clients`) — the legacy "Gestion Client"
screen. Master-detail over the `client` table (32 cols) with an **Info / Contacts / Adresses** identity
side and commercial sub-views **Références (catalogue) / Historique (commandes) / Marchandise (expéditions)
/ Tarif (PrixDeVente)**. Contacts/adresses are the shared polymorphic tables keyed on `IDclient`. **HFSQL
rules baked in**: `SELECT * FROM client` returns 0 rows on the Windows ODBC driver, so Windows names an
explicit non-accented column list and reads the archive flag via a separate `WHERE archivé = 1` query
(WHERE tolerates the accent); Linux uses `SELECT *` and reads the truncated key (`archiv`/`bloqu`) off the
row. We NEVER name `archivé`/`bloqué` in a SELECT list. Accented text VALUES (client names like "Amalthée",
"37 Degrés") are written as Latin-1 hex literals via `sqlText()`. INSERT sets `IDsociete = 1` (ETM);
`archivé`/`bloqué` left to HFSQL defaults. Reused the proven client-read pattern from `etudes-coloris.ts` /
`commandes-client.ts` and mirrored `fournisseurs.ts` for CRUD + contacts/adresses. The expedition /
designation_client / ref_client_colori columns were reconstructed from the legacy schema. (Memory:
`project_clients_gestion_screen.md`.)

## 2026-06-24 — feat/suivilot (graphique d'évolution + freinte)
Qualité › Suivi des lots — freinte corrections, end-customer in the récap, and a new
"Graphique" trend modal. **(1) Freinte fixes**: the main-area spec-banner *Freinte* showed
`freinte_demandee` raw (`0,12 %`) — it's a stored fraction like `ref_fini.freinte`, now ×100
(→ 12 %). The computed `freinte_sst` (`1 − (poids_sst·laize_sst/100000)·moyenne_rdt`) was
**removed from the Sous-Traitant Contrôles panel** — it's only an internal-consistency check
between three measurements of the same fabric (≈0 when measured correctly, ambiguous otherwise),
not a real yield loss; the API still computes/returns it (unused by the UI — do not re-add). **(2)
Récap**: *Récapitulatif de la commande* now shows **Client final** (end customer) when the sst
order links to a `commande_client` → `client` (data already plumbed; no backend change). **(3)
Graphique modal**: a `LineChart` icon button left of Modifier (view mode, visible to all — read-only,
not gated on `responsable_qualite`) opens a self-contained SVG line chart (no charting dependency).
New endpoint `GET /suivi-lots/:id/serie?sst=<id>` (suivi-lots.ts) scoped to **same `IDref_fini`** +
a **selectable sous-traitant** (`?sst`, defaults to the lot's own); `SELECT TOP 200 * FROM suivilot
… ORDER BY DATE DESC` reversed to oldest→newest, SELECT * + prefix-regex extraction (never names
accented `*_demandée` cols). **Granularity differs by parameter**: *Rendement* is plotted **per roll**
(each `stock_fini` rdt = metrage/poids, with the lot's target as a reference line), *Laize / Poids /
Stab H / Stab L* **per lot** (SST + Tirelle + Demandé). Response returns `points[]` (per-lot),
`rolls[]` (per-roll, capped 200), and `sous_traitants[]` (every sst that worked on the réf, for the
selector — shown only when >1). Chart UI: param tabs × series toggles × window (50/100/200 = rolls
for rendement, lots otherwise); `0 = non mesuré` omitted; current lot's point(s) cerclé(s) en or when
viewing its own sst. `keepPreviousData` avoids flicker on sst switch. See memory
`project_suivilot_graph_freinte`.

## 2026-06-24 — feat/suivilot
Qualité › Suivi des lots — workflow reform + Contrôles UX, plus a cross-screen cache fix.
**(1) Header cleanup**: removed the non-functional print + email (@) buttons (and their placeholder
dialog) from the lot detail header. **(2) Tolerance gauges**: each Contrôles measurement (Laize, Poids,
Stab H/L, in both Sous-Traitant and Tirelle cards) now renders a tolerance gauge under the value — a
green min→max band with a colored needle at the measured value (green in-band, red out, hidden when not
yet measured), with min/max labels under the band edges; **stab** is a 0-centered ±band (the ref_fini
figure `-5` means ±5 %, mostly shrink) labelled `-5 · 0 · +5`. An unmeasured value renders blank (no "0").
The Rendement row was dropped from both cards. **(3) Quality workflow reform** (see
`project_quality_workflow_reform`): replaces the legacy two-role model with a single `responsable_qualite`
permission (new catalog entry, category "Qualité", per-user in Paramètres › Utilisateurs; effective admin
bypasses). Non-holders get the screen **read-only** (no Modifier, no status change). Backend gates
`PUT /suivi-lots/:id` + `POST /suivi-lots/:id/etat` via `userHasPermission`. The footer is now a **two-verdict**
control — **Valider** (→3) / **Reprendre** (→2) only; `POST /etat` rejects any état ≠ {2,3}; **Reprendre** also
flags the lot's `stock_fini` rolls to `IDetat_stock_fini = 2` so they queue in the Sous-traitants reprise
flow (2→1 happens via the existing re-réception sync). Sending a soumission on Sous-traitants › Commandes
now **auto-sets** the matching `suivilot` to état **5**. État 5 renamed "Attente décision" → **"Attente Client"**
(UI-only — HFSQL `etat_stock_fini` label untouched for legacy), recolored violet, icon changed from HelpCircle
to **User** (person). **(4) Cross-screen cache sync** (see `project_react_query_stale_cross_screen`): new
`apps/web/src/lib/cache-sync.ts` → `invalidateLotQualityCaches(qc)` invalidates both the Qualité and
Sous-traitants query families; wired into `QualiteSuiviLots` `etatMut` and `SousTraitantsCommandes`
`invalidateAll` + soumission-email success, so a change on either screen refreshes the other (the global
5-min React Query `staleTime` previously served stale cache until a hard reload).

## 2026-06-24 — feat/facturation
Clients › Facturation (`apps/web/src/pages/ClientsFacturation.tsx` + `apps/api/src/routes/factures.ts` +
`apps/api/src/lib/pdf/FacturePdf.tsx`, registered `/api/factures`, route wired in `router.tsx`) — the manual
client-invoicing screen (legacy "Détail facture" / "Nouvelle facture"), mirroring Clients/Commandes
(MasterDetailLayout, header Print/Email/Modifier trio, unsaved guard, auto-edit-after-create, SendEmailDialog,
ConfirmDialog) **minus** stock affectation and the status footer (a facture has no lifecycle/paid flag).
Browse/search/filter (Tous / Factures / Avoirs), view + create + edit + delete over `facture`/`ligne_facture`
(ETM scope `IDsociete=1`), free-text line editor (`designation` / `quantite` / free-text `unite` / `prix`),
and computed **HT / TVA / TTC** — no stored totals: HT = Σ(qty×prix), TVA = HT × `tva.valeur`, TTC = HT+TVA.
**`type` 1=Facture / 2=Avoir** as a category chip; an Avoir reads negative in the list + footer (ledger sign),
positive in the grid. `facture` has **no accented columns** (SELECT * safe) but `date`/`type` are reserved
words → written uppercase `DATE`/`TYPE` (same trick as `envoi_email.DATE`). `numero = MAX+1 WHERE IDsociete=1`
with a retry loop. **Create auto-fills billing defaults from the client row** (`num_tva`, `IDtva`,
`IDmode_paiement`, `IDecheance`, `IDcode_comptable` + the `est_defaut_facturation` adresse). PDF (Facture/Avoir,
Malterre frame) + Gmail send (`contact.envoi_facture`, type_doc 19, type-aware subject) + envoi historique.
Sidebar tabs: Info (client, type toggle, date, mode, échéance, TVA select, N° TVA, billing-address picker) +
Historique. **Deferred (Phase 2 — blocked on the not-yet-built Transport/Expéditions module):** legacy
"Génération automatique" + "Factures provisoires" (`facture_prov`, empty in prod) which build invoices from
un-invoiced `expedition` rows, plus the "Factures → Compta" export. No Docs tab (legacy facture detail has
none; `ged` has no IDfacture FK). Verified end-to-end on local HFSQL (list / detail / create-autofill / lines
CRUD / PDF / email-defaults / historique / delete + reserved DATE/TYPE + accent round-trip); web tsc + vite
build clean.

## 2026-06-24 — feat/devis
Clients › Devis (`apps/web/src/pages/ClientsDevis.tsx` + `apps/api/src/routes/devis.ts` + `apps/api/src/lib/pdf/DevisEtmPdf.tsx`, registered at `/api/devis`, route `/clients/devis`) — the ETM client quotations screen (`devis_etm`/`ligne_devis_etm`), ported from the legacy `FI_Devis_ETM`. Mirrors Clients › Commandes (master-detail, Info/Adresses/Docs/Historique tabs, En cours/Soldé footer pill, PDF, Gmail send, ged documents, unsaved-guard) but a devis never reserves stock, so there is **no affectation drawer**. Key model facts (verified against live HFSQL): scope is **`IDprospect = 0`** (client devis; `devis_etm` has **no `IDsociete`**); `numero` = global `MAX(numero)+1`; **`date` is a reserved column** (reads back as `DATE`, written bare) plus a real **`date_expiration`** (drives list urgency); **`remise` is a fraction** (0.05 = 5%), shown/edited as a % and applied as `Σ(qty×prix)×(1−remise)+frais_port`; lines are type 2=fini / 3=divers (with `IDref_ecru` resolved from the fini ref and stored so the legacy app still reads them); never name accented `archivé`/`delai_annoncé`/`déverrouiller`. **Pricing**: a `GET /devis/pricing/suggest` endpoint reuses the ported `PrixDeVenteV4` (`calcTarifRefFini`) to auto-fill an empty line price (editable hint, finished refs only); the client-contract `contrat_tarif`/`tranche_tarifaire` layer is deferred. **Passer en commande**: `POST /devis/:id/convert` creates a `commande_client` + lines, marks the devis soldé, and back-links `devis_etm.IDcommande_ETM` (re-convert blocked). Documents/historique/email key on **`type_doc = 28`** ("devis"); ged docs discriminate on `IDreference=devisId AND IDtype_doc=28` (collision-free, no devis FK on `ged`); email "selected" bucket = `contact.envoi_soumission`. Deferred: read-only "Stock disponible" panel and the full contract-pricing layer. Verified end-to-end (list matches the legacy 7 open devis exactly, N°178 total 803.04 € identical, full create→line→convert→delete round-trip cleaned up). New file `apps/web/src/pages/ClientsDevis.tsx`; replaced the `ClientsDevisPage` placeholder in `router.tsx`.
## 2026-06-24 — feat/rapport
Rapports › Commandes sst (`apps/web/src/pages/RapportCommandesSst.tsx` + `apps/api/src/routes/rapports.ts`) —
added a **Journal** column and corrected the **Commentaire** column source. **(1) Journal column**: surfaces
the commande sst header `journal` field (`commande_sous_traitant.journal`, plain text since the 2026-05-26 RTF
migration; still `stripRtf()`'d defensively). Added to the report row payload (`journal: hdr?.journal || ''`),
the sortable table (new `journal` SortKey + 220px column), the Excel export column catalog (so it appears as a
toggle in the "Colonnes à exporter" picker), and the search haystack/placeholder. **(2) Commentaire column
fix**: repointed it from the per-line `ligne_commande_sous_traitant.commentaire` (with header fallback) to the
commande sst **header** `commentaire` only. Legacy stored unrelated notes on the line comment (e.g. the literal
word "journal"), so a line comment was shadowing the order's real header note; the column now consistently
shows the commande-level commentaire. Both note columns are now header-level (commande sst), matching the
report's per-commande mental model. Note: the export defaults to all-columns only for first-time users — anyone
with a previously-saved selection ticks **Journal** once in the picker to include it.

## 2026-06-24 — feat/cmd-client
Clients › Commandes — line-item creation, pricing, and supply-chain visibility on the existing screen
(`apps/web/src/pages/ClientsCommandes.tsx` + `apps/api/src/routes/commandes-client.ts`, new
`apps/api/src/lib/pricing-ligne-client.ts`). **(1) Nouvelle commande modal**: address pickers now render the
full address (street · CP ville · pays) under each name via `PopoverSelect`'s `description` (canonical
`adresseOption` mapper, designer §11bis); selecting a client **prefills** Mode paiement + Échéance from the
client sheet (`client.IDmode_paiement`/`IDecheance`, now returned by `/lookups/clients`) and the billing/
delivery addresses from their `est_defaut_*` flags. **(2) Clients lookup scoping**: `/lookups/clients` now
filters `IDsociete = 1` (was leaking 27 TRM + 4 Confection clients into the ETM picker). **(3) "Note interne"
→ "Journal"** UI label rename (field `commentaire_interne` unchanged). **(4) Nouvelle ligne modal**: fixed the
Unité dropdown overflowing the Prix input (dropped `size="sm"` → fills its grid cell); `unite=4` label "U" →
"unité" (frontend + `uniteLabel`). **(5) Buyable-ref filter**: the line Référence dropdown is restricted to
the refs assigned to the client in `designation_client` (`/lookups/refs-ecru|refs-fini?client=`, `assignedRefIds`
prunes `archivé`/`caché` in JS via `pickKey` — never named in SQL). **(6) Auto-pricing + roll note** (PrixDeVenteV4
port, `calcLignePriceClient` + `/lookups/line-price`): typing a quantity on an écru/fini line auto-fills the unit
price (€/Ml or €/Kg) for the roll-count tariff tranche, with a padlock to override (session-only). A roll-count
note shows green when the quantity is a whole-roll multiple, amber `>` when it overshoots (roll size =
`poids × round2(rendement)`). A **commercial nudge** appears when the quantity is within 15% of the next cheaper
tranche ("Plus que X Ml pour atteindre N rouleaux → Y €/Ml (−Z%)"). Fini path validated EXACT vs legacy
(040A/beige2585 10 rolls → 10,43 €); écru path derived (fil + tricotage ÷ margin ÷ port), unvalidated. Used
`keepPreviousData` to stop the note collapsing/reflowing on each keystroke, gated on current form inputs so it
clears on a fresh dialog. **(7) Coloris-aware affectation**: the line affectation drawer's "stock disponible"
and the link endpoints now filter/guard by the line's coloris (`stock_fini.IDColoris` / `stock_ecru.IDcolori_ecru`
= line `IDcolori`), so e.g. a beige line no longer offers gris rolls. **(8) Supply tabs**: the affectation drawer
became tabbed (designer §31.4) — Affectation + **Ennoblissement** (fini lines) + **Tricotage** (écru/fini),
showing in-progress sous-traitant orders feeding the line via new `GET /:id/lignes/:ligneId/supply`. Ennoblissement
disponible/affecté (ml) = input écru (`stock_ecru.IDref_commande_affectation`) split by client-affectation × raw
fini rendement (validated EXACT: 240,60 kg × 3,548387 = 853,74 ml); Tricotage affecté/disponible (kg) = output écru
committed to clients / `quantité − affecté` (validated 6388/4000 kg), métrage potentiel = dispo × rendement.
`invalidateAll` now also refreshes the `commande-client-pieces` and `commande-client-supply` caches after line/
affectation edits. The legacy right-side stock panels (écru-by-location, fil-by-tricoteur) were not built.

## 2026-06-23 — feat/suivilot
Qualité › Suivi des lots — enhancements to the existing screen (`apps/web/src/pages/QualiteSuiviLots.tsx`
+ `apps/api/src/routes/suivi-lots.ts`). **(1) RTF commentaire**: the commande's `commentaire` (RTF in
`commande_sous_traitant`) is now run through `stripRtf()` so the Récap shows plain text, not raw `{\rtf…}`.
**(2) Pièces conformity**: each received roll (`stock_fini`) gets a rendement-validity flag via the legacy
`gxRendementMini`/`gxRendementMaxi` model — bounds computed from `ref_fini.poids_Min/Max · laizeHT_Min/Max ·
freinte · rendement` and `suivilot.rendement_demande`; a new **Conforme** column (far-left was moved to a
dedicated far-right **Qualité** column) shows green check / red triangle, and the header shows the valid Rdt
range. **(3) Per-roll quality history**: a new far-right **Qualité** column shows a comment/defect icon
(MessageSquare, or amber AlertTriangle when a defect exists) with a hover tooltip aggregating each roll's
quality stages — Tricotage (source `stock_ecru.observations` + `visiteur`), Défaut tricotage
(`defaut_qualite` Type_Reference=2 keyed on écru + Type_Reference=1 keyed on the écru's `piece_production`),
Ennoblisseur (`stock_fini.observation_sst`), Contrôle fini (`stock_fini.observations`); all accent-repaired,
NUL-padding stripped via `cleanText`. **(4) Contrôle conformity markers**: Laize / Poids / Stab H / Stab L
in both Sous-Traitant and Tirelle cards are flagged conforme/non-conforme live (view + edit) against
`ref_fini` bounds shipped as `ref_bounds` — laize `min≤val≤max`, poids `min≤val≤max`, stab `val ≥
stab_hauteur/largeur`; suppressed when no ref or value not measured. **(5) Freinte SST computed**: the
Sous-Traitant Freinte is now the legacy computed value `1 − (poids_sst·laize_sst/100000)·moyenneRdt`
(was wrongly showing `freinte_demandee`), displayed as a rounded percentage. **(6) En cours / Terminé
filter fix**: the left-list status filter now keys off lot état (`IDetatLot = 3` "Validé" = Terminé),
matching legacy (34 en cours / ~5114 terminé) — it previously keyed off `fin_archivage`, which is actually
the sample-disposal date, not a status. **(7) Archive concept removed**: dropped the bogus "archived"
status (card marker, header badge + toggle button, `POST /:id/archive`, `isArchived`) since `fin_archivage`
is just the disposal date — it remains as the editable "Fin d'archivage" field in the Observations card.
Also fixed a `fixEncoding` aliasing bug (the list selected `st.nom AS sous_traitant_nom` then repaired the
non-existent aliased column, so `Société` rendered mangled — now selects real `nom` and renames in JS), and
gave état 5 "Attente décision" a distinct violet hue so it no longer reads like the gray archived icon.

## 2026-06-23 — feat/ref-tm
Tombé Métier › Références (`apps/web/src/pages/TombeMetierReferences.tsx` + `apps/api/src/routes/references-ecru.ts`) refinements + a new **Coût de tricotage** breakdown. **Jauge/Diamètre** are stored as 1-based ordinals indexing legacy combos (`gtaJauge`: 2→14, 3→18, 4→20, 5→28, no unit — needles/inch; `gtaDiametreMachine`: 2→26", 3→30") — both now display the real value and edit via dropdowns (the raw ordinal is never shown; ordinal 1/`-1`/0 = unset). **Search** is multi-criteria (space-separated AND across reference, désignation, contexture, jauge, diamètre — list endpoint now returns `Jauge`/`diametre`); the footer count tracks the filtered list. Identification header subtitle falls back to contexture when no désignation; Composition/Coloris cards collapse by default per selection. **"+ Nouveau"** auto-generates the next free 3-digit zero-padded reference server-side; duplicate references are rejected on rename (409); fixed the create-selection race (new card stays selected + scrolls into view) and stale-detail-after-delete. **Safeguards**: composition must total 100 % to leave edit mode (empty allowed); the composition AND five fabric-defining header fields (contexture, jauge, diamètre, bio, recyclé) are **frozen** once rolls (`stock_ecru`) or tricoteur orders (`ligne_commande_sous_traitant` type 0/1) exist — UI locks + backend 409/silent-keep; a coloris can't be deleted while affected to a roll, order, or its own composition (per-coloris in-use flags drive a greyed lock affordance + 409 guard). Statistiques gained "Rouleaux créés" + "Poids total" (Σ `stock_ecru.poids`); "Réglages par métier" "+" now opens a modal (`MachineFormDialog`); "Tombé du métier" is a Rouleaux/Plis dropdown. **Coût de tricotage**: refactored `apps/api/src/lib/pricing-trm.ts` to expose `prixDeRevientTRMDetail()` (full per-component breakdown — Frais de structure / Frais de production / Main d'œuvre — with `prixDeRevientTRM`/`trmLinePrix` as thin wrappers, line pricing byte-identical, regression `test-prix-revient-trm.ts` still 9/10); new `GET /api/references-ecru/:id/cout-tricotage?qty=` (default 1000) + a sidebar card and read-only modal with an editable debounced quantity, the three sections, subtotals, and the totals chain (coût → prix de vente ×1/0.7 → prix plancher → prix retenu).
## 2026-06-23 — feat/ref-fini
Finis › Références — added a **Tarif** tab to the detail sidebar plus three small left-list/label
refinements. **Tarif tab** ports the legacy `FI_Tarifs` / WLanguage `PrixDeVenteV4` cost-price
algorithm (the `nType_Ref=2` finished-ref path). New `apps/api/src/lib/pricing-fini-tarif.ts` →
`calcTarifRefFini(IDref_fini, IDcoloris)`, exposed via `GET /api/references-fini/:id/tarif?coloris=<id>`
(added to `references-fini.ts`; defaults to the ref's first coloris when omitted; returns
`tranches: []` rather than erroring when rendement=0 / no coloris / no écru). For a ref+coloris it
builds 9 order-quantity tranches (`<1,1,2,3,4,5,10,15,30` rolls; `PoidsRef = ref_ecru.poids*rollMult+1`)
each with the full breakdown: **fil** (`Σ pourcentage×yarn €/Kg`, preferring `colori_fil.prix_kg`),
**tricotage** (`ref_ecru.prix`, −5%/−10% at 15/30 rolls), **traitement** (per `traitement_ref_fini`,
band price ×1.05 packaging, ×`multiplicateurMatel` for IDtraitement∈{298,285,302}), **teinture**
(dye band ×MATEL mult ×1.05 +GOTS, only `avec_teinture≠0`) → **revient** → vente Kg/Ml via
`venteKg = round(revient/(1-CoefficientV2[i])/(1-tauxPort),2)` (port 5%, 3% at 30 rolls;
`CoefficientV2=[0.60,0.50,0.45,0.40,0.35,0.30,0.27,0.22,0.17]`). All ennoblissement prices read
`tranche_tarif_ennoblissement` rows with **`IDsous_traitant=0`** (the company's own copied-from-MATEL
tariff — no supplier picker); reuses `multiplicateurMatel`/`MATEL_BANDS` from `pricing-sst.ts`. The
legacy `.wdw` is a compressed binary (not extractable); the algorithm came from the WLanguage source
the user supplied, with the output shape confirmed by the Android transpile (`STPrixDétaillé`). UI
(`FinisReferences.tsx`): the single-button sidebar header became a 2-tab bar (Informations | **Tarif**,
`BadgeEuro`); the Tarif tab has a coloris `SearchableCombobox`, a clickable volume-tier grid
(Qté Rlx / Qté Ml / Prix/Ml) and a gold-banded cost breakdown for the selected tranche, all read-only.
Bridge-safe throughout: flat queries + JS merge (no JOIN+CONVERT), `fixEncoding` for label text,
integer-only filters, idField always selected (no `WHERE col=NaN` storm). **Also in this branch**:
left-list search is now multi-criteria (space-separated terms AND-matched across reference+designation);
the footer count reflects the filtered list; and the teinture indicator distinguishes **Simple teinture**
(`avec_teinture=1`, one droplet) vs **Double teinture** (`=2`, two droplets) vs Écru/lavage. Full algo
+ reuse notes in memory `project_prixdevente_v4`.

## 2026-06-23 — feat/cmd-client
Clients › Commandes — new master-detail screen (`apps/web/src/pages/ClientsCommandes.tsx` +
`apps/api/src/routes/commandes-client.ts` mounted at `/api/commandes-client` + PDF
`apps/api/src/lib/pdf/CommandeClientPdf.tsx`; the `router.tsx` placeholder was replaced). First
real Clients screen. Mirrors `FilsCommandes` (§28 unsaved guard, §29 binary status footer, §30
deadline urgency, §31 in-screen drawer, §32 email, §34 ged docs) and the sous-traitant commande
flow. **Data/semantics**: `commande_client` / `ligne_commande_client`. ETM scope on every
read/write = `IDsociete=1 AND IDcommande_ETM=0` (IDsociete=2 rows are TRM mirrors owned by the
sister company — this route is NOT the TRM-mirror writer, so none of that machinery is carried).
numero allocator = `MAX(numero)+1 WHERE IDsociete=1` with retry. **Centerpiece = stock
affectation**: each line reserves rolls via `stock_ecru.IDligne_commande_client` /
`stock_fini.IDligne_commande_client` (distinct from the sst `IDref_commande_affectation`); the
in-screen drawer shows "Stock affecté" ↔ "Stock disponible" with a unit-aware progress gauge.
**Line polymorphism** (`ligne_commande_client.TYPE`, reserved word → `TYPE AS type_kind`, write
uppercase; `IDcolori` is lowercase not IDColoris): 1=écru (`ref_ecru`+`colori_ecru`), 2=fini
(`ref_fini`+coloris by `avec_teinture`), 3=divers (`ref_divers.designation`, display-only, no
affectation). **`unite` enum** (hardcoded, verified empirically): 1=Kg→sum roll `poids`, 3=Ml→sum
roll `metrage`, 4=U, 5=m² — écru rolls carry `metrage=0` so écru (unite=1) gauges on poids.
Available fini = `IDref_fini` match, not reserved, not on a shipment (`IDligne_expedition` 0/NULL),
`IDetat_stock_fini<>4` (Expédié); available écru = `IDref_ecru`, `IDsociete=1`, not shipped
(`IDligne_expedition_ETM` 0/NULL), not reserved, not at a dyer (`IDref_commande_affectation` 0/NULL),
not consumed into a stock_fini. **Real bon-de-commande PDF + Gmail email** (§32, `type_doc 7`
"commande client" for the envoi_email log + ged discriminator `IDcommande_client=id AND
IDcommande_sous_traitant=0`); TVA from the `IDsociete=1` default `tva` row (≈20%). Manual pricing
(montant = quantite×prix; no auto-pricing — devis/facture cost-price lives elsewhere). Computed list
phase = a_affecter / partielle / terminee. **HFSQL footguns honoured**: `SELECT * FROM client`
returns 0 rows → explicit columns only, and clients are filtered by `est_visible=1` only (NOT
IDsociete); accented cols never named (`archivé`/`expedié`/`envoyé_client`, line
`delai_annoncé`/`déverrouiller`); accent-safe writes via `sqlText()` (Latin-1 hex); `echeance` /
`mode_paiement` label col = `libelle`; flat-query resolution (no CONVERT-in-JOIN); batched
`fixEncoding`. Verified end-to-end on local HFSQL (list/detail/CRUD/affectation link-unlink/PDF/
email-defaults/historique).

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

# Sous-traitants Commandes — status model, soumission lot, historique

Reference doc for the sous-traitant commande detail screen
(`apps/web/src/pages/SousTraitantsCommandes.tsx` + `apps/api/src/routes/commandes-sous-traitant.ts`).

## Status model — computed "phase" (no DB column)

Legacy MPS had three layers of status, only one of which writes anywhere
useful today:

| Layer | Field | Today |
|---|---|---|
| Header | `commande_sous_traitant.est_soldee` BOOLEAN | Gates writes via `refuseIfTerminee`. Drives the Clôturer / Rouvrir toggle. |
| Line | `ligne_commande_sous_traitant.sstatut` VARCHAR (12 legacy values) | **Not surfaced in the new UI.** Legacy app keeps writing; MPS_NG ignores. |
| Roll | `stock_fini.IDetat_stock_fini` SMALLINT FK → `etat_stock_fini` | Per-roll workflow state, real DB enum (5 values). |

The header pill the user sees is a **computed phase** derived on-read,
priority top-down (first match wins):

| Phase | When | Color |
|---|---|---|
| **terminée** | `est_soldee = 1` | Green (`bg-success`) |
| **en_reprise** | any `stock_fini` row has `IDetat_stock_fini = 2` | Orange |
| **soumis** | any `envoi_email` with `IDtype_doc = 15 AND IDreference = commandeId` | Violet |
| **en_controle** | any `stock_fini` row exists (rolls received) | Amber |
| **en_cours** | default | Primary blue |

Helpers in `commandes-sous-traitant.ts`:
- `computePhase(id, est_soldee)` — single commande, used by `GET /:id` detail
- `computePhasesBatch(rows)` — batched IN-queries + JS merge, used by `GET /` list

`SstPhase` type lives in both `commandes-sous-traitant.ts` and
`SousTraitantsCommandes.tsx`. `SST_PHASE_META` carries label + lucide icon +
pill class + solid class (for the StatusFooter band).

**Manual close only**: the auto-close trigger (`maybeAutoCloseCommande`)
is no longer called from the line-update path. Users clôture via the
StatusFooter button. The function definition remains for future revert.

**List filter** accepts `?status=` with: `all`, `terminee`, `en_cours`,
`en_controle`, `soumis`, `en_reprise`. The four sub-phases of
`est_soldee=0` are resolved server-side via signal-ID sets +
`IN (…)` / `NOT IN (…)` predicates so pagination still works.

## Soumission Lot Client feature

End-to-end flow for sending a soumission to a client whose
`designation_client.soumettre = 1` for that ref_fini.

### Eligibility

A "lot" is eligible when:
1. A `stock_fini` row points back to this commande's lines
   (`IDref_commande_source IN (lines)`)
2. The roll is reserved to a client via the chain
   `stock_fini.IDligne_commande_client → ligne_commande_client → commande_client.IDclient`
3. `designation_client.soumettre = 1 AND archivé = 0` for that
   `(IDclient, IDref_fini)` pair

Lot key tuple: `(IDref_fini, IDColoris, lot, IDcommande_client)`.
Helper: `findEligibleLots(commandeId)` (exported from
`commandes-sous-traitant.ts` for the dump-soumission-pdf dev script).

### Endpoints (all under `/commandes-sous-traitant/:id/soumission/…`)

- `GET /lots-eligibles` — returns `{ lots: EligibleLot[] }` (frontend
  uses `length === 0` to hide the button, `length === 1` to skip the picker)
- `GET /pdf?ref_fini=&coloris=&lot=&commande_client=` — inline PDF preview
- `GET /email-defaults?…` — recipients (client contacts with
  `envoi_soumission = 1` pre-selected) + subject + body
- `POST /email` — sends + logs to `envoi_email` with `IDtype_doc = 15`,
  `notes = <lot string>`, `IDreference = commandeId` (matches the legacy
  WinDev convention so the legacy app reads our outgoing soumissions
  alongside its own)

### PDF

`apps/api/src/lib/pdf/SoumissionLotPdf.tsx` — one-page document built on
`MalterreDocument`. Layout mirrors the legacy WinDev report: reference
strip (Référence Client / Malterre / Coloris) → "Détails de la commande"
table → "Adresse de livraison" panel → "Soumission" table (Date /
Expéditeur / Destinataire / Lot ou Bain) → large empty
"Attacher l'échantillon ici" frame for the physical swatch.

Custom inline SVG icons in the file: `FabricRollIcon`, `PaletteIcon`.

Destinataire is auto-filled from the client's contact whose
`contact.envoi_soumission = 1` (same boolean already used by
`etudes-coloris.ts:701` for sst soumissions).

### Frontend

`SousTraitantsCommandes.tsx`:
- "Soumettre au client" button in `DetailHeader` (between Email + Modifier),
  gated on `eligibleLots.length > 0`. Send icon (lucide).
- `SoumissionLotPicker` dialog — modelled on the existing
  `AdressePickerDialog` (~line 3494). Shown only when 2+ lots are eligible;
  single-lot flow jumps straight to the email modal.
- Reuses `SendEmailDialog` with the soumission-specific endpoints. The
  `extraBody` field on `postEmail()` carries the lot params through
  to the server (lot params survive across recipient changes).

## Historique tab

Right-sidebar tab (4th tab, Clock icon) showing the commande's event
timeline. Backed by `GET /:id/historique`.

### Sources

- `envoi_email` rows where `IDtype_doc IN (13, 15)` AND
  `IDreference = commandeId`. (Type 14 = avis expedition is **excluded**
  — its `IDreference` is polymorphic and points to `expedition.IDexpedition`
  not commande_sous_traitant. See HFSQL rules.)
- `reponse_soumission` rows where `IDcommande_sous_traitant = id`. Each
  row is one client decision: `reponse = 1` (approved, green check) or
  `0` (rejected, red X), with `DATE` + `lot`.

### Event grouping (envoi_email)

Multi-recipient sends produce one row per recipient (e.g. 4 MATEL
recipients of a single bon-de-commande email). The endpoint groups by
`(IDtype_doc, DATE truncated to the minute)` so the timeline shows one
event per real action. **Minute precision is intentional** — a send burst
can straddle the second boundary (e.g. timestamps `17:00:31.855 → :32.026`).

### Frontend types

`HistoriqueEvent` is a discriminated union:
- `{ kind: 'email', recipients[], notes (lot id), … }` — rendered by `EmailEventCard`
- `{ kind: 'reponse', reponse (0|1), lot, … }` — rendered by `ReponseEventCard`

`HISTORIQUE_EMAIL_META` maps `IDtype_doc → { label, icon, accent }`:
- 13 = "Bon de commande envoyé" (AtSign, blue)
- 14 = "Avis d'expédition envoyé" (Truck, cyan) — meta retained for a
  future expedition-chain wiring (sst lines → stock_fini → expedition)
- 15 = "Soumission au client" (Send, violet)

## Reprise flow

Multi-select fini rolls whose `IDetat_stock_fini = 2` ("En reprise") in
the Réception tab → "Reprendre (X)" button in the tab strip header →
opens `BatchReceptionDialog` in `mode='reprise'` (discriminated union):

- Pre-fills lot/poids/metrage/observations from the existing fini rows
- Submits PATCH per fini (not POST) with the edited values
- Resets `IDetat_stock_fini` back to `1` (En contrôle) server-side
- Hides Tricobot (create-only)

PATCH endpoint at `PATCH /:commandeId/lignes/:ligneId/pieces/fini/:stockFiniId`
accepts: `observations`, `observation_sst`, `numero`, `lot`, `poids`,
`metrage`, `IDetat_stock_fini`.

## PDF: Bon de commande sous-traitant

`apps/api/src/lib/pdf/CommandeSoustraitantPdf.tsx` — significantly
redesigned this session:

- Header: two-line yellow band ("BON DE COMMANDE" / "SOUS-TRAITANT N°X")
- Top right card combines délai de livraison + adresse de livraison
  (single bordered cell with internal divider)
- DÉSIGNATION column hierarchy: large primary-blue ref label →
  prominent coloris → designation subtitle → treatment chip pills →
  "OUVERT AU LARGE" comment (gray, MessageSquare icon, no frame) →
  POIDS/LAIZE/RENDEMENT chips on one line → ARTICLE INITIAL block
- Quantité prévue + Poids affecté + grand total bigger (11pt → 13pt
  grand). Top margin tightened (32pt → 16pt).
- "Stock à mettre en œuvre" moved to a **second logical Page**
  (`MalterreDocument.secondPage` prop, `paddingTop: 36`). Pieces
  chunked at `V2_CHUNK_SIZE = 17` so each chunk renders as a complete
  rounded-corner table that fits on its own physical page (with the
  section title on page 1 of secondPage).
- Lato Black quirk: ALL CAPS accented chars (À, É, Œ) render with
  detached diacritics under @react-pdf — strip accents from any
  uppercase title (e.g. "STOCK A METTRE EN OEUVRE").

`MalterreDocument` gained a `secondPage?: { paddingTop?, children }` prop
and a `PageFooter` helper extracted from the original single-page render.

## type_doc codes used by this screen

Legacy lookup `type_doc` (29 rows). Codes touched by MPS_NG:
- `13` "commande sst" — bon de commande email to the ennoblisseur
- `15` "soumission" — sst → client soumission. `IDreference =
  commande_sous_traitant.IDcommande_sous_traitant`, `notes = <lot>`
- `27` "labo coloris" — étude-coloris demande (`etudes-coloris.ts`)

History: we briefly used `30` in one session before catching the legacy
`15` convention. The reverse migration is
`apps/api/src/scripts/migrate-revert-type-doc-30.ts` (idempotent — safe
to re-run in any environment that may have stale rows).

## Tests (manual)

- Phase distribution probe: `apps/api/src/scripts/inspect-phase-distribution.ts`
- Soumission PDF dump: `apps/api/src/scripts/dump-soumission-pdf.ts`
  (uses exported `findEligibleLots` + `buildSoumissionLotPdfData`)
- Bon de commande PDF dump: `apps/api/src/scripts/dump-sst-pdf.ts`

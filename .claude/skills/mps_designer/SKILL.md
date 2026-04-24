# MPS Designer Skill

## Overview

Design system for **MPS_NG**, the ERP system for **ETS Malterre** (French textile/knitting manufacturer). This document is the single source of truth for all visual patterns — follow it precisely when building new screens or modifying existing ones.

## Reference implementations

There are **two** gold-standard references in the codebase. Pick the one whose layout matches the use case before writing any code; do not invent a third layout pattern.

| Screen | File | Use when |
|---|---|---|
| **`/fournisseurs/gestion`** (3-panel) | `apps/web/src/pages/Fournisseurs.tsx` | One entity at a time has rich nested data (contacts, addresses, sub-resources) and the user works on one record start-to-finish. Implements `MasterDetailLayout`, collapsible card sections with status-colored items, side-by-side edit dialogs with file upload + PDF preview, sidebar tabs with inline edit forms, global vs per-section edit state. **§4–§9, §18, §21–§25.** |
| **`/fournisseurs/stock`** (table-centric + slide-in drawer) | `apps/web/src/pages/FournisseursStock.tsx` | The page is fundamentally a sortable / searchable list of many flat rows; selecting a row reveals a focused detail view, but the row-set is the primary working surface. Implements toolbar (search + filters + create), split-aligned sortable table, right slide-in drawer, embed-mode top-offset, "Nouveau" creation dialog, KV-row drawer cards. **§27.** |

When in doubt about a single rule, look at both references. When in doubt about which *layout* to choose, ask the user — do NOT mix patterns from both into a hybrid third design.

**Every edit-mode screen — regardless of layout — must also plug into the unsaved-changes guard (§28).** This is not optional; it applies to both patterns above.

---

## 1. Brand Colors

### Primary Palette

| Name | Hex | HSL | CSS Variable | Usage |
|------|-----|-----|--------------|-------|
| **Primary Blue** | `#143D6B` | `211 68% 25%` | `--primary` | Sidebar background, primary buttons |
| **Vivid Gold** | `#F2B80A` | `44 92% 50%` | `--accent` / `--gold` | CTAs, active states, highlights, focus rings |
| **Accent Blue** | `#3B7DC9` | `211 68% 35%` | `--accent-blue` | Links, secondary actions |

### Extended Palette

| Name | HSL | CSS Variable | Usage |
|------|-----|--------------|-------|
| Teal | `175 42% 45%` | `--teal` | Complementary accent, alt badges |
| Terracotta | `18 55% 48%` | `--terracotta` | Warm accent, alt icon boxes |
| Sand | `38 20% 93%` | `--sand` | Warm surface backgrounds |
| Success Green | `152 69% 40%` | `--success` | Success states |
| Warning Amber | `38 92% 50%` | `--warning` | Warning states |
| Destructive Red | `0 72% 51%` | `--destructive` | Error states, delete actions |

### Surface Colors

| Name | HSL | CSS Variable | Usage |
|------|-----|--------------|-------|
| Background | `40 18% 99%` | `--background` | Page background (bright warm white) |
| Card | `0 0% 100%` | `--card` | Card surfaces (pure white) |
| Muted | `38 12% 96%` | `--muted` | Disabled backgrounds, soft surfaces |
| Border | `211 10% 91%` | `--border` | Default borders |

### Shadows (Blue-tinted)

All shadows have a soft blue tint from `rgb(20 61 107)`:

```css
--shadow-sm: 0 1px 2px 0 rgb(20 61 107 / 0.04), 0 1px 3px 0 rgb(20 50 90 / 0.02);
--shadow-md: 0 4px 6px -1px rgb(20 61 107 / 0.05), 0 2px 4px -2px rgb(20 50 90 / 0.02);
--shadow-lg: 0 10px 15px -3px rgb(20 61 107 / 0.06), 0 4px 6px -4px rgb(20 50 90 / 0.03);
```

### Gradients

```css
--gradient-brand: linear-gradient(135deg, hsl(211 68% 25%) 0%, hsl(211 68% 18%) 100%);
--gradient-accent: linear-gradient(135deg, hsl(44 92% 50%) 0%, hsl(44 92% 43%) 100%);
--gradient-accent-subtle: linear-gradient(135deg, hsl(44 92% 50% / 0.10) 0%, hsl(44 92% 50% / 0.03) 100%);
```

---

## 2. Typography

### Fonts (OS system stack)

The app intentionally uses the **OS default UI font** for everything — Segoe UI on Windows, San Francisco on macOS, Roboto on Android/Linux — via the `system-ui` CSS keyword. No web fonts are loaded. No `@import` in `index.css`, no `<link>` tags in `index.html`, no `@font-face`.

| Tailwind Class | Resolves to | Usage |
|----------------|-------------|-------|
| `font-sans` | system-ui stack | Body text (default) |
| `font-heading` | system-ui stack | Headings (h1-h6), applied automatically via base CSS |

Both utilities map to the same stack in `tailwind.config.js`:

```js
fontFamily: {
  sans: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
  heading: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
}
```

`font-heading` is kept as a separate utility (identical resolution) because many call sites already use `className="font-heading"` on headings and we want room to swap in a real display font later if needed.

**Historical note**: earlier iterations of this project tried to load Anton (display) + Lato (body) from Google Fonts via `@import`. The `@import` statement was placed after `@tailwind base` in `index.css`, which is invalid per the CSS spec (`@import` must come before any style rule), so browsers silently dropped it and the fonts never loaded. The app rendered in the system stack the entire time, which is the look the project has grown into and kept. The broken `@import` and the Anton/Lato references were removed in April 2026 — do NOT re-add `@import url('https://fonts.googleapis.com/...')` to `index.css` without an explicit design decision to swap the heading font, because it will silently change every screen.

### Heading Pattern

All h1-h6 automatically get `font-heading tracking-tight` via base CSS in `index.css`. For explicit usage:

```tsx
<h1 className="text-2xl font-heading font-bold tracking-tight">Page Title</h1>
```

Because `font-heading` currently resolves to the same stack as `font-sans`, `font-heading` has no *visual* effect on its own — weight/size/tracking do the lifting. Keep the className on headings anyway so the swap is a one-line config change if we ever pick a real display font.

### Text Hierarchy

| Style | Class | Usage |
|-------|-------|-------|
| Page title | `text-2xl font-heading font-bold tracking-tight` | Main entity name in detail header |
| Card title | `text-sm font-semibold` | Card section headers (Notes, Competences) |
| Form title | `text-xs font-semibold text-accent uppercase tracking-wide` | InlineForm headers |
| Body text | `text-sm` | Default content |
| Secondary | `text-sm text-muted-foreground` | Descriptions, notes content |
| Caption | `text-xs text-muted-foreground` | Metadata, counts, dates |
| Empty state | `text-sm text-muted-foreground italic` | "Aucune note", "Aucun contact" |
| Badge label | `text-xs` or `text-[10px]` | Badge content |

---

## 3. App Shell Layout

### Structure (`AppShell.tsx`)

```
┌──────────────────────────────────────────────┐
│ [Sidebar]  │  [Header bar]                   │
│  fixed     │  sticky top, h-14               │
│  left      │──────────────────────────────────│
│  w-64/w-16 │  [Main content]                 │
│            │  flex-1, p-4 lg:p-6             │
│            │  overflow-hidden                 │
└──────────────────────────────────────────────┘
```

- Root: `h-screen bg-background flex overflow-hidden`
- Content area margin: `lg:ml-64` (expanded) or `lg:ml-16` (collapsed)
- Transition: `transition-all duration-300`

### Sidebar (`Sidebar.tsx`)

- **Width**: 256px expanded (`w-64`), 64px collapsed (`w-16`)
- **Position**: `fixed left-0 top-0 z-40 h-screen`
- **Background**: `bg-gradient-to-b from-primary via-primary/95 to-primary/90`
- **Border**: `border-r border-primary/20`
- **Logo**: `text-accent` (gold), `font-semibold text-2xl`, shows "MPS" expanded / "M" collapsed

#### Nav Items

```tsx
// Active state
className="bg-white/20 text-white"
// + gold indicator bar:
<div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />

// Inactive state
className="text-white/85 hover:bg-white/10 hover:text-white"

// Item dimensions
className="flex h-12 items-center gap-3 rounded-md px-3 text-sm font-medium"
```

#### Sections (top to bottom)
1. Logo bar (`h-14`, `border-b border-white/10`)
2. Dashboard item
3. Separator (`border-t border-white/10`)
4. Main navigation items (scrollable)
5. Settings item (`border-t border-white/10`)
6. Collapse toggle (`border-t border-white/10`)

### Header (`Header.tsx`)

```tsx
className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-gold/30 bg-gradient-to-r from-gold/40 via-gold/15 to-transparent px-4 lg:px-6 shadow-sm"
```

- **Height**: 56px (`h-14`)
- **Background**: Gold gradient left-to-right (darker left → transparent right)
- **Border bottom**: `border-gold/30`
- **Content** (left to right): Mobile menu button | Submenu tabs | Spacer | Fullscreen toggle | User avatar

#### Submenu Tabs (in header)

```tsx
// Active tab
className="bg-accent text-accent-foreground shadow-sm"
// Inactive tab
className="text-muted-foreground hover:bg-accent/10 hover:text-accent"
// Shared
className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap"
```

---

## 4. MasterDetailLayout (3-Panel)

Component: `apps/web/src/components/layout/MasterDetailLayout.tsx`
Hook: `apps/web/src/hooks/useResponsiveLayout.ts`

> **Don't use this for list-heavy screens.** If the page is fundamentally a sortable / searchable / filterable table of many flat rows, use the **table-centric pattern** in §27 instead — that's the layout used by `/fournisseurs/stock`.

### Props

```typescript
{
  list: ReactNode           // Left panel content
  detailHeader: ReactNode   // Top of center panel
  detail: ReactNode         // Center panel body (scrollable)
  sidebar: ReactNode | null // Right panel content
  sidebarTitle?: string     // Drawer header label
  hasSelection: boolean     // Whether an item is selected
  onBack: () => void        // Back button handler (stacked mode)
}
```

### Responsive Modes

| Mode | Breakpoint | Layout |
|------|-----------|--------|
| **Full** | ≥ 1400px | 3 columns: list + detail + sidebar inline |
| **Compact** | 1240–1400px | 2 columns: list + detail; sidebar in right drawer |
| **Stacked** | < 1240px | 1 column: list OR detail; sidebar in right drawer |

### Full Mode Layout

```
┌─────────┬────────────────────────┬───────────┐
│  List   │  Detail Header         │  Sidebar  │
│  w-72   │────────────────────────│  w-96     │
│         │  Detail Body           │  (tabs)   │
│         │  (scrollable)          │           │
└─────────┴────────────────────────┴───────────┘
gap-4 between all panels
```

### Sidebar Drawer (compact/stacked modes)

```tsx
// Overlay
className="fixed inset-0 z-40 bg-black/50"
// Drawer panel
className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-background shadow-lg transition-transform duration-300"
// Slides: translate-x-full (hidden) → translate-x-0 (visible)
```

---

## 5. Left Panel: Entity List

Container:
```tsx
className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80"
```

### Panel Background Pattern

All panels (left list, right sidebar) and section item cards use **Zinc** background for contrast against white cards:
- **Panel body**: `bg-zinc-100/80` — neutral dense gray
- **Header/footer areas**: `bg-zinc-200/50` — slightly darker for visual structure
- **Item cards inside sections** (certificats, refs, commandes): `bg-zinc-100/80`
- **Contact/address cards in sidebar**: `bg-card` (white) since they sit on the zinc panel
- **Scrollbar**: Use `scrollbar-transparent` utility class for blending

### Search Bar (top, `border-b`)

```tsx
<div className="p-3 border-b rounded-t-lg bg-zinc-200/50">
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <input className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
  </div>
</div>
```

### List Items (scrollable body, `p-3 space-y-2 scrollbar-transparent`)

```tsx
// Selected item
className="p-3 border rounded-lg cursor-pointer border-accent bg-white ring-1 ring-accent"

// Unselected item
className="p-3 border rounded-lg cursor-pointer border-border bg-white hover:border-accent/50"
```

Item content:
- Row: icon (`h-4 w-4 text-muted-foreground`) + name (`font-medium text-sm truncate`)
- Optional subtitle: `text-xs text-muted-foreground mt-1 line-clamp-2`

### Footer (bottom, `border-t`)

```tsx
<div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
  <span>{count} entreprise{plural}</span>
  {isEditing && (
    <Button size="sm" variant="ghost" className="text-accent hover:text-accent hover:bg-accent/10">
      <Plus className="h-3.5 w-3.5 mr-1" />Nouveau
    </Button>
  )}
</div>
```

"Nouveau" button only visible in edit mode.

### Empty/Loading States

- **Loading**: centered `<Loader2 className="h-6 w-6 animate-spin text-accent" />`
- **Error**: centered `<AlertCircle />` + error message in `text-destructive`
- **Empty list**: centered large icon (`h-12 w-12 opacity-50`) + `text-sm` message
- **No selection** (detail area): centered `icon-box-gold h-16 w-16` + instruction text

---

## 6. Center Panel: Detail Header

Position: flex-shrink-0 at top of center panel.

```tsx
<div className="flex-shrink-0 pt-0.5">
  <div className="flex items-center gap-3">
    {/* Icon box */}
    <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center',
      isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
      <EntityIcon className="h-5 w-5" />
    </div>

    {/* Name + badges */}
    <div className="min-w-0 flex-1">
      {isEditing ? (
        <div className="flex items-center gap-3">
          <input className="flex-1 text-xl font-heading font-bold h-10 px-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
          <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm">
            <Pencil className="h-3 w-3" />Mode edition
          </Badge>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-heading font-bold tracking-tight truncate">{name}</h1>
          {/* Optional badges below name */}
          <div className="flex gap-1.5 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">{label}</Badge>
          </div>
        </>
      )}
    </div>

    {/* Action buttons */}
    <div className="flex items-center gap-2 flex-shrink-0">
      {isEditing ? (
        <>
          <Button variant="outline" size="sm"><X />Annuler</Button>
          <Button size="sm"><Save />Enregistrer</Button>
        </>
      ) : (
        <>
          <Button variant="outline" size="icon" className="h-9 w-9" title="Action"><Icon /></Button>
          <Button variant="outline" size="sm"><Pencil />Modifier</Button>
        </>
      )}
    </div>
  </div>

  {/* Gold accent line below header */}
  <div className={cn('h-1 w-24 mt-3 rounded-full',
    isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30')} />
</div>
```

### Key Details

- **Icon box**: `h-11 w-11 rounded-lg`, uses `icon-box-gold` in view mode, `bg-accent/15` in edit mode
- **Name input** (edit mode): `text-xl font-heading font-bold h-10` — matches heading visually
- **"Mode edition" badge**: `bg-accent text-accent-foreground` with `Pencil` icon
- **Gold accent line**: `h-1 w-24 mt-3 rounded-full`, gradient in view mode, solid in edit mode
- **Buttons**: `size="sm"` for text buttons, `size="icon" className="h-9 w-9"` for icon-only

### 6.1 Standard view-mode action buttons (Print + Email + Modifier)

Every detail screen should surface the same canonical set of view-mode action buttons, in this order, right-aligned in the header row:

1. **Imprimer** — `<Printer>` icon, opens a placeholder Dialog (see §18 "En developpement")
2. **Envoyer un email** — `<AtSign>` icon (**not** `<Mail>`), opens a placeholder Dialog (see §18 "En developpement")
3. **Modifier** — `<Pencil>` icon + "Modifier" text, switches to edit mode. **Always `variant="gold"`** — the gold CTA is the canonical "enter edit mode" affordance across the whole app.

```tsx
// Inside the view-mode branch of the button row
<>
  <Button variant="outline" size="icon" className="h-9 w-9" title="Imprimer" onClick={onPrintClick}>
    <Printer className="h-4 w-4" />
  </Button>
  <Button variant="outline" size="icon" className="h-9 w-9" title="Envoyer un email" onClick={onEmailClick}>
    <AtSign className="h-4 w-4" />
  </Button>
  <Button variant="gold" size="sm" onClick={onStartEdit}>
    <Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier
  </Button>
</>
```

**Icon choice is canonical**: use `AtSign` for the email *trigger* button (it's the recognisable "@" symbol and reads as an action, not a field label). `Mail` is reserved for the Dialog's large central icon and for contact-card sub-rows showing an email address inline. Do NOT swap them.

**Modifier button colour is canonical**: always `variant="gold"`. Never `variant="outline"`, never `variant="default"` (which is primary blue). The gold CTA across all screens reinforces "this is THE primary action on a view-mode screen — enter edit mode".

`onPrintClick` and `onEmailClick` flip page-level state (`setPrintModalOpen(true)` / `setEmailModalOpen(true)`) that opens the corresponding placeholder Dialog (§18). Both Dialogs are always mounted at the page root as siblings of the `MasterDetailLayout`, alongside any other top-level dialogs (`UnsavedChangesDialog`, `CreateXxxDialog`, etc.).

Reference implementations: `apps/web/src/pages/Entreprises.tsx`, `apps/web/src/pages/Fournisseurs.tsx`, `apps/web/src/pages/FournisseursStock.tsx`, and `apps/web/src/pages/FournisseursCommandes.tsx` — all four use `<Button variant="gold">` for the Modifier action.

---

## 7. Center Panel: Detail Body

The detail body hosts one of two layouts. Pick before writing code — they are not mixable:

| Shape | When to use | Outer classes |
|---|---|---|
| **Multi-section** — several distinct content groups stacked (notes, competences, certs, commandes, recommandations…) | The record has several independent concepts that each deserve their own titled surface | `flex-1 min-h-0 overflow-auto space-y-4` with one `<Card>` per section (often §23 collapsible) |
| **Single-list** — the whole center panel IS one list of rows (lignes of a commande, soumissions of an étude, mouvements of a stock lot…) | The record has one primary nested resource that's also its main interaction surface | `flex-1 min-h-0 flex flex-col` directly (§31 pattern), **no framing Card, no section title** |

For the single-list shape, **do not** wrap the rows in a `<Card>` with a "Section Title" + chevron + count-badge header. That pattern belongs to §23 (multi-section). The étude's title is already one screen-row above — a second "Soumissions" title would just duplicate it, eat vertical space, and invite the user to collapse the only thing on the screen. Render the row list as the flex-sibling body from §31.1, with the drawer as a second flex sibling below. Reference: `LignesSection` in `FilsCommandes.tsx`, `SoumissionsSection` in `EtudesColoris.tsx`.

### Cards (`.card-premium`)

```tsx
<Card className={cn('card-premium', isEditing && editSectionClass)}>
  <CardHeader className="pb-2">
    <CardTitle className="text-sm font-semibold">Section Title</CardTitle>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
</Card>
```

**Edit mode indicator** (`editSectionClass`):
```tsx
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'
```
Adds a gold left border and very subtle gold background tint.

### Card Header with Icon + Action

```tsx
<CardHeader className="flex flex-row items-center gap-2 pb-2">
  <Icon className="h-4 w-4 text-accent" />
  <CardTitle className="text-sm font-semibold">Title</CardTitle>
  <Badge variant="secondary" className="text-xs ml-auto">{count}</Badge>
  {isEditing && (
    <Button variant="ghost" size="icon" className="h-6 w-6">
      <Plus className="h-3.5 w-3.5" />
    </Button>
  )}
</CardHeader>
```

### Notes Card (view vs edit)

- **View**: `<p className="text-sm text-muted-foreground whitespace-pre-line">`
- **Empty**: `<p className="text-sm text-muted-foreground italic">Aucune note</p>`
- **Edit**: `<textarea rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />`

### Competence Badges

```tsx
// Existing competence
<Badge className="bg-accent/10 text-accent hover:bg-accent/20 border-accent/20">
  {label}
  {isEditing && (
    <button className="ml-1.5 rounded-full hover:bg-destructive/20 hover:text-destructive p-0.5 -mr-1 transition-colors">
      <X className="h-3 w-3" />
    </button>
  )}
</Badge>

// Available competence to add (shown on "+" click)
<Badge variant="outline" className="cursor-pointer hover:bg-accent/10 transition-colors">
  <Plus className="h-3 w-3 mr-1" />{label}
</Badge>
```

Available competences section: `mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-2`

### Item View Cards (certificats, refs, commandes, recommandations)

Cards use a consistent two-row layout with a colored left accent border and an icon box.

**Important**: Use `cn()` to combine the base classes with the border color class. Do NOT use a static className string — `twMerge` inside `cn()` resolves `border` + `border-l-4` in a specific way that produces the correct thin left accent.

#### Card Color Variants

The full status color system — left border, icon box, icon color, AND matching badge — should always be used together for visual consistency.

| Status | Left border | Icon bg | Icon color | Status badge |
|--------|-------------|---------|------------|--------------|
| **Neutral / Default** | `border-l-amber-400/60` | `bg-amber-400/10` | `text-amber-600` | `variant="secondary"` |
| **Success / Valid** | `border-l-green-500/60` | `bg-green-500/10` | `text-green-600` | `badge-success` |
| **Warning / In progress** | `border-l-amber-400/60` | `bg-amber-400/10` | `text-amber-600` | `badge-warning` |
| **Danger / Error / Expired** | `border-l-destructive/60` | `bg-destructive/10` | `text-destructive/70` | `variant="destructive"` |
| **Muted / Closed / Draft** | `border-l-border` | `bg-muted` | `text-muted-foreground` | `variant="outline"` |

**Amber/gold is the standard neutral color for item cards throughout the app** — use it for cards that don't have a meaningful status (e.g. references de fil, generic items). It's not just "warning".

#### Base Card Template

```tsx
<div className={cn(
  'group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3',
  'border-l-amber-400/60' // or dynamic borderColor variable
)}>
  {/* Top row: icon box + title + badges/actions */}
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-amber-400/10">
        <Icon className="h-3.5 w-3.5 text-amber-600" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
      </div>
    </div>
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {/* Badges, hover-reveal edit/delete buttons */}
    </div>
  </div>
  {/* Bottom row: metadata */}
  <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
    <span>{detail}</span>
    <span className="ml-auto">{rightDetail}</span>
  </div>
</div>
```

#### Status-colored Card (dynamic border)

```tsx
const borderColor = etat === 1 ? 'border-l-amber-400/60'
  : etat === 2 ? 'border-l-green-500/60'
  : 'border-l-border'
const iconBg = etat === 1 ? 'bg-amber-400/10'
  : etat === 2 ? 'bg-green-500/10'
  : 'bg-muted'
const iconColor = etat === 1 ? 'text-amber-600'
  : etat === 2 ? 'text-green-600'
  : 'text-muted-foreground'

<div className={cn('group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3', borderColor)}>
  <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 {iconBg}">
    <Icon className={cn('h-3.5 w-3.5', iconColor)} />
  </div>
  ...
</div>
```

#### Indented Sub-content (e.g., order lines)

```tsx
{/* Indent under the icon box with ml-9 */}
<div className="mt-2 space-y-1 ml-9">
  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
    <span className="truncate max-w-[220px]">{lineText}</span>
    <span className="flex-shrink-0">{lineValue}</span>
  </div>
</div>
```

---

## 8. Right Panel: Sidebar with Tabs

Container:
```tsx
className="w-96 flex-shrink-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80"
```

### Tab Bar

```tsx
<div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
  {tabs.map(tab => (
    <button className={cn(
      'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors',
      isActive ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10'
    )}>
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  ))}
</div>
```

### Tab Content Area

```tsx
className="flex-1 overflow-y-auto p-3 space-y-2"
```

### Contact/Address View Cards (in sidebar)

```tsx
<div className="p-2.5 rounded-md bg-muted/40 group relative">
  <div className="flex items-start justify-between">
    <div className="min-w-0 flex-1">
      <div className="font-medium text-sm flex items-center gap-2">
        {name}
        {isDefault && (
          <Badge variant="secondary" className="text-[10px] py-0">
            <Star className="h-2.5 w-2.5 mr-0.5" />Principal
          </Badge>
        )}
      </div>
      {/* Detail lines */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
        <Phone className="h-3 w-3" />{phone}
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Mail className="h-3 w-3" /><span className="truncate">{email}</span>
      </div>
    </div>
    {/* Hover-reveal edit/delete */}
    {isEditing && (
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-6 w-6"><Pencil className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"><Trash2 className="h-3 w-3" /></Button>
      </div>
    )}
  </div>
</div>
```

### "Add" Button (bottom of tab, edit mode only)

```tsx
<Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground">
  <Plus className="h-4 w-4 mr-1.5" />Ajouter un contact
</Button>
```

Only shown when `isEditing && !showForm && editingId === null`.

### 8.1 Item cards inside tabs — use the section card style, NOT the center-panel one

When a sidebar tab renders a list of items (documents, contacts, notes, attachments…), each item card must use the **sidebar section card style**, not the center-panel "item view card" style from §7.

| Context | Container classes | Used on |
|---|---|---|
| **Sidebar tab item** (this rule) | `p-3 rounded-lg border bg-card shadow-sm` | `DocsTab` doc cards, `AdresseCard`, `InfoTab` sub-cards |
| **Center-panel item** (§7) | `rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3` | `LineCard`, ref cards, commande cards in `Fournisseurs.tsx` |

Visual intent: center-panel cards sit on the warm background and rely on the left-edge status color to communicate state; sidebar tab cards sit on the `bg-zinc-100/80` panel and need to be white `bg-card` with a shadow to separate from the panel. Mixing the two — putting a zinc + border-l card inside a zinc sidebar panel — makes the card disappear into the background.

When `isEditing`, add `editSectionClass` (`border-l-4 border-l-accent/70 bg-accent/[0.03]`) to the same white card — this gives the gold left edge and subtle tint used consistently across every edit-aware panel card in the app. Do NOT try to use the amber `border-l-amber-400/60` accent from the center-panel neutral pattern.

### 8.2 Do not wrap single-content tabs in a redundant section card

When a sidebar tab holds only one kind of content (a single list of documents, a single form, a single note field), do NOT wrap the entire tab body in a `p-3 rounded-lg border bg-card shadow-sm` card with a header that repeats the tab's name.

```tsx
// WRONG — the "Documents" label duplicates the tab label,
// the card has nothing else inside, and the whitespace compounds.
function DocsTab({ commande, isEditing }) {
  return (
    <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5" />Documents
      </p>
      {/* doc list */}
    </div>
  )
}

// RIGHT — fragment root, items render directly in the tab body's p-3 space-y-2 layout.
function DocsTab({ commande, isEditing }) {
  return (
    <>
      {/* doc cards, each using the §8.1 section card style */}
      {/* "Ajouter un document" button, edit mode only */}
    </>
  )
}
```

Rationale: the tab header (Info / Adresses / Docs / Journal) already identifies the content. Doubling that as an internal card title creates redundant chrome and eats vertical space.

Multi-content tabs (like `InfoTab`'s "Metadata" + "Commentaire" pair) DO get internal cards — each logical group is its own card. The rule is about single-group tabs.

### 8.3 Edit-mode click swaps view ↔ edit on item cards

Item cards in a sidebar tab are clickable in both modes, but the target differs:

```tsx
onClick={() => isEditing ? setEditingDoc(doc) : setViewDoc(doc)}
className={cn(
  'group p-3 rounded-lg border bg-card shadow-sm cursor-pointer hover:border-accent/40 transition-colors',
  isEditing && editSectionClass,
)}
```

Conventions:
- **View mode** — click opens the read-only viewer dialog (`DocViewDialog`, `ContactViewDialog`, etc.). No action buttons shown on the card.
- **Edit mode** — click opens the create/edit form dialog. The card picks up `editSectionClass` so users see it's in "edit context". The only hover-revealed action on the card is **Trash** (red ghost icon); there is no separate Pencil button — the whole card is the pencil.
- **Delete** — hover-reveal `<Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">` with `e.stopPropagation()` inside its handler so the row click doesn't also fire. The destructive action goes through `ConfirmDialog` (§33).

Reference implementation: `DocsTab` in `FournisseursCommandes.tsx`. Applies to every future tab where items are editable (contacts, adresses, lots, attachments…).

---

## 9. Edit Mode Pattern

### Activation

- "Modifier" button in detail header → sets `isEditing = true`
- Populates edit state from current data (`editNom`, `editCommentaire`, etc.)
- "Annuler" discards changes, "Enregistrer" saves via mutation

### Visual Indicators (when `isEditing = true`)

1. **Header icon box**: switches from `icon-box-gold` to `bg-accent/15`
2. **Name field**: becomes editable `<input>` with `font-heading font-bold`
3. **"Mode edition" badge**: `bg-accent text-accent-foreground` with `Pencil` icon
4. **Gold accent line**: solid `bg-accent` instead of gradient
5. **Cards**: get `editSectionClass` = `border-l-4 border-l-accent/70 bg-accent/[0.03]`
6. **Hover-reveal buttons**: `opacity-0 group-hover:opacity-100 transition-opacity` on items
7. **"+" buttons**: appear in card headers and footer
8. **"Nouveau" button**: appears in list footer
9. **"Ajouter" buttons**: appear at bottom of sidebar tabs

### InlineForm Component

Used for creating/editing sub-entities (contacts, adresses, recommandations):

```tsx
<div className="rounded-lg border border-accent/25 bg-accent/[0.03] p-4 space-y-3">
  <p className="text-xs font-semibold text-accent uppercase tracking-wide">{title}</p>
  {/* Form fields */}
  <div className="flex justify-end gap-2 pt-1">
    <Button variant="outline" size="sm">Annuler</Button>
    <Button size="sm">Enregistrer</Button>
  </div>
</div>
```

### LabeledInput Component

```tsx
<div className="space-y-1">
  <label className="text-xs font-medium text-muted-foreground">{label}</label>
  <input className="w-full h-8 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
</div>
```

### Form Layout Grids

- 2-column: `grid grid-cols-2 gap-2` (e.g., Prénom + Nom, Société + Contact)
- 3-column: `grid grid-cols-3 gap-2` (e.g., CP | Ville spanning `col-span-2`)

### Forms Appear on Demand

Forms are **not** always visible. They show only when user clicks "+":
- `showForm` state controls visibility
- Only one form OR one edit at a time (`showForm` and `editingId` are mutually exclusive)

---

## 10. Shared CSS Classes

### Card Styles

```css
.card-premium {
  /* Rounded-xl, bg-card, border-border/50, shadow-md */
  /* Hover: shadow-lg, border-border */
}
```

### Icon Box Variants

```css
.icon-box-gold {
  /* gradient bg: gold/15 → gold/8, text: gold darker, rounded-xl */
}
.icon-box-teal {
  /* gradient bg: teal/15 → teal/8, text: teal darker, rounded-xl */
}
.icon-box-terracotta {
  /* gradient bg: terracotta/15 → terracotta/8, text: terracotta darker, rounded-xl */
}
```

### Badge Variants

```css
.badge-success { /* bg-success/10 text-success ring-success/20 */ }
.badge-warning { /* bg-warning/10 text-warning ring-warning/30 */ }
.badge-info    { /* bg-primary/10 text-primary ring-primary/20 */ }
.badge-pending { /* bg-muted text-muted-foreground ring-border */ }
.badge-teal    { /* bg teal-light, text teal-dark, ring teal */ }
```

### Accent Cards

```css
.card-warm {
  /* border: gold/15, bg gradient to gold/4, gold-tinted inset shadow */
  /* hover: border gold/25 */
}
.card-teal {
  /* border: teal/15, bg gradient to teal/4 */
}
```

### Utility Classes

```css
.glass          { /* bg-white/70 backdrop-blur-xl border-white/20 shadow-lg */ }
.text-gradient  { /* bg-clip-text text-transparent, gradient-brand */ }
.accent-line    { /* ::before pseudo, w-1 bg-accent left border */ }
.divider-warm   { /* h-px, gradient gold/25 transparent at edges */ }
.stat-glow      { /* ::after pseudo, gold gradient glow on hover */ }
```

---

## 11. Input Styling

### Standard Input

```tsx
const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring'
```

### Search Input (in list panel)

```tsx
className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
// With Search icon positioned: absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground
```

### Textarea

```tsx
className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
```

### Select / Dropdown

Three patterns in order of preference — **do not reach for native `<select>` first**, it looks like Windows 95 next to our cards and its native popup clips wrong inside KV rows (see §11bis for the clipping story).

1. **`SearchableCombobox`** — long lists (30+ items), typed search. Clients, Références, any catalog lookup. Both in edit-mode detail panels (size="sm") and in Nouveau dialogs (default size).
2. **`PopoverSelect`** — short ID-keyed lists (< 30 items), no search. Sous-traitant, magasins, statuses. Both in detail panels (size="sm") and in dialogs.
3. **Native `<select>`** — last resort. Only acceptable outside KV rows and outside scrollable panels (e.g. a flat form on a standalone page). Even then, prefer the styled variants for consistency. If you must use native: `cursor-pointer` + `disabled:cursor-not-allowed` (Windows defaults to arrow, not hand).

```tsx
// Fallback native select if you truly need it:
<select
  className="w-full h-9 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer disabled:bg-zinc-100 disabled:text-muted-foreground disabled:cursor-not-allowed"
>
```

Both `SearchableCombobox` and `PopoverSelect` are defined in `apps/web/src/pages/EtudesColoris.tsx` (the canonical reference screen for the pattern); extract to `components/ui/` the first time a second feature needs them.

### Focus Ring

All inputs: `focus:ring-2 focus:ring-ring` where `--ring: 42 80% 55%` (gold).

---

## 11bis. Styled Dropdowns: `SearchableCombobox` + `PopoverSelect`

Both components render the visible trigger inline (the text input for `SearchableCombobox`, the button for `PopoverSelect`) but mount the **popover list through `createPortal` into `document.body`**, positioned with `position: fixed` using `getBoundingClientRect()` from the trigger. This is non-negotiable in our right-panel detail views — see the clipping story below.

### Why portal — the clipping trap

The right-panel `KV` component wraps values in `<span className="… truncate">`, which expands to `overflow: hidden`. An `absolute z-50 top-full` popover rendered as a child of that span is clipped to the span's box (~button width × button height) and the user sees nothing clickable. The tab container above also has `overflow-hidden`, and its content has `overflow-y-auto`, so there are up to **three** ancestors that clip a non-portal popover. Always portal.

### When to pick which

| Use | Component | Trigger | Why |
|-----|-----------|---------|-----|
| 30+ options, user needs to find one fast (clients, references, catalogs) | `SearchableCombobox` | Text input | Typing filters the list live; selected item renders as primary — secondary |
| < 30 options, no search needed (sous-traitants, magasins, statuses) | `PopoverSelect` | Button + chevron | Cleaner visual; button shows current label, popover lists all options |
| A status the user cycles through (pending / sent / accepted / refused) | See §29 (detached status footer pill) | — | Not a form field — lives in sidebar footer, not inside a card |

### `SearchableCombobox<T>` — generic, ID-keyed

```tsx
<SearchableCombobox
  options={clients ?? []}
  value={IDclient}                         // 0 means nothing selected
  onChange={setIDclient}
  getId={(c) => c.IDclient}
  getPrimary={(c) => c.nom ?? ''}
  getSecondary={(c) => c.ville}            // optional
  placeholder="Rechercher un client"
  size="sm"                                // omit in dialogs, pass "sm" in right-panel KV rows
/>
```

- Typing invalidates the current selection (`onChange(0)`) until the user picks again — prevents stale IDs when the user mistyped.
- Loading state is supported via the `loading` prop (shows a spinner in the popover).
- In size="sm", the input is right-aligned at `h-7` capped at 220px to fit KV rows.

### `PopoverSelect` — generic, ID-keyed, no search

```tsx
<PopoverSelect
  options={sousTraitants.map((s) => ({ id: s.IDsous_traitant, primary: s.nom ?? '' }))}
  value={editIDSousTraitant}               // 0 means "none"
  onChange={setEditIDSousTraitant}
  emptyLabel="— aucun —"                    // default; customise per field
  size="sm"                                // same sizing rule as SearchableCombobox
/>
```

- Options are `{ id: number; primary: string; secondary?: string }`. The `secondary` is shown muted on the right side of the option row.
- `id: 0` is the sentinel for "none" — the top of the popover always shows a styled `emptyLabel` row.
- Set `disabled` + `disabledTitle` when the dropdown depends on another field (e.g. N° commande depends on a client being picked).
- The button rotates its chevron 180° when open; the selected option gets `bg-accent/10 text-accent`.

### Domain-specific wrappers

For fields with extra business rules, write a thin wrapper instead of inlining the logic at the call site. The canonical example is `CommandeSelect` in `EtudesColoris.tsx` — it wraps `PopoverSelect`-style behavior for N° commande with:

- Tabular-nums `N°<num>` primary label + French-formatted date as secondary.
- A **stale option row** at the top of the popover if the saved value no longer matches any active commande (e.g. the order was settled after the étude was saved). Rendered with a muted `soldée` tag so the user knows why it's there.
- Disabled until a client is picked.

Follow that shape when adding other domain dropdowns (e.g. N° devis, N° facture): specialize the wrapper, don't duplicate the portal positioning code.

### Sizing cheatsheet

| Context | Size | Button/input height | Width |
|---------|------|---------------------|-------|
| Right-panel KV row, edit mode | `size="sm"` | `h-7` | `w-[220px]` right-aligned |
| Nouveau dialog / centered form | default | `h-9` | `w-full` |
| Popover itself (both sizes) | — | `max-h-64 overflow-y-auto` | `max(triggerWidth, 240–260px)` so options stay readable even from a narrow trigger |

### Anti-patterns

- **Do not use native `<select>` inside a `KV` row** — the `truncate` span clips the native popup's hit area inconsistently across browsers and on Windows it looks unstyleable.
- **Do not absolute-position a popover as a DOM child of the trigger in a scrollable panel** — you'll reinvent the clipping bug. Portal.
- **Do not re-implement the portal positioning per call site.** If you need a third variant, either extend `PopoverSelect` with new props or write a wrapper (like `CommandeSelect`) — don't copy the `getBoundingClientRect` / scroll-listener block again.
- **Do not forget to close on scroll.** All our detail panels and dialogs are scrollable; leaving an open portal popover attached to an off-screen trigger looks broken. The existing components already wire this — don't strip it when you copy them.
- **But do NOT close when the scroll target is inside the popover itself.** The close-on-scroll listener uses `window.addEventListener('scroll', ..., true)` with `capture: true` (needed because `scroll` doesn't bubble), which means scrolls *inside* the popover's own option list also fire it. Always guard: `if (popoverRef.current?.contains(e.target as Node)) return` before closing. Without this, the user can't scroll past the first screen of options — the popover snaps shut on the first wheel tick.

---

## 12. Button Patterns

| Variant | Usage | Example |
|---------|-------|---------|
| Default (`<Button>`) | Primary in-form actions: Enregistrer | `bg-primary text-primary-foreground` |
| `variant="gold"` | **Canonical "Modifier" / enter-edit-mode CTA** on every detail screen header (§6.1) | `bg-gold text-gold-foreground` |
| `variant="outline"` | Secondary: Annuler, header icon buttons (Imprimer, Email) | Border + text |
| `variant="ghost"` | Tertiary: +, edit/delete icons | No border, hover bg |
| `variant="destructive"` | Dangerous full-text actions (rare — usually use ghost+text-destructive) | `bg-destructive` |
| `size="sm"` | Text buttons with icon: `<Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier` |
| `size="icon"` | Icon-only: `className="h-9 w-9"` for header, `className="h-6 w-6"` for inline |

The `gold` variant is defined in `apps/web/src/components/ui/button.tsx`:

```tsx
gold: 'bg-gold text-gold-foreground shadow hover:bg-gold/90',
```

Always use `variant="gold"` for the "Modifier" button at the top right of every detail screen — never `variant="outline"` or `variant="default"`. The gold CTA is the canonical "enter edit mode" affordance and stays consistent across the whole app. See §6.1 for the full Print + Email + Modifier header trio.

### Delete Button Pattern

```tsx
<Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
  <Trash2 className="h-3 w-3" />
</Button>
```

---

## 13. Loading & Skeleton States

### Spinner

```tsx
<Loader2 className="h-6 w-6 animate-spin text-accent" />  // small
<Loader2 className="h-8 w-8 animate-spin text-accent" />  // detail area
```

### Skeleton Pulse

```tsx
<div className="h-8 w-48 bg-muted animate-pulse rounded" />     // title placeholder
<div className="h-24 bg-muted animate-pulse rounded-lg" />       // card placeholder
```

### Sidebar Loading

```tsx
<div className="w-96 flex-shrink-0 bg-muted/30 rounded-xl border p-4 space-y-4">
  <div className="flex gap-2">
    <div className="h-8 flex-1 bg-muted animate-pulse rounded-md" />
    <div className="h-8 flex-1 bg-muted animate-pulse rounded-md" />
  </div>
  {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
</div>
```

---

## 14. Animation Classes

```css
.animate-fade-in     { animation: fadeIn 0.5s ease-out forwards; }
.animate-slide-up    { animation: slideUp 0.5s ease-out forwards; }
.animate-slide-in-right { animation: slideInRight 0.4s ease-out forwards; }
.stagger-children > *:nth-child(N) { animation-delay: (N-1)*50ms; }
.transition-premium  { transition: all 300ms ease-out; }
```

---

## 15. Responsive Breakpoints

| Breakpoint | Tailwind | Layout Effect |
|-----------|----------|---------------|
| < 1024px | default | Mobile: sidebar hidden, hamburger menu |
| ≥ 1024px | `lg:` | Desktop: sidebar visible |
| < 1240px | — | MasterDetail: stacked (1 column) |
| 1240–1400px | — | MasterDetail: compact (2 columns, sidebar drawer) |
| ≥ 1400px | — | MasterDetail: full (3 columns) |

---

## 16. Navigation Structure

1. **Tableau de bord** — Dashboard
2. **Clients** — Commandes, Devis, Facturation, Gestion
3. **Fournisseurs** — Commandes, Gestion
4. **Sous-traitants** — Commandes, Gestion
5. **Production** — Tricotage, Teinture, Confection, Contrôle qualité
6. **Stock** — Matières premières, Produits finis, Mouvements
7. **Produits** — Références, Coloris
8. **Transport** — Expéditions, Livraisons
9. **Réseau** — Entreprises
10. **Paramètres** — Settings

---

## 17. Icons (Lucide React)

| Icon | Usage |
|------|-------|
| `Building2` | Enterprise/company |
| `User` | Contact |
| `MapPin` | Address |
| `Phone` | Phone number |
| `Mail` | Email |
| `Search` | Search input |
| `Pencil` | Edit action |
| `Plus` | Add action |
| `X` | Close/cancel/remove |
| `Save` | Save action |
| `Trash2` | Delete action |
| `Award` | Competences |
| `MessageSquare` | Recommandations |
| `Star` | Default/principal indicator |
| `Calendar` | Date display |
| `Building` | Company (in recommandation) |
| `Globe` | Network/empty state |
| `AtSign` | Email action |
| `Loader2` | Loading spinner (with `animate-spin`) |
| `AlertCircle` | Error state |
| `ChevronLeft/Right` | Sidebar collapse, navigation |
| `ArrowLeft` | Back button (stacked mode) |
| `PanelRightOpen` | Open sidebar drawer |
| `Maximize2/Minimize2` | Fullscreen toggle |
| `Menu` | Mobile hamburger |

---

## 18. Dialog/Modal Pattern

Three variants are used in the app — pick the one that matches your use case.

> **Critical hooks rule**: Any `useState` / `useQuery` / `useEffect` inside a dialog component must be declared **before** any `if (!cert) return null` early return. Hooks after conditional returns work in dev but crash production builds with React error #310. See the React Component Rules in `CLAUDE.md`.

### A. Basic Form Dialog

For simple forms — use `DialogContent` with header, body, and footer.

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-w-md" onClose={() => setOpen(false)}>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-accent" />
        Title
      </DialogTitle>
    </DialogHeader>
    {/* Body content */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
      <Button onClick={handleSave}>Enregistrer</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### A-bis. "En developpement" Placeholder Dialog (canonical)

Any feature that's wired up in the UI but not yet implemented (email send, print, export, etc.) must open this exact placeholder Dialog. Reference: `Entreprises.tsx` email button, `FournisseursCommandes.tsx` print + email buttons.

```tsx
<Dialog open={placeholderOpen} onOpenChange={setPlaceholderOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <TriggerIcon className="h-5 w-5 text-accent" />
        {actionLabel}
      </DialogTitle>
    </DialogHeader>
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <CenterIcon className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-sm font-medium">En developpement</p>
      <p className="text-xs mt-1">Cette fonctionnalite sera disponible prochainement.</p>
    </div>
  </DialogContent>
</Dialog>
```

**Rules — do not deviate**:
- Title `<DialogTitle>` uses the **same icon as the trigger button** (`AtSign` for email, `Printer` for print, etc.) with `h-5 w-5 text-accent`
- Centre `<div>` uses `py-8 text-muted-foreground`, `opacity-40` on the large icon, `h-12 w-12 mb-3`
- Primary copy: **exactly** `"En developpement"` (no accent on the "é" — matches existing screens for grep consistency) in `text-sm font-medium`
- Secondary copy: **exactly** `"Cette fonctionnalite sera disponible prochainement."` in `text-xs mt-1`
- No footer, no buttons — user dismisses via the built-in `X` or overlay click
- The **centre icon** (`h-12 w-12`) can differ from the title icon when it reinforces the action. Example: email dialog uses `AtSign` in the title + `Mail` (envelope) in the centre, because both symbols read as "email" but the envelope is more visually recognisable at size 12. Print dialog uses `Printer` for both.

Always use the literal strings above so a global search for `"En developpement"` finds every placeholder in one shot when we're ready to implement them.

### B. Full-Bleed Viewer Dialog (chrome-free)

For embedded document/PDF viewers where the dialog frame would distract. Used by `CertificatViewDialog` in `Fournisseurs.tsx`.

```tsx
<Dialog open={!!cert} onOpenChange={() => onClose()}>
  {fichierOk ? (
    <div className="relative z-50 w-[60vw] max-w-3xl h-[95vh]" onClick={(e) => e.stopPropagation()}>
      <iframe
        src={`${API_URL}/.../fichier#view=FitH`}
        className="w-full h-full rounded-lg"
        title="Document"
      />
    </div>
  ) : (
    <DialogContent className="max-w-sm" onClose={onClose}>
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 opacity-30" />
        <p className="text-sm">Aucun document attaché</p>
      </div>
    </DialogContent>
  )}
</Dialog>
```

Key points:
- Renders a raw `<div>` directly inside `<Dialog>` (NOT wrapped in `<DialogContent>`) so there's no card chrome around the iframe
- `e.stopPropagation()` on the inner div prevents overlay-click-to-close from firing
- Always pre-check resource availability with a HEAD request before showing the iframe — falls back to a small `DialogContent` for empty/error states

### C. Side-by-Side Form + Preview Dialog

For complex edit dialogs where the user needs both a form AND a preview/viewer. Used by `CertificatEditDialog`.

```tsx
<Dialog open={!!cert} onOpenChange={() => onClose()}>
  <DialogContent className="max-w-5xl h-[85vh] flex flex-col" onClose={onClose}>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        Modifier l'élément
      </DialogTitle>
    </DialogHeader>
    <div className="flex-1 min-h-0 flex gap-4">
      {/* Left: form fields */}
      <div className="w-80 flex-shrink-0 overflow-y-auto space-y-3 px-1">
        <LabeledInput label="Nom" value={nom} onChange={setNom} />
        {/* more fields */}
      </div>
      {/* Right: viewer + file controls + action buttons */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex-1 min-h-0 rounded-lg border border-border/60 bg-zinc-50 overflow-hidden">
          <iframe src={previewUrl} className="w-full h-full" title="Document" />
        </div>
        <div className="flex items-center gap-2">
          {/* file picker, then action buttons aligned right */}
          <FileUploadButton ... />
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={handleSave}>Enregistrer</Button>
          </div>
        </div>
      </div>
    </div>
  </DialogContent>
</Dialog>
```

Key points:
- **`max-w-5xl h-[85vh]`** — wide enough for form + preview side by side
- **`flex-1 min-h-0 flex gap-4`** — body splits horizontally; `min-h-0` is required so children can scroll
- **Form column**: `w-80 flex-shrink-0 overflow-y-auto px-1` — `px-1` is critical, otherwise input focus rings get clipped
- **Viewer column**: `flex-1 min-w-0 flex flex-col gap-2` — fills remaining width; `min-w-0` prevents flex overflow
- **Action buttons live at the bottom of the right column**, NOT in a `DialogFooter`. This vertically aligns Annuler/Enregistrer with the file upload controls (looks intentional and avoids a stranded footer)

---

## 19. Body Background

Multi-layer warm gradient with fixed attachment:

```css
body {
  background-image:
    radial-gradient(ellipse 100% 60% at 50% -10%, hsl(42 80% 55% / 0.06), transparent 60%),
    radial-gradient(ellipse 80% 50% at 0% 50%, hsl(175 42% 45% / 0.04), transparent),
    radial-gradient(ellipse 70% 50% at 100% 80%, hsl(42 80% 55% / 0.05), transparent),
    linear-gradient(180deg, hsl(36 25% 98%) 0%, hsl(36 20% 97%) 100%);
  background-attachment: fixed;
}
```

---

## 20. Accessibility

- All interactive elements have `:focus-visible` states with gold ring
- Color contrast meets WCAG AA
- Screen reader labels: `<span className="sr-only">` for icon-only buttons
- Keyboard navigation support via Radix primitives
- Focus ring: `ring-2 ring-accent/40 ring-offset-2 ring-offset-background`

---

## 21. Iframe Document Viewer

For embedding PDFs, images, and other documents served by the API.

```tsx
<iframe
  src={`${API_URL}/.../fichier#view=FitH`}
  className="w-full h-full rounded-lg"
  title="Document"
/>
```

**Container**: `flex-1 min-h-0 rounded-lg border border-border/60 bg-zinc-50 overflow-hidden`

### Conventions

- **`#view=FitH`** is the PDF.js URL parameter that defaults the viewer to "fit width" — most readable for letter/A4 documents
- **Pre-check availability with HEAD** before showing the iframe — saves the user from seeing raw JSON 404 text inside the frame:
  ```tsx
  useEffect(() => {
    if (!cert) return
    fetch(`${API_URL}/.../fichier`, { method: 'HEAD' })
      .then(r => setFichierOk(r.ok))
      .catch(() => setFichierOk(false))
  }, [cert?.IDcertificat])
  ```
- **Object URL previews**: when showing a file the user just picked but hasn't saved yet, use `URL.createObjectURL(file)` and remember to `URL.revokeObjectURL()` on cleanup or when replacing the file:
  ```tsx
  if (newFileUrl) URL.revokeObjectURL(newFileUrl)
  setNewFileUrl(URL.createObjectURL(file))
  ```

### API-side requirements

Endpoints serving documents must override helmet's restrictive headers, otherwise iframes from a different port/host will be blocked:

```ts
res.setHeader('Content-Type', contentType)
res.setHeader('Content-Disposition', 'inline')
res.removeHeader('X-Frame-Options')
res.removeHeader('Content-Security-Policy')
res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
```

---

## 22. File Upload Pattern

Hidden `<input type="file">` wrapped in a styled `<label>` for a polished button look. Used in `CertificatEditDialog` in `Fournisseurs.tsx`.

```tsx
<label className="cursor-pointer">
  <input
    type="file"
    className="hidden"
    accept=".pdf,image/*"
    onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
    onChange={(e) => {
      const f = e.target.files?.[0]
      if (f) {
        if (newFileUrl) URL.revokeObjectURL(newFileUrl)
        setNewFile(f)
        setNewFileUrl(URL.createObjectURL(f))
        setRemoveFichier(false)
      }
    }}
  />
  <span className={cn(inputClass, 'inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/5 w-auto px-3')}>
    <Upload className="h-3.5 w-3.5" />
    {newFile ? newFile.name : 'Choisir un fichier'}
  </span>
</label>
{newFile && (
  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => {
    if (newFileUrl) URL.revokeObjectURL(newFileUrl)
    setNewFile(null); setNewFileUrl(null); setRemoveFichier(true)
  }}>
    <X className="h-3.5 w-3.5" />
  </Button>
)}
```

### Critical bits

- **`onClick={(e) => { e.target.value = '' }}`** — without resetting the value, picking the *same* file twice in a row doesn't fire `onChange`. Easy to miss, infuriating to debug.
- **`URL.createObjectURL` for instant preview** — shows the picked file in the viewer immediately, before the user clicks Save
- **`X` button to clear** the selection. If replacing an existing document, also set a `removeFichier` flag so the save handler knows to delete the old blob even if the user backs out of uploading a new one
- **Save MUST use raw `fetch` with `FormData`**, NOT `apiFetch` which forces `Content-Type: application/json`. The browser sets the multipart boundary automatically:
  ```tsx
  const formData = new FormData()
  formData.append('nom', nom)
  if (newFile) formData.append('fichier', newFile)
  if (removeFichier && !newFile) formData.append('remove_fichier', '1')
  const res = await fetch(url, { method: 'PUT', body: formData })
  ```

---

## 23. Collapsible Section Cards

The center detail body uses collapsible cards for groups of related items (Certificats, Refs de fil, Commandes in `FilsGestion.tsx`).

**Apply this pattern only when the center panel stacks *multiple* sections** (see §7 multi-section shape). When the center panel is a single primary list — lignes of a commande, soumissions of an étude, mouvements of a stock lot — do NOT use a collapsible Card. Use §31's flex-sibling layout directly. A framing Card with a title + chevron around the only thing on the screen duplicates the detail header, eats space, and lets the user collapse the only interaction surface.

```tsx
<Card className="card-premium">
  <CardHeader
    className="flex flex-row items-center gap-2 p-4 space-y-0 cursor-pointer select-none"
    onClick={() => setOpen(!open)}
  >
    <Icon className="h-4 w-4 text-accent" />
    <CardTitle className="text-sm font-semibold">Section Title</CardTitle>
    {isEditing && (
      <Button
        size="sm" variant="ghost"
        className="h-6 w-6 p-0 text-accent hover:text-accent hover:bg-accent/10"
        onClick={(e) => { e.stopPropagation(); setCreating(true) }}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    )}
    <Badge variant="secondary" className="text-xs ml-auto">{count}</Badge>
    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
  </CardHeader>
  {open && <CardContent className="space-y-2">
    {/* Optional toggle for hidden items, e.g. expired */}
    {hiddenCount > 0 && (
      <button
        onClick={() => setShowHidden(!showHidden)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showHidden ? 'Masquer expirés' : `Afficher expirés (${hiddenCount})`}
      </button>
    )}
    {/* item cards */}
  </CardContent>}
</Card>
```

### Conventions

- **`+` button on the header** (edit mode only) for creating items in this section. Always use `e.stopPropagation()` to prevent the header click from also toggling the card open/closed.
- **Count badge**: shows the **active/valid** count, not the total. For example, the Certificats badge shows only valid certs, with a separate "Afficher expirés (N)" toggle inside the content.
- **Chevron rotation**: `transition-transform` + conditional `rotate-180` for smooth expand/collapse animation.
- **`select-none`** on the header so users can't accidentally select text when toggling.

---

## 24. Comment / Empty-Aware Display

Pattern for showing optional comments under an item card, with a subtle icon to indicate "this has a note":

```tsx
{cmd.commentaire?.trim() && (
  <div className="flex items-start gap-1.5 mt-2 ml-9">
    <MessageSquare className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
    <p className="text-[11px] text-muted-foreground italic">{cmd.commentaire.trim()}</p>
  </div>
)}
```

### Conventions

- **Always `.trim()` before checking** — HFSQL stores `" "` (single space) for "no comment", which is truthy in JS. Without trimming, the icon would render for empty comments.
- **`ml-9`** indents the comment under the parent card's icon box (matches title alignment perfectly: 7px icon box + gap-2 ≈ ml-9).
- **`text-muted-foreground/50`** on the icon — intentionally subtle so it reads as metadata, not primary content.
- **`mt-0.5`** on the icon to optically center it with the first line of italic text.
- Wrap text in `<p className="text-[11px] text-muted-foreground italic">` to match the secondary-text hierarchy used elsewhere in cards.

---

## 25. Edit State: Global vs Per-Section

Two layers of edit state work together in data screens.

### Global `isEditing` (top-level page state)

Lives at the page component (e.g. `Fournisseurs`). Toggled by the **"Modifier"** button in the detail header.

When `true`:
- Detail header shows the entity name as an `<input>` and adds the **"Mode edition"** badge
- Header buttons swap from `[Modifier]` to `[Annuler] [Enregistrer]`
- Sub-sections enable their action buttons (the `+` on collapsible card headers, hover-reveal pencil/trash on item cards)
- Sidebar tabs (Info/Contacts/Adresses) enable their inline edit forms

### Per-Section state

Each sub-section (a collapsible card or a sidebar tab) has its own local state for which specific item is being edited.

```tsx
const [editingId, setEditingId] = useState<number | null>(null)  // which item is in edit form
const [showForm, setShowForm] = useState(false)                  // show "add new" form
const [form, setForm] = useState({ nom: '', tel: '', ... })      // form field values
```

Convention: opening one form/dialog should close any others — only one item is being edited at a time within a section.

### Mutation pattern with onSuccess invalidation

```tsx
const updateMut = useMutation({
  mutationFn: (id: number) => apiFetch(`/path/${id}`, {
    method: 'PUT',
    body: JSON.stringify(form),
  }),
  onSuccess: () => { onMutationSuccess(); setEditingId(null) },
})
```

The page component passes an `invalidateAll` callback down to sub-sections so they can refresh both the list and detail queries after a mutation:

```tsx
const invalidateAll = useCallback(() => {
  queryClient.invalidateQueries({ queryKey: ['fournisseurs'] })
  queryClient.invalidateQueries({ queryKey: ['fournisseur', selectedId] })
}, [queryClient, selectedId])
```

### 25.1 Auto-enter edit mode after creating a new entity

When the user clicks **Nouveau** to create a commande / fournisseur / entreprise / etc., the expected flow is: dialog opens → user fills the mandatory fields → dialog closes → the new row appears selected **and already in edit mode**, so the user can immediately finish filling optional fields without a second click on "Modifier". Don't make them hunt for the edit button on a freshly-created skeleton row.

The race condition to solve: `setSelectedId(newId)` switches the detail query, but the detail hasn't loaded yet, so calling `startEdit()` synchronously has nothing to snapshot. The fix is a one-shot trigger id + an effect that waits for the detail to match:

```tsx
// Page-level state — set by the create dialog's onCreated, cleared by the effect.
const [autoEditForId, setAutoEditForId] = useState<number | null>(null)

// Effect runs after every detail query settle. When the detail's id matches
// the flagged one, startEdit() snapshots the freshly-loaded row and flips
// isEditing on. The flag is then cleared so this only fires once.
useEffect(() => {
  if (autoEditForId !== null && detail?.IDcommande_fil === autoEditForId) {
    startEdit()
    setAutoEditForId(null)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [autoEditForId, detail])

// Wire it in the create dialog's onCreated:
<CreateCommandeDialog
  open={createOpen}
  onClose={() => setCreateOpen(false)}
  onCreated={(newId) => {
    setCreateOpen(false)
    queryClient.invalidateQueries({ queryKey: ['commandes-fil'] })
    setSelectedId(newId)
    setAutoEditForId(newId)
  }}
/>
```

The `eslint-disable` is deliberate — including `startEdit` in deps re-runs the effect whenever the callback identity changes, which causes false re-triggers after cancel. Keying the effect on `[autoEditForId, detail]` alone is correct.

Reference: `FournisseursCommandes.tsx` — apply the same pattern to every screen with a "Nouveau" affordance.

### 25.2 Auto-select the next item after a delete (read cache BEFORE invalidating)

When the user deletes the currently-selected row, the expected UX is: the row disappears from the list AND the next best row gets selected automatically, so the detail panel never shows an empty "Select a row" state. The naive implementation is broken in a subtle way:

```tsx
// BROKEN — the auto-select-first useEffect fires during stale-while-revalidate
// and picks the deleted row as selectedId, then the refetch removes it and
// selectedId points at a non-existent row.
const deleteMut = useMutation({
  mutationFn: () => apiFetch(`/commandes-fil/${selectedId}`, { method: 'DELETE' }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['commandes-fil'] })
    setSelectedId(null)  // the effect sees cached (old) list, picks [0]
    setIsEditing(false)
  },
})
```

The React Query default is `stale-while-revalidate`: `invalidateQueries` marks the query stale and triggers a refetch, but returns the cached result synchronously. Between the invalidation and the refetch completing, `commandes` still contains the just-deleted row. If the auto-select-first effect reads that stale list, it picks the wrong row.

**Fix**: read the cached list *before* invalidation, filter out the deleted id yourself, set the selection explicitly, then invalidate:

```tsx
const deleteMut = useMutation({
  // Pass the id as a mutation arg so onSuccess has a stable reference
  // that can't drift if the user changes selection mid-flight.
  mutationFn: (id: number) => apiFetch(`/commandes-fil/${id}`, { method: 'DELETE' }),
  onSuccess: (_data, deletedId) => {
    const cached = queryClient.getQueryData<CommandeListRow[]>(['commandes-fil', statusFilter]) ?? []
    const remaining = cached.filter((c) => c.IDcommande_fil !== deletedId)
    queryClient.invalidateQueries({ queryKey: ['commandes-fil'] })
    setIsEditing(false)
    setSelectedId(remaining.length > 0 ? remaining[0].IDcommande_fil : null)
  },
})

// At the call site, pass the current selection explicitly:
deleteMut.mutate(selectedId)
```

Conventions:
- **Always take the id as a mutation argument**, not from closure — the arg is stable across re-renders; closure captures can drift.
- **Read from the cache, not from state** — `queryClient.getQueryData` sees the same data React Query would render, keyed on the query key actually in use. Using a React state `commandes` variable risks closure staleness.
- **Include the cache key's full parameters** (`statusFilter`, `searchQuery`, etc.) when the query key depends on filters — otherwise `getQueryData` returns undefined.
- **Set selection explicitly, not to null** — setting to null and relying on an auto-select-first effect hits the stale-while-revalidate gap. Compute the next selection yourself and set it directly.
- **Empty list → `null`** — if nothing remains, set `selectedId` to `null` and let the existing empty-state render.

Reference: `FournisseursCommandes.tsx`. Apply to every delete mutation on every master-detail screen.

---

## 26. HFSQL Date Helpers

HFSQL stores dates as 8-character strings (`YYYYMMDD`), but HTML `<input type="date">` uses `YYYY-MM-DD`. These two helpers convert between the two formats and should be reused across screens — don't reinvent.

```tsx
// "20260403" → "2026-04-03"
function hfsqlDateToInput(d: string | null): string {
  if (!d || d.length !== 8) return ''
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

// "2026-04-03" → "20260403"
function inputDateToHfsql(d: string): string {
  return d.replace(/-/g, '')
}
```

For **display** (not editing), use `formatHfsqlDate` which converts to French locale:

```tsx
function formatHfsqlDate(raw: string): string {
  if (raw.length === 8) {
    return new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`).toLocaleDateString('fr-FR')
  }
  return new Date(raw).toLocaleDateString('fr-FR')
}
```

These three helpers live in **`apps/web/src/lib/dates.ts`** — import from there, do not redefine. Both `Fournisseurs.tsx` and `FournisseursStock.tsx` consume them via `import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'`.

---

## 26bis. Number Formatting (`fmtNum`)

All numeric values displayed in the UI (weights in kg, prices in €, stock counts, totals) must use **`fmtNum`** from `apps/web/src/lib/format.ts`. It produces French-style formatting with a **plain ASCII space** as the thousand separator — e.g. `12345.6` → `12 345,6`.

```tsx
import { fmtNum } from '@/lib/format'

fmtNum(12345)          // "12 345"
fmtNum(12345.67, 2)    // "12 345,67"
fmtNum(0.5, 1)         // "0,5"
fmtNum(null)           // ""  (null/undefined/NaN safe)
```

### Why not raw `toLocaleString('fr-FR')`?

The `fr-FR` locale emits `\u202f` (narrow no-break space) or `\u00a0` (non-breaking space) for groups depending on the browser/Node version. `fmtNum` normalizes both to a regular space so (a) UI spacing is predictable across environments, (b) copy-paste produces text the user can re-type, and (c) tests match on simple string literals.

### Conventions

- **Weights (kg)**: `fmtNum(value, 1)` for line/detail displays, `fmtNum(value)` (0 decimals) for list-card summaries where space is tight
- **Prices (€)**: `fmtNum(value, 2)` everywhere — always show cents
- **Unit prices (€/kg)**: `fmtNum(value, 2)`
- **Counts / integers**: `fmtNum(value)` (0 decimals)
- **Always pair with `tabular-nums`** on the containing element so columns align — matches the existing pattern in list cards and totals footers

### Do not

- Do not use `value.toFixed(n)` in JSX — it skips the thousand separator
- Do not redefine a local `fmtNum` inside a page file — import the shared one
- Do not hardcode the separator character in tests or snapshots; the helper guarantees a plain space but read the output through `fmtNum` if you need to assert

Reference: `FournisseursCommandes.tsx` uses `fmtNum` for list card kg/€, totals footer, and line card quantite/prix/total.

---

## 27. Table-Centric Screen Pattern

Reference: **`apps/web/src/pages/FournisseursStock.tsx`** (`/fournisseurs/stock`).

Use this pattern — never `MasterDetailLayout` — when the page is fundamentally a sortable / searchable list of many flat rows (e.g. stock lots, order lines, movements) and selecting a row reveals a focused detail view that the user reads/edits without leaving the table context.

### 27.1 Page root structure

```tsx
return (
  <div className="h-full flex flex-col gap-3 min-h-0">
    {/* Toolbar */}             <-- §27.2
    {/* Table card */}          <-- §27.3
    <DetailDrawer ... />        <-- §27.5
    <CreateDialog ... />        <-- §18.A
  </div>
)
```

`min-h-0` on the root is mandatory — without it the table body can't shrink to fit and the whole page scrolls instead of just the rows.

### 27.2 Toolbar (top, full-width)

A single horizontal flex row with:
1. **Search input** — `flex-1 min-w-0`, with a `<Search>` Lucide icon absolutely positioned inside. Standard input height `h-9`, white background.
2. **Filter toggles** — `<label>` wrappers around `<input type="checkbox">`, `flex-shrink-0`, label text follows the checkbox.
3. **"Nouveau" button** — pinned right, `flex-shrink-0`. Use the **default `<Button>` variant** (no `variant=...` prop) — that gives `bg-primary text-primary-foreground` which is the brand navy `#143D6B`. Always pair with a leading `<Plus className="h-3.5 w-3.5 mr-1" />`. Do **not** override the background color.

```tsx
<div className="flex-shrink-0 flex items-center gap-3">
  <div className="relative flex-1 min-w-0">
    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <input
      type="text"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="Rechercher (...)"
      className="h-9 w-full pl-8 pr-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
    />
  </div>

  <label className="flex items-center gap-2 text-sm cursor-pointer select-none flex-shrink-0">
    <input type="checkbox" checked={hideFinished} onChange={...}
      className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer" />
    <span>Masquer les lots terminés</span>
  </label>

  <Button size="sm" onClick={() => setCreateOpen(true)} className="flex-shrink-0">
    <Plus className="h-3.5 w-3.5 mr-1" />
    Nouveau
  </Button>
</div>
```

### 27.3 Split header / body table (the alignment trick)

Tables that scroll inside a fixed-height card need a non-scrolling header above a scrolling body. Use **two separate `<table>` elements** with **identical `<colgroup>` definitions** and `table-layout: fixed`. The shared `colgroup` is what keeps the columns aligned.

```tsx
const COLUMNS: { key: SortKey; label: string; width: string; align?: 'left' | 'right' }[] = [
  { key: 'ref_fil',          label: 'Référence',       width: '12%' },
  { key: 'colori_reference', label: 'Coloris',         width: '10%' },
  { key: 'lot',              label: 'Lot interne',     width: '7%' },
  // … widths must sum to 100% minus the trailing icon column
]
const ICON_COL_WIDTH = '3%'
```

```tsx
<div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden">
  {/* Header table — does NOT scroll */}
  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
    <colgroup>
      {COLUMNS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
      <col style={{ width: ICON_COL_WIDTH }} />
    </colgroup>
    <thead className="bg-zinc-200/60 border-b border-border/60">
      <tr className="text-xs uppercase tracking-wide text-muted-foreground">
        {COLUMNS.map((c) => (
          <SortHeader key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={handleSort} align={c.align} />
        ))}
        <th className="px-3 py-2.5 text-left font-semibold"></th>
      </tr>
    </thead>
  </table>

  {/* Body table — scrolls inside an overflow div */}
  <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent">
    <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        {COLUMNS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
        <col style={{ width: ICON_COL_WIDTH }} />
      </colgroup>
      <tbody>
        {filteredSorted.map((r) => (
          <tr
            key={r.IDstock_fil}
            data-stock-row
            onClick={() => setSelectedId((prev) => prev === r.IDstock_fil ? null : r.IDstock_fil)}
            className={cn(
              'border-b border-border/40 cursor-pointer transition-colors',
              isSelected ? 'bg-accent/10' : 'hover:bg-accent/5'
            )}
          >
            …row cells…
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

Conventions:
- **Row hover**: `hover:bg-accent/5`. **Selected**: `bg-accent/10`. Never both — selection wins via the `cn(... isSelected ? ... : hover...)` ternary.
- **Clicking the same row again** toggles the selection off (`prev === id ? null : id`). Clicking a different row switches.
- **`data-stock-row`** marker is mandatory — the drawer's outside-click handler reads it to differentiate "clicked another row" (switch) from "clicked outside the table" (close). See §27.5.
- **Numeric cells**: `tabular-nums`, right-aligned via the column's `align: 'right'`.
- **Trailing icon column**: small badges (Bio leaf, Recycle, Terminé "T") right-aligned in a `flex justify-end gap-1`.
- **Truncation**: every text cell uses `truncate`. Long values get a `title={value}` for hover tooltip.

### 27.4 Sortable column header

```tsx
function SortHeader({ label, sortKey, sort, onSort, align = 'left' }: SortHeaderProps) {
  const active = sort.key === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={cn(
        'px-3 py-2.5 font-semibold cursor-pointer select-none whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
        active && 'text-accent'
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  )
}
```

The active sort column gets `text-accent` (gold) **and** a directional arrow icon. Clicking the same header toggles direction; clicking a different one resets to `asc`.

### 27.5 Right slide-in drawer

The drawer is `position: fixed`, width `440px`, slides in from the right edge. It is **separate** from the page flex layout — it overlays the table.

#### Top offset (handles embed mode)

```tsx
const [searchParams] = useSearchParams()
const embed = searchParams.get('embed') === 'true'

<div
  ref={drawerRef}
  className={cn(
    'fixed right-0 bottom-0 w-[440px] bg-white border-l border-border/60 shadow-xl z-30 transition-transform duration-300 flex flex-col',
    embed ? 'top-0' : 'top-14',                       // critical — embed mode has no header
    open ? 'translate-x-0' : 'translate-x-full'
  )}
>
```

`top-14` is the height of the standard app header. When `?embed=true` is set the AppShell hides the header, so the drawer must pin to `top-0` or it leaves an empty band at the top of the embed iframe.

#### Three-tone background composition

The drawer must match the Fournisseurs right panel exactly: an opaque white root, an inner zinc-100/80 layer, and a zinc-200/50 top band. These need to be **nested** divs, not stacked classes — `bg-zinc-100/80` is semi-transparent and only blends correctly when there is an opaque base behind it.

```tsx
<div className="fixed ... bg-white ...">                          {/* opaque base */}
  <div className="flex-1 min-h-0 flex flex-col bg-zinc-100/80">  {/* inner panel */}
    <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border/60 bg-zinc-200/50">
      {/* Header band */}
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-transparent">
      {/* Body — inherits zinc-100/80 from parent */}
    </div>
  </div>
</div>
```

| Layer | Class | Why |
|---|---|---|
| Drawer root | `bg-white` | opaque base — drawer overlays the table, so the root must hide it |
| Inner panel | `bg-zinc-100/80` | the lighter gray, blended over white |
| Top band (header) | `bg-zinc-200/50` | the darker gray, blended over the inner zinc-100/80 |
| DrawerCards inside body | `bg-card` | white cards |

**Do not** put `bg-zinc-100/80` directly on the drawer root or `bg-zinc-200/50` directly over white — the colors will not match the Fournisseurs panel.

#### Header content

- **Icon** (`h-10 w-10` rounded square, `icon-box-gold` class normally / `bg-accent/15` when editing) containing a **`BobineIcon`** at `h-[25px] w-[25px]`. Always use `BobineIcon` for yarn-related screens (matches the inline icon used in `Fournisseurs.tsx` "Références de fil" section). Other domains get their domain-specific icon at the same frame size.
- **Title row**: `<h2 className="text-base font-heading font-bold tracking-tight truncate">` followed by inline `Badge`s (Bio, Recyclé) — use the same green/blue badge palette as elsewhere.
- **Subtitle**: `text-xs text-muted-foreground mt-0.5` — secondary identifier line (e.g. "coloris • Lot N").
- **Action buttons** (right-aligned, `flex-shrink-0 -mt-0.5`): `outline` Modifier in view mode, `outline` Annuler + default Enregistrer in edit mode. Save button shows a `Loader2` spinner when `mutation.isPending`.

#### Body cards

Each section is a `DrawerCard` with `bg-card`, gold icon, title:

```tsx
function DrawerCard({ icon, title, highlight, children }) {
  return (
    <div className={cn(
      'rounded-lg border border-border/60 bg-card p-3 shadow-sm',
      highlight && 'border-l-4 border-l-accent/70 bg-accent/[0.03]'
    )}>
      <div className="flex items-center gap-2 mb-2">{icon}<h3 className="text-sm font-semibold">{title}</h3></div>
      {children}
    </div>
  )
}
```

**Edit highlight rule**: every card that the user might *visually associate* with editing — including read-only ones in the same logical group — gets `highlight={isEditing}`. The Provenance card on this screen is read-only but still gets the gold left edge in edit mode so the user perceives the whole drawer as "in edit mode", not just two cards out of four.

#### KV row primitive

Inside cards, every label/value pair uses the `KV` component — label on the left, value on the right, baseline-aligned, label small/muted, value `text-sm text-right truncate`:

```tsx
function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm text-right truncate', mono && 'tabular-nums')}>{value}</span>
    </div>
  )
}
```

**Edit-mode inputs go in the value slot**, not below the label. The input height drops to `h-7` (smaller than the standard `h-9`) and gets `text-right` so its content visually aligns with the read-mode value text:

```tsx
<KV
  label="Emplacement"
  value={
    isEditing ? (
      <input type="text" value={editEmplacement} onChange={...}
        className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right" />
    ) : (
      detail.emplacement || '—'
    )
  }
/>
```

#### Outside-click dismissal

Clicking anywhere outside the drawer closes it — *except* clicking another row in the table, which switches the selection. The handler reads the `data-stock-row` marker (§27.3):

```tsx
useEffect(() => {
  if (id === null) return
  function handleMouseDown(e: MouseEvent) {
    const target = e.target as Node | null
    if (!target) return
    if (drawerRef.current?.contains(target)) return  // inside drawer → keep open
    if ((target as Element).closest?.('tr[data-stock-row]')) return  // row click → table handles it
    onClose()
  }
  document.addEventListener('mousedown', handleMouseDown)
  return () => document.removeEventListener('mousedown', handleMouseDown)
}, [id, onClose])
```

### 27.6 Foreign-key display columns

When a table column is a foreign-key ID (e.g. `stock_fil.IDMagasin → sous_traitant`), **never display the bare `#${id}`** in the UI. Add a JOIN to the API query and select the human name as a derived column (e.g. `st.nom AS magasin_nom`), then surface `magasin_nom` in the drawer KV. The legacy IDs are implementation noise — the user thinks in supplier names, depot names, etc.

### 27.7 Reference checklist for new table-centric screens

When building a new screen of this type, the result must have:

- [ ] Page root: `h-full flex flex-col gap-3 min-h-0`
- [ ] Toolbar with search left, filters middle, **default-variant** `<Button>` "Nouveau" right
- [ ] Split table with shared `<colgroup>` between header and body, both `tableLayout: fixed`
- [ ] Sortable headers via `SortHeader`, active column gets `text-accent` + arrow icon
- [ ] Row toggle selection on click (same row → close), `data-stock-row` marker, `bg-accent/10` selection / `hover:bg-accent/5` hover
- [ ] Right slide-in drawer with `embed`-aware top offset
- [ ] Three-tone background: `bg-white` root → `bg-zinc-100/80` inner → `bg-zinc-200/50` header
- [ ] `BobineIcon` (or domain icon) at `h-[25px] w-[25px]` in the gold icon frame
- [ ] All drawer rows use `KV` (label left / value right)
- [ ] `highlight={isEditing}` on every section card, even read-only ones
- [ ] FK columns rendered via joined display name, never `#${id}`
- [ ] Outside-click closes drawer, ignoring clicks on `tr[data-stock-row]`
- [ ] Create dialog wired through React Query mutation with `onMutationSuccess` invalidation, auto-selects the new row in the drawer

If any box is unchecked, do not mark the screen complete.

---

## 28. Unsaved Changes Guard (mandatory on every edit-mode screen)

Any screen with a "Modifier → edit → Enregistrer" flow **must** plug into the shared unsaved-changes guard. The guard intercepts navigation (route changes, left-list item clicks, back-button, drawer dismissal) while the form is dirty and pops a 3-button dialog: **Annuler** (stay) / **Abandonner** (discard) / **Enregistrer** (save then continue). Without this, users lose half-typed work the moment they misclick — we already had this bug on every edit screen before porting the pattern from MFProd.

**Apply this to every single edit-mode screen.** There is no screen where it's "optional".

### 28.1 The shared pieces — never re-implement, always import

| File | Purpose |
|---|---|
| `apps/web/src/components/shared/UnsavedChangesDialog.tsx` | The 3-button `AlertDialog`. Pure presentation — takes `open`, `onAction('save'\|'discard'\|'cancel')`, `isSaving`. |
| `apps/web/src/hooks/useUnsavedGuard.ts` | Wraps `useBlocker` for route nav, `guardAction(fn)` for in-page nav, dialog state, 3-way action handler. |

```tsx
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
```

Do **not** copy/paste `useBlocker` into pages. Always go through `useUnsavedGuard`.

### 28.2 Page-level integration (5 moving parts)

Every edit-mode page has the same five pieces. The order matters — `originalDraftRef` + `isDirty` must come before `useUnsavedGuard`, and `useUnsavedGuard` must come before `handleSelect` (which depends on `guard`).

```tsx
// (1) snapshot ref — set in startEdit, compared in isDirty
const originalDraftRef = useRef<{ nom: string; commentaire: string; /* ... */ } | null>(null)

// (2) sub-form dirty surfaced from child components (see §28.3)
const [subFormsDirty, setSubFormsDirty] = useState(false)
// OR the per-key registry for screens with multiple concurrent sub-forms (see §28.3)

// (3) startEdit captures the snapshot
const startEdit = useCallback(() => {
  if (!detail) return
  const snapshot = { nom: detail.nom, commentaire: detail.commentaire ?? '', /* ... */ }
  setEditNom(snapshot.nom)
  setEditCommentaire(snapshot.commentaire)
  originalDraftRef.current = snapshot
  setIsEditing(true)
}, [detail])

// (4) isDirty is a useMemo that ORs header-diff with sub-form-dirty
const isDirty = useMemo(() => {
  if (!isEditing) return false
  const o = originalDraftRef.current
  if (!o) return false
  if (editNom !== o.nom) return true
  if (editCommentaire !== o.commentaire) return true
  if (subFormsDirty) return true
  return false
}, [isEditing, editNom, editCommentaire, subFormsDirty])

// (5) the guard — depends on isDirty and the existing saveMutation
const guard = useUnsavedGuard({
  isDirty,
  save: async () => { await saveMutation.mutateAsync() },
  onDiscard: () => setIsEditing(false),
})
```

The `save` callback must call the existing top-level save mutation. Do **not** duplicate save logic — reuse whatever the "Enregistrer" button in the detail header already runs.

### 28.3 Surfacing sub-form dirty state from child components

Sub-sections (Contacts tab, Adresses tab, Lignes card, Recommandations card, etc.) own their own `showForm` / `editingId` state. The page needs to know when any of those are open so `isDirty` returns true. Two patterns depending on concurrency:

#### 28.3.a Single-source callback (use when sub-forms are mutually exclusive)

When only **one** sub-form can be open at a time in the whole screen — e.g. Fournisseurs where tab content is conditionally mounted so Contacts and Adresses can never be dirty at the same instant — pass a single `onDirtyChange: (dirty: boolean) => void` through the tree.

```tsx
// In the child (ContactsTab, LignesSection, etc.)
const onDirtyChangeRef = useRef(onDirtyChange)
useEffect(() => { onDirtyChangeRef.current = onDirtyChange })
useEffect(() => {
  onDirtyChangeRef.current(showForm || editingId !== null)
}, [showForm, editingId])
useEffect(() => () => { onDirtyChangeRef.current(false) }, [])  // reset on unmount
```

The ref indirection is **mandatory**: the unmount cleanup fires `false` so that when a tab is switched (unmounting the old tab), the parent correctly sees the dirty flag clear. A naked callback closure would crash on strict-mode double-invoke or lose the latest reference.

#### 28.3.b Per-key dirty registry (use when multiple sub-forms can be dirty simultaneously)

When the screen has sub-sections in **both** the center panel and the sidebar — e.g. Entreprises where `RecommandationsCard` lives in the center and `ContactsTab` / `AdressesTab` live in the sidebar — a single setter would let the last caller clobber the others. Use a key-based registry:

```tsx
// In the page
const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
const reportDirty = useCallback((key: string, dirty: boolean) => {
  setDirtyKeys((prev) => {
    if (dirty === prev.has(key)) return prev
    const next = new Set(prev)
    if (dirty) next.add(key); else next.delete(key)
    return next
  })
}, [])
const subFormsDirty = dirtyKeys.size > 0
```

Pass `reportDirty` down. Each child reports under a **unique string key**:

```tsx
// In the child
const reportDirtyRef = useRef(reportDirty)
useEffect(() => { reportDirtyRef.current = reportDirty })
useEffect(() => {
  reportDirtyRef.current('ent-contacts', showForm || editingId !== null)
}, [showForm, editingId])
useEffect(() => () => { reportDirtyRef.current('ent-contacts', false) }, [])
```

Key naming: prefix with the screen (e.g. `ent-contacts`, `ent-adresses`, `ent-recommandations`) to avoid collisions if the same component is reused across screens later.

#### 28.3.c Drawer-based screens (FournisseursStock pattern)

When the edit form lives inside a right-side drawer child component (per §27), the drawer owns its own edit state. Surface `isDirty` to the page via a callback + expose `save` and `onDiscard` via mutable refs so the page-level guard can invoke them:

```tsx
// Page
const [drawerDirty, setDrawerDirty] = useState(false)
const drawerSaveRef = useRef<() => Promise<void>>(async () => {})
const drawerDiscardRef = useRef<() => void>(() => {})

const guard = useUnsavedGuard({
  isDirty: drawerDirty,
  save: async () => { await drawerSaveRef.current() },
  onDiscard: () => drawerDiscardRef.current(),
})

<StockDetailDrawer
  onDirtyChange={setDrawerDirty}
  saveRef={drawerSaveRef}
  discardRef={drawerDiscardRef}
  onClose={handleClose}  // guarded — see §28.4
/>
```

```tsx
// Drawer
const isDirty = useMemo(() => { /* compare edit state to originalDraftRef */ }, [...])
useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])
useEffect(() => () => { onDirtyChange(false) }, [onDirtyChange])  // reset on unmount

useEffect(() => {
  saveRef.current = async () => { await saveMutation.mutateAsync() }
})
useEffect(() => {
  discardRef.current = () => setIsEditing(false)
})
```

The `useEffect(() => { ref.current = ... })` with no dep array runs on every render, keeping the ref up-to-date with the latest closure. The page's guard reads `drawerSaveRef.current` at click time, always getting the fresh function.

### 28.4 Guarding in-page navigation — `guardAction` wraps everything

Three in-page navigation points must go through `guard.guardAction`:

```tsx
// 1. Left list click (MasterDetailLayout pattern)
const handleSelect = useCallback((id: number) => {
  guard.guardAction(() => {
    setIsEditing(false)
    setSelectedId(id)
  })
}, [guard])

// 2. Back button (MasterDetailLayout stacked mode)
onBack={() => guard.guardAction(() => { setIsEditing(false); setSelectedId(null) })}

// 3. Drawer close / outside-click dismissal (table-centric §27 pattern)
const handleClose = useCallback(() => {
  guard.guardAction(() => setSelectedId(null))
}, [guard])

// In the table row (§27.3):
onClick={() => handleRowClick(r.IDstock_fil)}
// where handleRowClick = (id) => guard.guardAction(() => setSelectedId(prev => prev === id ? null : id))
```

**Route-level navigation** (sidebar clicks, submenu tabs, programmatic `navigate()`) is **automatically** intercepted by `useBlocker` inside the hook — no extra wiring needed. The only thing left to render is the dialog:

```tsx
<UnsavedChangesDialog
  open={guard.showDialog}
  onAction={guard.handleAction}
  isSaving={guard.isSaving}
/>
```

Place it as a sibling of the `MasterDetailLayout` (wrap in a `<>...</>` fragment if necessary), **not** inside it — dialogs should always be top-level siblings of the screen's main JSX.

### 28.5 Delete bypass

Header delete buttons (trash icon → confirm → mutate) must **reset `isEditing` before calling the mutation** so the guard doesn't block the follow-up list re-render:

```tsx
onDelete={() => {
  if (confirm('Supprimer ... ?')) {
    setIsEditing(false)  // <-- critical: makes isDirty false so guard doesn't fire
    deleteMut.mutate()
  }
}}
```

Deleting is a valid exit path that implicitly discards. The guard should never ask "save or discard?" when the user is deleting the record entirely.

### 28.6 Hooks-before-returns (CLAUDE.md rule reinforced)

`useBlocker` is a React hook called from inside `useUnsavedGuard`. Since pages call `useUnsavedGuard` at their top level, this is fine in normal flow. But: **every hook in the page component (including `useState`, `useRef`, `useMemo`, `useCallback`, `useMutation`, `useQuery`, `useUnsavedGuard`) must be declared before any early `return`**. Violating this crashes production builds with React error #310 (dev builds may appear to work).

The 4 current reference screens all satisfy this — mirror their layout. When in doubt, put every hook at the top of the component body and only put early returns (`if (!detail) return null`) after the last hook call.

### 28.7 Reference checklist for new edit-mode screens

Every screen with an edit mode must have:

- [ ] `UnsavedChangesDialog` and `useUnsavedGuard` imported from the shared paths (§28.1)
- [ ] `originalDraftRef` captured in `startEdit`, containing every editable header field
- [ ] `isDirty` `useMemo` comparing current header state to the snapshot, OR'd with sub-form dirty flag(s)
- [ ] Sub-form dirty surfaced via **single-callback** (§28.3.a) OR **per-key registry** (§28.3.b) OR **ref-based** (§28.3.c) depending on architecture
- [ ] Every child component with its own form state uses the `useRef(callback)` + `useEffect` + unmount-cleanup trio (§28.3.a) — never a naked closure
- [ ] `useUnsavedGuard({ isDirty, save, onDiscard })` called at the page top level, with `save` awaiting the existing save mutation
- [ ] `handleSelect`, `onBack`, `handleClose`, and any row-click handler routed through `guard.guardAction(...)`
- [ ] `<UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />` rendered as a top-level sibling
- [ ] Delete button resets `setIsEditing(false)` **before** calling the delete mutation (§28.5)
- [ ] All hooks declared before any early `return` (§28.6)
- [ ] `tsc --noEmit` clean and `pnpm --filter @mps/web build` completes without errors

Manual test that must pass on every edit-mode screen:
1. Enter edit mode, change a field, click a different row in the list → dialog appears
2. Click **Annuler** → stays on current, edit state preserved
3. Click **Abandonner** → switches to new row, discarding changes
4. Click **Enregistrer** → saves, then switches
5. Enter edit mode, change a field, click a different sidebar route → same 3 outcomes
6. Enter edit mode with no changes, click another row → switches immediately, no dialog
7. Click delete → no dialog, deletion proceeds

---

## 29. Sidebar Status Footer (user-controlled state, detached pill)

References:
- **Binary**: `apps/web/src/pages/FilsCommandes.tsx` → `StatusFooter` (two-state toggle — en cours / terminée)
- **Multi-state**: `apps/web/src/pages/EtudesColoris.tsx` → `EtudeStatutFooter` (four-state menu — attente labo / soumis / accepté / annulé)

For entities with a **user-controlled primary state**, render the current state as a **solid-colored pill placed as a standalone sibling below the sidebar tabs panel** — not as a small badge in the header, and not as an inset cap on the bottom of the panel. The pill is both the status display and the state-change control, combined into a single visual unit, and it is structurally separated from the tabs panel by a 12px gap.

This pattern applies regardless of how many values the state can take:
- **2 values (binary)** → pill + split toggle button (§29.3)
- **3+ values (multi-state)** → pill + menu button that opens a transition popover (§29.4)

Both variants share the same outer shape, colors, and placement. Do NOT put state management in the detail header (no status Badge next to the title). Multi-state entities were an exception in earlier drafts of this skill — they are not an exception anymore.

### 29.1 Why a detached pill, not an inset footer

- The detail header is already dense with title, date, edit/delete buttons, and "Mode édition" chip — adding a badge there competes for attention
- A bar fixed below the right sidebar sits in a predictable spot across screens, so users always know where to look for / change status
- Giving the state its own bold, colored surface communicates its importance more than a pastel pill
- **Detaching** it from the tabs panel (rather than capping the panel with it) lets the tabs panel keep its own rounded-xl border on all four corners and makes the status pill feel like a first-class, distinct control rather than subordinate chrome of the tabs panel

### 29.2 Structure — parent layout

The sidebar's root is a flex column with two siblings: the tabs panel (fills remaining height) and the status pill (fixed height, pinned at the bottom). Use `gap-3` between them so they read as two distinct elements.

```tsx
return (
  <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
    {/* Tabs panel — takes remaining space, own rounded border on all four corners */}
    <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
      <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
        {/* tab buttons */}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
        {/* active tab content */}
      </div>
    </div>

    {/* Standalone status pill — flex-shrink-0, same w-96 inherited from the parent */}
    <StatusFooter
      etat={commande.etat}
      onToggle={onToggleEtat}
      isToggling={isTogglingEtat}
      disabled={isEditing}
    />
  </div>
)
```

Critical classes on the root:
- **`flex flex-col gap-3 min-h-0`** — the `min-h-0` is mandatory: without it the `flex-1` child can't shrink below its content's natural height and the status pill gets pushed off-screen.
- **`gap-3`** — 12px separation between the tabs panel and the status pill. Smaller gaps look accidental.

### 29.3 Binary variant — pill + split toggle button

Two states, one click flips from one to the other. The right-side action button's label describes the *target* state, not the current one ("Clôturer" on an en-cours order, "Rouvrir" on a closed one).

```tsx
function StatusFooter({
  etat, onToggle, isToggling, disabled,
}: {
  etat: number | null
  onToggle: () => void
  isToggling: boolean
  disabled: boolean
}) {
  const isDone = etat === 1
  const Icon = isDone ? CheckCircle2 : Clock
  const label = isDone ? 'Terminée' : 'En cours'
  const actionLabel = isDone ? 'Rouvrir' : 'Clôturer'
  const ActionIcon = isDone ? Clock : CheckCircle2

  return (
    <div
      className={cn(
        'flex-shrink-0 rounded-xl border shadow-sm overflow-hidden flex items-stretch h-11',
        isDone ? 'bg-success border-success' : 'bg-primary border-primary'
      )}
    >
      {/* Left half: icon + state label */}
      <div className="flex items-center gap-2 px-3 flex-1 text-white min-w-0">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-bold uppercase tracking-wide truncate">{label}</span>
      </div>
      {/* Right half: toggle action, split by a white divider */}
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || isToggling}
        title={isDone ? 'Marquer en cours' : 'Marquer terminée'}
        className="px-3.5 bg-white/15 hover:bg-white/25 active:bg-white/30 disabled:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold border-l border-white/25 flex items-center gap-1.5 transition-colors"
      >
        <ActionIcon className="h-3.5 w-3.5" />
        {actionLabel}
      </button>
    </div>
  )
}
```

### 29.4 Multi-state variant — pill + menu button

Three or more discrete states (pending / sent / accepted / refused, draft / submitted / paid / overdue / cancelled, …). Same outer shape as the binary variant, but the right-side button opens a small popover with one row per possible state. Clicking a row fires the state-change mutation immediately and closes the menu.

```tsx
const STATUT_META: Record<Statut, {
  label: string               // e.g. "Soumis au client"
  icon: LucideIcon            // e.g. Send
  solidBg: string             // Tailwind bg class, e.g. 'bg-blue-500 border-blue-500'
}> = { /* …one entry per state… */ }

function StatutFooter({
  current, onChange, isChanging, disabled,
}: {
  current: Statut
  onChange: (next: Statut) => void
  isChanging: boolean
  disabled: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const meta = STATUT_META[current]
  const Icon = meta.icon

  // Click outside to close the menu.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  return (
    <div ref={rootRef} className="flex-shrink-0 relative">
      <div className={cn(
        'rounded-xl border shadow-sm overflow-hidden flex items-stretch h-11',
        meta.solidBg,
      )}>
        <div className="flex items-center gap-2 px-3 flex-1 text-white min-w-0">
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-bold uppercase tracking-wide truncate">
            {meta.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={disabled || isChanging}
          title="Changer le statut"
          className="px-3.5 bg-white/15 hover:bg-white/25 active:bg-white/30 disabled:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold border-l border-white/25 flex items-center gap-1.5 transition-colors"
        >
          {isChanging
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <ChevronUp className={cn('h-3.5 w-3.5 transition-transform', menuOpen && 'rotate-180')} />}
          Changer
        </button>
      </div>
      {menuOpen && (
        <div className="absolute bottom-full right-0 mb-1 w-full min-w-[220px] rounded-lg border bg-white shadow-lg overflow-hidden z-50">
          {STATUT_ORDER.map((s) => {
            const m = STATUT_META[s]
            const active = current === s
            const SIcon = m.icon
            return (
              <button
                key={s}
                type="button"
                onClick={() => { if (!active) onChange(s); setMenuOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  active ? 'bg-accent/10 text-accent cursor-default' : 'hover:bg-zinc-100',
                )}
              >
                <SIcon className="h-4 w-4" />
                {m.label}
                {active && <CheckCircle2 className="h-4 w-4 ml-auto text-accent" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

Conventions specific to the multi-state variant:
- **Menu button label is always `"Changer"`** (not the target state — there are too many possible targets to name one). The icon is a `ChevronUp` that rotates 180° when open so it reads as "expand upward."
- **Popover anchors to `bottom-full`** (opens upward from the pill) so it doesn't get clipped at the bottom of the viewport.
- **Active row is non-interactive** (`cursor-default`, no hover state, check icon on the right) — clicking it does nothing. The other rows fire `onChange` immediately.
- **`onChange` triggers a mutation that persists the change directly** — there is no "Enregistrer" step. Status changes are not part of the record's edit form. During edit mode, the button is `disabled` so the user can't race their own unsaved edit against a status change.
- **Loader replaces the chevron** while `isChanging` is true. The button stays disabled through the round-trip.
- **State list comes from a `STATUT_META` record** indexed by the state type. This is the same structure used by the left-list card (strip color), detail-header badge, and any other status-displaying surface — one definition, one visual language.

### 29.5 Conventions

- **Colors**: `bg-primary` (MPS deep blue) for the "in progress / active" state, `bg-success` for the "done / validated" state. The border matches the bg color (`border-primary` / `border-success`) so the pill reads as a single solid shape, not a ringed button. Do NOT use `bg-amber`/`bg-yellow` for active — amber is reserved for warnings/alerts. Do NOT use pastel transparent colors (`bg-primary/10`) — the pill must be solid and bold to match the left-list badge aesthetic.
- **Shape**: `rounded-xl` all four corners (NOT `rounded-b-xl`) — it's a standalone pill now, not a bottom cap.
- **Border + shadow**: `border shadow-sm` to match the tabs panel's visual weight. Without them the pill looks flat next to the bordered panel above.
- **Height**: fixed `h-11` — visually substantial without dominating the sidebar.
- **Typography**: `text-sm font-bold uppercase tracking-wide` for the state label, `text-xs font-semibold` for the action button text. White foreground throughout.
- **Action button as inset split**: the toggle button lives **inside** the colored pill, separated by `border-l border-white/25` and a `bg-white/15` hover-tinted surface. It is not an outlined shadcn `<Button>` — use a raw `<button>` so it can share the pill's background.
- **Disabled during edit mode**: pass `disabled={isEditing}` so users cannot toggle the state while a header edit is mid-flight. Also disable while the mutation is in-flight (`isTogglingEtat`).
- **No "Statut" label above the pill**: the bold colored pill speaks for itself. Adding a label above makes it feel like a form field and eats vertical space.

### 29.6 When to use the footer vs a badge in the header

| Situation | Pattern |
|---|---|
| **User-controlled** primary state — 2 values → §29.3 / 3+ values → §29.4 | **Footer pill** at the bottom of the sidebar |
| **Computed / derived** state shown for reference only (e.g. "en retard" from due date, "surstockée" from a threshold) | Badge in the detail header |
| Several independent flags displayed together (e.g. Bio + Recyclé + GOTS on a yarn reference) | Row of badges in the detail header or near the title |

Decision rule: *"Can the user change this from a dropdown or toggle?"* If yes, it goes to the footer, regardless of how many values exist. If it's purely derived from other fields (dates, thresholds, calculations), it stays in the header where it reads as "informational."

**Do not** place user-controlled status management in the detail header — even for multi-valued states. Earlier drafts of this skill allowed a header badge + menu as an alternative for 3+-state screens; that guidance has been superseded. Every status surface now uses the footer.

### 29.7 Gotcha: `<Badge variant='default'>` is primary blue, not grey

When building related status indicators elsewhere, note that the shadcn `<Badge>` component in this project defaults to `variant='default'` which is `bg-primary text-primary-foreground` — **solid deep blue**, not a neutral grey. If you append a `badge-warning` / `badge-success` utility via `className`, the variant's `bg-primary` will usually win because both classes sit in the same CSS layer. Always pass an explicit `variant` (`variant='default'`, `variant='success'`, `variant='warning'`, `variant='secondary'`) when building status badges. This is how `CommandeEtatBadge` in `FournisseursCommandes.tsx` is written: `<Badge variant="success">Terminée</Badge>` / `<Badge variant="default">En cours</Badge>`.

---

## 30. List Card Deadline / Urgency Indicator

Reference: **`apps/web/src/pages/FournisseursCommandes.tsx`** → `deliveryUrgency()` helper + left-list card.

For any entity that has a **deadline** (delivery date, due date, échéance, expected ship date…), the left-list card should visually flag how urgent that deadline is. The pattern:

- **Red left edge + red selection ring** → deadline is today or already past, OR no deadline is set
- **Amber left edge + amber selection ring** → deadline is within the next 3 days
- **No decoration** → deadline is further out, OR the entity is in a terminal state (`terminée`, `livrée`, `payée`, `annulée`…)

This makes the "what do I need to deal with first?" question answerable at a glance without reading any date values.

### 30.1 Urgency helper

```tsx
// Urgency flag based on a YYYYMMDD deadline (HFSQL date string).
// 'late' = today >= deadline, OR no deadline specified (red)
// 'soon' = deadline within the next 3 days (amber)
// null   = not urgent, or entity is in a terminal state
function deliveryUrgency(deadlineHfsql: string | null, etat: number | null): 'late' | 'soon' | null {
  if (etat === 1) return null // terminal state — no urgency color
  if (!deadlineHfsql || !/^\d{8}$/.test(deadlineHfsql)) return 'late' // missing date = problem
  const y = Number(deadlineHfsql.slice(0, 4))
  const m = Number(deadlineHfsql.slice(4, 6)) - 1
  const d = Number(deadlineHfsql.slice(6, 8))
  const target = new Date(y, m, d); target.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays <= 0) return 'late'
  if (diffDays <= 3) return 'soon'
  return null
}
```

The three-day window and the "missing date = late" rule are deliberate — a missing deadline is almost always a data-quality problem the user should see as red rather than silently hide.

### 30.2 Rendering the indicator on the card

Two visual cues, applied together:

1. **Left-edge strip** via an inset `box-shadow` (not `border-l`) — see §30.3 for why
2. **Matching selection ring + border** when the card is the selected one — so the urgency color dominates the selection color instead of fighting it

```tsx
{rows.map((row) => {
  const isSelected = selectedId === row.id
  const urgency = deliveryUrgency(row.earliest_delivery, row.etat)
  const selectedRingClass =
    urgency === 'late' ? 'border-red-500 ring-1 ring-red-500'
    : urgency === 'soon' ? 'border-amber-500 ring-1 ring-amber-500'
    : 'border-accent ring-1 ring-accent'

  return (
    <div
      key={row.id}
      onClick={() => onSelect(row.id)}
      className={cn(
        'p-3 border rounded-lg cursor-pointer transition-all bg-white',
        isSelected ? selectedRingClass : 'border-border hover:border-accent/50',
        // Inset left-edge strip — uses --tw-shadow so it coexists with --tw-ring-shadow
        urgency === 'late' && 'shadow-[inset_4px_0_0_0_rgb(239_68_68)]',
        urgency === 'soon' && 'shadow-[inset_4px_0_0_0_rgb(245_158_11)]'
      )}
    >
      {/* …card contents… */}
    </div>
  )
})}
```

### 30.3 Why `shadow-[inset_...]` and not `border-l-4 border-l-red-500`

The left list cards already use `border border-accent` + `ring-1 ring-accent` to mark the selected row. Mixing that with `border-l-<color>` causes two problems:

1. `border-accent` is a shorthand (sets all four sides) and `border-l-red-500` is a longhand for the left side — the winner depends on Tailwind's stylesheet ordering, which is not stable across class combinations
2. The selection ring and the urgency strip are two separate visual concepts, and coupling them to the same `border-l` property makes it hard to keep the ring color consistent with the urgency color independently

`shadow-[inset_4px_0_0_0_<color>]` sidesteps both issues. Tailwind compiles arbitrary-value shadows to `--tw-shadow`, while `ring-1 ring-accent` compiles to `--tw-ring-shadow`. The final `box-shadow` property composes both variables, so a selected urgent row gets the ring **and** the inset left strip at the same time, with no ordering gymnastics. `cn()` (twMerge) also doesn't know about arbitrary shadow values, so nothing gets deduped away.

### 30.4 Color palette

Always use the same raw RGB values for consistency across screens:

| State | Fill color (inset shadow) | Ring / border class |
|---|---|---|
| `late` | `rgb(239 68 68)` (red-500) | `ring-red-500 border-red-500` |
| `soon` | `rgb(245 158 11)` (amber-500) | `ring-amber-500 border-amber-500` |
| normal | — | `ring-accent border-accent` |

Do NOT use the semantic `destructive` / `warning` tokens here — those vary slightly between light and dark themes, and deadline urgency should remain stable regardless of theme. Raw Tailwind red-500 / amber-500 is the right choice.

### 30.5 When this pattern applies

Apply it to any list card that carries a deadline the user cares about. Candidates in MPS_NG:

- Fournisseurs → Commandes (implemented) — earliest line `date_livraison`
- Clients → Commandes — earliest line `date_livraison`
- Clients → Facturation — `date_echeance`
- Sous-traitants → Commandes — `date_retour_prevue`
- Production → Tricotage / Teinture / Confection — `date_prevue`
- Transport → Expéditions / Livraisons — `date_expedition` / `date_livraison`

The three-day window can be tuned per domain, but the visual language (red = late/missing, amber = soon, no decoration = normal) stays constant across the whole app so users don't have to re-learn it per screen.

---

## 31. In-Screen Contained Drawer (click-a-row → slides up inside the center panel)

Reference: **`apps/web/src/pages/FournisseursCommandes.tsx`** → `StockLinkDrawer` + the split inside `LignesSection`.

When a user clicks a row in the center panel's main list (e.g. an order line), a drawer should slide up inside that same panel — **not** as a full-screen `Sheet` overlay. The rows shrink to make room; the drawer fills the bottom. Nothing outside the center panel is covered.

This pattern already exists in **MFProd** (`C:\dev\mfprod\mfprod_erp` → `src/features/commandes/components/OrderDetail.tsx` + `AffectationPanel.tsx`) and should be used in MPS_NG for the same "drill into a row without losing context" interactions. It is distinct from:
- **§27 Table-centric screens** — those use a `fixed` right-side drawer that overlays the table body
- **§29 Sidebar status footer** — that is a pinned element, never hidden
- **shadcn `<Sheet>`** — that is a full-screen modal with an overlay backdrop

### 31.1 Core mechanic — flexbox sibling, no `position: fixed`

The drawer is a **flex sibling** of the rows-scrollable div, not a positioned overlay. The parent is already `flex-1 min-h-0 flex flex-col` (§7 single-list shape — **no framing `<Card>` around the list**, see §7 and §23). When the drawer is open, the rows div capitulates to `flex-shrink-0 max-h-[40%]` and the drawer gets `flex-1 min-h-0`. Flexbox handles the height split with no explicit calc.

```tsx
function LignesSection({ commande, stockDrawerLineId, onOpenStockDrawer, isEditing, ... }: Props) {
  // Drawer is closed whenever we enter edit mode — the line-card click is
  // reserved for the existing edit-mode buttons.
  const drawerOpen = stockDrawerLineId !== null && !isEditing
  const drawerLigne = drawerOpen
    ? commande.lignes.find((l) => l.IDref_fil_commande === stockDrawerLineId) ?? null
    : null

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Rows list: shrinks to 40% when drawer is open, full height otherwise */}
      <div
        className={cn(
          'overflow-auto space-y-2 p-1 scrollbar-transparent',
          drawerOpen ? 'flex-shrink-0 max-h-[40%]' : 'flex-1 min-h-0'
        )}
      >
        {commande.lignes.map((l) => (
          <LineCard
            key={l.IDref_fil_commande}
            line={l}
            isStockDrawerOpen={stockDrawerLineId === l.IDref_fil_commande}
            onOpenStockDrawer={onOpenStockDrawer}
            /* ...other props */
          />
        ))}
      </div>

      {/* Drawer: fills the remaining space, animated slide-in */}
      {drawerOpen && drawerLigne && (
        <div className="flex-1 min-h-0 flex flex-col mt-3 rounded-lg border border-border/60 overflow-hidden bg-zinc-50/80 animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
          <StockLinkDrawer
            commandeId={commande.IDcommande_fil}
            ligne={drawerLigne}
            onClose={() => onOpenStockDrawer(null)}
            onSuccess={onMutationSuccess}
          />
        </div>
      )}

      {/* Existing totals footer stays pinned at the bottom */}
      {commande.lignes.length > 0 && (
        <div className="flex-shrink-0 mt-3 pt-3 border-t ...">…</div>
      )}
    </div>
  )
}
```

### 31.2 Toggle-on-reclick + selected-row highlight

The click behavior is a **toggle**: clicking the already-open row closes the drawer, clicking a different row switches it. The open row also gets a subtle highlight so the user always knows which row the drawer belongs to.

```tsx
// Inside LineCard
<div
  className={cn(
    'group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3',
    etatBorder,
    clickable && 'cursor-pointer hover:bg-zinc-100 hover:border-accent/40 transition-colors',
    isStockDrawerOpen && 'ring-1 ring-accent bg-accent/[0.06] border-accent/50' // selected-row cue
  )}
  onClick={clickable ? () => onOpenStockDrawer(isStockDrawerOpen ? null : line.IDref_fil_commande) : undefined}
>
```

State lives at the **page root** (`const [stockDrawerLineId, setStockDrawerLineId] = useState<number | null>(null)`), threaded down through `DetailMain → LignesSection → LineCard`. This keeps the drawer state outside the React Query cache and lets the page-level `startEdit` callback close it imperatively when the user switches to edit mode.

### 31.3 Auto-close when entering edit mode

Edit mode hides the drawer because the same line-card click is reserved for the inline edit UI. Close the drawer in `startEdit`, not just conditionally in the render:

```tsx
const startEdit = useCallback(() => {
  // …snapshot header draft…
  setStockDrawerLineId(null) // Edit mode hides the stock drawer
  setIsEditing(true)
}, [detail])
```

This means the drawer's `drawerOpen` guard (`stockDrawerLineId !== null && !isEditing`) is belt-and-suspenders — but the imperative close is what actually drops the state so it doesn't silently reopen when the user cancels the edit.

### 31.4 Drawer content chrome

Because the drawer sits **inside** the panel and the selected row is already highlighted right above it, **do NOT repeat the row's info at the top of the drawer**. The user can see it without scrolling. Keep the drawer header minimal — a thin strip with just an `X` close button on the right is plenty:

```tsx
<div className="flex flex-col h-full min-h-0 overflow-hidden">
  {/* Minimal top bar: close button only — row info is already visible in the list above */}
  <div className="flex-shrink-0 px-2 py-1 border-b bg-zinc-200/50 flex items-center justify-end">
    <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" title="Fermer">
      <X className="h-3.5 w-3.5" />
    </Button>
  </div>
  <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-transparent">
    {/* sections, row items, etc. */}
  </div>
</div>
```

If the drawer's content has multiple sections, use the same `text-[10px] uppercase tracking-wide text-muted-foreground font-semibold` section heading convention (§5, §7).

### 31.5 Gotcha: `overflow-auto` clips ring-based highlights

The shrunk rows container has `overflow-auto`, which **clips the `ring-1` + `border-accent` highlight on the selected row** if there's no padding between the cards and the scrollable edge. Always add `p-1` (or wider) to the scrollable div:

```tsx
// WRONG — ring gets clipped on top/left edges
<div className="overflow-auto space-y-2 pr-1 ...">

// RIGHT — 4px of breathing room all around the cards
<div className="overflow-auto space-y-2 p-1 ...">
```

This same fix applies anywhere else in the app where a scrollable container holds cards with outer rings.

### 31.6 Data pattern: mutations return the full refreshed payload

Drawer contents usually show two lists that move items between themselves (linked ↔ available, selected ↔ candidate, etc.). Rather than invalidating and refetching after every mutation, have the **mutation endpoint return the full refreshed `{listA, listB}` payload** and hydrate it directly via `queryClient.setQueryData`. No round-trip, no flicker:

```tsx
const queryKey = ['commande-fil-stock', commandeId, ligne.IDref_fil_commande]

const linkMut = useMutation({
  mutationFn: (stockId: number) => apiFetch(`/commandes-fil/${commandeId}/lignes/${ligne.IDref_fil_commande}/stock/${stockId}`, { method: 'PUT' }),
  onSuccess: (payload: LineStockPayload) => {
    queryClient.setQueryData(queryKey, payload)
    onSuccess() // also invalidate the parent detail query so indicators on the row outside refresh
  },
})
```

The `onSuccess` callback bubbles up to the page so the parent `['commande-fil', id]` query (which drives the row's aggregate indicator, e.g. "N lots · X kg") also refreshes.

### 31.7 When to use this vs other drawer patterns

| Situation | Pattern |
|---|---|
| Click a row in a list to drill into a related sub-list / pick child items, without navigating away | **§31 in-screen drawer** (this section) |
| Edit a single entity's full form / certificate viewer / anything where the user needs the full screen | shadcn `<Sheet>` or `<Dialog>` |
| Stock-fil style "big table with a side panel for the selected row" | **§27 fixed right-side drawer** |
| Pinned always-visible state display | **§29 sidebar status footer** |

### 31.8 Candidate screens in MPS_NG

This pattern will recur wherever the user needs to "drill into a row to pick related items". Candidates:

- Fournisseurs → Commandes (implemented) — pick stock_fil lots for a ref_fil_commande line
- Clients → Commandes — pick finished-product lots for a client order line (same shape)
- Sous-traitants → Commandes — pick semi-finished batches for a subcontract return
- Production → Tricotage / Teinture / Confection — pick inputs to consume for a production order line
- Transport → Expéditions — pick ready-to-ship parcels for a delivery line

Every case has the same mechanic: a list of rows in the center panel, and each row needs an ad-hoc sub-picker against another table. This pattern is the canonical answer.

---

## 32. Email Send Dialog (Gmail API via domain-wide delegation)

References:
- **Shared component**: `apps/web/src/components/email/SendEmailDialog.tsx` — the single reusable two-pane dialog used by every email button in the app.
- **Shared lib**: `apps/web/src/lib/email.ts` — types (`EmailRecipient`, `EmailDefaults`, `SendPayload`), `parseEmailList`, `formatFileSize`, `MAX_TOTAL_ATTACHMENT_BYTES`, `postEmail(url, payload, opts)`.
- **Call sites**: `apps/web/src/pages/FournisseursCommandes.tsx` (with PDF preview) and `apps/web/src/pages/Entreprises.tsx` (no PDF → empty viewer).
- **Backend reference**: `apps/api/src/routes/commandes-fil.ts` → `/:id/email-defaults` + `/:id/email` (with server-rendered PDF + user attachments). `apps/api/src/routes/entreprises.ts` has the minus-PDF variant.

Every document-centric screen (bons de commande, devis, factures, bons de livraison, bons d'expédition…) plus "plain" email-enabled screens like Entreprises use the same `SendEmailDialog` component. Backed by a single Google service account with Workspace domain-wide delegation — there is no per-user OAuth flow.

**Historical note**: through April 2026 the plan was per-screen `EmailXxxDialog` forks until 3+ copies justified abstracting. The actual abstraction landed earlier: `FournisseursCommandes.tsx` got a working `EmailCommandeDialog`, then `Entreprises.tsx` needed one, then a bunch of other screens were queued — so the shared component was built directly, the local `EmailCommandeDialog` was deleted, and both call sites were wired through `<SendEmailDialog>`. **Do not re-fork per screen**. Add props to the shared component or lift state up if a screen needs something custom.

### 32.1 Infrastructure (one-time, already in place)

| Piece | File | Role |
|---|---|---|
| JWT impersonation + MIME builder | `apps/api/src/lib/gmail.ts` | `sendMail({ from, fromName, to, cc, subject, body, attachments })` — builds a RFC 2822 multipart/mixed message and sends via `google.gmail('v1').users.messages.send()`. One `JWT` instance per impersonated `subject`, cached across sends. |
| User→email map | `apps/api/src/lib/user-emails.ts` + `apps/api/data/user-emails.json` | JSON-file-backed, mirrors `permissions.ts`. Admin-editable via `/api/user-emails/users`. The `utilisateur` table has no `email` column, so the mapping lives outside HFSQL. |
| Admin editor | `apps/web/src/pages/SettingsUtilisateurs.tsx` → `EmailEditor` card | Lives above the permission list on each user. Local draft state, client-side regex check, Enregistrer disabled when empty-to-empty or invalid. |
| Env var | `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` in `apps/api/.env.{development,production}` | Absolute path to the service account JSON key. Read lazily inside `gmail.ts` (dotenv runs in `index.ts`, ESM import hoisting forbids reading at module load). Key file lives in `apps/api/secrets/` locally (gitignored) and `/home/debian/mps_api/secrets/` on the prod API server. |

The GCP project is **MPS-Desktop**, the service account is **OAuth_Sender** (`oauth-sender@mps-desktop.iam.gserviceaccount.com`), and its Client ID (`106332337770635660405`) is authorised in Google Workspace Admin → Security → API controls → Domain-wide Delegation for scope `https://www.googleapis.com/auth/gmail.send`.

### 32.2 Two-endpoint backend pattern per document type

For each document type (or plain entity) that needs email, add **two** endpoints next to the existing `/:id/pdf` endpoint (if any):

**`GET /:id/email-defaults`** — returns the shared `EmailDefaults` shape:

```ts
{
  recipients: {
    selected:    Array<{ email, name?, source: 'contact', contactId }>,  // pre-checked chips
    suggestions: Array<{ email, name?, source: 'contact', contactId }>,  // clickable to add
  },
  subject: string,
  body: string,
  // ...plus screen-specific context fields (fournisseurNom, entrepriseNom, numero, etc.)
}
```

Filter every contact on the parent record: skip `est_visible = 0`, require a non-empty `mail` matching `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, dedupe lowercase. Build `name` from `prenom + nom`. Split into two lists by the relevant `envoi_*` flag (for documents) or `est_defaut` (for entreprises, which have no `envoi_*`). Returns 404 if the parent record doesn't exist.

**`POST /:id/email`** — body:

```ts
{
  to: string[],                     // required, min 1, Zod .email()
  cc?: string[],
  subject: string,                  // min 1, max 500
  body: string,                     // min 1, max 20000
  attach_pdf?: boolean,             // default true; omit if there's no server PDF
  extra_attachments?: Array<{       // user-uploaded files from the dialog
    filename:       string,
    content_base64: string,
    content_type:   string,
  }>,
}
```

Validates via Zod, looks up the acting user's mapped email via `getUserEmail(req.userId)`, generates the server PDF via the shared helper (if `attach_pdf !== false`), decodes each `extra_attachments[].content_base64` to a Buffer, merges both into one `attachments` array, calls `sendMail()`. Responses:
- `200 { ok: true, messageId }`
- `400 no_sender_email` — acting user has no mapped email yet (see §32.7)
- `400 Validation failed` — Zod issues
- `404` — record not found
- `500 send_failed` — bubble `err.message` for the UI banner

**Body size**: `apps/api/src/index.ts` sets `express.json({ limit: '25mb' })`. Required — user attachments travel inline as base64 and the default 100 KB limit would reject anything non-trivial.

**PDF helper refactor (mandatory)** — the moment a document type gains an email endpoint, split its PDF rendering into a reusable `buildXxxPdfData(id)` + `renderXxxPdfBuffer(data)` pair. Both `/pdf` and `/email` call them so the attachment is byte-identical to the downloadable PDF. Reference: `commandes-fil.ts`.

**Iframe-embedding header strip (mandatory for any `/pdf` endpoint)** — see §21. The `SendEmailDialog` viewer iframes the `/pdf` endpoint, and helmet's default headers block cross-origin embedding. Every PDF endpoint MUST:
```ts
res.removeHeader('X-Frame-Options')
res.removeHeader('Content-Security-Policy')
res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
```
Without this the right pane silently falls back to the empty state. Already applied in `commandes-fil.ts`.

**Contacts filtering convention** — flags in the `contact` table drive which contacts go into `recipients.selected` vs `suggestions`:

| Document | Flag determining `selected` bucket |
|---|---|
| Bon de commande (commande_fil) | `envoi_commande = 1` |
| Facture | `envoi_facture = 1` |
| Bon de livraison | `envoi_bl = 1` |
| Devis / Soumission | `envoi_soumission = 1` |
| **Entreprise (no document)** | `est_defaut = 1` (fallback — entreprise contacts lack `envoi_*`) |

Everything that doesn't match the flag but still has a valid email goes into `suggestions` so the user can click-to-add.

### 32.3 Frontend — using the shared `SendEmailDialog`

Every screen mounts the same component. Do NOT fork it. Call site shape:

```tsx
<SendEmailDialog
  open={emailModalOpen}
  onClose={() => setEmailModalOpen(false)}
  contextLabel={detail?.fournisseur_nom ?? undefined}
  queryKey={['commande-fil-email-defaults', selectedId]}
  loadDefaults={() => apiFetch(`/commandes-fil/${selectedId}/email-defaults`)}
  pdfUrl={`${API_URL}/commandes-fil/${selectedId}/pdf`}
  pdfAttachmentLabel={`commande-fournisseur-${selectedId}.pdf`}
  onSend={(p) => postEmail(
    `${API_URL}/commandes-fil/${selectedId}/email`,
    p,
    { includeAttachPdf: true },
  )}
/>
```

For a screen without a document (Entreprises), drop `pdfUrl` + `pdfAttachmentLabel` and pass `postEmail(..., p)` without `includeAttachPdf`. The right pane shows the empty state until the user attaches a file.

**Props**:

| Prop | Type | Notes |
|---|---|---|
| `open` / `onClose` | `boolean` / `() => void` | Standard dialog visibility |
| `contextLabel` | `string?` | Header suffix (e.g. fournisseur / entreprise name) |
| `queryKey` | `readonly unknown[]` | React-query cache key for the defaults fetch — must be stable per open id |
| `loadDefaults` | `() => Promise<EmailDefaults>` | Called on open (guarded by `enabled: open`) |
| `onSend` | `(payload: SendPayload) => Promise<void>` | Caller wires the endpoint via `postEmail(url, p, opts)` |
| `pdfUrl` | `string?` | Optional; when omitted, the right pane shows the empty state and no server PDF chip is added to the attachment list |
| `pdfAttachmentLabel` | `string?` | Filename-like label shown on the server PDF chip (default `'document.pdf'`) |

**`postEmail` helper** (`apps/web/src/lib/email.ts`) does three things the caller should not reinvent:
1. Uses raw `fetch` with `credentials: 'include'` (NOT `apiFetch`) so the server's French `no_sender_email` message is preserved in the response body.
2. Serializes `payload.userAttachments` (`File[]`) to base64 via a binary-safe chunked `Uint8Array` → `btoa` loop, sends as `extra_attachments: [{ filename, content_base64, content_type }]`.
3. When `opts.includeAttachPdf` is true, forwards `attachPdf` as the `attach_pdf` body field.

### 32.4 Layout — the two-pane dialog

```
┌───────────────────────────────────────────────────────────┐
│  [@] Envoyer un email — {contextLabel}             [X]   │ ← flex-shrink-0 header, gold gradient
├─────────────────────────────┬─────────────────────────────┤
│ À                           │                             │
│ ┌─────────────────────────┐ │                             │
│ │ [👤 Jean D. ✕] [✕]      │ │                             │
│ │ + [Paul M.] [Marc T.]   │ │                             │
│ │ [ajouter une adresse] + │ │       <iframe #view=FitH>   │
│ └─────────────────────────┘ │       OR <img object-contain>│
│ Cc                          │       OR "Aperçu non         │
│ [__________________]        │          disponible"         │
│ Objet                       │       OR empty state         │
│ [__________________]        │                             │
│ Message                     │                             │
│ ┌─────────────────────────┐ │                             │
│ │ (flex-1, min-h-0,        │ │                             │
│ │  resize-none,            │ │                             │
│ │  anchored to bottom)     │ │                             │
│ └─────────────────────────┘ │                             │
├─────────────────────────────│─────────────────────────────│
│ [errors/success banner]     │ [📎 server.pdf ✕] [file ✕]  │
│       [Annuler] [Envoyer]   │ [+ Ajouter un fichier]      │
└─────────────────────────────┴─────────────────────────────┘
```

- Outer: `<DialogContent className="max-w-6xl w-[92vw] h-[85vh] flex flex-col p-0 overflow-hidden">`
- Header: `flex-shrink-0 px-6 py-4 border-b bg-gradient-to-r from-gold/25 via-gold/10 to-transparent`
- Body split: `flex-1 min-h-0 flex` → left `w-1/2 border-r flex flex-col`, right `w-1/2 bg-zinc-200/50 flex flex-col`
- **Left pane is a flex column**, NOT a scrollable container:
  - À / Cc / Objet blocks are each `space-y-1 flex-shrink-0` — preserve natural height
  - Message block is `flex-1 min-h-0 flex flex-col gap-1` with a `flex-shrink-0` label and the textarea at `flex-1 min-h-0 w-full resize-none scrollbar-transparent` — it fills all remaining space down to the footer
  - Footer (`flex-shrink-0 p-4 border-t bg-zinc-200/50`) holds the error/success banners and the Annuler + Envoyer buttons
- **Right pane is a flex column** with the viewer at `flex-1 min-h-0` and the attachment strip at `flex-shrink-0 border-t bg-white/70 px-3 py-2.5`, leading `Paperclip` icon

### 32.5 Recipient chip UX (left pane, À block)

Inside a bordered card, stacked vertically with `border-t border-border/40` dividers:

1. **Selected chips** — `<span>` elements with `bg-accent/10 border-accent/30 text-accent`, optional 👤 `User` icon for `source: 'contact'`, name-or-email, and a `<button>` ✕ that removes. Removing a contact-sourced chip moves it back to suggestions; removing a manual-sourced chip just drops it.
2. **Suggestion chips** — `<button>` elements with `bg-zinc-100 border-border/60 text-muted-foreground hover:bg-accent/10`, leading `+` icon. Click moves the recipient to the selected list.
3. **Manual entry** — `<input type="email">` + ghost `+` button. On Enter or button click, validate via `EMAIL_REGEX`, dedupe case-insensitive against both lists, push as `{ source: 'manual', email }`.

### 32.6 Attachment strip + clickable pills (right pane, bottom)

Strip layout: `flex items-start gap-2` with a leading muted `Paperclip`, then `flex-1 min-w-0 flex flex-wrap gap-1.5 items-center`.

**Pill types** (all keyed on stable ids):
- **Server-rendered PDF pill** — rendered when `pdfUrl && attachPdf`. Click body → `selectPreview('server')`. Click inner ✕ → `removeServerPdf()` (sets `attachPdf=false` + falls through the preview).
- **User-uploaded file pills** — one per entry in the internal `userAttachments: UserAttachment[] = { id, file, blobUrl }[]` state. Click body → `selectPreview(a.id)`. Click inner ✕ → `removeUserAttachment(a.id)` (revokes blob URL + filters + falls through preview). Shows filename + `formatFileSize(file.size)`.
- **"Ajouter un fichier" button** — dashed-border `<button>`, triggers a hidden multi-file `<input type="file">`. Mandatory `onClick={(e) => (e.target.value = '')}` reset from §22 so the same file can be picked twice.

**Pills are `<div role="button" tabIndex={0}>`, not `<button>`** — HTML forbids nested `<button>`s and each pill has an inner ✕ `<button>`. `onKeyDown` handles Enter/Space for keyboard. Inner ✕ uses `e.stopPropagation()` so removal doesn't also fire `selectPreview`.

**Active pill styling**: `border-accent ring-2 ring-accent/60` (gold ring). Inactive: `border-border/60 hover:bg-zinc-50`.

**Size cap**: the strip rejects additions that would push total user-attachment bytes above `MAX_TOTAL_ATTACHMENT_BYTES` (18 MB) and surfaces a French error banner. The total is shown inline as `X MB / 18.0 MB` on the right end of the strip when at least one user file is present.

### 32.7 Viewer preview state + render kinds

Internal state:
- `previewedId: 'server' | string | null` — currently shown in the viewer. Hydration effect sets it to `'server'` when a `pdfUrl` is passed, otherwise `null`.
- Resolved into an `ActivePreview` tagged union via `useMemo`:

```ts
type ActivePreview =
  | { kind: 'server-pdf';       url: string }
  | { kind: 'user-pdf';         url: string; name: string }
  | { kind: 'user-image';       url: string; name: string }
  | { kind: 'user-unsupported'; name: string; type: string }
  | { kind: 'empty' }
```

Render branch:
- `server-pdf` / `user-pdf` → `<iframe src={url} />` with `url = '...#view=FitH'`
- `user-image` → centered `<img className="max-w-full max-h-full object-contain" />`
- `user-unsupported` (anything not `application/pdf` or `image/*`) → `FileText h-12 w-12 opacity-30` + `"Aperçu non disponible pour ce type de fichier"` + truncated filename
- `empty` → `FileText h-12 w-12 opacity-30` + `"Aucun document à prévisualiser"`

**Preview auto-selection rules** (keep the viewer in sync with what's in the send queue):
- First hydration with pdfUrl → `'server'`; without pdfUrl → `null`.
- First user file added when preview is `null` → auto-select the new file.
- Server PDF removed + it was active → fall through to first user attachment, else `null`.
- User attachment removed + it was active → fall through to next user attachment, else back to server PDF (if still in list), else `null`.

**Blob URL lifecycle**: created in `handleFilePick` (`URL.createObjectURL(file)`), revoked in `removeUserAttachment` AND in the dialog-close cleanup effect (`setUserAttachments(prev => { prev.forEach(a => URL.revokeObjectURL(a.blobUrl)); return [] })`). If an addition is rejected by the size cap, the brand-new blob URLs are revoked too — no leaks on the reject path.

### 32.8 Conventions — do not deviate

- **Envoyer button variant = default (primary blue)**, NOT gold. `variant="gold"` is reserved for the canonical Modifier/enter-edit-mode CTA (§6.1/§12). In-form actions like Enregistrer/Envoyer use the default variant.
- **Icon in the DialogTitle** is `AtSign`. Send button icon is `Mail` (envelope). Never swap them.
- **Width**: `max-w-6xl w-[92vw] h-[85vh]`. Fixed, not responsive to content — the PDF preview needs room.
- **Pre-fill hydration runs once** on first defaults arrival via a `hydrated` flag so editing-in-progress isn't clobbered.
- **Cleanup effect on `open → false`** resets all state and revokes all blob URLs.
- **Validation before send**: at least one chip in `selectedRecipients`, non-empty `subject.trim()`. Surface errors in the red banner — don't throw.
- **Success banner → auto-close** after 1.2s via `setTimeout(onClose, 1200)`. Envoyer is disabled while `successMessage` is set.
- **When adding a new call site** the default shape is: screen-specific `queryKey`, `loadDefaults` via `apiFetch`, `onSend` via `postEmail(url, p, { includeAttachPdf: hasServerPdf })`. Everything else is already handled inside the shared component.

### 32.9 Body template conventions

Keep the default body **short, polite, French, and signed "ETS Malterre"**. Pattern from `buildEmailDefaults` in `commandes-fil.ts`:

```
Bonjour,

Veuillez trouver ci-joint notre bon de commande N°{numero}
[à destination de {fournisseurNom}].

Merci de bien vouloir nous confirmer la bonne réception de cette commande.

Cordialement,
ETS Malterre
```

Per document type, only the second line changes (the document reference). Do NOT generate elaborate multi-paragraph templates — users will edit the body when they need something specific, and a terse default is easier to personalise than a verbose one to delete.

### 32.10 From header convention

The API resolves the acting user's display name from `utilisateur.prenom + nom` and formats the From header as `Prénom Nom — ETS Malterre <mapped-email@etsmalterre.com>`. Never send with a bare email in the From header — Gmail will render it with the `mapped-email` local part as the display name, which looks clinical. The " — ETS Malterre" suffix makes the sender instantly recognisable in the recipient's inbox. MIME-encode the display name via the `encodeHeader` helper in `gmail.ts` so accented characters survive.

### 32.11 Error handling — map 400s to friendly French

The server's `400 no_sender_email` response includes a `message` field in French: `"Aucune adresse email n'est associée à votre compte. Un administrateur doit en définir une dans Paramètres › Utilisateurs."`

The frontend must surface this message verbatim — it directs the user to the exact fix. The `handleSend` raw-fetch path does this automatically by reading `json.message` before falling back to `json.error`. Do not strip or rephrase it in the dialog.

Any other 4xx/5xx falls through to the generic `Erreur HTTP {status}` banner.

### 32.12 Candidate screens

The shared `SendEmailDialog` covers every email-enabled screen. Apply to:

- Fournisseurs → Commandes ✅ implemented (with server PDF)
- Réseau → Entreprises ✅ implemented (no server PDF — plain message with user attachments)
- Sous-traitants → Commandes — contact flag `envoi_commande`
- Clients → Commandes — contact flag `envoi_commande`
- Clients → Devis — contact flag `envoi_soumission`
- Clients → Facturation — contact flag `envoi_facture`
- Transport → Expéditions / Livraisons — contact flag `envoi_bl`

A new document screen needs:
1. A PDF renderer in `apps/api/src/lib/pdf/`
2. A `buildXxxPdfData(id)` + `renderXxxPdfBuffer(data)` helper pair reused by both `/pdf` and `/email`
3. The PDF endpoint with the iframe header strip (§21 + §32.2)
4. `GET /:id/email-defaults` returning the `recipients: { selected, suggestions }` shape
5. `POST /:id/email` accepting `extra_attachments`
6. The `@` button on the view-mode header trio (§6.1)
7. A `<SendEmailDialog>` mount at the page root passing `pdfUrl`, `pdfAttachmentLabel`, `queryKey`, `loadDefaults`, and `onSend` via `postEmail(..., { includeAttachPdf: true })`

A plain non-document screen (like Entreprises) skips steps 1–3 and omits `pdfUrl` / `pdfAttachmentLabel` from the `<SendEmailDialog>` props. The `onSend` call drops `includeAttachPdf`.

---

## 33. Destructive confirmation — `ConfirmDialog` (never use `window.confirm`)

Reference: **`apps/web/src/components/shared/ConfirmDialog.tsx`**, used for commande / ligne / document deletion in `FournisseursCommandes.tsx`.

**Never call `window.confirm()` / `window.alert()` / `window.prompt()` from application code.** Native browser dialogs are jarring, styled by the browser (so they break the app's visual language), block the entire tab, and cannot surface loading state while the destructive mutation runs. Every destructive or hard-to-reverse action in the app must go through `ConfirmDialog` instead.

### 33.1 Import & props

```tsx
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

<ConfirmDialog
  open={confirmOpen}
  title="Supprimer la commande"
  description="Cette action supprimera la commande et toutes ses lignes. Elle est irréversible."
  confirmLabel="Supprimer"
  isPending={deleteMut.isPending}
  onCancel={() => setConfirmOpen(false)}
  onConfirm={() => deleteMut.mutate(id, { onSuccess: () => setConfirmOpen(false) })}
/>
```

| Prop | Type | Notes |
|---|---|---|
| `open` | `boolean` | Required |
| `title` | `string` | Required. Imperative + the entity ("Supprimer la commande"). Keep it to one short phrase. |
| `description` | `string?` | Optional second line. Use when the action has side effects the user needs to know about ("toutes ses lignes", "tous les contacts", etc.). Keep to 1–2 short sentences. |
| `confirmLabel` | `string?` | Defaults to `"Supprimer"` for destructive, `"Confirmer"` for default. Always an imperative verb. |
| `cancelLabel` | `string?` | Defaults to `"Annuler"`. Never override unless there's a specific reason. |
| `variant` | `'destructive' \| 'default'` | Defaults to `'destructive'`. Controls the title icon (`AlertTriangle` in red for destructive, none for default) and the confirm button variant (`destructive` red vs `default` primary). |
| `isPending` | `boolean?` | Wire this to the mutation's `isPending`. Disables both buttons and swaps the `Trash2` icon on the confirm button for a spinning `Loader2` — users get visual feedback that the action is actually running. |
| `onCancel` | `() => void` | Close the dialog. Also fires on overlay/escape/X. |
| `onConfirm` | `() => void` | Fire the destructive mutation. **The component does NOT auto-close on confirm** — you are responsible for closing it yourself, typically in the mutation's `onSuccess`. This lets the dialog stay visible (with its spinner) while the request is in flight. |

### 33.2 State pattern — local state at the nearest owner

Don't try to hoist confirmation state to the page root when the action is owned by a sub-component. Each component that fires a destructive mutation owns its own confirm state. If three different places on a screen can delete things (the detail header, the lines section, the docs tab), mount three `ConfirmDialog`s — one per owner — each with its own state. This keeps the concerns colocated and avoids cross-tree plumbing.

The canonical shape for a one-target-at-a-time delete:

```tsx
// Single-target delete (commande, current entity, etc.)
const [confirmOpen, setConfirmOpen] = useState(false)

// …in the button handler:
onClick={() => setConfirmOpen(true)}

// …at the end of the JSX:
<ConfirmDialog
  open={confirmOpen}
  title="Supprimer la commande"
  description="Cette action supprimera la commande et toutes ses lignes. Elle est irréversible."
  isPending={deleteMut.isPending}
  onCancel={() => setConfirmOpen(false)}
  onConfirm={() => {
    if (selectedId !== null) deleteMut.mutate(selectedId)
  }}
/>
```

For a list of items where each has its own delete button, store the target id (or full object) instead of a boolean — the dialog is "open" iff that value is non-null:

```tsx
// Per-row delete (line cards, doc cards, etc.)
const [deleteTarget, setDeleteTarget] = useState<LigneCommande | null>(null)

onDelete={() => setDeleteTarget(line)}

<ConfirmDialog
  open={deleteTarget !== null}
  title="Supprimer la ligne"
  description={deleteTarget ? `${deleteTarget.ref_fil} · ${deleteTarget.colori_reference} sera supprimée.` : undefined}
  isPending={deleteMut.isPending}
  onCancel={() => setDeleteTarget(null)}
  onConfirm={() => {
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.IDref_fil_commande, {
        onSuccess: () => setDeleteTarget(null),
      })
    }
  }}
/>
```

Storing the full object (not just the id) lets you interpolate entity fields into the `description` without a second lookup. The dialog closes on the mutation's per-call `onSuccess` — the page-level `deleteMut` can have its own global `onSuccess` for invalidation that runs in addition.

### 33.3 Placement — always a top-level sibling of the main JSX

Like `UnsavedChangesDialog` and `SendEmailDialog`, `ConfirmDialog` must be a **top-level sibling of the screen's main content**, not nested inside a card or section. Wrap the component's return in a `<>…</>` fragment if needed. Nesting it under a scrollable or transform-containing parent causes the `AlertDialog` overlay to render in the wrong stacking context and the dialog ends up clipped.

### 33.4 Copy conventions (French)

- **Title** — imperative verb + entity, no punctuation: `"Supprimer la commande"`, `"Supprimer le document"`, `"Supprimer la ligne"`. Not `"Êtes-vous sûr ?"` — that's a popup question, not a decision.
- **Description** — 1–2 short sentences in present tense, stating what will happen. End with a period. Mention cascading effects explicitly: `"Cette action supprimera la commande et toutes ses lignes. Elle est irréversible."` — the user deserves to know that deleting a commande also wipes its lines.
- **Confirm button** — imperative verb matching the title: `"Supprimer"` / `"Archiver"` / `"Clôturer"`. Never `"OK"` or `"Oui"`.
- **Cancel button** — always `"Annuler"`.

### 33.5 When to use the dialog vs proceed directly

Use it for:
- **Irreversible deletes** — rows from the database, files, linked sub-entities
- **Cascading actions** — deleting a parent that also removes children
- **State transitions that can't be trivially undone** — closing a commande, invoicing, sending
- **Discarding unsaved work** — covered by `UnsavedChangesDialog` (§28), not this one

Do NOT use it for:
- Toggling a boolean state that has its own in-place undo (`checked` → `unchecked`)
- Navigation with unsaved changes — use `UnsavedChangesDialog` instead
- Anything the user can trivially redo (reassigning a lot to a line, reordering a list)

When in doubt, lean towards using it — one extra click is much cheaper than a lost order.

### 33.6 Mandatory replacements

Any existing `window.confirm(…)` / `alert(…)` / `prompt(…)` call in the codebase is a bug. When you touch a file that still has one, replace it with `ConfirmDialog` as part of the same edit. Do not add new native dialog calls under any circumstances.

---

## 34. Polymorphic document attachments (`ged` + `type_doc`)

Reference implementation: **`apps/web/src/pages/FournisseursCommandes.tsx`** → `DocsTab`, `DocViewDialog`, `DocCreateEditDialog` + **`apps/api/src/routes/commandes-fil.ts`** → the `/:id/documents*` endpoint cluster.

The legacy MPS database uses **one shared table `ged`** to store documents for every entity in the system — client commandes, sous-traitant commandes, commande_fil (fournisseur orders), stock lots, certificates, references, and more. Rather than one attachment table per parent, rows are disambiguated by which of several discriminator columns is non-zero. Every screen that needs attached documents follows the same convention below — do not build a new dedicated table, and do not skip any of the conventions.

### 34.1 `ged` schema (columns you care about)

| Column | Type | Purpose |
|---|---|---|
| `IDged` | int PK | Stable id used by API routes and `stock_fil_ged` linker |
| `nom` | string | User-facing filename / label |
| `fichier` | blob (BinMemo) | The actual file bytes — may be empty/null even when `IS NOT NULL` (see §34.6) |
| `commentaire` | string | Free-form note |
| `IDdossier` | int FK | Legacy "dossier" grouping, rarely used in the new app — set to `0` |
| `IDcommande_client` | int FK | Non-zero iff the doc belongs to a client order |
| `IDcommande_sous_traitant` | int FK | Non-zero iff the doc belongs to a subcontractor order |
| `IDtype_doc` | int FK → `type_doc.IDtype_doc` | Doc type (facture fil, cert GOTS, BL, cert oekotex…). The full catalog lives in `type_doc` |
| `IDreference` | int | **The polymorphic parent id**. Interpretation depends on which of the discriminator columns above are non-zero |

### 34.2 Polymorphic discriminator — how to know which parent a row belongs to

There is no dedicated "parent_type" column — the owning entity is inferred from which FKs are zero:

| Parent entity | `IDcommande_client` | `IDcommande_sous_traitant` | `IDreference` |
|---|---|---|---|
| **Client commande** | `≠ 0` (the commande id) | `0` | typically also equal to the commande id (legacy quirk) |
| **Sous-traitant commande** | `0` | `≠ 0` (the commande id) | typically also equal to the commande id |
| **Commande_fil (fournisseur order)** | `0` | `0` | `= IDcommande_fil` |
| **Other entities** (stock_fil via `stock_fil_ged`, references via `IDreference`, dossier via `IDdossier`, …) | `0` | `0` | varies — see the specific screen's pattern |

**Critical consequence**: to query "documents for commande_fil #672", the WHERE clause is **not** just `IDreference = 672`. It must explicitly filter out client and sous-traitant rows:

```sql
WHERE g.IDreference = ${id}
  AND g.IDcommande_client = 0
  AND g.IDcommande_sous_traitant = 0
```

Skipping either zero guard leaks documents from other parent types that happen to share the same numeric id.

### 34.3 The canonical endpoint shape (mirror this for every parent)

For each parent type that needs documents, implement this exact five-endpoint cluster on the parent's route file. Naming uses `commande-fil` below — substitute the parent.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/:id/documents` | List metadata (joins `type_doc`, includes per-doc `linked_lots` when relevant) |
| `GET` | `/:id/documents/:idged/fichier` | Serve the blob as `application/pdf` / `image/*` / `application/octet-stream` |
| `POST` | `/:id/documents` | Multipart create (metadata + optional file) |
| `PUT` | `/:id/documents/:idged` | Multipart update (metadata + optional file replace) |
| `DELETE` | `/:id/documents/:idged` | Scoped delete |

Every endpoint **must** enforce the parent scope — a caller with a valid `IDged` from another commande must not be able to read, edit, or delete a doc that doesn't belong to the parent in the URL:

```ts
// Scope guard reused by every PUT/DELETE and the file GET
const scope = await query(
  `SELECT IDged FROM ged
   WHERE IDged = ${idged}
     AND IDreference = ${id}
     AND IDcommande_client = 0
     AND IDcommande_sous_traitant = 0`
)
if (scope.length === 0) { res.status(404).json({ error: 'Document not found' }); return }
```

Factor this into a helper (`verifyDocBelongsToCommande`) once you have more than two endpoints using it.

### 34.4 Encoding — `fixEncoding` for two separate base tables

The list endpoint joins `ged` and `type_doc`, both of which have French accented text that comes back corrupted through the ODBC bridge. `fixEncoding()` works on one base table at a time, so apply it twice:

```ts
const fixed = await fixEncoding(rows, 'ged', 'IDged', ['nom', 'commentaire'])
// type_nom (from type_doc) needs a separate targeted pass keyed on IDtype_doc:
const typeIds = Array.from(new Set(fixed.map((r) => r.IDtype_doc).filter((t) => t > 0)))
const typeMap = new Map<number, string>()
if (typeIds.length > 0) {
  const typeRows = await query(
    `SELECT IDtype_doc, nom FROM type_doc WHERE IDtype_doc IN (${typeIds.join(',')})`
  )
  const fixedTypes = await fixEncoding(typeRows, 'type_doc', 'IDtype_doc', ['nom'])
  for (const t of fixedTypes) typeMap.set(t.IDtype_doc, t.nom)
}
```

Do NOT try to `CONVERT(td.nom USING 'UTF-8') AS type_nom` inline in the JOIN — `fixEncoding` assumes a single base table and gets confused.

### 34.5 Writing binary blobs — hex literals, not parameters

HFSQL ODBC doesn't accept parameterized binary values. All blob writes go through a hex literal on `queryRaw`:

```ts
if (req.file && req.file.buffer.length > 0) {
  const hexStr = req.file.buffer.toString('hex')
  await queryRaw(`UPDATE ged SET fichier = x'${hexStr}' WHERE IDged = ${newId}`)
}
```

For `POST`, do the INSERT of metadata first (with zero blob), then the hex-literal UPDATE on the looked-up new `IDged`. For `PUT`, accept a `remove_fichier=1` form field that clears the blob when the user wants to delete the file without replacing it:

```ts
if (req.file && req.file.buffer.length > 0) {
  await queryRaw(`UPDATE ged SET fichier = x'${req.file.buffer.toString('hex')}' WHERE IDged = ${idged}`)
} else if (req.body.remove_fichier === '1') {
  await query(`UPDATE ged SET fichier = NULL WHERE IDged = ${idged}`)
}
```

### 34.6 Serving the blob — MIME sniff + empty-blob 404 + iframe header strip

```ts
const rows = await queryRaw(
  `SELECT fichier FROM ged
   WHERE IDged = ${idged} AND IDreference = ${id}
     AND IDcommande_client = 0 AND IDcommande_sous_traitant = 0`
)
if (rows.length === 0) { res.status(404).json({ error: 'Document not found' }); return }

const fichier = rows[0].fichier
if (fichier == null) { res.status(404).json({ error: 'No file attached' }); return }

let buf: Buffer
if (fichier instanceof ArrayBuffer) buf = Buffer.from(fichier)
else if (Buffer.isBuffer(fichier)) buf = fichier
else { res.status(404).json({ error: 'No file attached' }); return }

// HFSQL BinMemo IS NOT NULL is unreliable — empty/null-terminator-only
// blobs pass the null check. Return 404 here so the frontend HEAD pre-check
// can hide the viewer cleanly.
if (buf.length === 0 || (buf.length === 1 && buf[0] === 0)) {
  res.status(404).json({ error: 'No file attached' }); return
}

// Sniff MIME from magic bytes
let contentType = 'application/octet-stream'
if (buf.length >= 4) {
  const h = buf.subarray(0, 4)
  if (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) contentType = 'application/pdf'
  else if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4E && h[3] === 0x47) contentType = 'image/png'
  else if (h[0] === 0xFF && h[1] === 0xD8) contentType = 'image/jpeg'
}

res.setHeader('Content-Type', contentType)
res.setHeader('Content-Disposition', 'inline')
// Strip helmet so cross-origin iframe embedding works in dev
res.removeHeader('X-Frame-Options')
res.removeHeader('Content-Security-Policy')
res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
res.end(buf)
```

The "empty blob = 404" rule (§34.6 CLAUDE.md HFSQL rules) is mandatory: without it the frontend HEAD pre-check can't distinguish "document exists" from "document has a real file". Three magic-byte checks (PDF / PNG / JPEG) cover essentially every document type ETS Malterre uses; fall back to `application/octet-stream` and let the browser's inline handler do its best.

### 34.7 Per-lot scoping via `stock_fil_ged` — "zero rows = applies to all"

A `ged` row attached to a commande_fil can additionally be scoped to a subset of the commande's yarn lots via the **`stock_fil_ged`** linker table (`IDstock_fil_ged`, `IDged`, `IDstock_fil`). This is how a GOTS certificate applies to only some of an order's lots instead of the whole order.

**Semantics — critical and easy to get wrong**:

- **Zero rows in `stock_fil_ged` for a given `IDged`** = the document applies to **all** lots of the parent commande. This is the default and the "implicit global" state. It matches legacy behavior and means you don't need to backfill links when a new lot is added to the order.
- **One or more rows** = the document applies **only** to the listed lots — explicit specific scoping.

Do NOT add a separate boolean column to `ged` to represent "all vs specific" — the empty-set convention already encodes it. When the user flips a UI toggle from "specific" back to "all", DELETE every `stock_fil_ged` row for that `IDged` (not "insert one row per lot" — that would be the wrong semantics and would break the moment someone adds a new lot).

**Scope guard on link writes**: when inserting a `stock_fil_ged` row, verify that the stock_fil lot actually belongs to the parent commande via the line table:

```ts
const scope = await query(
  `SELECT sf.IDstock_fil FROM stock_fil sf
   INNER JOIN ref_fil_commande rfc ON sf.IDref_fil_commande = rfc.IDref_fil_commande
   WHERE sf.IDstock_fil = ${stockId} AND rfc.IDcommande_fil = ${id}`
)
if (scope.length === 0) {
  res.status(400).json({ error: 'Lot does not belong to this commande' }); return
}
// Idempotent insert — skip if already linked
const existing = await query(
  `SELECT IDstock_fil_ged FROM stock_fil_ged WHERE IDged = ${idged} AND IDstock_fil = ${stockId}`
)
if (existing.length === 0) {
  await query(`INSERT INTO stock_fil_ged (IDged, IDstock_fil) VALUES (${idged}, ${stockId})`)
}
```

**Endpoints**:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/:id/documents/:idged/lots` | Return `{ linked: StockLot[], available: StockLot[] }` |
| `PUT` | `/:id/documents/:idged/lots/:stockId` | Idempotent link (returns the refreshed `{linked, available}`) |
| `DELETE` | `/:id/documents/:idged/lots/:stockId` | Unlink a single lot (same return shape) |
| `DELETE` | `/:id/documents/:idged/lots` | Bulk clear — used when the UI toggle flips back to "all lots" |

Every write returns the refreshed `{linked, available}` payload so the dialog can hydrate via `queryClient.setQueryData` without a follow-up fetch. Matches the pattern used by the stock drawer's link/unlink endpoints.

### 34.8 Enrich the list endpoint with `linked_lots`

When the frontend shows a doc list and needs to render a per-card indicator like `"Lot A, Lot B"` when specific lots are selected, include a batched `linked_lots` field on each doc row from the list endpoint — don't force the frontend to fire N per-doc queries.

```ts
// After fetching + fixEncoding'ing the main ged rows:
const docIds = fixed.map((r) => r.IDged)
const lotsByDoc = new Map<number, Array<{ IDstock_fil: number; lot: string | null }>>()
if (docIds.length > 0) {
  const lotRows = await query(
    `SELECT sfg.IDged, sf.IDstock_fil, sf.lot
     FROM stock_fil_ged sfg
     INNER JOIN stock_fil sf ON sfg.IDstock_fil = sf.IDstock_fil
     WHERE sfg.IDged IN (${docIds.join(',')})
     ORDER BY sf.lot`
  )
  for (const lr of lotRows) {
    const arr = lotsByDoc.get(lr.IDged) ?? []
    arr.push({ IDstock_fil: lr.IDstock_fil, lot: lr.lot })
    lotsByDoc.set(lr.IDged, arr)
  }
}

const out = fixed.map((r) => ({
  IDged: r.IDged,
  nom: r.nom,
  commentaire: r.commentaire,
  IDtype_doc: r.IDtype_doc,
  type_nom: typeMap.get(r.IDtype_doc) ?? null,
  linked_lots: lotsByDoc.get(r.IDged) ?? [],  // empty array = "all lots"
}))
```

Empty `linked_lots` on the frontend = render nothing (the doc applies globally). Non-empty = render a `<BobineIcon>` + truncated `Lot A, Lot B, Lot C…` inline on the right side of the card.

### 34.9 Frontend — `DocsTab` + `DocViewDialog` + `DocCreateEditDialog`

Three components, all colocated in the parent screen file (not factored into shared), mirroring `FournisseursCommandes.tsx`:

1. **`DocsTab`** — the sidebar tab:
   - Fragment root (no wrapping card, per §8.2)
   - `useQuery` on `['<parent>-docs', parentId]`
   - Each doc rendered as a `p-3 rounded-lg border bg-card shadow-sm` card (per §8.1) with `editSectionClass` when editing, lot indicator on the right side when `linked_lots.length > 0`, hover-reveal trash in edit mode
   - Click-to-view (view mode) or click-to-edit (edit mode) per §8.3
   - `"Ajouter un document"` ghost button at the bottom, `isEditing && !isNew`
   - Locally-mounted `ConfirmDialog` (§33) for deletes — doc-level state `deleteDocConfirm: GedDocument | null`

2. **`DocViewDialog`** — chrome-free full-bleed iframe per §18.B:
   - HEAD pre-check on the file endpoint before rendering the iframe
   - Falls back to a compact `DialogContent` with "Aucun document attaché" when the HEAD returns 404 (empty blob)

3. **`DocCreateEditDialog`** — side-by-side form + preview per §18.C:
   - Left column: `LabeledInput` for `nom`, a select for `IDtype_doc` (sourced from `/fournisseurs/type-doc`, reuse that endpoint across screens — do not duplicate it), textarea for `commentaire`, the "Lots de fil" toggle + list section (edit mode only, doc exists), error banner
   - Right column: iframe preview of the current blob OR the freshly-picked file via `URL.createObjectURL`, file picker (`accept=".pdf,image/*"`), action buttons bottom-right
   - Raw `fetch` with `FormData` (NOT `apiFetch` — multipart needs the browser to set the boundary)
   - `createOpen || editingDoc !== null` controls `open`; `doc={editingDoc}` distinguishes create mode (null) from edit mode
   - On success, calls `onSuccess` which closes the dialog and invalidates the docs list — parent state (`createOpen`, `editingDoc`) is reset in the same handler

### 34.10 Candidate screens

Apply this entire pattern to every screen where entities have attached documents:

- **Fournisseurs → Commandes** ✅ reference implementation
- **Clients → Commandes** — discriminator: `IDcommande_client = id`, `IDcommande_sous_traitant = 0`
- **Sous-traitants → Commandes** — discriminator: `IDcommande_sous_traitant = id`, `IDcommande_client = 0`
- **Clients → Devis / Facturation** — same legacy split; check which `IDtype_doc` values legacy populates for each
- **Production → Tricotage / Teinture / Confection** — attached via `IDsuivi_tricotage` etc., polymorphic column depends on entity. Check the legacy MPS database before coding.
- **Stock → Matières premières / Produits finis** — these go through `stock_fil_ged` for yarn lots; finished-product lots may have their own linker

For each new parent, the checklist is: (1) identify the discriminator columns, (2) implement the five-endpoint cluster with scope guards, (3) copy-paste the three frontend components and adapt the query keys + parent id. Do NOT try to abstract the components into a single generic `<DocumentAttachments>` — the parent-specific scope guards and discriminator columns are different enough per screen that a generic component ends up riddled with conditionals.

---

## 35. Inline toggle pill (`role="switch"`)

Reference: **`apps/web/src/pages/FournisseursCommandes.tsx`** → `DocCreateEditDialog` "Appliquer à tous les lots" row.

For inline boolean controls inside a form — "Appliquer à tous les lots", "Notifier par email à la création", "Afficher les éléments archivés", etc. — use an iOS-style pill switch, not a plain `<input type="checkbox">` and not a shadcn-style filled checkbox. The pill reads as a toggle at a glance and matches the app's modern feel.

The app has no shared `<Switch>` component — copy this inline. Don't refactor into a component until at least three screens use it.

### 35.1 Markup

```tsx
<button
  type="button"
  role="switch"
  aria-checked={value}
  disabled={disabled}
  onClick={() => onChange(!value)}
  className={cn(
    'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    value ? 'bg-accent shadow-inner' : 'bg-zinc-300 hover:bg-zinc-400/80',
  )}
>
  <span
    className={cn(
      'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out',
      value ? 'translate-x-[18px]' : 'translate-x-0.5',
    )}
  />
</button>
```

### 35.2 Row layout — label on left, toggle pinned right

The toggle itself is intentionally small; give it a descriptive row around it so the whole thing is a clickable-feeling control:

```tsx
<div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-white shadow-sm">
  <div className="min-w-0 flex-1">
    <div className="flex items-center gap-1.5 text-xs font-semibold">
      <BobineIcon className="h-3.5 w-3.5 text-accent" />
      <span>Appliquer à tous les lots</span>
    </div>
    <p className="text-[10px] text-muted-foreground mt-0.5">
      {value ? 'Ce document concerne toute la commande' : `${specific.length} lot sélectionné(s)`}
    </p>
  </div>
  {mutation.isPending && <Loader2 className="h-3 w-3 animate-spin text-accent flex-shrink-0" />}
  {/* …toggle button from §35.1 goes here… */}
</div>
```

### 35.3 Conventions

- **Track**: `h-5 w-9` (20×36px). `bg-accent` (gold `#F2B80A`) when on, `bg-zinc-300` when off. `shadow-inner` on the on-state adds a subtle recessed feel. Hover tint on the off-state only.
- **Thumb**: `h-4 w-4` white circle with `shadow`. Slides from `translate-x-0.5` to `translate-x-[18px]` — the arbitrary `18px` is `w-9 (36) - w-4 (16) - 2×(0.5×4) = 18`. A `200ms ease-out` transition is exactly enough to feel responsive without looking sluggish.
- **Accessibility**: `role="switch"` + `aria-checked` is non-negotiable — without them screen readers announce the button as a plain button. Full keyboard support comes for free via `<button>`.
- **Disabled**: `opacity-50 cursor-not-allowed` on the track; do NOT change the thumb position for disabled state — the user still needs to read the current value while a mutation is in flight.
- **Never use `<input type="checkbox">`** — browsers render those very differently on Windows (square, grey) vs macOS (circle, blue); the pill is consistent across platforms.
- **Label click**: the outer row is NOT clickable. The click target is the pill itself. Putting a click handler on the row risks firing when users click the subtitle text or a stray icon — confusing for state that drives a destructive operation (like clearing all lot links).

### 35.4 When NOT to use this pattern

- **Form submission checkboxes** (accept terms, agree to newsletter…) — a shadcn checkbox is more conventional there because those are part of a larger form submission, not inline state toggles
- **List filters** (hide terminated, show bio only…) — a plain checkbox+label in the toolbar is fine; the pill is overkill for a filter
- **Multi-select checkboxes** (lot-picker list, tag picker…) — use a checkbox; the pill doesn't scale visually to many side-by-side toggles

Use the pill specifically for **inline single-boolean state that has meaningful UX consequences** (hides/shows a section, toggles a mode, clears/sets a relationship).


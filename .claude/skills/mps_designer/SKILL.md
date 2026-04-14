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

### Fonts (loaded via `@import` in `index.css`)

| Font | Tailwind Class | Usage |
|------|----------------|-------|
| **Anton** | `font-heading` | All headings (h1-h6), applied automatically via base CSS |
| **Lato** (300-700) | `font-sans` | Body text (default) |

**Important**: Do NOT add `<link>` tags for Google Fonts in `index.html` — use CSS `@import` only.

### Heading Pattern

All h1-h6 automatically get `font-heading tracking-tight` via base CSS. For explicit usage:

```tsx
<h1 className="text-2xl font-heading font-bold tracking-tight">Page Title</h1>
```

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

Scrollable area: `flex-1 min-h-0 overflow-auto space-y-4`

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

**MANDATORY**: every `<select>` must include `cursor-pointer` so the hand cursor appears on hover — this is how users recognise a dropdown is clickable. When the select can be disabled, also add `disabled:cursor-not-allowed` so the cursor switches to the forbidden icon instead of staying as a hand.

```tsx
// Always-enabled select
<select className={cn(inputClass, 'cursor-pointer')}>

// Select that may be disabled (e.g. dependent dropdown)
<select
  disabled={...}
  className="w-full h-9 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer disabled:bg-zinc-100 disabled:text-muted-foreground disabled:cursor-not-allowed"
>
```

Do not rely on the browser default — on Windows the default select cursor is an arrow, not a hand, so the class is required.

### Focus Ring

All inputs: `focus:ring-2 focus:ring-ring` where `--ring: 42 80% 55%` (gold).

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

The center detail body uses collapsible cards for groups of related items (Certificats, Refs de fil, Commandes in `Fournisseurs.tsx`).

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

## 29. Sidebar Status Footer (binary state + toggle action)

Reference: **`apps/web/src/pages/FournisseursCommandes.tsx`** → `StatusFooter`.

For entities with a **binary primary state** that the user toggles (open/closed, en cours/terminée, active/archivé…), render the current state as a **solid-colored bar pinned at the bottom of the right sidebar panel** — not as a small badge in the header. The bar is both the status display and the toggle control, combined into a single visual unit.

### 29.1 Why the sidebar footer, not the header

- The detail header is already dense with title, date, edit/delete buttons, and "Mode édition" chip — adding a badge there competes for attention
- A bar pinned at the bottom of the right panel sits in a predictable spot across screens, so users always know where to look for / change status
- Giving the state its own bold, colored surface communicates its importance more than a pastel pill

### 29.2 Structure

```tsx
{/* Placed as the last child of the sidebar's outer flex-col, AFTER the scrollable tab body */}
<StatusFooter
  etat={commande.etat}
  onToggle={onToggleEtat}
  isToggling={isTogglingEtat}
  disabled={isEditing}
/>
```

The parent sidebar container must be `flex flex-col overflow-hidden` so the footer can use `flex-shrink-0` and stay visible while the tab body scrolls above it.

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
    <div className="flex-shrink-0 border-t bg-zinc-200/50 rounded-b-xl p-3">
      <div
        className={cn(
          'rounded-lg shadow-sm overflow-hidden flex items-stretch h-11',
          isDone ? 'bg-success' : 'bg-primary'
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
    </div>
  )
}
```

### 29.3 Conventions

- **Colors**: `bg-primary` (MPS deep blue) for the "in progress / active" state, `bg-success` for the "done / validated" state. Do NOT use `bg-amber`/`bg-yellow` for active — amber is reserved for warnings/alerts. Do NOT use pastel transparent colors (`bg-primary/10`) — the bar must be solid and bold to match the left-list badge aesthetic.
- **Height**: fixed `h-11` — visually substantial without dominating the sidebar.
- **Typography**: `text-sm font-bold uppercase tracking-wide` for the state label, `text-xs font-semibold` for the action button text. White foreground throughout.
- **Action button as inset split**: the toggle button lives **inside** the colored bar, separated by `border-l border-white/25` and a `bg-white/15` hover-tinted surface. It is not an outlined shadcn `<Button>` — use a raw `<button>` so it can share the bar's background.
- **Disabled during edit mode**: pass `disabled={isEditing}` so users cannot toggle the state while a header edit is mid-flight. Also disable while the mutation is in-flight (`isTogglingEtat`).
- **Placement**: always `flex-shrink-0 border-t bg-zinc-200/50 rounded-b-xl p-3` — the `rounded-b-xl` matches the sidebar's outer border radius, and the `bg-zinc-200/50` matches the tab-bar top strip for symmetry.
- **No "Statut" label above the bar**: the bold colored bar speaks for itself. Adding a label above makes it feel like a form field and eats vertical space.

### 29.4 When to use this pattern vs a badge in the header

| Situation | Pattern |
|---|---|
| Binary primary state (open/closed, active/done) that the user explicitly toggles | **StatusFooter** at the bottom of the sidebar |
| Computed / derived state shown for reference only (e.g. "en retard" from due date) | Badge in the detail header |
| Multi-valued state (draft / sent / paid / overdue / cancelled) | Header badge, potentially with a state-transition menu instead of a single toggle |

The StatusFooter is the right tool **only** for binary, user-toggled states. For multi-step workflows use a header badge + menu.

### 29.5 Gotcha: `<Badge variant='default'>` is primary blue, not grey

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

The drawer is a **flex sibling** of the rows-scrollable div, not a positioned overlay. The parent is already `flex-1 min-h-0 flex flex-col` (§7 detail body pattern). When the drawer is open, the rows div capitulates to `flex-shrink-0 max-h-[40%]` and the drawer gets `flex-1 min-h-0`. Flexbox handles the height split with no explicit calc.

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

Reference: **`apps/web/src/pages/FournisseursCommandes.tsx`** → `EmailCommandeDialog` + **`apps/api/src/routes/commandes-fil.ts`** → `/:id/email-defaults` + `/:id/email`.

Every document-centric screen (bons de commande, devis, factures, bons de livraison, bons d'expédition...) needs an "Envoyer un email" action that attaches the PDF and sends from the acting user's `@etsmalterre.com` address. Backed by a single service account with Google Workspace domain-wide delegation — there is no per-user OAuth flow.

### 32.1 Infrastructure (one-time, already in place)

| Piece | File | Role |
|---|---|---|
| JWT impersonation + MIME builder | `apps/api/src/lib/gmail.ts` | `sendMail({ from, fromName, to, cc, subject, body, attachments })` — builds a RFC 2822 multipart/mixed message and sends via `google.gmail('v1').users.messages.send()`. One `JWT` instance per impersonated `subject`, cached across sends. |
| User→email map | `apps/api/src/lib/user-emails.ts` + `apps/api/data/user-emails.json` | JSON-file-backed, mirrors `permissions.ts`. Admin-editable via `/api/user-emails/users`. The `utilisateur` table has no `email` column, so the mapping lives outside HFSQL. |
| Admin editor | `apps/web/src/pages/SettingsUtilisateurs.tsx` → `EmailEditor` card | Lives above the permission list on each user. Local draft state, client-side regex check, Enregistrer disabled when empty-to-empty or invalid. |
| Env var | `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` in `apps/api/.env.{development,production}` | Absolute path to the service account JSON key. Read lazily inside `gmail.ts` (dotenv runs in `index.ts`, ESM import hoisting forbids reading at module load). Key file lives in `apps/api/secrets/` locally (gitignored) and `/home/debian/mps_api/secrets/` on the prod API server. |

The GCP project is **MPS-Desktop**, the service account is **OAuth_Sender** (`oauth-sender@mps-desktop.iam.gserviceaccount.com`), and its Client ID (`106332337770635660405`) is authorised in Google Workspace Admin → Security → API controls → Domain-wide Delegation for scope `https://www.googleapis.com/auth/gmail.send`.

### 32.2 Two-endpoint backend pattern per document type

For each document type that needs email, add **two** endpoints next to the existing `/:id/pdf` endpoint:

- `GET /:id/email-defaults` — returns `{ to, subject, body, ... }`. Computes the default recipient list (contacts with the relevant `envoi_*` flag + a non-empty mail), a templated subject, and a templated body. Returns 404 if the parent record doesn't exist.
- `POST /:id/email` — body `{ to: string[], cc?: string[], subject, body, attach_pdf? }`. Validates, looks up the acting user's mapped email, generates the PDF via the same helper used by `/:id/pdf`, calls `sendMail()`. Responses:
  - `200 { ok: true, messageId }`
  - `400 no_sender_email` — acting user has no mapped email yet
  - `404` — record not found
  - `500 send_failed` — bubble the `error.message` for the UI toast

The PDF generation **must be refactored into a reusable helper** the moment a document type gains an email endpoint — `buildCommandePdfData(id)` + `renderCommandePdfBuffer(data)` in `commandes-fil.ts` is the pattern. Both `/pdf` and `/email` call the same two helpers, so the attachment is byte-identical to the downloadable PDF.

Contacts filtering convention — `envoi_*` flags in the `contact` table drive which contacts pre-fill the To field:

| Document | Contact flag |
|---|---|
| Bon de commande (commande_fil) | `envoi_commande = 1` |
| Facture | `envoi_facture = 1` |
| Bon de livraison | `envoi_bl = 1` |
| Devis / Soumission | `envoi_soumission = 1` |

Always additionally filter out `est_visible = 0` contacts and dedupe by lower-cased email, and skip entries that don't match the simple regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Legacy data has `"-"`, `"."`, single-char mail fields that must not pollute the pre-filled recipient list.

### 32.3 Frontend dialog — `EmailDocDialog` shape

Every document screen gets its own copy of the email dialog alongside `CreateXxxDialog` — **do not try to abstract** into a shared component yet. The differences (default body wording, which record ID, which endpoints) make it cleaner to fork per screen until we have 3+ working examples.

Canonical structure based on `EmailCommandeDialog`:

```tsx
<Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
  <DialogContent className="max-w-2xl" onClose={onClose}>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <AtSign className="h-5 w-5 text-accent" />
        Envoyer un email
      </DialogTitle>
    </DialogHeader>

    {loadingDefaults ? <Loader2 /> : defaultsError ? <AlertCircle /> : (
      <div className="space-y-3">
        {/* À — comma-separated text input + helper text */}
        {/* Cc — comma-separated, facultatif */}
        {/* Objet — single line */}
        {/* Message — textarea rows={8}, font-sans */}
        {/* Checkbox — "Joindre le bon de commande (PDF)" with FileText icon, checked by default */}
        {/* Error banner — border-destructive/30 bg-destructive/5 with AlertCircle */}
        {/* Success banner — border-green-500/30 bg-green-500/5 with CheckCircle2 */}
      </div>
    )}

    <DialogFooter>
      <Button variant="outline" onClick={onClose} disabled={isSending}>Annuler</Button>
      <Button onClick={handleSend} disabled={isSending || loadingDefaults || !!successMessage}>
        {isSending ? <><Loader2 className="animate-spin" />Envoi…</> : <><Mail />Envoyer</>}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 32.4 Conventions — do not deviate

- **Icon in the DialogTitle** is `AtSign` (the "@" action symbol), consistent with the view-mode header button (§6.1). Never `Mail` — that's reserved for inline email-address indicators and for the centre icon of the placeholder `"En developpement"` dialog (§18 A-bis).
- **Send button icon** is `Mail` (envelope) — different from the title icon, same distinction as the §18 placeholder pattern.
- **Width**: `max-w-2xl`. Wider than the default `max-w-md` so the textarea has breathing room, narrower than `max-w-5xl` so it doesn't feel like a page-replacing form.
- **To/Cc inputs are comma-separated plain text**, not a chip-based multiselect. The `parseEmailList` helper splits on `,`, `;`, or newline and trims. Keep it simple — users can edit freely and Gmail's own compose uses the same pattern.
- **Pre-fill hydration** runs once on first `defaults` load, then leaves the fields editable. Use a `hydrated` state flag + `useEffect` so re-renders don't clobber edits in progress.
- **All dialog state resets on close**, via a second `useEffect` keyed on `open`. Re-opening re-fetches defaults.
- **Client-side validation before sending**: at least one recipient, non-empty subject. Surface as a red banner, don't throw.
- **Use raw `fetch` with `credentials: 'include'` inside `handleSend`**, not `apiFetch`. The shared helper discards the response body on error, which means you lose the server's `message` field — and the server's 400 `no_sender_email` message is exactly the text the user needs to see. Raw fetch lets you `res.json()` on failure.
- **Success banner then auto-close** after ~1.2s via `setTimeout(() => onClose(), 1200)`. Disable the Envoyer button while `successMessage` is set so a double-click can't send twice.
- **PDF attachment checkbox default = true**. There is never a case where the user wants to send a bon de commande without the PDF.

### 32.5 Body template conventions

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

### 32.6 From header convention

The API resolves the acting user's display name from `utilisateur.prenom + nom` and formats the From header as `Prénom Nom — ETS Malterre <mapped-email@etsmalterre.com>`. Never send with a bare email in the From header — Gmail will render it with the `mapped-email` local part as the display name, which looks clinical. The " — ETS Malterre" suffix makes the sender instantly recognisable in the recipient's inbox. MIME-encode the display name via the `encodeHeader` helper in `gmail.ts` so accented characters survive.

### 32.7 Error handling — map 400s to friendly French

The server's `400 no_sender_email` response includes a `message` field in French: `"Aucune adresse email n'est associée à votre compte. Un administrateur doit en définir une dans Paramètres › Utilisateurs."`

The frontend must surface this message verbatim — it directs the user to the exact fix. The `handleSend` raw-fetch path does this automatically by reading `json.message` before falling back to `json.error`. Do not strip or rephrase it in the dialog.

Any other 4xx/5xx falls through to the generic `Erreur HTTP {status}` banner.

### 32.8 Candidate screens

Apply this pattern to every document screen that needs email delivery:

- Fournisseurs → Commandes ✅ implemented
- Sous-traitants → Commandes — contact flag `envoi_commande`
- Clients → Commandes — contact flag `envoi_commande`
- Clients → Devis — contact flag `envoi_soumission`
- Clients → Facturation — contact flag `envoi_facture`
- Transport → Expéditions / Livraisons — contact flag `envoi_bl`

Each one needs: (a) a PDF renderer in `apps/api/src/lib/pdf/`, (b) a reusable `buildXxxPdfData` + `renderXxxPdfBuffer` helper pair, (c) the two endpoints `/:id/email-defaults` and `/:id/email`, (d) the forked `EmailXxxDialog` component, and (e) the `@` button on the view-mode header trio (§6.1).

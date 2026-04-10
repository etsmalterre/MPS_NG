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
| Default (`<Button>`) | Primary actions: Enregistrer | `bg-primary text-primary-foreground` |
| `variant="outline"` | Secondary: Annuler, Modifier | Border + text |
| `variant="ghost"` | Tertiary: +, edit/delete icons | No border, hover bg |
| `size="sm"` | Text buttons with icon: `<Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier` |
| `size="icon"` | Icon-only: `className="h-9 w-9"` for header, `className="h-6 w-6"` for inline |

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

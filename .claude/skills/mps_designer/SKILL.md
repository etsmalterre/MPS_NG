# MPS Designer Skill

## Overview

Design system for **MPS_NG**, the ERP system for **ETS Malterre** (French textile/knitting manufacturer). This document is the single source of truth for all visual patterns — follow it precisely when building new screens or modifying existing ones.

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

| Variant | Left border | Icon bg | Icon color | Usage |
|---------|------------|---------|------------|-------|
| **Neutral (default)** | `border-l-amber-400/60` | `bg-amber-400/10` | `text-amber-600` | Standard cards (refs, neutral commandes) |
| **Success** | `border-l-green-500/60` | `bg-green-500/10` | `text-green-600` | Valid certificates, delivered orders |
| **Danger** | `border-l-destructive/60` | `bg-destructive/10` | `text-destructive/70` | Expired certificates |
| **Muted** | `border-l-border` | `bg-muted` | `text-muted-foreground` | Closed/draft items |

**Amber/gold is the standard neutral color for item cards throughout the app.**

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

```tsx
<select className={cn(inputClass, 'cursor-pointer')}>
```

Dropdowns always use `cursor-pointer` so the pointing finger icon shows on hover.

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

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-accent" />
        Title
      </DialogTitle>
    </DialogHeader>
    {/* Body content */}
  </DialogContent>
</Dialog>
```

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

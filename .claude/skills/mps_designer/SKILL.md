# MPS Designer Skill

## Overview

This skill defines the design system for **MPS_NG**, the ERP system for **ETS Malterre**, a French textile/knitting manufacturing company (bonnetterie/tricotage).

## Branding - ETS Malterre

### Primary Colors

| Name | Hex | HSL | CSS Variable | Usage |
|------|-----|-----|--------------|-------|
| **Primary Navy** | `#00243E` | `207 100% 12%` | `--primary` | Sidebar, navigation, headers |
| **Accent Gold** | `#E8AD33` | `42 80% 55%` | `--accent` | CTAs, active states, highlights |
| **Accent Blue** | `#046BD2` | `211 96% 42%` | `--accent-blue` | Links, secondary actions |
| **Secondary Gold** | `#F1B439` | `42 87% 58%` | `--gold` | Hover states, warm accents |

### Color Palette

```css
/* Primary - Navy */
--primary: 207 100% 12%;           /* #00243E */
--primary-foreground: 210 40% 98%; /* White text on navy */

/* Accent - Gold */
--accent: 42 80% 55%;              /* #E8AD33 */
--accent-foreground: 207 100% 12%; /* Navy text on gold */

/* Gold variants */
--gold: 42 80% 55%;                /* #E8AD33 */
--gold-foreground: 207 100% 12%;

/* Teal (complementary) */
--teal: 174 58% 45%;               /* #30B5A1 */
--teal-foreground: 210 40% 98%;
```

### Gradients

```css
/* Gold gradient */
--gradient-gold: linear-gradient(135deg, hsl(42 80% 55%), hsl(42 87% 58%));

/* Teal gradient */
--gradient-teal: linear-gradient(135deg, hsl(174 58% 45%), hsl(174 58% 55%));

/* Gold to transparent (for headers) */
--gradient-header: linear-gradient(to right, hsl(42 80% 55% / 0.15), white);
```

### Shadows (Gold-tinted)

```css
--shadow-sm: 0 1px 2px 0 rgb(232 173 51 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(232 173 51 / 0.1), 0 2px 4px -2px rgb(232 173 51 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(232 173 51 / 0.1), 0 4px 6px -4px rgb(232 173 51 / 0.1);
```

## Component Patterns

### Icon Boxes

Two variants for icon containers:

```tsx
// Gold icon box
<div className="icon-box-gold h-10 w-10">
  <Icon className="h-5 w-5" />
</div>

// Teal icon box
<div className="icon-box-teal h-10 w-10">
  <Icon className="h-5 w-5" />
</div>
```

CSS classes:
```css
.icon-box-gold {
  @apply flex items-center justify-center rounded-lg
         bg-gradient-to-br from-gold/20 to-gold/10
         text-gold border border-gold/20;
}

.icon-box-teal {
  @apply flex items-center justify-center rounded-lg
         bg-gradient-to-br from-teal/20 to-teal/10
         text-teal border border-teal/20;
}
```

### Cards

Premium card style with gold accent:

```tsx
<Card className="card-premium">
  {/* content */}
</Card>
```

CSS class:
```css
.card-premium {
  @apply bg-card border border-gold/20 shadow-sm
         transition-all duration-200
         hover:shadow-md hover:border-gold/30;
}
```

### Stat Cards

For dashboard statistics:

```tsx
<Card className="card-premium stat-glow">
  {/* stat content */}
</Card>
```

CSS class:
```css
.stat-glow {
  @apply relative overflow-hidden;
}
.stat-glow::after {
  content: '';
  @apply absolute -top-12 -right-12 h-24 w-24
         rounded-full bg-gradient-to-br from-gold/20 to-transparent
         blur-2xl;
}
```

### Active State Indicator

Gold vertical bar for active navigation items:

```tsx
{isActive && (
  <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />
)}
```

### Buttons

Primary button with gold:
```tsx
<Button className="bg-accent text-accent-foreground hover:bg-accent/90">
  Action
</Button>
```

### Badges

```tsx
// Gold badge
<Badge variant="gold">Status</Badge>

// Teal badge
<Badge variant="teal">Status</Badge>
```

## Navigation Structure

### Main Menu Items

1. **Tableau de bord** - Dashboard overview
2. **Clients** - Customer management
   - Commandes (Orders)
   - Devis (Quotations)
   - Facturation (Invoicing)
   - Gestion (Management)
3. **Fournisseurs** - Supplier management
   - Commandes
   - Gestion
4. **Sous-traitants** - Subcontractor management
   - Commandes
   - Gestion
5. **Production** - Manufacturing
   - Tricotage (Knitting)
   - Teinture (Dyeing)
   - Confection (Assembly)
   - Contrôle qualité (Quality control)
6. **Stock** - Inventory
   - Matières premières (Raw materials)
   - Produits finis (Finished goods)
   - Mouvements (Stock movements)
7. **Produits** - Products
   - Références (References)
   - Coloris (Colors)
8. **Transport** - Shipping
   - Expéditions (Shipments)
   - Livraisons (Deliveries)
9. **Paramètres** - Settings

## Layout Specifications

### Sidebar

- Width: 256px (expanded), 64px (collapsed)
- Background: Navy gradient (`from-primary via-primary/95 to-primary/90`)
- Logo: "MPS" in gold (#E8AD33)
- Border: Right border with `border-primary/20`

### Header

- Height: 56px (h-14)
- Background: `bg-gradient-to-r from-gold/40 via-gold/15 to-transparent`
- Border: `border-b border-gold/30`
- Contains: Submenu tabs, fullscreen toggle, user avatar

### Content Area

- Padding: 16px (p-4) on mobile, 24px (p-6) on desktop
- Max width: Full width with sidebar offset
- Background: Light neutral (`--background`)

## Typography

### Fonts

Fonts are loaded via `@import` in `index.css` (after @tailwind directives):

```css
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Lato:wght@300;400;500;600;700&display=swap');
```

**Important**: Do NOT add a duplicate `<link>` tag in `index.html` - the CSS @import is sufficient.

| Font | Usage | Tailwind Class |
|------|-------|----------------|
| **Anton** | Headings (h1-h6) | `font-heading` |
| **Lato** | Body text | `font-sans` (default) |

### Heading Styles

Base CSS applies `font-heading` to all h1-h6 automatically:

```css
h1, h2, h3, h4, h5, h6 {
  @apply font-heading tracking-tight;
  text-wrap: balance;
}
```

For explicit heading styling (recommended pattern):

```tsx
// Page titles - use font-heading font-bold explicitly
<h1 className="text-3xl font-heading font-bold tracking-tight">Page Title</h1>

// Section headings
<h2 className="text-2xl font-heading font-bold tracking-tight">Section</h2>
```

### Text Styles

- **Body**: Default Lato font via `font-sans`
- **Tabular numbers**: `tabular-nums` for statistics and numbers
- **Muted text**: `text-muted-foreground` for secondary content
- **Small text**: `text-sm text-muted-foreground` for descriptions

## Animation Classes

```css
/* Fade in */
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

/* Staggered children */
.stagger-children > * {
  animation: fadeIn 0.3s ease-out backwards;
}
.stagger-children > *:nth-child(1) { animation-delay: 0ms; }
.stagger-children > *:nth-child(2) { animation-delay: 50ms; }
.stagger-children > *:nth-child(3) { animation-delay: 100ms; }
.stagger-children > *:nth-child(4) { animation-delay: 150ms; }

/* Pulse (for status indicators) */
.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

## Responsive Breakpoints

Following Tailwind defaults:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px (sidebar switches from mobile to desktop)
- `xl`: 1280px
- `2xl`: 1536px

## Icons

Using **Lucide React** for all icons. Common icons:

| Icon | Usage |
|------|-------|
| `TrendingUp` | Dashboard |
| `Users` | Clients |
| `Factory` | Production, Suppliers |
| `Package` | Products, Stock |
| `ShoppingCart` | Orders |
| `Truck` | Transport |
| `Settings` | Settings |
| `Boxes` | Stock/Inventory |

## Accessibility

- All interactive elements have focus states
- Color contrast meets WCAG AA
- Screen reader labels for icon-only buttons
- Keyboard navigation support

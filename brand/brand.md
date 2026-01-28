# 1DXR Design System & Brand Guidelines

**Version:** 2.1 (Enterprise Edition)  
**Last Updated:** January 2026  
**Philosophy:** *"Industrial Clarity."* A precision-engineered aesthetic optimized for high-density agentic workflows, balancing readability with brand personality.

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Typography System](#2-typography-system)
3. [Color System](#3-color-system)
4. [Geometry & Shape](#4-geometry--shape)
5. [Visual Hierarchy & Spacing](#5-visual-hierarchy--spacing)
6. [UI Component Patterns](#6-ui-component-patterns)
7. [Motion & Interaction](#7-motion--interaction)
8. [Iconography](#8-iconography)
9. [Brand Assets](#9-brand-assets)
10. [Accessibility & Compliance](#10-accessibility--compliance)
11. [Implementation Checklist](#11-implementation-checklist)
12. [Quick Reference](#12-quick-reference)

---

## 1. Core Principles

| Principle | Description |
| --- | --- |
| **Content is the Interface** | Reduce decorative noise. Use whitespace and typography to define hierarchy, not heavy borders or fills. |
| **Zinc & Blue** | We rely on a neutral, warm-gray "Zinc" foundation to reduce eye strain, reserving **Cornflower Blue** strictly for interaction and guidance. |
| **Depth, Not Flatness** | In Dark Mode, we avoid pitch black (`#000000`). We use layers of deep Zinc to create a hierarchy of depth (Base → Card → Overlay). |
| **Semantic Over Literal** | Never use hex codes in components. Use CSS custom properties (`--background`, `--primary`) for automatic Light/Dark mode switching. |
| **Accessibility First** | All color combinations must pass WCAG AA. Never rely on color alone to convey meaning. |

---

## 2. Typography System

We utilize a **Dual-Typeface System**: `Poppins` for brand personality (Headings) and `Inter` for strict UI legibility (Body/Controls).

### Primary Font Stack

```css
--font-brand: 'Poppins', sans-serif;          /* Headings, Hero, Marketing */
--font-ui:    'Inter', system-ui, sans-serif; /* Inputs, Tables, Body Text */
--font-mono:  'JetBrains Mono', monospace;    /* Code, API Keys, Logs */
```

### Type Scale & Line Height

| Role | Size (px/rem) | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| **Display H1** | 48px / 3.00rem | SemiBold (600) | 1.1 | -0.02em | Hero Pages, Marketing |
| **Heading H2** | 36px / 2.25rem | SemiBold (600) | 1.2 | -0.02em | Page Titles (Marketing) |
| **Heading H3** | 24px / 1.50rem | Medium (500) | 1.3 | -0.01em | Card Titles |
| **Body Large** | 18px / 1.125rem | Regular (400) | 1.6 | 0 | Lead Text, Descriptions |
| **Body Base** | 16px / 1.00rem | Regular (400) | 1.5 | 0 | Default UI Text |
| **Small** | 14px / 0.875rem | Medium (500) | 1.4 | 0 | Inputs, Buttons, Tables |
| **Caption** | 12px / 0.75rem | Regular (400) | 1.4 | 0.02em | Timestamps, Hints, Metadata |

### Application UI Typography

For the **application shell** (dashboard, settings, data views), we use a more restrained scale:

| Element | Class | Size |
| --- | --- | --- |
| Page Title | `text-lg font-semibold` | 18px |
| Page Description | `text-sm text-foreground` | 14px |
| Section Header | `text-sm font-semibold` | 14px |
| Card Title | `text-sm font-semibold` | 14px |
| Body Text | `text-sm text-foreground` | 14px |
| Helper Text | `text-xs text-foreground` | 12px |
| Form Labels | `text-xs text-muted-foreground` | 12px |
| Metadata | `text-xs text-muted-foreground` | 12px |

### Complementary Font: Sofia Sans Extra Condensed

**Usage:** Accent font used sparingly for labels, tags, and decorative purposes.

```css
--font-accent: 'Sofia Sans Extra Condensed', sans-serif;
```

**Rules:**
- Only for decorative headers and special callouts
- Always uppercase with `letter-spacing: 0.05em`
- Never use for body text or long-form content

---

## 3. Color System

We do **not** use hex codes in production components. We use **Semantic Tokens** mapped to Tailwind CSS variables. This ensures perfect Light/Dark mode switching.

### Brand Colors (The DNA)

*Used sparingly for branding moments and primary interactions.*

| Name | Hex | CSS Variable | Usage |
| --- | --- | --- | --- |
| **Cornflower Blue** | `#568AFF` | `--primary` | Primary actions, links, brand accents |
| **Green-Blue** | `#0665BA` | `--chart-2` | Secondary brand, gradient endpoints |
| **French Sky Blue** | `#66ABFE` | `--accent` | Highlights, notifications, active states |
| **Gradient Start** | `#559EFF` | `--brand-gradient-start` | Premium elements |
| **Gradient End** | `#0065BA` | `--brand-gradient-end` | Premium elements |

### Surface & Backgrounds (The Canvas)

*The fundamental layers of the application.*

| Token | Light Mode | Dark Mode | Usage |
| --- | --- | --- | --- |
| `bg-background` | `#FAFAFA` (Zinc-50) | `#09090B` (Zinc-950) | Main page background. Never pure white/black. |
| `bg-card` | `#FFFFFF` (Pure White) | `#0F0F11` (Zinc-900+) | Cards, Panels, Sidebars. Creates depth. |
| `bg-popover` | `#FFFFFF` (Pure White) | `#0F0F11` (Zinc-900+) | Dropdowns, Modals, Tooltips. |
| `bg-muted` | `#F4F4F5` (Zinc-100) | `#27272A` (Zinc-800) | Secondary backgrounds, table alternates. |
| `bg-muted/30` | Zinc-100 @ 30% | Zinc-800 @ 30% | Card backgrounds (application pattern). |

### Text & Content (The Ink)

*Designed for high contrast without harshness.*

| Token | Light Mode | Dark Mode | Usage |
| --- | --- | --- | --- |
| `text-foreground` | `#18181B` (Zinc-900) | `#FAFAFA` (Zinc-50) | Primary headings, body text. **Must be used for all primary content.** |
| `text-muted-foreground` | `#71717A` (Zinc-500) | `#A1A1AA` (Zinc-400) | Form labels, placeholders, metadata. **Only for secondary content.** |
| `text-primary` | `#568AFF` (Brand) | `#568AFF` (Brand) | Links, active states, interactive text. |
| `text-destructive` | `#DC2626` (Red-600) | `#EF4444` (Red-500) | Error messages, destructive actions. |

### Borders & Dividers (The Structure)

*Subtle separation.*

| Token | Light Mode | Dark Mode | Usage |
| --- | --- | --- | --- |
| `border-border` | `#E4E4E7` (Zinc-200) | `#27272A` (Zinc-800) | Default card borders, dividers. |
| `border-input` | `#E4E4E7` (Zinc-200) | `#27272A` (Zinc-800) | Form inputs (default state). |
| `ring` | `#568AFF` (Brand) | `#568AFF` (Brand) | Focus states (accessibility). |

### Data Visualization (Charts & Analytics)

We use a strict sequence for categorical data to ensure contrast and harmony.

| Order | Token | Color | Usage |
| --- | --- | --- | --- |
| 1 | `--chart-1` | Cornflower Blue | Primary metric (e.g., "Revenue", "Total") |
| 2 | `--chart-2` | Green-Blue | Secondary metric (e.g., "Profit", "Growth") |
| 3 | `--chart-3` | Sky Blue | Accent/Highlight (e.g., "Projected", "Target") |
| 4 | `--chart-4` | Teal/Purple | Comparison data (e.g., "Last Year", "Previous") |
| 5 | `--chart-5` | Orange/Yellow | Warnings or outliers |

**Rules:**
- Always assign colors in this exact sequence
- Never use the "Destructive" (Red) color for generic data
- Reserve red strictly for negative trends, errors, or alerts
- Ensure sufficient contrast between adjacent data series

---

## 4. Geometry & Shape

### Corner Radius Logic

We use a mathematically consistent radius system. When nesting elements, the inner radius must be smaller than the outer radius to appear parallel.

**The Formula:** `Outer Radius - Padding = Inner Radius`

| Token | Value | Usage |
| --- | --- | --- |
| `--radius-lg` | 8px (0.5rem) | Cards, Modals, Main Containers |
| `--radius-md` | 6px (0.375rem) | Buttons, Inputs, Dropdown Menus |
| `--radius-sm` | 4px (0.25rem) | Checkboxes, Badges, Nested items |
| `--radius-full` | 9999px | Avatars, Status Indicators, Pills |

**Example - Nested Elements:**
```
Card Container: rounded-lg (8px) + p-4 (16px padding)
Inner Element:  rounded-sm (4px) ← appears visually parallel
```

### Shadow System

| Token | Usage | Specification |
| --- | --- | --- |
| `shadow-sm` | Cards, raised surfaces | `0 1px 2px 0 rgb(0 0 0 / 0.05)` |
| `shadow` | Default elevated elements | `0 1px 3px 0 rgb(0 0 0 / 0.1)` |
| `shadow-md` | Dropdowns, tooltips | `0 4px 6px -1px rgb(0 0 0 / 0.1)` |
| `shadow-lg` | Modals, popovers | `0 10px 15px -3px rgb(0 0 0 / 0.1)` |
| `shadow-brand` | Premium/AI features | `0 4px 14px 0 rgba(86, 138, 255, 0.25)` |

---

## 5. Visual Hierarchy & Spacing

### The 4px Baseline Grid

All spacing, sizing, and typography must align to a 4px grid.

| Spacing | Tailwind | Pixels | Usage |
| --- | --- | --- | --- |
| `space-1` | `gap-1` | 4px | Tight spacing (inline elements) |
| `space-2` | `gap-2` | 8px | Default gap (buttons, inputs) |
| `space-3` | `gap-3` | 12px | Compact sections |
| `space-4` | `gap-4` | 16px | Standard section spacing |
| `space-6` | `gap-6` | 24px | Page-level section spacing |
| `space-8` | `gap-8` | 32px | Large section breaks |

### Application Layout Spacing

| Element | Spacing |
| --- | --- |
| Page Container | `space-y-6 py-6` |
| Card Content | `pt-6` (CardContent only, no full padding) |
| Section Spacing | `space-y-4` |
| Form Fields | `space-y-2` between label and input |
| Button Groups | `gap-2` |
| Navigation Items | `gap-0.5` to `gap-2.5` |

### Minimum Target Size

All interactive elements must be at least **44px height** for accessibility compliance (touch targets).

### Depth Strategy (Dark Mode)

In dark mode, "Light comes from the top." Create depth through progressively lighter surfaces:

| Level | Surface | Color | Usage |
| --- | --- | --- | --- |
| 0 | Background | `#09090B` (Zinc-950) | Page background |
| 1 | Card | `#0F0F11` (Zinc-900) | Cards, panels, sidebar |
| 2 | Popover | `#18181B` (Zinc-850) | Dropdowns, modals, tooltips |
| 3 | Hover | `#27272A` (Zinc-800) | Hover states on cards |

---

## 6. UI Component Patterns

### Buttons

Buttons must convey hierarchy through visual weight, not just size.

| Variant | Classes | Look | Usage |
| --- | --- | --- | --- |
| **Primary** | `bg-primary text-primary-foreground hover:opacity-90` | Solid Cornflower Blue | Single most important action ("Create", "Deploy") |
| **Secondary** | `bg-secondary text-secondary-foreground hover:bg-secondary/80` | Light Gray / Dark Zinc | Safe actions ("Cancel", "View") |
| **Ghost** | `hover:bg-accent hover:text-accent-foreground` | Transparent, changes on hover | Icon buttons, navigation |
| **Destructive** | `bg-destructive text-destructive-foreground` | Red | High-risk actions ("Delete") |
| **Outline** | `border border-input bg-transparent hover:bg-accent` | Border only | Secondary actions |

**Sizing:**
- Always use `size="sm"` for application UI (never default size)
- Exception: Empty state CTAs may use `size="lg"`

### Inputs & Forms

| State | Specification |
| --- | --- |
| **Default** | 1px border `border-input`, `bg-transparent`, `h-9` height |
| **Focus** | Border changes to `ring` (Blue) + 2px offset ring |
| **Error** | Border changes to `destructive` (Red), text becomes `text-destructive` |
| **Disabled** | `opacity-50`, `cursor-not-allowed` |

**Rules:**
- All inputs must use `h-9` (36px) height, never `h-10` or default
- Labels must use `text-xs text-muted-foreground`
- Helper text must use `text-xs text-foreground`
- Form sections must use `space-y-2` or `space-y-3`

### Cards & Containers

| Rule | Specification |
| --- | --- |
| Background | Always `bg-muted/30`, never `bg-background` or `bg-white` |
| Structure | Use `CardContent` with `pt-6`, avoid `CardHeader`/`CardTitle` |
| Borders | 1px `border` combined with subtle shadows, never heavy borders |
| Elevation | `shadow-sm` for cards, `shadow-lg` for dropdowns/modals |

**Gradient Borders (Premium/AI Features):**
```tsx
<div className="bg-brand-gradient p-[1px] rounded-lg">
  <div className="bg-background rounded-[calc(0.5rem-1px)] p-4">
    {/* Content */}
  </div>
</div>
```

---

## 7. Motion & Interaction

1DXR is a productivity tool. Animation must be **fast**, **imperceptible**, and **functional**.

### Animation Timing

| Interaction | Duration | Easing | Usage |
| --- | --- | --- | --- |
| **Hover** | 150ms | `ease-out` | Instant feedback for buttons, links |
| **Fade In/Out** | 200ms | `ease-out` | Snappy entrance for modals, panels |
| **Accordion** | 300ms | `cubic-bezier(0.87, 0, 0.13, 1)` | Smooth expansion/collapse |
| **Slide** | 200ms | `ease-out` | Sidebar, sheet transitions |
| **Scale** | 150ms | `ease-out` | Button press feedback |

### Framer Motion Defaults

```tsx
// Standard spring physics for 1DXR
const defaultSpring = { stiffness: 400, damping: 30 }

// Fade in animation
const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.2 }
}

// Scale on press
const scaleOnPress = {
  whileTap: { scale: 0.98 }
}
```

### Accessibility Requirements

- All animations must respect `prefers-reduced-motion` media queries
- Provide instant state changes for users who prefer reduced motion
- Never use animation as the only indicator of state change

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Iconography

### System Icons (UI)

Use **Lucide React** for all interface controls.

| Specification | Value |
| --- | --- |
| **Library** | Lucide React |
| **Stroke Width** | 1.5px (consistent, elegant) |
| **Size - Small** | 16px (3.5 in buttons, inputs) |
| **Size - Default** | 20px (navigation) |
| **Size - Large** | 24px (display, empty states) |

**Classes:**
```tsx
<Icon className="h-3.5 w-3.5" /> // In buttons
<Icon className="h-4 w-4" />     // In navigation
<Icon className="h-5 w-5" />     // In cards
<Icon className="h-6 w-6" />     // Display
```

### Brand Icons (Marketing)

Use custom SVGs (`logo_7`, `logo_9`) for:
- Empty states where brand personality is needed
- Success screens and celebrations
- Marketing materials and hero sections
- Loading/splash screens

---

## 9. Brand Assets

### Logo Selection Matrix

| Background | Full Logo | Icon Only |
| --- | --- | --- |
| **Black/Dark** | `logo_1.svg`, `logo_2.svg` | `logo_7.svg` |
| **White/Light** | `logo_4.svg`, `logo_5.svg` | `logo_8.svg` |
| **Blue Gradient** | `logo_3.svg`, `logo_6.svg` | `logo_9.svg` |
| **App Icons** | `app.svg`, `app_black_bg.svg` | `app.svg` |

### Logo Specifications

| Type | Min Size | Clear Space |
| --- | --- | --- |
| Primary (Full) | 120px width | 25% of logo height |
| Secondary | 100px width | 20% of logo height |
| Accent | 80px width | 15% of logo height |
| Icon Mark | 24px | 10% of icon size |

### Gradients

The "1DXR Glow" is a signature element used for "AI Magic" moments.

```css
/* CSS Classes */
.bg-brand-gradient {
  background: linear-gradient(135deg, #559EFF 0%, #0065BA 100%);
}

.bg-brand-gradient-vertical {
  background: linear-gradient(180deg, #559EFF 0%, #0065BA 100%);
}

.text-brand-gradient {
  background: linear-gradient(135deg, #559EFF 0%, #0065BA 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

### Decorative Assets

| Asset | Path | Usage |
| --- | --- | --- |
| Background Pattern | `public/icons/background_icon.svg` | Hero sections (20-30% opacity) |
| App Icon | `public/icons/app.svg` | 561×561px, iOS/Android |
| Social Icon | `public/icons/app_black_bg.svg` | 1080×1080px, Social media |

---

## 10. Accessibility & Compliance

### Color Contrast Requirements

All text/background combinations must pass **WCAG AA** (4.5:1 for normal text, 3:1 for large text).

| Combination | Ratio | Status |
| --- | --- | --- |
| `text-foreground` on `bg-background` | 15.8:1 | ✅ Pass |
| `text-foreground` on `bg-card` | 15.8:1 | ✅ Pass |
| `text-muted-foreground` on `bg-background` | 5.2:1 | ✅ Pass |
| `text-primary` on `bg-background` | 4.5:1 | ✅ Pass (borderline) |

### Rules

1. **Never** use `text-muted-foreground` on dark gray backgrounds for critical information
2. **Never** remove `outline` on focus unless replacing with custom `ring`
3. **Never** rely on color alone to convey state (use Icon + Color together)
4. **Always** provide text alternatives for icons (aria-label or sr-only)
5. **Always** ensure minimum 44px touch targets for interactive elements

### Focus Management

```tsx
// Always use visible focus rings
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
```

---

## 11. Implementation Checklist

### Fonts
- [ ] `app/layout.tsx` loads Inter (UI) and Poppins (headings)
- [ ] JetBrains Mono loaded for code blocks
- [ ] Font display set to `swap` for performance

### Theme
- [ ] `next-themes` configured with `class` strategy
- [ ] Dark mode toggle functional
- [ ] All components use semantic tokens (not literal colors)

### CSS
- [ ] `tailwind.css` extends theme with Zinc variables
- [ ] Brand gradient utilities available
- [ ] Accordion animations defined

### Components
- [ ] All buttons use `size="sm"` explicitly
- [ ] All inputs use `h-9` height
- [ ] All cards use `bg-muted/30` background
- [ ] All labels use `text-xs text-muted-foreground`
- [ ] Primary content uses `text-foreground` (NOT muted)

### Accessibility
- [ ] All inputs have labels
- [ ] All images have alt text
- [ ] All interactive elements keyboard navigable
- [ ] Focus states properly styled
- [ ] Reduced motion respected

---

## 12. Quick Reference

### Color Quick Copy

| Color | Hex | HSL |
| --- | --- | --- |
| Cornflower Blue | `#568AFF` | `220 100% 67%` |
| Green-Blue | `#0665BA` | `207 95% 38%` |
| French Sky Blue | `#66ABFE` | `212 98% 70%` |
| Zinc-50 | `#FAFAFA` | `0 0% 98%` |
| Zinc-100 | `#F4F4F5` | `240 5% 96%` |
| Zinc-500 | `#71717A` | `240 4% 46%` |
| Zinc-800 | `#27272A` | `240 4% 16%` |
| Zinc-900 | `#18181B` | `240 6% 10%` |
| Zinc-950 | `#09090B` | `240 10% 4%` |

### Font Quick Reference

```css
/* Brand Headings */
font-family: 'Poppins', sans-serif;
font-weight: 600;

/* UI Body */
font-family: 'Inter', system-ui, sans-serif;
font-weight: 400;

/* Code */
font-family: 'JetBrains Mono', monospace;

/* Accent Labels */
font-family: 'Sofia Sans Extra Condensed', sans-serif;
text-transform: uppercase;
letter-spacing: 0.05em;
```

### Component Patterns

```tsx
// Page Header
<div className="space-y-6 py-6">
  <div className="flex items-center justify-between">
    <div className="space-y-1">
      <h1 className="text-lg font-semibold">Page Title</h1>
      <p className="text-sm text-foreground mt-0.5">Description</p>
    </div>
    <Button size="sm">Action</Button>
  </div>
</div>

// Card
<Card className="bg-muted/30">
  <CardContent className="pt-6">
    <h3 className="text-sm font-semibold mb-0.5">Card Title</h3>
    <p className="text-xs text-foreground">Content</p>
  </CardContent>
</Card>

// Form Field
<div className="space-y-2">
  <Label className="text-xs text-muted-foreground">Field Label</Label>
  <Input className="h-9" placeholder="Enter value" />
  <p className="text-xs text-foreground">Helper text</p>
</div>
```

---

## File Organization

```
public/
├── logos/
│   ├── logo_1.svg          (Black bg, white text, gradient X)
│   ├── logo_2.svg          (Black bg, gradient text, white X)
│   ├── logo_3.svg          (Gradient bg, white text, black X)
│   ├── logo_4.svg          (White bg, black text, gradient X)
│   ├── logo_5.svg          (White bg, gradient text, black X)
│   ├── logo_6.svg          (Gradient bg, black text, white X)
│   ├── logo_7.svg          (Black bg, gradient X icon)
│   ├── logo_8.svg          (White bg, black X icon)
│   └── logo_9.svg          (Gradient bg, white X icon)
│
└── icons/
    ├── app.svg             (Premium app icon 561×561px)
    ├── app_black_bg.svg    (App icon on black 1080×1080px)
    ├── background_icon.svg (Outline pattern for backgrounds)
    └── background_icon_usage.svg (Usage example 1280×720px)

styles/
└── tailwind.css            (Zinc-based theme with semantic tokens)

brand/
└── brand.md                (This document)
```

---

## Version History

| Version | Date | Changes |
| --- | --- | --- |
| 1.0 | November 2025 | Initial brand guidelines (marketing focus) |
| 2.0 | January 2026 | Enterprise Design System: semantic tokens, dual-typeface, Zinc palette |
| 2.1 | January 2026 | Added motion, data viz, geometry, iconography standards |

---

## Legal & Trademark

The 1DXR logo, name, and brand assets are proprietary and protected. Unauthorized use, reproduction, or modification is prohibited without express written permission.

---

*This document defines the complete 1DXR Product Design System. For component implementation examples, reference the shadcn/ui documentation and the project's `.cursorrules` file.*

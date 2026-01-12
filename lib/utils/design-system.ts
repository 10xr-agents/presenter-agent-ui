/**
 * Design System Constants
 * 
 * Centralized design tokens for consistent styling across the application.
 * These constants ensure visual consistency and make it easy to maintain
 * the design system.
 */

/**
 * Typography Scale
 * 
 * Standardized typography sizes and weights for consistent text hierarchy.
 */
export const typography = {
  // Page Titles
  pageTitle: "text-3xl font-bold tracking-tight",
  // Section Titles
  sectionTitle: "text-2xl font-semibold",
  // Subsection Titles
  subsectionTitle: "text-xl font-semibold",
  // Body Text
  body: "text-base font-normal leading-relaxed",
  // Small Text
  small: "text-sm font-normal",
  // Tiny Text
  tiny: "text-xs font-normal",
} as const

/**
 * Spacing Scale
 * 
 * Standardized spacing values for consistent layout.
 */
export const spacing = {
  // Container Spacing
  pageContainer: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
  section: "space-y-6", // 24px
  cardPadding: "p-6", // 24px
  
  // Component Spacing
  formFields: "space-y-4", // 16px
  buttonGroup: "gap-2", // 8px
  listItems: "space-y-1", // 4px
  cardContent: "space-y-4", // 16px
  
  // Micro Spacing
  iconText: "gap-2", // 8px
  inline: "gap-1", // 4px
  tight: "gap-0.5", // 2px
} as const

/**
 * Component Patterns
 * 
 * Standardized component styling patterns.
 */
export const components = {
  // Cards
  card: {
    base: "border rounded-lg shadow-sm p-6",
    hover: "hover:shadow-md transition-shadow",
  },
  
  // Buttons
  button: {
    sizes: {
      sm: "h-8 px-3 text-sm",
      default: "h-10 px-4 py-2",
      lg: "h-11 px-8",
    },
  },
  
  // Forms
  form: {
    label: "text-sm font-medium",
    input: "border rounded-md px-3 py-2",
    error: "text-sm text-destructive",
    help: "text-sm text-muted-foreground",
  },
  
  // Tables
  table: {
    header: "font-semibold text-sm",
    row: "border-b",
    hover: "hover:bg-muted/50",
  },
} as const

/**
 * Semantic Colors
 * 
 * Color usage guidelines for consistent semantic meaning.
 */
export const colors = {
  primary: "#568AFF", // Brand blue
  success: "text-green-600", // Success states
  warning: "text-amber-600", // Warnings
  error: "text-destructive", // Errors
  muted: "text-muted-foreground", // Secondary text
} as const

// Note: cn utility is exported from lib/utils/cn.ts
// This file focuses on design system constants only

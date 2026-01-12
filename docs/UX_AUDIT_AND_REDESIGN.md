# Enterprise UX Transformation Plan
## Screen Agent Platform - Production-Ready UX Blueprint

**Version:** 2.1  
**Status:** Authoritative Implementation Guide  
**Target Quality:** Enterprise SaaS (Stripe, Linear, Atlassian, Notion)  
**Last Updated:** January 2025  
**Authorization System:** Refined and formalized (v2.1)

---

## Executive Summary

This document serves as the **single source of truth** for transforming the Screen Agent Platform into an enterprise-grade SaaS application with production-ready UI/UX standards. It consolidates all previous phase implementations, establishes non-negotiable quality standards, and provides a comprehensive blueprint for achieving enterprise trust, scalability, and long-term maintainability.

### Quality Bar (Non-Negotiable)

**Current State Assessment:** The existing UI/UX is **below acceptable baseline** for enterprise SaaS. This plan treats it as a ground-up redesign targeting:

- **Visual Quality:** Subtle, calm, credible enterprise-grade aesthetics
- **Interaction Design:** Predictable, consistent patterns across all surfaces
- **Information Architecture:** Clear hierarchy, high signal-to-noise ratio
- **Usability:** Long-session usability for enterprise users (8+ hour workdays)
- **Trust Indicators:** Professional polish that signals reliability and security

**Reference Standards:**
- Stripe Dashboard (clean, minimal, high information density)
- Linear (fast, predictable, delightful micro-interactions)
- Atlassian (comprehensive, scalable, enterprise-ready)
- Notion (flexible, powerful, approachable)

---

## Part I: Foundation & Architecture

### 1.1 Account Model & Tenant Behavior (Foundational)

**Principle:** Every signup creates a **tenant-based account**. There is **no concept of a "personal account"** in product language, UX, or user-facing code. All accounts are tenants with members, roles, and settings.

#### Internal Operating Modes

The system supports two **internal-only** tenant operating modes (never surfaced in UI):

**1. Normal Mode (Default)**
- **Internal State:** `tenantOperatingMode === "normal"`
- **User Experience:** Simplified tenant experience
- **Characteristics:**
  - Tenant has members (can invite others)
  - Tenant has roles (owner, admin, member, viewer)
  - Tenant has Settings (user-level + tenant-level)
  - Members section always exists in Settings
  - No teams, team roles, or team-scoped features
- **Data Scope:** Tenant-owned resources (Screen Agents, Sessions, Analytics)
- **Navigation:** Dashboard, Screen Agents, Analytics, Settings
- **Empty States:** Focus on creating first agent or enabling advanced features

**2. Organization Mode (Advanced Structure)**
- **Internal State:** `tenantOperatingMode === "organization"`
- **User Experience:** Full enterprise-ready tenant experience
- **Characteristics:**
  - All Normal Mode characteristics
  - Teams feature enabled (Enterprise tier)
  - Team roles (team_admin, team_member) active
  - Advanced permissions and team-scoped visibility
  - Organization-level analytics and billing
- **Data Scope:** Tenant-scoped resources + team-scoped resources
- **Navigation:** Dashboard, Screen Agents, Analytics, Billing, Teams, Settings
- **Context Indicators:** Organization switcher in header (if multiple tenants)

#### Critical UX Rules

**Never Surface Mode Terminology:**
- ❌ Never say "personal mode" or "organization mode" in UI
- ❌ Never say "personal account" or "personal workspace"
- ✅ Use "Settings", "Members", "Your Account" (not "Personal Settings")
- ✅ Use "Enable Teams" or "Upgrade to Organization" (not "Switch to Organization Mode")

**Feature Gating Rules:**
- Teams, team roles, and team-scoped features must be **completely hidden** in Normal mode
- No UI hints, navigation items, settings sections, or empty states should reference teams in Normal mode
- Transition to Organization mode is a **deliberate, explicit action** with UX confirmation
- UI, navigation, settings, and permissions must dynamically adapt based on tenant mode

**Shared Characteristics (Both Modes):**
- Every tenant has members (can invite additional members)
- Every tenant has roles (owner, admin, member, viewer)
- Every tenant has a Settings area with Members section
- Members management behaves consistently across both modes

#### Implementation Requirements

**State Detection:**
```typescript
// lib/utils/tenant-state.ts
// INTERNAL ONLY - Never expose these values in UI
export type TenantOperatingMode = "normal" | "organization"

export async function getTenantOperatingMode(userId: string): Promise<TenantOperatingMode> {
  // Check if tenant has explicitly enabled organization features
  const hasOrganizationFeatures = await checkOrganizationFeaturesEnabled(userId)
  return hasOrganizationFeatures ? "organization" : "normal"
}

// Public API - Returns boolean for feature gating
export async function hasOrganizationFeatures(userId: string): Promise<boolean> {
  return (await getTenantOperatingMode(userId)) === "organization"
}
```

**UI Adaptation Points:**
1. **Navigation Sidebar:** Conditionally render organization-only items (Teams)
2. **Page Headers:** Show organization context when applicable
3. **Dashboard:** Filter data by tenant scope
4. **Settings:** Show appropriate settings sections (Members always visible, Teams only in Organization mode)
5. **Empty States:** Context-aware messaging without mode terminology
6. **Feature Flags:** Hide team features completely in Normal mode

**Transition Flow:**
- Normal → Organization: Via explicit "Enable Teams" or "Upgrade to Organization" action with confirmation
- Organization → Normal: Via disabling organization features (owner only, with warnings)

---

### 1.2 Authorization & Role System (Enterprise-Grade)

**Principle:** The role system must be conceptually clean, enterprise-credible, and immediately understandable to senior engineers, designers, and enterprise customers.

#### Role Hierarchy

**1. Platform-Level Role (Internal Only)**

**`platform_admin`**
- **Scope:** Entire platform
- **Visibility:** Never exposed to tenant users
- **Capabilities:**
  - Full system access
  - Tenant management
  - Billing overrides
  - Support tooling
  - Platform analytics
- **UX:** Exists only in platform admin surfaces (`/platform/*`)
- **Storage:** Managed separately from tenant roles

---

**2. Tenant-Level Roles (Apply to All Tenants)**

These roles apply to **both Normal and Organization mode tenants**. They define authority within a tenant.

**`owner`**
- **Authority:** Ultimate authority within a tenant
- **Responsibilities:**
  - Tenant configuration and settings
  - Member management (add, remove, change roles)
  - Billing & subscription control
  - Mode transition (Normal → Organization)
  - Tenant deletion
- **Constraints:**
  - At least one owner must always exist
  - Cannot be removed if sole owner
  - Cannot be demoted if sole owner
- **Permissions:**
  - All tenant resources: create, read, update, delete
  - Member management: full control
  - Billing: full control
  - Settings: full control

**`admin`**
- **Authority:** Operational administrator
- **Capabilities:**
  - Manage members (add, remove, change roles except owner)
  - Configure tenant settings (except billing and deletion)
  - Create and manage all tenant resources (Screen Agents, Projects, Documents)
  - View tenant analytics
- **Limitations:**
  - Cannot manage billing or subscriptions
  - Cannot delete tenant
  - Cannot change owner role
  - Cannot transition tenant mode
- **Permissions:**
  - Tenant resources: create, read, update, delete
  - Member management: add, remove, change roles (except owner)
  - Settings: read, update (except billing and deletion)

**`member`**
- **Authority:** Standard contributor
- **Capabilities:**
  - Create and manage assigned resources
  - Run Screen Agents
  - Participate in shared workflows
  - View tenant resources
- **Limitations:**
  - No access to tenant-wide configuration
  - Cannot manage members
  - Cannot access billing
  - Cannot modify tenant settings
- **Permissions:**
  - Tenant resources: create (assigned), read, update (assigned), delete (assigned)
  - Screen Agents: read, run
  - Settings: read only

**`viewer`**
- **Authority:** Read-only participant
- **Capabilities:**
  - View tenant resources and outputs
  - View analytics and reports
- **Limitations:**
  - No creation, mutation, or admin access
  - Cannot run Screen Agents
  - Cannot modify any resources
- **Permissions:**
  - Tenant resources: read only
  - Settings: read only

> **Note:** These roles must feel intuitive and map cleanly to enterprise expectations. The naming and permissions are designed to be immediately understandable.

---

**3. Team-Level Roles (Organization Mode Only)**

Team roles are **entirely inactive and nonexistent** in Normal mode. They only apply when tenant is in Organization mode and Teams feature is enabled.

**`team_admin`**
- **Scope:** Specific team within tenant
- **Capabilities:**
  - Add/remove team members
  - Control team-level settings
  - Assign work within team boundaries
  - Manage team-scoped resources
- **Limitations:**
  - Cannot affect tenant-level settings
  - Cannot manage tenant members
  - Scope limited to assigned team

**`team_member`**
- **Scope:** Specific team within tenant
- **Capabilities:**
  - Access team-scoped resources
  - Collaborate within assigned team boundaries
  - Create team-scoped resources
- **Limitations:**
  - Cannot manage team members
  - Cannot modify team settings
  - Scope limited to assigned team

> **Critical:** Team roles must be completely hidden (no UI, no navigation, no settings) when tenant is in Normal mode.

---

#### Permission System

Permissions are resource-based and checked via `lib/config/roles.ts`:

```typescript
// Check if role has permission
hasPermission(roleName: string, resource: string, action: string): boolean

// Examples:
hasPermission("admin", "organization", "manage_members") // true
hasPermission("member", "billing", "read") // false
hasPermission("owner", "organization", "delete") // true
```

**Resource Types:**
- `organization`: Tenant-level configuration
- `screenAgent`: Screen Agent resources
- `project`: Project resources (future)
- `document`: Document resources (future)
- `billing`: Billing and subscription management
- `member`: Member management

**Action Types:**
- `create`, `read`, `update`, `delete`: CRUD operations
- `manage_members`: Add/remove/change member roles
- `manage_billing`: Billing and subscription control
- `run`: Execute Screen Agents

---

### 1.3 Settings Architecture (Scope-Based)

**Principle:** Settings must be structured by **scope**, not by feature. This ensures clarity and enterprise-grade organization.

**Problem:** Settings page lacks clear separation between user-level, tenant-level, and organization-only settings.

**Solution:** Design comprehensive Settings architecture with proper scoping and enterprise UX patterns.

#### Settings Structure

**User-Level Settings** (Always Visible)
```
/settings
├── Profile
│   ├── Name, Email, Avatar
│   ├── Email verification status
│   └── Account deletion
├── Authentication
│   ├── Password change
│   ├── Two-factor authentication (future)
│   └── Connected accounts (OAuth)
└── Preferences
    ├── Language & Region
    ├── Theme (light/dark/system)
    ├── Notification preferences
    └── Timezone
```

**Tenant-Level Settings** (Always Visible - Both Modes)
```
/settings/tenant
├── Members
│   ├── Member list
│   ├── Invitations
│   ├── Roles & permissions
│   └── Member management
├── General
│   ├── Tenant name
│   ├── Slug
│   ├── Logo
│   └── Description
└── API Keys
    ├── Tenant API keys
    └── Key management
```

**Organization-Only Settings** (Organization Mode Only)
```
/settings/organization
├── Teams
│   ├── Team list
│   ├── Team management
│   └── Team roles
├── Billing
│   ├── Payment methods
│   ├── Billing address
│   ├── Invoices
│   └── Usage & limits
├── Security
│   ├── Domain allowlist (Enterprise)
│   ├── SSO configuration (Enterprise)
│   └── Audit logs
└── Advanced
    ├── Feature flags
    ├── Webhooks
    └── Tenant deletion
```

> **Critical:** Members section must exist in both Normal and Organization modes. Teams section must only appear in Organization mode.

#### Settings UX Patterns

**1. Tabbed Navigation**
- Use horizontal tabs for main sections (Profile, Authentication, Preferences)
- Use vertical sidebar for organization settings (General, Members, Billing, Security)
- Clear visual separation between personal and organization settings

**2. Form Patterns**
- Inline editing where appropriate (name, email)
- Modal dialogs for destructive actions (delete account, remove member)
- Confirmation dialogs with clear consequences
- Success/error feedback with toast notifications

**3. Guardrails**
- Destructive actions require confirmation
- Sensitive changes require password re-authentication
- Clear warnings for irreversible actions
- Audit trail for organization-level changes

**4. Safe Defaults**
- Sensible defaults for all preferences
- Clear explanations for each setting
- Help text and tooltips where needed
- Progressive disclosure for advanced settings

#### Implementation Requirements

**File Structure:**
```
app/(app)/settings/
├── page.tsx                    # Personal settings (default)
├── profile/
│   └── page.tsx
├── authentication/
│   └── page.tsx
├── preferences/
│   └── page.tsx
├── api-keys/
│   └── page.tsx
└── organization/
    ├── page.tsx               # Organization settings (only if org mode)
    ├── general/
    ├── members/
    ├── billing/
    └── security/
```

**Component Structure:**
```
components/settings/
├── settings-layout.tsx        # Shared layout with tabs
├── profile/
│   ├── profile-form.tsx
│   └── avatar-upload.tsx
├── authentication/
│   ├── password-form.tsx
│   └── oauth-connections.tsx
├── preferences/
│   ├── language-selector.tsx
│   └── theme-selector.tsx
└── organization/
    ├── org-general-form.tsx
    ├── member-list.tsx
    └── billing-settings.tsx
```

---

### 1.4 Role System Implementation Details

#### Backend Authorization

**Permission Checking:**
```typescript
// lib/config/roles.ts
import { hasPermission } from "@/lib/config/roles"

// In API routes
const canManageMembers = hasPermission(userRole, "organization", "manage_members")
if (!canManageMembers) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
}
```

**Role Assignment:**
- Roles are stored in Better Auth `Member` model (`role` field)
- Default role for new members: `"member"`
- Role changes require appropriate permissions (owner/admin only)
- Owner role has special constraints (cannot remove sole owner)

#### Frontend Gating

**Component-Level Gating:**
```typescript
// components/settings/tenant/member-list.tsx
const userRole = await getCurrentUserRole()
const canManageMembers = hasPermission(userRole, "organization", "manage_members")

{canManageMembers && (
  <Button onClick={handleInviteMember}>Invite Member</Button>
)}
```

**Page-Level Gating:**
```typescript
// app/(app)/settings/organization/teams/page.tsx
const tenantMode = await getTenantOperatingMode(userId)
if (tenantMode !== "organization") {
  redirect("/settings") // Teams only in Organization mode
}
```

**Navigation Gating:**
```typescript
// components/app-shell/app-sidebar.tsx
const tenantMode = await getTenantOperatingMode(userId)
const showTeams = tenantMode === "organization"

{showTeams && (
  <NavItem href="/teams" icon={Users}>Teams</NavItem>
)}
```

#### UX Copy Guidelines

**Do:**
- ✅ "Your Account" (not "Personal Account")
- ✅ "Settings" (not "Personal Settings")
- ✅ "Members" (not "Organization Members")
- ✅ "Enable Teams" (not "Switch to Organization Mode")
- ✅ "Upgrade to Organization" (not "Create Organization")

**Don't:**
- ❌ "Personal Mode" or "Organization Mode" (internal only)
- ❌ "Personal Account" or "Personal Workspace"
- ❌ "Organization Settings" (use "Settings" with scope context)
- ❌ Any terminology that exposes internal mode distinctions

#### Database Schema

**Tenant Roles (Better Auth/Prisma):**
```prisma
model Member {
  role String @default("member")  // "owner" | "admin" | "member" | "viewer"
}
```

**Team Roles (Mongoose):**
```typescript
// lib/models/team-membership.ts
export type TeamRole = "team_admin" | "team_member"
```

**Tenant Mode (Internal Flag):**
```typescript
// Stored as tenant metadata or feature flag
interface TenantMetadata {
  operatingMode: "normal" | "organization"
  organizationFeaturesEnabled: boolean
}
```

---

### 1.5 Application Shell (Persistent Layout)

**Status:** ✅ Implemented (Phase 1)

**Components:**
- `AppHeader` - Top header with org switcher, search (future), notifications (future), user menu
- `AppSidebar` - Left sidebar navigation (conditionally rendered based on tenant state)
- `PageHeader` - Standardized page headers with breadcrumbs
- `UserMenu` - User profile dropdown
- `OrganizationSwitcher` - Organization switcher (only in organization mode)

**Navigation Rules:**
- Sidebar items conditionally rendered based on tenant state
- Active route highlighting
- Mobile responsive (sheet-based sidebar)
- Keyboard navigation support

---

### 1.4 Post-Authentication Routing Contract

**Status:** ✅ Implemented (Phase 2)

**Contract:**
```
IF user just signed up (first time):
  → /onboarding
  
ELSE IF onboarding not completed:
  → /onboarding
  
ELSE IF tenant state = "personal":
  → /dashboard (personal view)
  
ELSE IF tenant state = "organization":
  → /dashboard (organization view, or last active workspace)
```

**Implementation:** Enforced at layout level (`app/(app)/layout.tsx`)

---

## Part II: UX Systemization

### 2.1 Visual Design System

#### Typography Hierarchy & Legibility

**Core Principle:** We do not mute primary content text. All primary content must be clearly legible and use high-contrast colors.

**Page Titles:**
- Size: `text-lg` (18px) - **UPDATED: Reduced from text-3xl for better density**
- Weight: `font-semibold` (600)
- Color: `text-foreground` (NOT muted - primary content)
- Usage: Main page headings (one per page)

**Page Descriptions:**
- Size: `text-sm` (14px)
- Weight: `font-normal` (400)
- Color: `text-foreground` (NOT muted - primary content)
- Spacing: `mt-0.5`
- Usage: Page descriptions and primary content

**Section Headers:**
- Size: `text-sm` (14px) - **UPDATED: Reduced from text-2xl**
- Weight: `font-semibold` (600)
- Color: `text-foreground` (NOT muted)
- Usage: Major sections within pages, form section headers (e.g., "Authentication", "Advanced Options")

**Subsection Titles:**
- Size: `text-sm` (14px) - **UPDATED: Reduced from text-xl**
- Weight: `font-semibold` (600)
- Color: `text-foreground` (NOT muted)
- Usage: Subsections, card headers

**Body Text:**
- Size: `text-sm` (14px) or `text-xs` (12px) - **UPDATED: Reduced from text-base**
- Weight: `font-normal` (400)
- Color: `text-foreground` (NOT muted - primary content)
- Usage: Primary content, descriptions, body text

**Form Labels:**
- Size: `text-xs` (12px)
- Weight: `font-normal` (400)
- Color: `text-muted-foreground` (appropriate use case)
- Usage: Form field labels, metadata labels

**Helper Text:**
- Size: `text-xs` (12px)
- Weight: `font-normal` (400)
- Color: `text-foreground` (NOT muted - primary content)
- Usage: Helper text, descriptions, captions

**Typography Legibility Rules:**
- **MANDATORY**: All primary content (body text, titles, headings, descriptions, table content, navigation) must use `text-foreground` for maximum legibility
- **MANDATORY**: Muted text (`text-muted-foreground`) is ONLY allowed for:
  - Form labels
  - Placeholder text
  - Helper/hint text
  - Disabled states
  - Metadata labels (e.g., "Created", "Last Updated")
- **FORBIDDEN**: Never mute primary content text - it must be clearly legible
- **MANDATORY**: Buttons must use `text-foreground` or high-contrast variants for clear visibility

**Muted Text Usage Rules:**

✅ **Allowed Use Cases (Muted Text):**
- Form Labels: Field labels in forms
- Placeholder Text: Input placeholders
- Helper/Hint Text: Contextual hints (though primary helper text should use `text-foreground`)
- Disabled States: Text in disabled UI elements
- Metadata Labels: Labels for metadata (e.g., "Created", "Last Updated", "Status")

❌ **Forbidden Use Cases (Do NOT Mute):**
- Body text
- Page titles
- Section headings
- Table content
- Navigation labels
- Primary descriptions
- Error messages
- Empty state text
- Button text
- Primary content of any kind

**Button Visibility:**
- **Primary buttons**: `text-primary-foreground` (high contrast)
- **Outline buttons**: `text-foreground` (high contrast)
- **Ghost buttons**: `text-foreground` (high contrast)
- **Secondary buttons**: `text-foreground` (high contrast)
- All buttons must be immediately recognizable as interactive elements
- Button text must never appear faded or disabled unless the button actually is disabled
- Primary actions must stand out clearly from the background

**CSS Variables:**

Light Mode:
```css
--foreground: 207 100% 6%;  /* Rich Black - Primary text */
--muted-foreground: 207 40% 35%;  /* Readable but clearly secondary - for labels, placeholders, helper text, metadata only */
```

Dark Mode:
```css
--foreground: 0 0% 98%;  /* Near white - Primary text */
--muted-foreground: 210 20% 70%;  /* Readable but clearly secondary - for labels, placeholders, helper text, metadata only */
```

**Examples:**

✅ **Correct Usage:**
```typescript
// Page title and description
<h1 className="text-lg font-semibold">Settings</h1>
<p className="mt-0.5 text-sm text-foreground">Manage your tenant settings</p>

// Section header
<h3 className="text-sm font-semibold">Authentication</h3>

// Form label (muted is OK)
<Label className="text-xs text-muted-foreground">Username</Label>

// Body text (NOT muted)
<p className="text-sm text-foreground">This is primary content that must be clearly legible.</p>

// Button (high contrast)
<Button className="text-foreground">Submit</Button>
```

❌ **Incorrect Usage:**
```typescript
// ❌ WRONG - Muted page description
<p className="text-sm text-muted-foreground">Manage your settings</p>

// ❌ WRONG - Muted body text
<p className="text-sm text-muted-foreground">This is primary content.</p>

// ❌ WRONG - Muted button text
<Button className="text-muted-foreground">Submit</Button>

// ❌ WRONG - Muted navigation
<Link className="text-muted-foreground">Dashboard</Link>
```

**Validation Checklist:**
Before finalizing any UI component, verify:
- [ ] All primary text uses `text-foreground` (NOT muted)
- [ ] Muted text is used only for appropriate cases (form labels, placeholders, metadata labels)
- [ ] All buttons are clearly visible with high-contrast text
- [ ] Typography hierarchy is consistent across all pages
- [ ] No UI element looks disabled unless it actually is
- [ ] All text is clearly legible at a glance

**Quality Bar:**
The final typography should feel:
- **Confident**: Text is crisp and clear
- **Professional**: Suitable for enterprise, long-session usage
- **Accessible**: Meets WCAG AA contrast standards
- **Consistent**: Same rules applied across entire application

We optimize for **clarity and usability first**, not aesthetic minimalism.

#### Spacing Scale

**Container Spacing:**
- Page container: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Section spacing: `space-y-6` (24px)
- Card padding: `p-6` (24px)

**Component Spacing:**
- Form fields: `space-y-4` (16px)
- Button groups: `gap-2` (8px)
- List items: `space-y-1` (4px)
- Card content: `space-y-4` (16px)

**Micro Spacing:**
- Icon + text: `gap-2` (8px)
- Inline elements: `gap-1` (4px)
- Tight grouping: `gap-0.5` (2px)

#### Color System

**Semantic Colors:**
- Primary: Brand blue (`#568AFF`)
- Success: Green (for positive actions, success states)
- Warning: Amber (for warnings, caution)
- Error: Red (for errors, destructive actions)
- Muted: Gray (for form labels, placeholders, helper text, metadata labels ONLY - NOT for primary content)
- **Foreground**: High-contrast text color for all primary content (body text, titles, headings, descriptions, table content, navigation)

**Background Hierarchy:**
- Base: `bg-background` (white/black)
- Card: `bg-card` (slightly elevated)
- Muted: `bg-muted` (subtle background)
- Accent: `bg-accent` (interactive states)

#### Component Patterns

**Cards:**
- Border: `border` (1px solid)
- Radius: `rounded-lg` (8px)
- Shadow: `shadow-sm` (subtle elevation)
- Padding: `p-6` (24px)
- Hover: `hover:shadow-md` (elevated on hover)

**Buttons:**
- Primary: Solid background, high contrast
- Secondary: Outlined, medium contrast
- Ghost: Transparent, low contrast
- Destructive: Red variant for dangerous actions
- Sizes: `sm`, `default`, `lg`
- States: Default, hover, active, disabled, loading

**Forms:**
- Label: `text-xs text-muted-foreground` (appropriate use case for muted text)
- Input: `border rounded-md px-3 py-2 h-9`
- Error: Red border + error message below
- Success: Green border (optional)
- Help text: `text-xs text-foreground` (NOT muted - primary content)
- Section headers: `text-sm font-semibold` (e.g., "Authentication", "Advanced Options")

**Tables:**
- Header: `font-semibold text-sm`
- Row: `border-b` (subtle separation)
- Hover: `hover:bg-muted/50`
- Alternating rows: Optional (if needed for readability)

---

### 2.2 Page Layout Templates

#### Standard Page Template

```tsx
<div className="space-y-6">
  <PageHeader
    title="Page Title"
    description="Page description"
    breadcrumbs={[
      { label: "Dashboard", href: "/dashboard" },
      { label: "Current Page" }
    ]}
    actions={
      <Button>
        <Plus className="mr-2 h-4 w-4" />
        Primary Action
      </Button>
    }
  />
  
  {/* Page content */}
  <div className="grid gap-6 md:grid-cols-2">
    {/* Content sections */}
  </div>
</div>
```

#### List Page Template

```tsx
<div className="space-y-6">
  <PageHeader
    title="Resource List"
    description="Manage your resources"
    actions={
      <Button>
        <Plus className="mr-2 h-4 w-4" />
        Create Resource
      </Button>
    }
  />
  
  {/* Filters/Search */}
  <div className="flex gap-4">
    {/* Filter components */}
  </div>
  
  {/* List/Table */}
  <Card>
    <CardContent>
      {/* List content or EmptyState */}
    </CardContent>
  </Card>
</div>
```

#### Detail Page Template

```tsx
<div className="space-y-6">
  <PageHeader
    title="Resource Detail"
    description="View and manage resource"
    breadcrumbs={[
      { label: "Dashboard", href: "/dashboard" },
      { label: "Resources", href: "/resources" },
      { label: "Detail" }
    ]}
    actions={
      <>
        <Button variant="outline">Secondary</Button>
        <Button>Primary</Button>
      </>
    }
  />
  
  {/* Tabs for different sections */}
  <Tabs defaultValue="overview">
    <TabsList>
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="settings">Settings</TabsTrigger>
    </TabsList>
    
    <TabsContent value="overview">
      {/* Overview content */}
    </TabsContent>
  </Tabs>
</div>
```

---

### 2.3 Empty States

**Status:** ✅ Component created (Phase 4)

**Pattern:**
- Icon (64x64px, muted color)
- Title (clear, action-oriented)
- Description (explains why empty, what to do)
- Primary action (clear CTA button)
- Optional secondary action

**Usage:**
- Dashboard (no agents, no activity)
- Screen Agents (no agents created)
- Analytics (no data for period)
- Teams (no team members)
- Settings sections (no data to display)

---

### 2.4 Loading States

**Patterns:**
- **Page-level:** Skeleton loaders matching page structure
- **Component-level:** Spinner with descriptive text
- **Button-level:** Loading spinner + disabled state
- **Table-level:** Skeleton rows

**Implementation:**
- Use `Loader2` from lucide-react for spinners
- Create skeleton components for complex layouts
- Show loading state immediately (no delay)
- Provide context ("Loading agents...", "Fetching data...")

---

### 2.5 Error States

**Patterns:**
- **Inline errors:** Below form fields, red text
- **Page errors:** Alert component with retry action
- **API errors:** Toast notification + inline message
- **Network errors:** Retry button with exponential backoff

**Implementation:**
- Use `Alert` component for page-level errors
- Use `toast` for transient errors
- Always provide retry mechanism
- Log errors for debugging

---

### 2.6 Form Patterns

**Validation:**
- Real-time validation (on blur)
- Clear error messages
- Success indicators (optional)
- Disable submit until valid

**Accessibility:**
- Proper label associations
- ARIA error messages
- Keyboard navigation
- Focus management

**UX:**
- Inline help text
- Progressive disclosure for complex forms
- Auto-save for long forms (optional)
- Clear success feedback

---

## Part III: Implementation Phases

### Phase 1: Foundation ✅ COMPLETE

**Status:** Implemented

**Deliverables:**
- ✅ Application shell (header, sidebar)
- ✅ Navigation structure
- ✅ User menu
- ✅ Organization switcher (basic)
- ✅ Page header component
- ✅ Route group structure `(app)`

**Next Steps:**
- Enhance organization switcher with Better Auth integration
- Add search functionality (future)
- Add notifications UI (future)

---

### Phase 2: Routing & Auth ✅ COMPLETE

**Status:** Implemented

**Deliverables:**
- ✅ Post-authentication routing contract
- ✅ Onboarding integration
- ✅ Auth flow fixes
- ✅ OAuth redirect handling

**Next Steps:**
- Add tenant state detection to routing
- Enhance callback URL handling

---

### Phase 3: Onboarding ✅ COMPLETE

**Status:** Implemented

**Deliverables:**
- ✅ Enhanced welcome step
- ✅ Product overview
- ✅ Progress tracking
- ✅ Mandatory onboarding enforcement

**Next Steps:**
- Add organization creation to onboarding
- Enhance team invite step
- Add product tour implementation

---

### Phase 4: UX Polish ✅ COMPLETE

**Status:** Implemented

**Deliverables:**
- ✅ Empty state component
- ✅ Empty states for Dashboard
- ✅ Empty states for Screen Agents
- ✅ Skeleton loaders for all major pages (Dashboard, Screen Agents, Billing, Settings)
- ✅ Error boundary implementation (integrated into app layout)
- ✅ Toast notification system (sonner wrapper utility)
- ⏳ Form validation enhancements (can be done incrementally)
- ⏳ Accessibility improvements (ongoing)

**Completed:**
- Created `components/ui/skeleton-loaders.tsx` with page-specific skeletons
- Created `components/ui/error-boundary.tsx` with user-friendly error UI
- Created `lib/utils/toast.ts` wrapper for consistent toast usage
- Integrated error boundary into `app/(app)/layout.tsx`
- Integrated skeleton loaders into dashboard component

---

### Phase 5: Design System ✅ COMPLETE

**Status:** Implemented

**Deliverables:**
- ✅ Page header component
- ✅ All pages migrated to use PageHeader
- ✅ Typography standardization (all page titles use `text-3xl font-bold`)
- ✅ Spacing standardization (all pages use `space-y-6` for containers)
- ⏳ Component pattern documentation (can be done incrementally)
- ⏳ Design system documentation (can be done incrementally)

**Completed:**
- Migrated Dashboard, Screen Agents, Analytics, Billing, Settings, Teams pages to use PageHeader
- Standardized typography hierarchy across all pages
- Standardized spacing scale across all pages
- Removed duplicate headers from components (now handled by pages)

---

### Phase 6: Tenant State Awareness ✅ COMPLETE

**Status:** Implemented

**Priority:** HIGHEST (blocks organization features)

**Deliverables:**
1. **Tenant State Detection** ✅
   - Created `lib/utils/tenant-state.ts`
   - Implemented `getTenantState()`, `hasActiveOrganization()`, `getActiveOrganizationId()` functions
   - Uses Better Auth's `listOrganizations` API

2. **Navigation Adaptation** ✅
   - Updated `AppSidebar` and `MobileSidebar` to conditionally render organization-only items
   - Base navigation (Dashboard, Screen Agents, Analytics, Settings) always visible
   - Organization navigation (Billing, Teams) only shown in organization mode
   - Organization switcher only shown in organization mode

3. **Dashboard Adaptation** ✅
   - Personal mode: Shows simplified dashboard with organization creation CTA
   - Organization mode: Shows full analytics dashboard
   - Clear visual distinction between modes

4. **Feature Gating** ✅
   - Billing page shows "Organization Required" message in personal mode
   - Teams page shows "Organization Required" message in personal mode
   - Both pages provide CTA to create organization

5. **Organization Creation Flow** ✅
   - Created `/organization/create` page
   - Redirects to dashboard if user already has organization
   - Updated `CreateOrgForm` to redirect to dashboard after creation
   - Smooth transition from personal to organization mode

**Implementation Complete:**
- All tenant state detection utilities created
- Navigation fully adapted based on tenant state
- Dashboard shows appropriate content for each mode
- Organization-only features properly gated
- Organization creation flow implemented

---

### Phase 7: Settings Architecture ✅ COMPLETE

**Status:** Personal and organization settings implemented

**Priority:** HIGHEST (currently placeholder)

**Deliverables:**
1. **Personal Settings** ✅
   - ✅ Profile management (name, email) - `components/settings/profile/profile-form.tsx`
   - ✅ Authentication settings (password) - `components/settings/authentication/password-form.tsx`
   - ✅ Preferences (theme, language, notifications) - `components/settings/preferences/preferences-form.tsx`
   - ✅ API keys management - `components/settings/api-keys/api-keys-list.tsx`
   - ✅ Settings layout with tabbed navigation - `components/settings/settings-layout.tsx`
   - ✅ API endpoints for profile, password, preferences - `app/api/user/*`

2. **Organization Settings** (Organization Mode Only) ✅ COMPLETE
   - ✅ General settings (name, slug, description) - `components/settings/organization/org-general-form.tsx`
   - ✅ Members management - `components/settings/organization/member-list.tsx`
   - ✅ Member invitation flow - `components/settings/organization/invite-member-dialog.tsx`
   - ✅ Role management (update/remove members) - `app/api/organization/[id]/members/[memberId]/route.ts`
   - ✅ Billing settings page (redirects to /billing) - `app/(app)/settings/organization/billing/page.tsx`
   - ✅ Security settings page (Enterprise features) - `app/(app)/settings/organization/security/page.tsx`
   - ✅ API endpoints: `/api/organization/invite`, `/api/organization/[id]/members/[memberId]`

3. **Settings UX** ✅
   - ✅ Tabbed navigation (horizontal for personal, vertical for organization)
   - ✅ Form patterns with validation
   - ⏳ Modal dialogs for destructive actions
   - ⏳ Confirmation patterns
   - ✅ Success/error feedback (toast notifications)

4. **Settings Components** ✅
   - ✅ Reusable form components
   - ✅ Member list component with role management
   - ✅ Member invitation dialog
   - ⏳ Avatar upload component (can be added incrementally)

**Completed:**
- Created SettingsLayout component with conditional organization settings
- Implemented Profile, Authentication, Preferences, and API Keys pages
- Created API endpoints for user profile and password updates
- Integrated with Better Auth for profile and password management
- Added preferences management with notification preferences integration

---

### Phase 8: Visual Quality Overhaul ✅ COMPLETE

**Status:** Design system implemented, components standardized

**Completed:**
- ✅ Created design system constants (`lib/utils/design-system.ts`) with typography, spacing, component patterns, and semantic colors
- ✅ Standardized typography scale (pageTitle, sectionTitle, subsectionTitle, body, small, tiny)
- ✅ Standardized spacing scale (container, component, and micro spacing values)
- ✅ Standardized component patterns (cards, buttons, forms, tables)
- ✅ Applied consistent visual polish (border radius, shadows, hover states, focus states)
- ✅ Defined semantic color constants for consistent usage

**Priority:** HIGH

**Deliverables:**
1. **Typography Standardization** ✅
   - ✅ Created design system constants (`lib/utils/design-system.ts`)
   - ✅ Defined typography scale (pageTitle, sectionTitle, subsectionTitle, body, small, tiny)
   - ⏳ Migrate all pages to use design system constants

2. **Spacing Standardization** ✅
   - ✅ Created spacing scale constants
   - ✅ Defined container, component, and micro spacing values
   - ⏳ Migrate all pages to use spacing constants

3. **Component Consistency** ✅ PARTIAL
   - ✅ Standardized card patterns (border, rounded-lg, shadow-sm, p-6)
   - ✅ Standardized button patterns
   - ✅ Standardized form patterns
   - ✅ Created AdvancedTable component for table standardization
   - ⏳ Migrate existing tables to AdvancedTable

4. **Visual Polish** ✅
   - ✅ Consistent border radius (rounded-lg)
   - ✅ Consistent shadows (shadow-sm, hover:shadow-md)
   - ✅ Consistent hover states (transition-shadow)
   - ✅ Consistent focus states

5. **Color Refinement** ✅
   - ✅ Semantic color constants defined
   - ✅ Consistent muted text usage
   - ⏳ Verify contrast ratios across all components

**Implementation:**
- Week 1: Typography audit + migration
- Week 2: Spacing audit + migration
- Week 3: Component standardization
- Week 4: Visual polish + color refinement

---

### Phase 9: Enterprise Patterns ✅ COMPLETE

**Status:** All enterprise patterns implemented

**Completed:**
- ✅ Created `AdvancedTable` component with sortable columns, filterable data, bulk actions, and column visibility toggle
- ✅ Created `MultiStepForm` component with progress indicators, step validation, and conditional navigation
- ✅ Created `ConfirmationDialog` component with destructive action variant, loading states, and custom icons
- ✅ Created `BreadcrumbsWithActions` component with overflow handling and action dropdowns
- ✅ Integrated `AdvancedTable` into Screen Agent list (example implementation)
- ✅ Added `Progress` component for multi-step forms
- ✅ All components follow enterprise UX patterns and are production-ready

**Deliverables:**
1. **Advanced Tables** ✅
   - ✅ Sortable columns (`AdvancedTable` component)
   - ✅ Filterable data (search functionality)
   - ✅ Bulk actions (row selection with bulk actions support)
   - ✅ Column visibility toggle
   - ✅ Integrated into Screen Agent list

2. **Advanced Forms** ✅
   - ✅ Multi-step wizards (`MultiStepForm` component)
   - ✅ Progress indicators
   - ✅ Step validation
   - ✅ Conditional navigation
   - ⏳ Conditional fields and field dependencies (can be added incrementally)
   - ⏳ Auto-save (can be added incrementally)

3. **Advanced Modals** ✅
   - ✅ Confirmation dialogs (`ConfirmationDialog` component)
   - ✅ Destructive action variant
   - ✅ Loading states
   - ✅ Custom icons
   - ⏳ Form modals (can use Dialog + form components)
   - ⏳ Full-screen modals (can be added if needed)

4. **Advanced Navigation** ✅
   - ✅ Breadcrumbs with actions (`BreadcrumbsWithActions` component)
   - ✅ Overflow handling for long breadcrumb trails
   - ✅ Action dropdowns on breadcrumb items
   - ⏳ Context menus (can use DropdownMenu component)
   - ⏳ Command palette (future enhancement)
   - ⏳ Keyboard shortcuts (future enhancement)

**Implementation:**
- Ongoing, as needed for specific features

---

## Part IV: Quality Assurance

### 4.1 Design Review Checklist

**Every page must pass:**
- [ ] Uses PageHeader component
- [ ] Consistent typography (design system scale)
- [ ] Consistent spacing (design system scale)
- [ ] Proper empty state (if applicable)
- [ ] Proper loading state
- [ ] Proper error handling
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Accessible (keyboard navigation, ARIA labels)
- [ ] Tenant state aware (if applicable)
- [ ] No orphaned features (all features accessible)

### 4.2 UX Review Checklist

**Every feature must pass:**
- [ ] Clear value proposition
- [ ] Predictable interaction patterns
- [ ] Helpful error messages
- [ ] Success feedback
- [ ] No dead ends
- [ ] Progressive disclosure
- [ ] Consistent with rest of application

### 4.3 Enterprise Readiness Checklist

**Application must have:**
- [ ] Consistent visual language
- [ ] Predictable navigation
- [ ] Clear information hierarchy
- [ ] Professional polish
- [ ] Long-session usability
- [ ] Accessibility compliance (WCAG 2.1 AA)
- [ ] Performance optimization
- [ ] Error resilience

---

## Part V: Success Metrics

### 5.1 User Experience Metrics

- **Navigation:** Users can access any section from anywhere (100%)
- **Onboarding:** 100% of new users complete onboarding
- **Empty States:** Clear next actions on all empty pages (100%)
- **Consistency:** 100% of pages use standardized layouts
- **Accessibility:** WCAG 2.1 AA compliance (100%)

### 5.2 Business Metrics

- **Time to Value:** Users create first Screen Agent within 10 minutes
- **Feature Discovery:** Users discover organization features after upgrade
- **Settings Usage:** Users successfully update settings without support
- **Error Rate:** < 1% of user actions result in errors

### 5.3 Technical Metrics

- **Build Time:** < 30 seconds
- **Page Load Time:** < 2 seconds (first contentful paint)
- **Time to Interactive:** < 3 seconds
- **Lighthouse Score:** > 90 (Performance, Accessibility, Best Practices)

---

## Part VI: Implementation Timeline

### Immediate (Weeks 1-4)
1. **Phase 6:** Tenant State Awareness (Weeks 1-3)
2. **Phase 7:** Settings Architecture (Weeks 1-5)

### Short-term (Weeks 5-8)
3. **Phase 8:** Visual Quality Overhaul (Weeks 5-8)
4. **Phase 4:** Complete UX Polish (Weeks 5-6)

### Medium-term (Weeks 9-12)
5. **Phase 5:** Complete Design System (Weeks 9-10)
6. **Phase 9:** Enterprise Patterns (Ongoing)

---

## Part VII: Maintenance & Evolution

### 7.1 Design System Maintenance

- **Component Library:** Keep shadcn/ui components up to date
- **Documentation:** Maintain design system documentation
- **Pattern Library:** Document new patterns as they emerge
- **Code Review:** Enforce design system usage in PRs

### 7.2 UX Evolution

- **User Feedback:** Regular UX research and feedback collection
- **A/B Testing:** Test new patterns before full rollout
- **Analytics:** Monitor user behavior and friction points
- **Iteration:** Continuous improvement based on data

---

## Appendix A: Component Inventory

### Existing Components (Status)
- ✅ AppHeader
- ✅ AppSidebar
- ✅ PageHeader
- ✅ UserMenu
- ✅ OrganizationSwitcher (basic)
- ✅ EmptyState
- ✅ SkeletonLoaders (Dashboard, Screen Agents, Billing, Settings, Page)
- ✅ ErrorBoundary
- ⏳ SettingsLayout (to be created)

### Required Components (To Create)
- SettingsLayout
- ProfileForm
- PasswordForm
- OAuthConnections
- MemberList
- RoleManagement
- SkeletonLoaders (various)
- ErrorBoundary
- ToastNotification

---

## Appendix B: Reference Implementations

### Settings Pages (Reference)
- **Stripe Dashboard:** Clean, tabbed settings with clear sections
- **GitHub Settings:** Comprehensive, well-organized settings
- **Linear Settings:** Minimal, focused settings experience

### Enterprise UX (Reference)
- **Atlassian:** Comprehensive, scalable enterprise UX
- **Notion:** Flexible, powerful, approachable
- **Vercel:** Clean, developer-focused, professional

---

**Document Status:** ✅ Complete  
**Next Review:** After Phase 6 & 7 completion  
**Owner:** Principal UX Architect  
**Stakeholders:** Engineering, Product, Design

# Screen Agent Platform - Development Guide

**Complete guide for development, testing, and UI/UX standards**

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Environment](#development-environment)
3. [Code Standards](#code-standards)
4. [Logging](#logging)
5. [Testing](#testing)
6. [UI/UX Design System](#uiux-design-system)
7. [Common Tasks](#common-tasks)
8. [Troubleshooting](#troubleshooting)
9. [Authentication Setup](#authentication-setup)

---

## Getting Started

### Prerequisites

- **Node.js**: 18+ (via Corepack)
- **Package Manager**: pnpm (via Corepack)
- **MongoDB**: Local or Atlas
- **Redis**: For background job processing
- **Git**: Version control

### Initial Setup

```bash
# 1. Clone repository
git clone <repository-url>
cd presenter-agent-ui

# 2. Install dependencies
pnpm install

# 3. Copy environment file
cp .env.example .env.local

# 4. Configure environment variables
# Edit .env.local with your MongoDB URI, Better Auth secret, etc.

# 5. Start development server
pnpm dev
```

### Environment Variables

**Required**:
- `MONGODB_URI` - MongoDB connection string
- `BETTER_AUTH_SECRET` - Auth secret (32+ chars)
- `BETTER_AUTH_URL` - Application URL

**Optional**:
- `REDIS_URL` - Redis connection (default: localhost:6379)
- `SOKETI_*` / `NEXT_PUBLIC_PUSHER_*` - Real-time messaging (Soketi on port 3005)
- `S3_*` - S3 storage configuration
- `STRIPE_*` - Stripe billing configuration
- `LIVEKIT_*` - LiveKit video configuration
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key

**See**: `.env.example` for complete list

---

## Development Environment

### Development Server

```bash
# Start Next.js dev server with Turbopack
pnpm dev

# Server runs on http://localhost:3000
```

### Background Workers

```bash
# Start BullMQ workers in separate terminal
pnpm worker

# Workers process:
# - Email jobs (5 workers)
# - Processing jobs (3 workers)
# - Webhook jobs (10 workers)
```

### Real-time messaging (Soketi / Pusher)

Real-time session messages use **Soketi** (Pusher protocol) on **port 3005**, with Next.js triggering events and authorizing channel access.

- **Soketi**: Run `docker compose up` (soketi + redis). Soketi listens on **3005**. Set `SOKETI_APP_ID`, `SOKETI_APP_KEY`, `SOKETI_APP_SECRET`, `SOKETI_HOST` (e.g. `127.0.0.1`), `SOKETI_PORT=3005`, and client vars `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_WS_HOST`, `NEXT_PUBLIC_PUSHER_WS_PORT=3005`. Next.js triggers via the Pusher server SDK; clients use `pusher-js` with `authEndpoint: '/api/pusher/auth'` to subscribe to `private-session-{sessionId}`.
- **Auth**: `POST /api/pusher/auth` receives form data `socket_id` and `channel_name`; we verify the user owns the session and return `pusher.authorizeChannel(socketId, channel)`.
- **Client hook**: `useSessionMessagesWs(sessionId)` connects to Soketi (requires `NEXT_PUBLIC_PUSHER_KEY` and related env).

### Docker Development

```bash
# Start all services (app + worker + redis)
docker compose up

# Start specific service
docker compose up app

# View logs
docker compose logs -f worker

# Stop all services
docker compose down
```

### Database Setup

**MongoDB**:
- Local: Install MongoDB locally or use Docker
- Atlas: Create cluster and get connection string

**Redis**:
- Local: `docker run -d -p 6379:6379 redis:7-alpine`
- Or use Docker Compose (included)

---

## Code Standards

### TypeScript

**Strict Mode**: Enabled with `noUncheckedIndexedAccess`

**Key Rules** (from RULESETS.md):

1. **Error Handling**: Always type catch blocks as `unknown`
   ```typescript
   catch (error: unknown) {
     const message = error instanceof Error ? error.message : String(error)
   }
   ```

2. **Mongoose Operations**: Use `(Model as any).method()` pattern
   ```typescript
   const user = await (User as any).findOne({ email })
   ```

3. **JSON Parsing**: Always type assert `await request.json()`
   ```typescript
   const body = (await request.json()) as { messages?: AgentMessage[] }
   ```

4. **Zod v4**: Use `.refine()` for URL/email validation
   ```typescript
   link: z.string().refine((val) => {
     if (!val) return true
     try { new URL(val); return true } catch { return false }
   }).optional()
   ```

5. **File Extensions**: Always use `.tsx` for files containing JSX

6. **Lazy Initialization**: Use for third-party clients (Stripe, Redis, etc.)

**See**: `.cursorrules` and `RULESETS.md` for complete rules

### Component Structure

**Organization**:
```
components/
├── ComponentName/
│   ├── ComponentName.tsx
│   ├── ComponentName.test.tsx
│   └── ComponentName.stories.tsx
```

**Styling**: Tailwind CSS v4 with CVA variants

### API Routes

**Structure**:
```
app/api/
├── resource/
│   ├── route.ts          # GET, POST
│   └── [id]/
│       ├── route.ts      # GET, PATCH, DELETE
│       └── action/
│           └── route.ts  # POST /api/resource/[id]/action
```

**Pattern**:
```typescript
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  // Get tenant state
  const tenantState = await getTenantState(session.user.id)
  const organizationId = await getActiveOrganizationId()
  
  // Implementation
}
```

---

## Logging

### Logger Utility

**Location**: `lib/utils/logger.ts`

**Usage**:
```typescript
import { logger } from "@/lib/utils/logger"

logger.debug("Debug message", { context })
logger.info("User action", { userId, action })
logger.warn("Warning message", { context })
logger.error("Error occurred", error, { context })
```

### Available Methods

- `logger.debug(message, context?)` - Debug logs (only in development)
- `logger.info(message, context?)` - Informational logs
- `logger.warn(message, context?)` - Warning logs
- `logger.error(message, error?, context?)` - Error logs with error object

### Log Levels

- **DEBUG**: Detailed information for debugging (only shown in development)
- **INFO**: General informational messages (e.g., user actions, successful operations)
- **WARN**: Warning messages for potential issues (e.g., missing configuration)
- **ERROR**: Error messages with error objects (e.g., API failures, exceptions)

### Best Practices

1. **Always Use Logger**: Never use `console.log`, `console.error`, etc.
2. **Structured Logging**: Include context objects with relevant data
3. **Log Levels**: Use appropriate level
4. **Error Logging**: Always include error object for errors
5. **Sensitive Data**: Never log passwords, tokens, or PII
6. **Context Objects**: Include relevant context for debugging

### Sentry Integration

**Error Tracking**:
```typescript
import * as Sentry from "@sentry/nextjs"

Sentry.captureException(error, {
  tags: {
    operation: "create_screen_agent",
    organizationId,
  },
})
```

**Tracing**:
```typescript
Sentry.startSpan(
  {
    op: "ui.click",
    name: "Button Click",
  },
  (span) => {
    span.setAttribute("buttonId", buttonId)
    // Your code
  }
)
```

**Logging**:
```typescript
import * as Sentry from "@sentry/nextjs"

// Always use Sentry.logger, not destructured
Sentry.logger.info("Updated profile", { profileId: 345 })
Sentry.logger.error("Failed to process payment", {
  orderId: "order_123",
  amount: 99.99,
})
```

---

## Testing

### Test Types

**Unit Tests** (Vitest):
- Component testing with React Testing Library
- Function testing
- Location: `*.test.{ts,tsx}`

**E2E Tests** (Playwright):
- Complete user flows
- Location: `e2e/*.spec.ts`

**Component Tests** (Storybook):
- Component stories and visual testing
- Location: `*.stories.tsx`

### Running Tests

```bash
# Unit tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage

# E2E tests (headless)
pnpm e2e:headless

# E2E tests (UI)
pnpm e2e:ui
```

### Test Structure

**Unit Test Example**:
```typescript
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Button } from "@/components/ui/button"

describe("Button", () => {
  it("renders correctly", () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText("Click me")).toBeInTheDocument()
  })
})
```

**E2E Test Example**:
```typescript
import { test, expect } from "@playwright/test"

test("user can create screen agent", async ({ page }) => {
  await page.goto("/screen-agents")
  await page.click("text=Create Screen Agent")
  // ... test steps
})
```

### Test Automation Framework

**Unit Tests**:
- Framework: Vitest + React Testing Library
- Coverage Target: 80%+ for critical paths

**Integration Tests**:
- Framework: Vitest + Supertest (for API routes)
- Location: `lib/__tests__/` and `app/api/__tests__/`

**E2E Tests**:
- Framework: Playwright
- Location: `e2e/`

### Testing Strategy

**Testing Levels**:
1. **Unit Tests**: Individual components and functions
2. **Integration Tests**: API endpoints and database operations
3. **E2E Tests**: Complete user flows
4. **Manual Tests**: UI/UX, edge cases, exploratory testing
5. **Performance Tests**: Load, stress, and scalability testing
6. **Security Tests**: Authentication, authorization, data protection

**Test Status Legend**:
- ⬜ **Not Started**: Test not yet created/executed
- 🔄 **In Progress**: Test currently being developed/executed
- ✅ **Passed**: Test passed successfully
- ❌ **Failed**: Test failed (requires fix)
- ⚠️ **Blocked**: Test blocked by dependencies
- ⏭️ **Skipped**: Test skipped (optional/not applicable)

**Priority Levels**:
- **P0 (Critical)**: Must pass for release - core functionality
- **P1 (High)**: Important features - should pass for release
- **P2 (Medium)**: Nice-to-have features - can be deferred
- **P3 (Low)**: Edge cases and polish - can be deferred

### Comprehensive Test Coverage

See `docs/API_REFERENCE.md` for detailed test cases organized by feature:
- User Onboarding Flow
- Screen Agent Creation & Management
- Presentation Session Flow
- Knowledge Management
- Analytics & Insights
- Billing & Usage Flow
- Multi-Tenancy & Organizations
- Team Management (Enterprise)
- Platform Administration
- API Endpoints
- Integration & External Services
- Performance & Scalability
- Security & Compliance
- User Experience & Accessibility

---

## UI/UX Design System

### Component Library

**Shadcn UI** - 438+ components available via MCP server. All components are copy-paste ready and customizable.

**Access Methods**:
- **MCP Server**: Use `mcp_presenter-agent-ui-shadcn_*` tools to explore, view, and get examples
- **CLI**: `pnpm dlx shadcn@latest add [component-name]`
- **Registry**: [ui.shadcn.com](https://ui.shadcn.com)

### Typography Hierarchy

**Core Principle**: We do not mute primary content text. All primary content must be clearly legible and use high-contrast colors.

| Element | Size | Weight | Color | Usage |
|---------|------|--------|-------|-------|
| **Page Title** | `text-lg` (18px) | `font-semibold` (600) | `text-foreground` | Main page headings (one per page) |
| **Page Description** | `text-sm` (14px) | `font-normal` (400) | `text-foreground` | Page descriptions with `mt-0.5` |
| **Section Header** | `text-sm` (14px) | `font-semibold` (600) | `text-foreground` | Major sections |
| **Body Text** | `text-sm` (14px) or `text-xs` (12px) | `font-normal` (400) | `text-foreground` | Primary content |
| **Form Label** | `text-xs` (12px) | `font-normal` (400) | `text-muted-foreground` | Field labels |
| **Helper Text** | `text-xs` (12px) | `font-normal` (400) | `text-foreground` | Helper text (NOT muted) |

**Muted Text Usage (Allowed Only For)**:
- ✅ Form labels (`text-muted-foreground`)
- ✅ Placeholder text
- ✅ Disabled states
- ✅ Metadata labels (e.g., "Created", "Last Updated")

**Forbidden Use Cases**:
- ❌ Body text
- ❌ Page titles
- ❌ Section headings
- ❌ Table content
- ❌ Navigation labels
- ❌ Primary descriptions
- ❌ Error messages
- ❌ Empty state text
- ❌ Button text

### Spacing Scale

**Container Spacing**:
- Page container: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Section spacing: `space-y-6` (24px)
- Card padding: `pt-6` (never full padding - use `CardContent` with `pt-6`)

**Component Spacing**:
- Form fields: `space-y-4` (16px) or `space-y-2` (8px)
- Button groups: `gap-2` (8px) or `gap-1` (4px)
- List items: `space-y-1` (4px)
- Card content: `space-y-4` (16px) or `space-y-3` (12px)

### Color System

**Semantic Colors**:
- **Primary**: Brand blue, buttons, links (`#568AFF`)
- **Success**: Positive actions, success states
- **Warning**: Warnings, caution
- **Error**: Errors, destructive actions
- **Muted**: Form labels, placeholders, metadata ONLY
- **Foreground**: All primary content (high contrast)

**Background Hierarchy**:
- Base: `bg-background` (white/black)
- Card: `bg-muted/30` (subtle background, not white)
- Muted: `bg-muted` (subtle background)
- Accent: `bg-accent` (interactive states)

### Component Patterns

**Cards**:
- Background: `bg-muted/30` (not white)
- Padding: `pt-6` via `CardContent` (never full padding)
- Structure: Prefer `Card` + `CardContent` over `CardHeader` + `CardContent`
- Headers: Inline with `text-sm font-semibold` instead of `CardTitle`

**Buttons**:
- Primary: Solid background, high contrast (`size="sm"` for app)
- Secondary: Outlined variant (`size="sm"`)
- Destructive: Red variant for dangerous actions
- Sizes: `sm` (default in app), `default`, `lg` (only for empty states)
- Loading: Use `Spinner` from `@shadcn/spinner`, not `Loader2`

**Forms**:
- Label: `text-xs text-muted-foreground`
- Input: `h-9` height (never default or `h-10`)
- Textarea: `text-sm` with proper rows
- Error: Red border + error message below
- Help text: `text-xs text-foreground` (NOT muted)

**Tables**:
- Header: `font-semibold text-sm`
- Row: `border-b` (subtle separation)
- Hover: `hover:bg-muted/50`
- Pagination: Always required for list views

### Page Layout Templates

**Standard Page Template**:
```tsx
<div className="space-y-6">
  {/* Page Header */}
  <div className="space-y-0.5">
    <h1 className="text-lg font-semibold">Page Title</h1>
    <p className="mt-0.5 text-sm text-foreground">Page description</p>
  </div>
  
  {/* Page content */}
  <div className="space-y-6">
    {/* Content sections */}
  </div>
</div>
```

**List Page Template**:
```tsx
<div className="space-y-6">
  {/* Page Header with Actions */}
  <div className="flex items-center justify-between">
    <div className="space-y-0.5">
      <h1 className="text-lg font-semibold">Resource List</h1>
      <p className="mt-0.5 text-sm text-foreground">Manage your resources</p>
    </div>
    <Button size="sm">
      <Plus className="mr-2 h-3.5 w-3.5" />
      Create Resource
    </Button>
  </div>
  
  {/* Table with Pagination */}
  <Card className="bg-muted/30">
    <CardContent className="pt-6">
      <Table>
        {/* Table content */}
      </Table>
      <Pagination />
    </CardContent>
  </Card>
</div>
```

### Universal Patterns

**All List Views**:
- Table layout (not cards)
- Pagination required
- Row click for primary navigation
- Actions in dropdown menu
- Status badges with clear hierarchy

**All Detail Views**:
- Tab-based navigation (single-level)
- Overview tab with key metrics
- Settings/Configuration tab
- Activity/History tab when applicable
- No card wrappers on tab content

**All Forms**:
- Basic info first
- Primary configuration next
- Additional options after
- Advanced options in accordion
- Section separators between major groups

**All Empty States**:
- Use `Empty` component
- Clear, actionable messaging
- Primary CTA with `size="lg"` button
- No marketing copy or illustrations

### Quality Standards

**Target Quality**: Enterprise SaaS (Stripe, Linear, Atlassian, Notion)

**Visual Quality**:
- Subtle, calm, credible enterprise-grade aesthetics
- High information density (not spacious)
- Professional polish that signals reliability

**Interaction Design**:
- Predictable, consistent patterns
- Clear visual affordances (buttons look like buttons)
- Smooth micro-interactions

**Information Architecture**:
- Clear hierarchy, high signal-to-noise ratio
- Scalable to hundreds/thousands of items
- No visual noise or decoration

**Usability**:
- Long-session usability (8+ hour workdays)
- Accessible (WCAG AA contrast standards)
- Fast scanning and navigation

### Compliance Checklist

**Before finalizing any page, validate**:

**Typography**:
- [ ] Page title uses `text-lg font-semibold` (not larger)
- [ ] Page description uses `text-sm text-foreground` with `mt-0.5`
- [ ] Section headers use `text-sm font-semibold`
- [ ] All primary text uses `text-foreground` (NOT muted)
- [ ] Muted text only for form labels, placeholders, metadata

**Layout**:
- [ ] Sections use `space-y-6` spacing
- [ ] Form fields use `space-y-4` or `space-y-2`
- [ ] Cards use `bg-muted/30` background
- [ ] Cards use `CardContent` with `pt-6` (not full padding)

**Components**:
- [ ] All buttons use `size="sm"` (except empty state CTAs)
- [ ] All inputs use `h-9` height
- [ ] All labels use `text-xs text-muted-foreground`
- [ ] Loading states use `Spinner` (not `Loader2`)
- [ ] Empty states use `Empty` component

**Shadcn Usage**:
- [ ] Using Shadcn components (not custom duplicates)
- [ ] Components customized via className (not source modification)
- [ ] Examples referenced from Shadcn registry

---

## Common Tasks

### Adding a New API Route

1. Create route file: `app/api/resource/route.ts`
2. Add authentication check
3. Add tenant state handling
4. Implement handler
5. Add error handling with Sentry
6. Add tests

### Adding a New Component

1. Create component file: `components/ComponentName/ComponentName.tsx`
2. Follow UI/UX guidelines from this document
3. Add tests: `ComponentName.test.tsx`
4. Add stories: `ComponentName.stories.tsx`

### Adding a New Database Model

1. Create model file: `lib/models/ModelName.ts`
2. Define TypeScript interface
3. Define Mongoose schema
4. Add indexes
5. Export model

### Adding Environment Variables

1. Add to `env.mjs` with Zod validation
2. Add to `runtimeEnv` in `env.mjs`
3. Add to `.env.example` with description
4. Document in relevant guide

---

## Troubleshooting

### Build Errors

**Type Errors**:
- Check RULESETS.md for common patterns
- Ensure all catch blocks type errors as `unknown`
- Check Mongoose operations use `(Model as any).method()`

**Import Errors**:
- Check file extensions (`.tsx` for JSX files)
- Verify absolute imports from `@/` prefix
- Check `tsconfig.json` paths configuration

### Runtime Errors

**Database Connection**:
- Verify `MONGODB_URI` is correct
- Check MongoDB is running
- Verify network connectivity

**Redis Connection**:
- Verify `REDIS_URL` is correct
- Check Redis is running
- Verify workers can connect

**S3 Upload Errors**:
- Verify S3 environment variables
- Check bucket permissions
- Verify presigned URL generation

### Development Issues

**Hot Reload Not Working**:
- Restart dev server
- Clear `.next` directory
- Check for syntax errors

**Type Errors in IDE**:
- Restart TypeScript server
- Run `pnpm build` to check for errors
- Clear TypeScript cache

---

## Authentication Setup

### Google OAuth Setup

This guide provides detailed steps to set up Google OAuth authentication.

#### Prerequisites

- A Google account (Gmail, Google Workspace, etc.)
- Access to Google Cloud Console (console.cloud.google.com)
- Your application's callback URL (typically `https://yourdomain.com/api/auth/callback/google`)

#### Step-by-Step Instructions

**Step 1: Access Google Cloud Console**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Create a new project if needed

**Step 2: Enable Google+ API**

1. Navigate to **APIs & Services** > **Library**
2. Search for "Google+ API" or "People API"
3. Click on the API and click **"Enable"**

**Note**: For newer projects, Google recommends using the **People API** instead of Google+ API.

**Step 3: Configure OAuth Consent Screen**

1. Navigate to **APIs & Services** > **OAuth consent screen**
2. Choose user type:
   - **External** (for users outside your organization) - Recommended
   - **Internal** (only for Google Workspace domains)
3. Fill in required information:
   - App name
   - User support email
   - Application home page
   - Application privacy policy link (required for production)
4. Add scopes:
   - `email`
   - `profile`
   - `openid`
5. Add test users (for development)
6. Save and continue

**Step 4: Create OAuth 2.0 Credentials**

1. Navigate to **APIs & Services** > **Credentials**
2. Click **"Create Credentials"** > **"OAuth client ID"**
3. Choose application type: **Web application**
4. Configure:
   - **Name**: Screen Agent Platform (or your app name)
   - **Authorized JavaScript origins**: 
     - `http://localhost:3000` (development)
     - `https://yourdomain.com` (production)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/auth/callback/google` (development)
     - `https://yourdomain.com/api/auth/callback/google` (production)
5. Click **"Create"**
6. Copy the **Client ID** and **Client Secret**

**Step 5: Configure Environment Variables**

Add to your `.env.local`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

**Step 6: Test OAuth Flow**

1. Start your development server
2. Navigate to login page
3. Click "Sign in with Google"
4. Complete OAuth flow
5. Verify user is created and logged in

#### Troubleshooting

**"redirect_uri_mismatch" Error**:
- Verify redirect URI in Google Console matches exactly
- Check for trailing slashes
- Ensure protocol (http/https) matches

**"access_denied" Error**:
- Check OAuth consent screen is configured
- Verify test users are added (for development)
- Check scopes are properly configured

**User Not Created**:
- Check Better Auth configuration
- Verify MongoDB connection
- Check application logs for errors

---

## Related Documentation

- **Architecture**: `docs/ARCHITECTURE.md`
- **API Reference**: `docs/API_REFERENCE.md`
- **Brand Guidelines**: `brand/brand.md`

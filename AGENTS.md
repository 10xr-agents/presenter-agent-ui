# AGENTS.md

This file provides guidance to Cursor AI agents when working with code in this repository.

## Project Overview

**Modern Next.js Boilerplate** - A production-ready Next.js starter with authentication, MongoDB, background job processing, and modern tooling. Built with Next.js 16, React 19, and Tailwind CSS v4.

### What This Boilerplate Provides

| Feature | Technology | Description |
|---------|------------|-------------|
| **Authentication** | Better Auth | Email/password + Google OAuth with session management |
| **Database** | MongoDB | Type-safe operations with singleton connection pattern |
| **Job Queues** | BullMQ + Redis | Reliable background job processing with retries |
| **UI Components** | shadcn/ui | Pre-built accessible components with Radix UI |
| **Styling** | Tailwind CSS v4 | Utility-first CSS with CVA variants |
| **File Uploads** | Uploadthing | Easy file upload handling |
| **Email** | Resend | Transactional email service |
| **Testing** | Vitest + Playwright | Unit, integration, and E2E testing |
| **Containerization** | Docker | Development environment with Redis |

### Tech Stack
- **Framework**: Next.js 16 (App Router), React 19
- **Styling**: Tailwind CSS v4, shadcn/ui, Radix UI
- **Auth**: Better Auth with MongoDB adapter
- **Database**: MongoDB (Atlas recommended)
- **Job Queue**: BullMQ with Redis
- **Testing**: Vitest, Playwright, Storybook
- **Package Manager**: pnpm (via Corepack)

## Common Commands

```bash
# Development
pnpm dev              # Start dev server with Turbopack
pnpm build            # Production build
pnpm start            # Start production server
pnpm analyze          # Build with bundle analyzer

# Background Workers
pnpm worker           # Start background job workers

# Docker (includes Redis)
docker compose up     # Start all services (app + worker + redis)
docker compose up -d  # Start in detached mode

# Testing
pnpm test             # Run Vitest unit tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage
pnpm e2e:headless     # Run Playwright E2E tests
pnpm e2e:ui           # Run Playwright with UI

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Run ESLint with auto-fix
pnpm prettier         # Check formatting
pnpm prettier:fix     # Fix formatting

# Storybook
pnpm storybook        # Start Storybook on port 6006
pnpm build-storybook  # Build static Storybook
```

## Architecture

### Directory Structure
```
app/                    # Next.js App Router
├── (auth)/             # Auth route group (login, register, verify-email)
├── api/                # API routes
│   ├── auth/           # Better Auth API
│   ├── health/         # Health check endpoint
│   └── uploadthing/    # File upload API
├── layout.tsx          # Root layout
└── page.tsx            # Home page

components/
├── auth/               # Auth components (login-form, register-form, oauth-buttons)
├── providers/          # React providers (auth-provider)
├── ui/                 # shadcn/ui components
├── Button/             # Example component with tests and stories
└── Tooltip/            # Example component

lib/
├── auth/               # Better Auth configuration
├── db/                 # MongoDB connection and utilities
├── queue/              # BullMQ job queue system
│   ├── redis.ts        # Redis connection singleton
│   ├── types.ts        # Job type definitions
│   ├── queues.ts       # Queue definitions and helpers
│   ├── workers.ts      # Worker processors
│   └── index.ts        # Barrel export
├── types/              # TypeScript type definitions
├── uploadthing/        # Uploadthing configuration
└── utils/              # Utility functions

scripts/
└── worker.ts           # Background worker entry point

e2e/                    # Playwright end-to-end tests
brand/                  # Brand guidelines and assets
public/
├── logos/              # Logo variations (9 SVG files)
└── icons/              # App icons and patterns
```

### Key Patterns

**Component Structure**: Components are organized in folders with co-located files:
- `ComponentName.tsx` - Main component
- `ComponentName.test.tsx` - Vitest unit tests
- `ComponentName.stories.tsx` - Storybook stories

**Styling**: Uses Tailwind CSS v4 with:
- `class-variance-authority` (CVA) for component variants
- `tailwind-merge` for className merging

**Environment Variables**: Managed via T3 Env (`env.mjs`) with Zod validation. Add new env vars there with schema definitions.

**Health Checks**: Available at `/healthz`, `/health`, `/ping`, or `/api/health` (all route to the same endpoint).

### Authentication

Better Auth is pre-configured with:
- Email/password authentication
- Google OAuth (optional)
- Email verification via Resend
- MongoDB session storage

Protected routes are configured in `proxy.ts`. Add routes to `protectedRoutes` array.

### Database

This boilerplate uses a **hybrid database approach**:

**Prisma (Better Auth)**:
- Managed in `lib/db/prisma.ts`
- Used exclusively by Better Auth for authentication
- Schema generated via Better Auth CLI
- Type-safe with auto-generated Prisma client

**Mongoose (Application Features)**:
- Connection managed in `lib/db/mongoose.ts`
- Used for AI agents, custom features, and application data
- Models defined in `lib/models/`
- Rich schema validation and middleware support

Both use the same MongoDB database (Atlas recommended).

**Note**: See [UPGRADE_GUIDE.md](UPGRADE_GUIDE.md) for detailed setup instructions and architecture overview.

### Background Job Processing

BullMQ + Redis for reliable background job processing. Pre-configured queues:

| Queue | Purpose | Concurrency |
|-------|---------|-------------|
| `email` | Email sending | 5 workers |
| `processing` | Long-running tasks | 3 workers |
| `webhooks` | External HTTP calls | 10 workers |

**Adding a job to a queue:**
```typescript
import { queueEmail, queueProcessing, queueWebhook } from "@/lib/queue"

// Queue an email
await queueEmail({
  to: "user@example.com",
  subject: "Welcome!",
  body: "<p>Thanks for signing up</p>",
})

// Queue a processing task
await queueProcessing({
  userId: "user-123",
  taskId: "task-456",
  payload: { /* your data */ },
})

// Queue a webhook
await queueWebhook({
  url: "https://api.example.com/webhook",
  method: "POST",
  body: { event: "user.created" },
})
```

**Running workers:**
```bash
# Development (separate terminal)
pnpm worker

# With Docker (automatically runs worker service)
docker compose up
```

**Custom job types**: Add new job types in `lib/queue/types.ts` and processors in `lib/queue/workers.ts`.

### Testing
- Unit tests: Vitest with React Testing Library (files: `*.test.{ts,tsx}`)
- E2E tests: Playwright (in `e2e/` directory)
- Component testing: Storybook with test-runner

### TypeScript
Strict mode enabled with `noUncheckedIndexedAccess`. Uses ts-reset for enhanced type safety. Absolute imports configured from project root.

## Common Build Issues and Fixes

**⚠️ CRITICAL: Read this section before making changes that could break the build.**

This section documents all build issues encountered and their permanent fixes. These patterns must be followed to prevent regression.

### 1. Next.js 16 Middleware Migration

**Issue**: Next.js 16 deprecated `middleware.ts` in favor of `proxy.ts`.

**Error**: 
```
Warning: The middleware.ts file is deprecated. Use proxy.ts instead.
```

**Fix**: 
- Rename `middleware.ts` → `proxy.ts`
- Change `export function middleware()` → `export function proxy()`
- Update all references

**Files Affected**: `proxy.ts` (formerly `middleware.ts`)

**Prevention**: Always use `proxy.ts` for Next.js 16+ projects. Never create `middleware.ts`.

---

### 2. Prisma Client Generation Order

**Issue**: Circular dependency - Better Auth CLI needs Prisma client, but Prisma needs Better Auth schema.

**Error**:
```
Module '"@prisma/client"' has no exported member 'PrismaClient'.
Cannot find module '.prisma/client/default'
```

**Fix**: 
1. Create minimal placeholder Prisma schema with at least one model
2. Generate Prisma client: `npx prisma generate`
3. Generate Better Auth schema: `npx @better-auth/cli@latest generate`
4. Regenerate Prisma client: `npx prisma generate`

**Files Affected**: 
- `prisma/schema.prisma` - Must have placeholder model before Better Auth generation
- `lib/db/prisma.ts` - Uses lazy/conditional import to allow CLI to read config

**Code Pattern**:
```typescript
// lib/db/prisma.ts - Lazy import pattern
let PrismaClient: any
let prismaInstance: any

try {
  const prismaModule = require("@prisma/client")
  PrismaClient = prismaModule.PrismaClient
  // ... initialize
} catch (error) {
  // Prisma client not generated yet - expected during initial setup
  prismaInstance = null
}
```

**Prevention**: 
- Always run Prisma generation in correct order (see README)
- Never delete placeholder model before Better Auth generation
- Keep Prisma import lazy/conditional in auth config

---

### 3. Mongoose Model Type Errors

**Issue**: TypeScript cannot infer Mongoose model method signatures, causing "This expression is not callable" errors.

**Error**:
```
Type error: This expression is not callable.
Each member of the union type has signatures, but none of those signatures are compatible.
```

**Fix**: Add `as any` type assertion to all Mongoose model method calls.

**Files Affected** (15+ files):
- `lib/audit/logger.ts` - `AuditLog.create()`, `AuditLog.find()`
- `lib/notifications/manager.ts` - `Notification.create()`, `Notification.find()`, `Notification.findOneAndUpdate()`, `Notification.countDocuments()`
- `lib/usage/tracker.ts` - `Usage.create()`, `Usage.find()`
- `lib/templates/manager.ts` - `Template.create()`, `Template.find()`, `Template.findById()`, `Template.findByIdAndUpdate()`
- `lib/webhooks/manager.ts` - `Webhook.find()`, `Webhook.findByIdAndUpdate()`
- `lib/onboarding/flow.ts` - `Onboarding.findOne()`, `Onboarding.create()`
- `lib/features/flags.ts` - `FeatureFlag.findOne()`, `FeatureFlag.find()`
- `lib/rate-limit/middleware.ts` - `RateLimit.findOne()`, `RateLimit.create()`
- `lib/search/engine.ts` - `SearchIndex.findOneAndUpdate()`, `SearchIndex.find()`, `SearchIndex.deleteOne()`
- `lib/activity/feed.ts` - All ActivityLog methods
- `lib/api-keys/manager.ts` - All ApiKey methods
- `lib/cost/tracker.ts` - `Cost.create()`, `Cost.find()`
- `app/api/webhooks/stripe/route.ts` - `Subscription.findOneAndUpdate()`
- `app/billing/page.tsx` - `Subscription.findOne()`

**Code Pattern**:
```typescript
// ❌ WRONG - Causes type error
const notification = await Notification.create({ ... })

// ✅ CORRECT - Use type assertion
const notification = await (Notification as any).create({ ... })
```

**Prevention**: 
- Always use `(Model as any).method()` pattern for Mongoose operations
- Apply to: `create()`, `find()`, `findOne()`, `findById()`, `findOneAndUpdate()`, `findByIdAndUpdate()`, `countDocuments()`, `deleteOne()`

---

### 4. Zod v4 API Changes

**Issue**: Zod v4 changed API signatures - `.url()`, `.email()`, and `z.record()` require different arguments.

**Error**:
```
Type error: Expected 2-3 arguments, but got 1.
```

**Fix**: 

#### 4a. URL Validation
```typescript
// ❌ WRONG - Zod v4 doesn't support .url() on strings
link: z.string().url().optional()

// ✅ CORRECT - Use refine with URL validation
link: z.string().refine(
  (val) => {
    if (!val) return true
    try {
      new URL(val)
      return true
    } catch {
      return false
    }
  },
  { message: "Invalid URL format" }
).optional()
```

#### 4b. Email Validation
```typescript
// ❌ WRONG
EMAIL_FROM: z.string().email().optional()

// ✅ CORRECT
EMAIL_FROM: z.string().refine(
  (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
  "Invalid email"
).optional()
```

#### 4c. Record Type
```typescript
// ❌ WRONG - Zod v4 requires key type
metadata: z.record(z.any()).optional()

// ✅ CORRECT - Specify key type
metadata: z.record(z.string(), z.any()).optional()
```

**Files Affected**:
- `lib/utils/validation.ts` - All schema definitions
- `env.mjs` - All environment variable validations

**Prevention**: 
- Always use `.refine()` for URL/email validation in Zod v4
- Always specify key type in `z.record(keyType, valueType)`
- Check Zod version before using validation methods

---

### 5. JSON Parsing Type Assertions

**Issue**: `request.json()` and `response.json()` return `unknown`, causing type errors when destructuring.

**Error**:
```
Type error: Property 'messages' does not exist on type 'unknown'.
```

**Fix**: Add explicit type assertions to all JSON parsing calls.

**Files Affected**:
- All API routes: `app/api/**/route.ts`
- Client components: `components/**/*.tsx`
- Hooks: `hooks/**/*.ts`

**Code Pattern**:
```typescript
// ❌ WRONG
const body = await request.json()
const { messages } = body // Error: Property doesn't exist on unknown

// ✅ CORRECT - Type assertion
const body = (await request.json()) as {
  messages?: AgentMessage[]
  task?: string
  organizationId?: string
}
const { messages } = body // Works correctly
```

**Prevention**: 
- Always type assert `await request.json()` and `await response.json()`
- Define interface/type for expected JSON structure
- Apply to all API routes and fetch calls

---

### 6. Better Auth Import Paths

**Issue**: Incorrect import path for Better Auth organization client plugin.

**Error**:
```
Module not found: Can't resolve 'better-auth/react/plugins'
```

**Fix**: Use correct import path.

**Code Pattern**:
```typescript
// ❌ WRONG
import { organizationClient } from "better-auth/react/plugins"

// ✅ CORRECT
import { organizationClient } from "better-auth/client/plugins"
```

**Files Affected**: `lib/auth/client.ts`

**Prevention**: Always use `better-auth/client/plugins` for client-side plugins.

---

### 7. JSX in TypeScript Files

**Issue**: JSX syntax in `.ts` files causes parsing errors.

**Error**:
```
Parsing ecmascript source code failed
```

**Fix**: Rename files with JSX to `.tsx` extension.

**Files Affected**: 
- `lib/analytics/client.ts` → `lib/analytics/client.tsx`

**Prevention**: 
- Always use `.tsx` for files containing JSX
- Never put JSX in `.ts` files

---

### 8. Mongoose Document Property Conflicts

**Issue**: Interface property name conflicts with Mongoose Document interface.

**Error**:
```
Interface 'ICost' incorrectly extends interface 'Document'.
Types of property 'model' are incompatible.
```

**Fix**: Use `Omit` to exclude conflicting properties.

**Code Pattern**:
```typescript
// ❌ WRONG
export interface ICost extends mongoose.Document {
  model: string // Conflicts with Document.model
  // ...
}

// ✅ CORRECT
export interface ICost extends Omit<mongoose.Document, "model"> {
  model: string // Now safe
  // ...
}
```

**Files Affected**: `lib/cost/tracker.ts`

**Prevention**: Use `Omit<mongoose.Document, "conflictingProperty">` when interface properties conflict with Document.

---

### 9. NextRequest IP Address

**Issue**: `NextRequest` doesn't have `.ip` property in Next.js 16.

**Error**:
```
Type error: Property 'ip' does not exist on type 'NextRequest'.
```

**Fix**: Extract IP from headers.

**Code Pattern**:
```typescript
// ❌ WRONG
const ip = req.ip

// ✅ CORRECT
const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || 
           req.headers.get("x-real-ip") || 
           "anonymous"
```

**Files Affected**: `lib/rate-limit/middleware.ts`

**Prevention**: Always extract IP from headers, never use `req.ip`.

---

### 10. Stripe API Version

**Issue**: Outdated Stripe API version causes type errors.

**Error**:
```
Type error: Type '"2024-12-18.acacia"' is not assignable to type '"2025-02-24.acacia"'
```

**Fix**: Update to latest API version.

**Code Pattern**:
```typescript
// ✅ CORRECT
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
})
```

**Files Affected**: `lib/billing/stripe.ts`

**Prevention**: Check Stripe API version compatibility when updating Stripe SDK.

---

### 11. Missing Type Declarations

**Issue**: Third-party library missing TypeScript types.

**Error**:
```
Could not find a declaration file for module 'js-yaml'.
```

**Fix**: Create type declaration file.

**Files Affected**: `js-yaml.d.ts` (created)

**Code Pattern**:
```typescript
// js-yaml.d.ts
declare module "js-yaml" {
  export function load<T = any>(str: string, options?: any): T
  export function dump(obj: any, options?: any): string
  export function safeLoad<T = any>(str: string, options?: any): T
  export function safeDump(obj: any, options?: any): string
  const yaml: {
    load: typeof load
    dump: typeof dump
    safeLoad: typeof safeLoad
    safeDump: typeof safeDump
  }
  export default yaml
}
```

**Prevention**: Create `.d.ts` files for libraries without types.

---

### 12. Reduce Function Type Annotations

**Issue**: TypeScript cannot infer types in reduce callbacks.

**Error**:
```
Type error: Parameter 'sum' implicitly has an 'any' type.
```

**Fix**: Add explicit type annotations.

**Code Pattern**:
```typescript
// ❌ WRONG
const total = items.reduce((sum, item) => sum + item.value, 0)

// ✅ CORRECT
const total = items.reduce((sum: number, item: any) => sum + item.value, 0)
```

**Files Affected**: 
- `lib/usage/tracker.ts`
- `lib/cost/tracker.ts`

**Prevention**: Always type reduce callback parameters explicitly.

---

### 13. Better Auth Secret During Build

**Issue**: Better Auth requires secret during build, but env vars may not be available.

**Error**:
```
[BetterAuthError]: You are using the default secret. Please set BETTER_AUTH_SECRET
```

**Fix**: Provide fallback secret for build (development only).

**Code Pattern**:
```typescript
// ✅ CORRECT - Allow build without env vars
secret: process.env.BETTER_AUTH_SECRET || "development-secret-change-in-production-min-32-chars",
```

**Files Affected**: `lib/auth/auth.ts`

**Prevention**: Always provide fallback for Better Auth secret during build.

---

### 14. Template Interface Mismatch

**Issue**: `createTemplate` function doesn't accept all properties that Mongoose model expects.

**Error**:
```
Object literal may only specify known properties, and 'featured' does not exist in type...
```

**Fix**: Either add properties to function signature or use type assertion.

**Code Pattern**:
```typescript
// ✅ CORRECT - Use type assertion for additional properties
return (Template as any).create({
  ...data,
  featured: false as any,
  usageCount: 0 as any,
})
```

**Files Affected**: 
- `lib/templates/manager.ts`
- `scripts/seed.ts`

**Prevention**: Ensure function signatures match model requirements or use type assertions.

---

### Build Checklist

Before committing changes, verify:

- [ ] No `middleware.ts` file exists (use `proxy.ts`)
- [ ] All Mongoose model calls use `(Model as any).method()` pattern
- [ ] All `request.json()` and `response.json()` have type assertions
- [ ] All Zod validations use v4-compatible syntax
- [ ] No JSX in `.ts` files (use `.tsx`)
- [ ] Prisma schema has placeholder model before Better Auth generation
- [ ] Better Auth imports use correct paths
- [ ] IP addresses extracted from headers, not `req.ip`
- [ ] Reduce callbacks have explicit type annotations
- [ ] All environment variable validations use `.refine()` for URLs/emails

---

## Docker Development

The docker-compose setup includes:
- **app**: Next.js development server with hot reloading
- **worker**: Background job processor
- **redis**: Redis server for job queues (persisted data)

```bash
# Start all services
docker compose up

# Start specific service
docker compose up app

# View logs
docker compose logs -f worker

# Stop all services
docker compose down
```

## Brand Assets

Full brand guidelines are in `brand/brand.md`. Key resources:

### Logos (`public/logos/`)
| Background | Full Logo | Icon Only |
|------------|-----------|-----------|
| Dark/Black | logo_1.svg, logo_2.svg | logo_7.svg |
| Light/White | logo_4.svg, logo_5.svg | logo_8.svg |
| Gradient | logo_3.svg, logo_6.svg | logo_9.svg |

### Icons (`public/icons/`)
- `app.svg` - Primary app icon (561x561px, rounded square)
- `app_black_bg.svg` - App icon on black canvas (1080x1080px, for social media)
- `background_icon.svg` - Decorative X pattern for backgrounds (use at 20-30% opacity)

### Brand Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Cornflower Blue | `#568AFF` | Primary brand, buttons, links |
| Green-Blue | `#0665BA` | Secondary, gradient endpoints |
| Rich Black | `#001320` | Text, dark backgrounds |
| Gradient | `#559EFF` → `#0065BA` | Premium elements, CTAs |

### Typography
- **Poppins Semi Bold (600)** - Headlines, navigation, buttons
- **Poppins Regular (400)** - Body text, descriptions
- **Sofia Sans Extra Condensed** - Accent labels only (use sparingly)

## Getting Started

### Local Development
```bash
# 1. Copy environment file
cp .env.example .env.local

# 2. Fill in required values (MongoDB URI, Better Auth secret)

# 3. Install dependencies
pnpm install

# 4. Start Redis (if running workers locally)
docker run -d -p 6379:6379 redis:7-alpine

# 5. Start dev server
pnpm dev

# 6. (Optional) Start workers in another terminal
pnpm worker
```

### Docker Development
```bash
# 1. Copy environment file
cp .env.example .env.local

# 2. Fill in required values

# 3. Start all services
docker compose up
```

## API Routes

| Route | Description |
|-------|-------------|
| `GET /api/health` | Health check endpoint |
| `/api/auth/*` | Better Auth endpoints |
| `/api/uploadthing` | File upload endpoint |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `BETTER_AUTH_SECRET` | Yes | Auth secret (32+ chars) |
| `BETTER_AUTH_URL` | Yes | App URL for auth |
| `REDIS_URL` | No | Redis URL (default: localhost:6379) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth secret |
| `RESEND_API_KEY` | No | Resend email API key |
| `EMAIL_FROM` | No | From email address |
| `UPLOADTHING_TOKEN` | No | Uploadthing API token |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL |

## Additional Documentation

- [README.md](README.md) - **Complete setup and usage guide** - Installation, configuration, and how to use all features
- [ARCHITECTURE.md](ARCHITECTURE.md) - **Architecture documentation** - Database architecture, multi-tenancy, AI agents, billing, analytics, and system design
- [CLAUDE.md](CLAUDE.md) - **Claude Code guidance** - Similar documentation for Claude AI
- [GEMINI.md](GEMINI.md) - **Gemini/Antigravity guidance** - Similar documentation for Gemini AI
- [brand/brand.md](brand/brand.md) - Complete brand guidelines and assets

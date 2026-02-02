# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Screen Agent Platform** - Enterprise-grade, multi-tenant SaaS platform for creating AI-powered interactive screen presentations. Built with Next.js 16, React 19, and Tailwind CSS v4.

### What This Application Does

Organizations use Screen Agents to deliver voice-guided, interactive walkthroughs of live websites for sales demos, customer onboarding, product training, and support. Key business functions:

- **Screen Agent Management**: Create/manage AI agents with voice config, website auth, knowledge bases
- **Interactive Presentations**: Real-time voice-guided demos with viewer Q&A
- **Analytics**: Session tracking, question clustering, engagement metrics
- **Billing**: Free tier, pay-as-you-go, and enterprise contracts
- **Multi-Tenancy**: Organization-based isolation with RBAC (Normal mode vs Organization mode)

### Tech Stack
- **Framework**: Next.js 16 (App Router), React 19
- **Styling**: Tailwind CSS v4, shadcn/ui, Radix UI
- **Auth**: Better Auth with MongoDB adapter + organizations plugin
- **Database**: MongoDB (Prisma for auth, Mongoose for app data)
- **AI**: Google Gemini via `@google/genai`, LangGraph for agent orchestration
- **Real-time**: Pusher for WebSocket communication
- **Job Queue**: BullMQ with Redis
- **Testing**: Vitest, Playwright, Storybook
- **Package Manager**: pnpm (via Corepack)

## Common Commands

```bash
# Development
pnpm dev              # Start dev server with Turbopack
pnpm build            # Production build
pnpm start            # Start production server
pnpm worker           # Start background job workers (separate terminal)

# Testing
pnpm test             # Run Vitest unit tests
pnpm test path/to/file.test.ts  # Run a single test file
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage
pnpm e2e:headless     # Run Playwright E2E tests
pnpm e2e:ui           # Run Playwright with UI

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Run ESLint with auto-fix
pnpm prettier         # Check formatting
pnpm prettier:fix     # Fix formatting

# Database
pnpm seed             # Seed database with test data
pnpm migrate          # Run database migrations

# Docker (includes Redis)
docker compose up     # Start all services (app + worker + redis)
docker compose up -d  # Start in detached mode
```

## Architecture

### Directory Structure
```
app/
├── (auth)/             # Auth routes (login, register, verify-email)
├── (dashboard)/        # Protected dashboard routes
├── (main)/             # Main app layout routes
├── api/                # API routes
│   ├── v1/             # Versioned API for Chrome extension
│   ├── agent/          # AI agent interaction endpoints
│   ├── session/        # Session management (init, messages, tasks)
│   ├── screen-agents/  # Screen Agent CRUD
│   ├── knowledge/      # Knowledge base management
│   ├── billing/        # Stripe billing endpoints
│   ├── analytics/      # Analytics and insights
│   ├── organization/   # Multi-tenancy management
│   └── pusher/         # Real-time WebSocket auth
├── layout.tsx          # Root layout
└── page.tsx            # Landing page

lib/
├── ai/                 # AI/LLM integration (Gemini, LangGraph)
├── auth/               # Better Auth configuration
├── db/                 # Database connections (Prisma + Mongoose)
├── models/             # Mongoose models (see Models section)
├── queue/              # BullMQ job queue system
├── services/           # Business logic services
├── utils/              # Utility functions
└── types/              # TypeScript type definitions

components/
├── ui/                 # shadcn/ui components
├── auth/               # Auth components
├── providers/          # React providers
└── [feature]/          # Feature-specific components

scripts/                # CLI scripts (worker, seed, migrate)
e2e/                    # Playwright E2E tests
```

### Key Patterns

**Component Structure**: Components in folders with co-located files:
- `ComponentName.tsx` - Main component
- `ComponentName.test.tsx` - Vitest unit tests
- `ComponentName.stories.tsx` - Storybook stories

**Environment Variables**: Managed via T3 Env (`env.mjs`) with Zod validation. Add new env vars there with schema definitions.

**Multi-Tenancy Modes**: The app supports two operating modes (check via `getTenantOperatingMode()`):
- **Normal Mode**: Single-user accounts, no team features
- **Organization Mode**: Full multi-tenancy with teams, RBAC, and member management

**API Versioning**:
- `/api/v1/*` routes are for the Chrome extension client
- Unversioned `/api/*` routes are for the web app

### Authentication

Better Auth is pre-configured with:
- Email/password + Google OAuth
- Organizations plugin for multi-tenancy
- Email verification via Resend
- MongoDB session storage

Protected routes are configured in `proxy.ts`. Add routes to `protectedRoutes` array.

### Database

**Hybrid database approach** using the same MongoDB database:

| Layer | Technology | Purpose |
|-------|------------|---------|
| Auth | Prisma (`lib/db/prisma.ts`) | Better Auth tables only |
| App | Mongoose (`lib/db/mongoose.ts`) | All application data |

**Key Mongoose Models** (in `lib/models/`):
- `ScreenAgent` - AI agent configurations
- `Session`, `Message`, `Task`, `TaskAction` - Session/conversation tracking
- `KnowledgeDocument`, `WebsiteKnowledge` - Knowledge base content
- `Team`, `TeamMembership` - Organization/team management
- `BillingAccount`, `UsageEvent` - Billing and usage tracking
- `AnalyticsEvent`, `VerificationRecord` - Analytics data

### Background Job Processing

BullMQ + Redis for background jobs. Pre-configured queues in `lib/queue/`:

| Queue | Purpose | Concurrency |
|-------|---------|-------------|
| `email` | Email sending | 5 workers |
| `processing` | Long-running tasks | 3 workers |
| `webhooks` | External HTTP calls | 10 workers |

Add job types in `lib/queue/types.ts` and processors in `lib/queue/workers.ts`.

### Real-time Communication

Pusher is used for WebSocket communication between the Chrome extension and web app:
- Auth endpoint: `/api/pusher/auth`
- Used for session updates, task progress, and live notifications

### Testing
- Unit tests: Vitest with React Testing Library (`*.test.{ts,tsx}`)
- E2E tests: Playwright (`e2e/` directory)
- Component testing: Storybook with test-runner

### TypeScript
Strict mode with `noUncheckedIndexedAccess`. Absolute imports from project root.

## Code Generation Rules

**⚠️ CRITICAL: Follow [RULESETS.md](RULESETS.md) for mandatory code patterns.**

### Quick Reference (Most Common Issues)

```typescript
// ❌ WRONG - Mongoose operations
const user = await User.findOne({ email })

// ✅ CORRECT - Always cast to any
const user = await (User as any).findOne({ email })

// ❌ WRONG - Zod v4 validation
email: z.string().email()
url: z.string().url()

// ✅ CORRECT - Use .refine()
email: z.string().refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Invalid email")
url: z.string().refine((v) => { try { new URL(v); return true } catch { return false } })

// ❌ WRONG - JSON parsing
const body = await request.json()

// ✅ CORRECT - Type assert
const body = (await request.json()) as { field: string }

// ❌ WRONG - Catch blocks
catch (error) { console.error(error.message) }

// ✅ CORRECT - Type as unknown
catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
}

// ❌ WRONG - IP address
const ip = req.ip

// ✅ CORRECT - From headers
const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "anonymous"
```

### Other Critical Rules
- Always use `proxy.ts`, never `middleware.ts` (Next.js 16)
- Use `.tsx` for files with JSX (never `.ts`)
- Use lazy initialization for third-party clients (Stripe, Redis)
- Better Auth imports: `better-auth/client/plugins` (not `react/plugins`)
- BullMQ connections need type assertions: `connection: getRedis() as any`

## UI/Design System Rules

The app follows a strict enterprise design system (Resend/Stripe/Linear aesthetic):

- **Page titles**: `text-lg font-semibold` (never larger)
- **Page descriptions**: `text-sm text-foreground` (NOT muted)
- **All buttons**: `size="sm"` (never default or large)
- **All inputs**: `h-9` (never `h-10`)
- **Cards**: `bg-muted/30` (never `bg-white` or `bg-background`)
- **Primary content**: Always `text-foreground` (muted only for labels/metadata)
- **No `useEffect` for data fetching**: Use Server Components + Suspense
- **No manual memoization**: React Compiler handles it

## Getting Started

```bash
cp .env.example .env.local  # Configure environment
pnpm install                 # Install dependencies
pnpm dev                     # Start dev server
# In separate terminal:
pnpm worker                  # Start background workers (needs Redis)
```

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `BETTER_AUTH_SECRET` | Auth secret (32+ chars) |
| `BETTER_AUTH_URL` | App URL (e.g., http://localhost:3000) |
| `GEMINI_API_KEY` | Google Gemini API key (for AI features) |

Optional: `REDIS_URL`, `STRIPE_SECRET_KEY`, `PUSHER_*`, `RESEND_API_KEY`

## Additional Documentation

- [RULESETS.md](RULESETS.md) - **Mandatory code patterns** (prevents build errors)
- [README.md](README.md) - Complete setup guide and business features
- [brand/brand.md](brand/brand.md) - Brand guidelines and assets

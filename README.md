# Screen Agent Platform

Enterprise-grade, multi-tenant SaaS platform for creating, distributing, and analyzing interactive AI-powered screen presentations.

## Overview

**Screen Agent Platform** enables businesses to create intelligent, conversational screen presentations that respond to viewer questions in real-time while demonstrating live websites. Organizations use Screen Agents to deliver personalized, voice-guided walkthroughs for sales demos, customer onboarding, product training, and technical support.

### Core Value Proposition

- **Sales Teams:** Convert website visitors into qualified leads with on-demand product demos, 24/7
- **Customer Success:** Scale onboarding and reduce time-to-value with interactive presentations
- **Support Organizations:** Deflect support tickets with interactive troubleshooting guides
- **Product Teams:** Gather deep analytics on feature usage and friction points

---

## Business Functions

### 🎯 Screen Agent Management

- **Creation Wizard:** Multi-step wizard for creating Screen Agents with voice configuration, website authentication, knowledge base integration, and personality settings
- **Management Interface:** Dashboard for managing Screen Agents with status controls (Draft, Active, Paused, Archived)
- **Sharing & Embedding:** Shareable links, embed codes, QR codes, and custom branding options
- **Knowledge Base:** Upload PDFs, videos, audio files, and URLs that provide context to Screen Agents

### 🎥 Interactive Presentations

- **LiveKit Integration:** Real-time video conferencing with screen sharing
- **Voice-Guided Demos:** AI-powered voice narration with configurable voices (ElevenLabs, OpenAI, Cartesia)
- **Viewer Interaction:** Real-time Q&A where viewers can ask questions via voice or text
- **Session Recording:** Automatic recording and transcription of presentation sessions
- **Public Access:** No-auth public access via shareable links

### 📊 Analytics & Insights

- **Session Analytics:** Track viewer engagement, questions asked, pages visited, and completion rates
- **Post-Session Analysis:** AI-powered question clustering, topic extraction, and insights generation
- **Dashboard Views:** Organization-level and Screen Agent-level analytics with time period filtering
- **Exportable Reports:** CSV and PDF export for all analytics data
- **Real-Time Metrics:** Live tracking of active sessions and viewer engagement

### 💳 Billing & Usage

- **Free Tier:** 20 minutes/month + 1 Screen Agent (no credit card required)
- **Pay-as-You-Go:** Usage-based billing with real-time balance tracking and auto-reload
- **Enterprise Contracts:** Custom billing contracts with committed usage and overage rates
- **Usage Metering:** Per-minute billing with transparent cost tracking
- **Invoice Management:** Automated invoice generation and payment processing

### 🏢 Multi-Tenancy

- **Organization Management:** Organization-based data isolation with role-based access control
- **Team Management (Enterprise):** Team hierarchy with team-level permissions and Screen Agent ownership
- **RBAC:** Owner, Admin, Member roles at organization level; Team Admin, Team Member at team level
- **Custom Permissions (Enterprise):** Granular permission assignment for enterprise customers
- **Organization Upgrades:** Seamless upgrade from Basic to Enterprise tier

### 🔧 Platform Administration

- **Organization Management:** View and manage all organizations, members, and billing
- **Contract Management:** Create and manage enterprise contracts with custom terms
- **Usage Monitoring:** System-wide usage monitoring and cost attribution
- **Feature Flags:** Enable/disable features globally or per organization
- **Support Tools:** User impersonation, detailed logs, and manual billing adjustments

---

## Quick Start

### Prerequisites

- Node.js >= 20.9.0
- MongoDB database (Atlas recommended)
- pnpm (via Corepack)
- Docker (optional, for Redis)

### Installation

```bash
# 1. Enable Corepack for pnpm
corepack enable

# 2. Clone and install dependencies
git clone <your-repo-url>
cd presenter-agent-ui
pnpm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your MongoDB URI and Better Auth secret

# 4. Generate Prisma schema for Better Auth
npx @better-auth/cli@latest generate
npx prisma generate

# 5. Start development server
pnpm dev
```

**That's it!** Your app is running at http://localhost:3000

### With Docker

```bash
# Copy environment file
cp .env.example .env.local
# Edit .env.local with your MongoDB URI and secrets

# Start all services (app + worker + redis)
docker compose up
```

---

## Key Features

| Feature | Technology | Description |
|---------|------------|-------------|
| **Authentication** | Better Auth | Email/password + Google OAuth with session management |
| **Multi-Tenancy** | Better Auth Organizations | Organization-based multi-tenancy with roles & permissions |
| **Billing** | Stripe | Pay-as-you-go and enterprise contract billing |
| **Video Conferencing** | LiveKit | Real-time video streaming for presentations |
| **File Uploads** | Uploadthing | Knowledge document uploads (PDFs, videos, audio) |
| **Background Jobs** | BullMQ + Redis | Reliable background job processing |
| **Database** | MongoDB | Hybrid: Prisma (auth) + Mongoose (app) |
| **UI Components** | shadcn/ui | Pre-built accessible components |
| **Styling** | Tailwind CSS v4 | Utility-first CSS with CVA variants |
| **Email** | Resend | Transactional email service |
| **Testing** | Vitest + Playwright | Unit, integration, and E2E testing |
| **Containerization** | Docker | Development environment with Redis |

---

## Available Commands

```bash
# Development
pnpm dev              # Start dev server with Turbopack
pnpm build            # Production build
pnpm start            # Start production server
pnpm worker           # Start background job workers

# Testing
pnpm test             # Run unit tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage
pnpm e2e:headless     # Run E2E tests

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Auto-fix linting
pnpm prettier         # Check formatting
pnpm prettier:fix     # Fix formatting

# Docker
docker compose up     # Start all services (app + worker + redis)
docker compose up -d  # Start in detached mode
```

---

## Environment Variables

All environment variables are defined in `env.mjs` with validation. Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

### Required

```bash
# Database (MongoDB)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# Better Auth Configuration
BETTER_AUTH_SECRET=your-32-character-secret-here-minimum-32-chars
BETTER_AUTH_URL=http://localhost:3000
```

### Optional

```bash
# Build Configuration
ANALYZE=false

# Redis (for job queues - defaults to localhost:6379)
REDIS_URL=redis://localhost:6379

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email (Resend) - for email verification and notifications
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=noreply@yourdomain.com

# Uploadthing (file uploads)
UPLOADTHING_TOKEN=sk_live_xxxxx

# AI Agent Configuration
OPENAI_API_KEY=sk-xxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxx
TAVILY_API_KEY=tvly-xxxxx

# Organization Settings
ORGANIZATION_LIMIT=5
MEMBERSHIP_LIMIT=100

# Stripe Billing
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_ID_FREE=price_xxxxx
STRIPE_PRICE_ID_PRO=price_xxxxx
STRIPE_PRICE_ID_ENTERPRISE=price_xxxxx

# PostHog Analytics (client-side)
NEXT_PUBLIC_POSTHOG_KEY=ph_xxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Sentry Error Tracking
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
SENTRY_AUTH_TOKEN=xxxxx

# Feature Flags
FEATURE_FLAGS_ENABLED=false

# Public Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Note**: See `.env.example` for the complete template with all variables and descriptions.

---

## Project Structure

```
app/                    # Next.js App Router
├── (admin)/            # Admin routes (protected)
│   └── platform/       # Platform admin interface
├── (auth)/             # Auth routes
├── api/                # API routes
│   ├── admin/          # Platform admin API
│   ├── analytics/      # Analytics API
│   ├── auth/           # Better Auth endpoints
│   ├── billing/        # Billing API
│   ├── knowledge/      # Knowledge documents API
│   ├── presentations/  # Presentation sessions API
│   ├── screen-agents/  # Screen Agents API
│   └── usage/          # Usage tracking API
├── analytics/          # Analytics pages
├── billing/            # Billing pages
├── dashboard/          # Dashboard
├── screen-agents/      # Screen Agents pages
└── present/            # Public presentation viewer

components/
├── admin/              # Platform admin components
├── analytics/          # Analytics components
├── auth/               # Auth components
├── billing/            # Billing components
├── presentations/      # Presentation components
├── screen-agents/      # Screen Agent components
└── ui/                 # shadcn/ui components

lib/
├── analytics/          # Analytics logic
├── auth/               # Better Auth configuration
├── billing/            # Billing logic
├── db/                 # Database connections
├── models/             # Mongoose models
├── presentations/      # Presentation session management
├── queue/              # BullMQ queues and workers
├── screen-agents/      # Screen Agent business logic
└── usage/              # Usage tracking and limits
```

---

## Documentation

📖 **[Complete Documentation](docs/COMPLETE_GUIDE.md)** - Comprehensive guide covering:
- Product specification and business functions
- Architecture and system design
- Implementation plan
- Deployment guide
- Development guide

🧪 **[Testing Documentation](docs/TESTING.md)** - Complete testing tracker covering:
- Manual and automated test cases for all features
- Integration and E2E testing requirements
- Performance and security testing
- Sign-off checklist for release

**Additional Documentation:**
- [AGENTS.md](AGENTS.md) - Cursor AI guidance
- [CLAUDE.md](CLAUDE.md) - Claude Code guidance
- [GEMINI.md](GEMINI.md) - Gemini/Antigravity guidance
- [RULESETS.md](RULESETS.md) - Code generation rules and patterns

---

## Technology Stack

- **Framework:** Next.js 16 (App Router), React 19
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4, shadcn/ui, Radix UI
- **Authentication:** Better Auth with MongoDB adapter
- **Database:** MongoDB (Prisma for auth, Mongoose for app)
- **Job Queue:** BullMQ with Redis
- **Billing:** Stripe
- **Video:** LiveKit
- **File Uploads:** Uploadthing
- **Email:** Resend
- **Testing:** Vitest, Playwright, Storybook
- **Package Manager:** pnpm (via Corepack)

---

## Getting Started

1. **Set up environment variables** (see [Environment Variables](#environment-variables))
2. **Generate Prisma schema:** `npx @better-auth/cli@latest generate && npx prisma generate`
3. **Start development server:** `pnpm dev`
4. **Start background workers:** `pnpm worker` (in separate terminal)
5. **Read the documentation:** See [docs/COMPLETE_GUIDE.md](docs/COMPLETE_GUIDE.md)

---

## Development

### Code Quality

⚠️ **IMPORTANT:** Follow [RULESETS.md](RULESETS.md) for code generation rules to prevent build and lint errors.

**Key Rules:**
- Always type catch block errors as `unknown`
- Use `(Model as any).method()` for Mongoose operations
- Use Zod `.refine()` for URL/email validation
- Type assert `await request.json()` and `await response.json()`
- Use `.tsx` extension for files containing JSX
- Use `proxy.ts` not `middleware.ts` (Next.js 16)

### Testing

```bash
pnpm test             # Run unit tests
pnpm test:watch       # Run tests in watch mode
pnpm e2e:headless     # Run E2E tests
```

### Building

```bash
pnpm build            # Production build
pnpm lint             # Run linter
pnpm lint:fix         # Auto-fix linting issues
```

---

## Deployment

See [docs/COMPLETE_GUIDE.md#deployment-guide](docs/COMPLETE_GUIDE.md#deployment-guide) for complete deployment instructions.

**Quick Deploy Options:**
- **Vercel:** Connect GitHub repo, configure environment variables, deploy
- **Docker:** `docker compose -f docker-compose.prod.yml up -d`
- **Self-Hosted:** PM2 or systemd (see deployment guide)

---

## Support

- 📖 Read the [Complete Documentation](docs/COMPLETE_GUIDE.md)
- 🐛 Check [RULESETS.md](RULESETS.md) for common code patterns
- 💬 Review code examples in the codebase

---

## License

MIT

---

**Screen Agent Platform** - Enterprise-grade AI-powered screen presentations.

# Screen Agent Platform - Complete Documentation

## Table of Contents

1. [Product Overview](#product-overview)
2. [Business Functions](#business-functions)
3. [Product Specification](#product-specification)
4. [Architecture](#architecture)
5. [Implementation Plan](#implementation-plan)
6. [Deployment Guide](#deployment-guide)
7. [Development Guide](#development-guide)

---

## Product Overview

### What We Are Building

**Screen Agent Platform** is an enterprise-grade, multi-tenant SaaS platform that enables businesses to create, distribute, and analyze interactive AI-powered screen presentations. Organizations use Screen Agents to deliver personalized, voice-guided walkthroughs of their web applications for sales demos, customer onboarding, product training, and technical support.

Unlike traditional screen recording tools, Screen Agents are intelligent, conversational interfaces that respond to viewer questions in real-time while demonstrating live websites. Each Screen Agent combines voice AI with browser automation to provide an interactive experience where viewers can ask questions, request clarification, or explore specific features while watching the AI navigate the application.

### Core Value Proposition

**For Sales Teams:** Convert website visitors into qualified leads by providing personalized product demos on-demand, 24/7, without requiring sales rep availability.

**For Customer Success:** Scale onboarding and reduce time-to-value by letting new customers learn through interactive, self-paced presentations that answer their specific questions.

**For Support Organizations:** Deflect support tickets by providing interactive troubleshooting guides that walk users through complex workflows while answering questions contextually.

**For Product Teams:** Gather deep analytics on which features resonate, common questions, and friction points by analyzing viewer interactions with Screen Agents.

### Target Users

**Primary Users:**
- Sales Operations Managers needing scalable demo capabilities
- Customer Success Directors driving onboarding efficiency
- Support Team Leads reducing ticket volume
- Product Marketers creating interactive product content
- Training Managers delivering software enablement programs

**Secondary Users:**
- Enterprise Architects evaluating multi-tenant security requirements
- Finance teams managing usage-based billing and cost allocation
- Platform Administrators overseeing system-wide configuration and upgrades

---

## Business Functions

### Core Features

1. **Screen Agent Creation & Management**
   - Multi-step creation wizard for Screen Agents
   - Voice configuration (ElevenLabs, OpenAI, Cartesia)
   - Website authentication and credential management
   - Knowledge base integration (PDFs, videos, audio, text)
   - Agent personality and conversation configuration
   - Status management (Draft, Active, Paused, Archived)

2. **Interactive Presentations**
   - LiveKit-based video conferencing
   - Real-time screen sharing
   - Voice-guided demonstrations
   - Viewer interaction (questions via voice/text)
   - Session recording and transcription
   - No-auth public access via shareable links

3. **Analytics & Insights**
   - Session-level analytics
   - Viewer engagement metrics
   - Question clustering and analysis
   - Post-session video analysis
   - Topic extraction and insights
   - Exportable reports (CSV, PDF)

4. **Billing & Usage**
   - Free tier (20 minutes/month + 1 Screen Agent)
   - Pay-as-you-go billing with auto-reload
   - Enterprise contracts with custom terms
   - Usage-based metering (per-minute)
   - Real-time balance tracking
   - Invoice generation and management

5. **Multi-Tenancy**
   - Organization-based isolation
   - Team management (Enterprise)
   - Role-based access control (Owner, Admin, Member, Team Admin, Team Member)
   - Custom permissions (Enterprise)
   - Organization upgrades (Basic → Enterprise)

6. **Platform Administration**
   - Organization management
   - Contract management
   - Usage monitoring
   - Feature flag management
   - Support tools (impersonation, logs)

### Business Logic Flows

#### User Onboarding Flow
1. Registration (email/password or OAuth)
2. Email verification
3. Onboarding wizard (optional team invite, optional tour)
4. Organization setup (Basic tier)
5. First Screen Agent creation

#### Screen Agent Creation Flow
1. Basic Information (name, description, website URL)
2. Voice Configuration (provider, voice, language)
3. Website Authentication (encrypted credentials)
4. Knowledge Upload (PDFs, videos, audio, URLs)
5. Agent Personality (optional welcome message, traits)
6. Review & Publish (validation, test, publish)

#### Presentation Session Flow
1. Session Initiation (link access, optional viewer auth)
2. Session Setup (LiveKit room, agent initialization)
3. Presentation Interface (video, audio, controls)
4. Active Presentation (navigation, Q&A, interaction)
5. Session Completion (survey, recording, analytics)
6. Session Teardown (cleanup, usage tracking)

#### Billing & Payment Flow
1. Free Tier Usage (20 minutes allocation)
2. Approaching Limit (80% warning, 100% blocking)
3. Payment Method Addition (Stripe integration)
4. Initial Balance Loading ($100 minimum)
5. Active Consumption (real-time deduction)
6. Auto-Reload (threshold-based, automatic)
7. Enterprise Billing (contract-based, invoicing)

---

## Product Specification

### Data Models

#### Core Entities

**User**
- Email (unique, verified)
- Name, profile photo
- Authentication provider
- Platform role (standard user or platform admin)
- Notification preferences

**Organization**
- Name, slug (URL-friendly)
- Organization type (Basic or Enterprise)
- Subscription tier (Free, Professional, Enterprise)
- Billing account reference
- Feature flags
- Domain allowlist (Enterprise)

**OrganizationMembership**
- User reference
- Organization reference
- Role (Owner, Admin, Member)
- Invitation status
- Custom permissions (Enterprise)

**Team** (Enterprise Only)
- Team name and description
- Organization reference
- Team settings and access control

**TeamMembership** (Enterprise Only)
- User reference
- Team reference
- Team role (Team Admin, Team Member)

**Screen Agent**
- Agent name and description
- Owner, Organization, Team (optional)
- Visibility (Private, Team, Organization, Public)
- Status (Draft, Active, Paused, Archived)
- Configuration:
  - Target website URL
  - Website credentials (encrypted)
  - Voice configuration (provider, voice ID, language)
  - Conversation configuration (personality, welcome message)
  - Knowledge sources (PDFs, videos, audio, URLs)
  - Domain restrictions
  - Session settings (timeout, max duration)
- Sharing: Public link, private tokens, embed config
- Analytics: Total presentations, viewers, minutes consumed

**Presentation Session**
- Screen Agent reference
- Session token (unique)
- Viewer information (name, email, company)
- Session timestamps (start, end, duration)
- LiveKit room identifier
- Recording reference
- Interaction metrics (questions, pages visited, engagement)
- Completion status (Completed, Abandoned, Error)

**Knowledge Document**
- Screen Agent reference
- Document type (PDF, Video, Audio, Text, URL)
- Storage location
- Processing status (Pending, Processing, Ready, Failed)
- Processed data (extracted text, embeddings, summary)

**Billing Account**
- Organization reference
- Billing type (Pay-as-you-go, Enterprise Contract)
- Account status (Active, Suspended, Closed)
- Pay-as-you-go fields:
  - Balance in cents
  - Auto-reload configuration
  - Payment methods
- Enterprise Contract fields:
  - Contract dates
  - Committed usage minutes
  - Rates (per-minute, overage)
  - Payment terms
  - Invoice frequency

**Usage Event**
- Organization reference
- Event type (Session Minutes, Knowledge Processing, Storage, API Call)
- Quantity and unit cost
- Total cost in cents
- Billing status (Unbilled, Billed, Refunded)
- Invoice reference

**Analytics Event**
- Screen Agent reference
- Presentation Session reference
- Event type (Viewer Question, Page Navigation, Agent Response, Session Milestone)
- Event properties (flexible JSON)
- Timestamp

**Invoice**
- Organization reference
- Invoice number
- Invoice period
- Line items (usage events)
- Payment details
- Status (Draft, Issued, Paid, Overdue)

### User Interface Specifications

#### Design System Principles

**Visual Identity:**
- Modern, clean aesthetic inspired by leading AI SaaS platforms (Linear, Vercel, Stripe)
- High contrast for readability and accessibility
- Generous whitespace preventing visual clutter
- Consistent component styling
- Smooth micro-interactions
- Dark mode as first-class citizen

**Component Library:**
- Built with shadcn/ui
- Fully accessible with keyboard navigation
- Responsive across desktop, tablet, mobile
- Loading states for async operations
- Empty states with helpful guidance
- Error states with recovery actions

#### Key Interface Layouts

**Application Shell**
- Persistent top navigation
- Organization switcher
- Search bar
- Notification bell
- User avatar with dropdown

**Dashboard Layout**
- Hero metrics section
- Tabbed content sections
- Filterable data tables
- Interactive charts
- Quick action buttons

**Screen Agent Creation Wizard**
- Multi-step wizard with progress indicator
- Form validation with inline errors
- Auto-save draft functionality
- Preview pane
- Help tooltips

**Screen Agent Detail Page**
- Header with status and actions
- Tabbed content (Overview, Analytics, Sessions, Knowledge, Settings)
- Share modal (link, embed code, QR code)
- Real-time status updates

**Analytics Dashboard**
- Customizable date range selector
- Multi-level drill-down
- Comparative analysis
- Export and sharing options

**Billing Interface**
- Current balance display
- Visual usage meter
- Payment methods management
- Transaction history
- Usage forecast
- Auto-reload configuration

**Platform Admin Interface**
- Organization management
- Contract management
- Usage monitoring
- Feature flag management
- Support tools

---

## Architecture

### System Architecture

#### Technology Stack

**Frontend:**
- Next.js 16 (App Router)
- React 19
- TypeScript (strict mode)
- Tailwind CSS v4
- shadcn/ui components
- Turbopack for development

**Backend:**
- Next.js API Routes
- Server Components
- Server Actions (where applicable)

**Database:**
- MongoDB (Atlas recommended)
- **Hybrid Approach:**
  - Prisma for Better Auth (authentication data)
  - Mongoose for application data (Screen Agents, Sessions, Analytics, etc.)

**Authentication & Authorization:**
- Better Auth (email/password, OAuth)
- Organization-based multi-tenancy
- Role-based access control (RBAC)
- Custom permissions (Enterprise)

**Background Processing:**
- BullMQ + Redis
- Job queues for:
  - Email sending
  - Knowledge processing
  - Video analysis
  - Usage aggregation
  - Billing jobs

**External Services:**
- LiveKit (video conferencing)
- Stripe (billing and payments)
- Resend (email)
- Uploadthing (file uploads)
- OpenAI/Anthropic (AI features)

#### Directory Structure

```
app/                    # Next.js App Router
├── (admin)/            # Admin routes (protected)
│   └── platform/       # Platform admin interface
├── (auth)/             # Auth routes (login, register, verify-email)
├── api/                # API routes
│   ├── admin/          # Platform admin API
│   ├── analytics/      # Analytics API
│   ├── auth/           # Better Auth endpoints
│   ├── billing/        # Billing API
│   ├── knowledge/      # Knowledge documents API
│   ├── notifications/  # Notifications API
│   ├── presentations/  # Presentation sessions API
│   ├── screen-agents/  # Screen Agents API
│   ├── teams/          # Teams API (Enterprise)
│   ├── usage/          # Usage tracking API
│   └── uploadthing/    # File upload API
├── analytics/          # Analytics pages
├── billing/            # Billing pages
├── dashboard/          # Dashboard
├── onboarding/         # Onboarding flow
├── present/            # Public presentation viewer
├── screen-agents/      # Screen Agents pages
├── teams/              # Teams pages (Enterprise)
└── layout.tsx          # Root layout

components/
├── admin/              # Platform admin components
├── analytics/          # Analytics components
├── auth/               # Auth components
├── billing/            # Billing components
├── notifications/      # Notification components
├── onboarding/         # Onboarding components
├── organizations/      # Organization components
├── presentations/      # Presentation components
├── screen-agents/      # Screen Agent components
├── teams/              # Team components (Enterprise)
├── providers/          # React providers
└── ui/                 # shadcn/ui components

lib/
├── analytics/          # Analytics logic (aggregation, insights)
├── auth/               # Better Auth configuration
├── billing/            # Billing logic (pay-as-you-go, auto-reload)
├── db/                 # Database connections
│   ├── mongoose.ts     # Mongoose connection
│   └── prisma.ts       # Prisma client
├── knowledge/          # Knowledge processing
├── models/             # Mongoose models
├── notifications/      # Notification system
├── presentations/      # Presentation session management
├── queue/              # BullMQ queues and workers
├── screen-agents/      # Screen Agent business logic
├── teams/              # Team management (Enterprise)
├── usage/              # Usage tracking and limits
└── utils/              # Utility functions
```

### Database Architecture

#### Hybrid Database Approach

**Prisma (Better Auth):**
- Used exclusively for authentication-related data
- Models: User, Session, Account, Organization, Member
- Schema auto-generated by Better Auth CLI
- Type-safe with auto-generated Prisma client
- Managed in `lib/db/prisma.ts`

**Mongoose (Application Data):**
- Used for all application features
- Models: ScreenAgent, PresentationSession, KnowledgeDocument, BillingAccount, UsageEvent, AnalyticsEvent, Team, TeamMembership, etc.
- Rich schema validation and middleware
- Managed in `lib/db/mongoose.ts`
- Both use the same MongoDB database

**Why Hybrid Approach:**
- Better Auth requires Prisma for its schema management
- Mongoose provides richer schema validation and middleware for application data
- Both connect to the same MongoDB database
- Clean separation of concerns: auth vs application logic

#### Multi-Tenancy

**Organization-Based Isolation:**
- All data scoped by `organizationId`
- User can belong to multiple organizations
- Active organization context determines data access
- RBAC enforces permissions at organization level

**Team Isolation (Enterprise):**
- Teams are sub-organizational units
- Screen Agents can be team-owned or individually-owned
- Team permissions control access within organization
- All team data still scoped by `organizationId`

#### Data Models

**Key Patterns:**
- All application models include `organizationId` for multi-tenancy
- Timestamps (`createdAt`, `updatedAt`) on all models
- Soft deletes where appropriate (status fields)
- Indexes for query performance
- Validation via Mongoose schemas and Zod

### Authentication & Authorization

**Better Auth Integration:**
- Email/password authentication
- Google OAuth (optional)
- Email verification
- Session management
- Organization plugin for multi-tenancy

**Role-Based Access Control:**
- Roles: Owner, Admin, Member (organization level)
- Team roles: Team Admin, Team Member (Enterprise)
- Custom permissions (Enterprise)
- Permission checks via `hasPermission()` from `lib/config/roles.ts`

**Route Protection:**
- Middleware in `proxy.ts` (Next.js 16)
- Protected routes array
- Admin routes require `platform_admin` role
- API routes use `withAuth()` helper

### Background Job Processing

**BullMQ + Redis:**
- Queue system for async tasks
- Workers process jobs with concurrency limits
- Retry logic for failed jobs
- Job types:
  - Email sending
  - Knowledge processing (PDF extraction, video transcription, embedding generation)
  - Video analysis (question clustering, topic extraction, insights)
  - Usage aggregation
  - Billing jobs (auto-reload, invoice generation)

**Worker Management:**
- Separate worker process (`scripts/worker.ts`)
- Docker service for production
- PM2/systemd for self-hosted
- Concurrency per queue configurable

### API Design

**RESTful Principles:**
- Resource-oriented URLs
- Standard HTTP methods (GET, POST, PATCH, DELETE)
- JSON request/response bodies
- Standard HTTP status codes
- Pagination (offset-based or cursor-based)

**Authentication:**
- Session-based (Better Auth cookies)
- API keys for programmatic access
- OAuth 2.0 for delegated access

**Error Handling:**
- Consistent error response format
- Error codes for client handling
- Validation errors with field-level details

### Security Considerations

**Authentication:**
1. **Session Management**: Better Auth handles sessions securely
2. **Route Protection**: Use `proxy.ts` for protected routes (Next.js 16)
3. **API Security**: Always verify sessions in API routes

**Multi-Tenancy:**
1. **Organization Isolation**: Always verify organization membership
2. **Permission Checks**: Use `hasPermission()` API before operations
3. **Data Scoping**: Filter queries by `organizationId`

**Data Protection:**
- Website credentials encrypted at rest
- HTTPS for all communications
- Environment variables for secrets
- Rate limiting on API endpoints

**Access Control:**
- Multi-tenant data isolation
- RBAC for permission enforcement
- API key scoping for programmatic access
- Audit logging for sensitive operations

**Billing:**
1. **Webhook Verification**: Always verify Stripe webhook signatures
2. **Subscription Validation**: Verify subscription status before access
3. **Payment Security**: Never store payment details

**Webhooks:**
1. **Signature Verification**: Always verify webhook signatures (HMAC-SHA256)
2. **HTTPS Only**: Only accept webhooks over HTTPS
3. **Retry Logic**: Implement proper retry and backoff

**Compliance:**
- GDPR-ready (data export, deletion)
- SOC 2 controls (encryption, logging, access control)
- Audit trail for compliance

### Performance Optimization

**Database:**
1. **Indexes**: Add indexes to frequently queried fields
2. **Connection Pooling**: Both Prisma and Mongoose handle this automatically
3. **Query Optimization**: Use Mongoose select() to limit fields

**Caching:**
1. **Session Cache**: Better Auth has built-in session caching
2. **Organization Cache**: Cache organization data in client state
3. **Redis**: Use Redis for application-level caching

**Job Queues:**
1. **Concurrency**: Adjust worker concurrency based on load
2. **Prioritization**: Use job priorities for important tasks
3. **Batching**: Batch similar jobs when possible

### Best Practices

**Code Organization:**
1. **Separation of Concerns**: Prisma for auth, Mongoose for app
2. **Model Organization**: Group related Mongoose models
3. **Tool Organization**: Keep tools focused and reusable

**Error Handling:**
1. **Try-Catch**: Always wrap async operations, type errors as `unknown`
2. **Error Types**: Use specific error types
3. **Logging**: Log errors with context

**Testing:**
1. **Unit Tests**: Test individual functions and components
2. **Integration Tests**: Test API routes and database operations
3. **E2E Tests**: Test complete user flows

---

## Implementation Plan

### Current Status: Phases 1-20 Complete

**✅ Completed Phases:**
1. Core Data Models & Schema
2. Screen Agent Core API
3. Screen Agent Creation Wizard UI
4. Screen Agent Management UI
5. Pay-as-You-Go Billing System
6. Free Tier & Usage Limits
7. Onboarding Flow Enhancement
8. Organization Upgrade Flow
9. Team Management (Enterprise)
10. Knowledge Processing & Storage
11. Presentation Session Infrastructure
12. Presentation Analytics & Tracking
13. Analytics Dashboard
14. Post-Presentation Analysis
15. Shareable Links & Embedding
16. LiveKit Integration & Presentation Interface
17. Usage Event Tracking & Metering
18. Enhanced Dashboard
19. Platform Admin Interface
20. Production Deployment & Monitoring

### Implementation Checklist

For each phase:
- [ ] Implement features
- [ ] Write tests (`pnpm test`)
- [ ] Run linting (`pnpm lint`)
- [ ] Build verification (`pnpm build`)
- [ ] Manual testing
- [ ] Code review

### Development Standards

**Code Quality:**
- Follow `RULESETS.md` patterns
- TypeScript strict mode
- ESLint and Prettier
- Write tests for new features
- Document complex logic

**Testing:**
- Unit tests: Vitest + React Testing Library
- Integration tests: API endpoints
- E2E tests: Playwright
- Run `pnpm test && pnpm lint && pnpm build` after each phase

---

## Deployment Guide

### Prerequisites

- Node.js >= 20.9.0
- MongoDB Atlas account (or self-hosted MongoDB)
- Redis instance (for job queues)
- Environment variables configured
- Domain name with DNS configured

### Environment Setup

#### Required Environment Variables

```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# Authentication
BETTER_AUTH_SECRET=your-32-character-secret-here-minimum
BETTER_AUTH_URL=https://your-domain.com

# Application
NEXT_PUBLIC_APP_URL=https://your-domain.com
NODE_ENV=production

# Redis (for job queues)
REDIS_URL=redis://your-redis-host:6379

# Email (Resend)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=noreply@your-domain.com

# Stripe (for billing)
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx

# LiveKit (for presentations)
LIVEKIT_URL=https://your-livekit-instance.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# Uploadthing (for file uploads)
UPLOADTHING_SECRET=sk_live_xxxxx
UPLOADTHING_APP_ID=xxxxx

# Optional: Analytics
POSTHOG_KEY=ph_xxxxx
POSTHOG_HOST=https://app.posthog.com
NEXT_PUBLIC_POSTHOG_KEY=ph_xxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Optional: Error Tracking
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

# Optional: Google OAuth
GOOGLE_CLIENT_ID=xxxxx
GOOGLE_CLIENT_SECRET=xxxxx
```

### Build & Deployment

#### Production Build

```bash
# Install dependencies
pnpm install

# Generate Prisma client for Better Auth
npx @better-auth/cli@latest generate
npx prisma generate

# Build for production
pnpm build

# Start production server
pnpm start
```

#### Docker Deployment

```bash
# Build and start services
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

#### Vercel Deployment

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Set build command: `pnpm build`
4. Set output directory: `.next`
5. Deploy

#### Self-Hosted Deployment

**Using PM2:**
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start npm --name "presenter-agent" -- start

# Start worker
pm2 start npm --name "presenter-agent-worker" -- run worker

# Save PM2 configuration
pm2 save
pm2 startup
```

**Using systemd:**
Create service files for app and worker, then:
```bash
sudo systemctl enable presenter-agent
sudo systemctl start presenter-agent
sudo systemctl status presenter-agent
```

### Background Workers

Background workers must run separately from the main application:
- Development: `pnpm worker`
- Production: Separate service/process
- Docker: Included as separate service

### Database Setup

**MongoDB Atlas:**
1. Create a MongoDB Atlas cluster
2. Create a database user
3. Whitelist your deployment IP addresses
4. Copy the connection string to `MONGODB_URI`

**Database Migrations:**
Better Auth handles schema migrations automatically:
```bash
npx @better-auth/cli@latest generate
```

### Redis Setup

**Redis Cloud:**
1. Create a Redis Cloud account
2. Create a database
3. Copy connection URL to `REDIS_URL`

**Self-Hosted Redis:**
```bash
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
redis-cli config set requirepass your-redis-password
```

### Health Checks

The application exposes health check endpoints:
- `GET /health` - Basic health check
- `GET /healthz` - Kubernetes-style health check
- `GET /api/health` - API health check

### Monitoring

**Sentry Error Tracking:**
1. Create a Sentry account
2. Create a new project
3. Copy DSN to environment variables
4. Errors are automatically tracked

**PostHog Analytics:**
1. Create a PostHog account
2. Copy API key to environment variables
3. Analytics are automatically tracked

### SSL/TLS

**Using Let's Encrypt:**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
sudo certbot renew --dry-run
```

**Using Cloudflare:**
1. Add your domain to Cloudflare
2. Set SSL/TLS mode to "Full"
3. Configure DNS records

### Performance Optimization

**CDN Configuration:**
- Use Vercel Edge Network (if deploying to Vercel)
- Configure Cloudflare CDN for static assets
- Enable image optimization

**Caching:**
- Next.js automatically caches static pages
- API routes can use Redis for caching
- Configure CDN caching headers

### Security Checklist

- [ ] All environment variables set
- [ ] `BETTER_AUTH_SECRET` is 32+ characters
- [ ] MongoDB connection uses SSL
- [ ] Redis password configured
- [ ] SSL/TLS enabled
- [ ] Rate limiting configured
- [ ] CORS configured properly
- [ ] Error tracking enabled
- [ ] Backup procedures in place

### Backup Strategy

**MongoDB Backups:**
MongoDB Atlas provides automatic backups. For self-hosted:
```bash
mongodump --uri="mongodb://localhost:27017/database" --out=/backup/$(date +%Y%m%d)
mongorestore --uri="mongodb://localhost:27017/database" /backup/20240101
```

**Redis Backups:**
```bash
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb /backup/redis-$(date +%Y%m%d).rdb
```

### Scaling

**Horizontal Scaling:**
- Run multiple Next.js instances behind a load balancer
- Ensure Redis is accessible to all instances
- Use sticky sessions for authentication (or shared Redis for sessions)

**Database Scaling:**
- Use MongoDB Atlas with automatic scaling
- Configure read replicas for read-heavy workloads
- Use connection pooling

**Worker Scaling:**
- Run multiple worker instances
- Configure concurrency per worker
- Monitor queue lengths

---

## Development Guide

### Getting Started

#### Prerequisites

- Node.js >= 20.9.0
- MongoDB database (Atlas recommended)
- pnpm (via Corepack)
- Docker (optional, for Redis)

#### Installation

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

#### With Docker

```bash
# Copy environment file
cp .env.example .env.local
# Edit .env.local with your MongoDB URI and secrets

# Start all services (app + worker + redis)
docker compose up
```

### Common Commands

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

### Code Generation Rules

**⚠️ CRITICAL: Follow code generation rules to prevent build and lint errors.**

All mandatory code patterns are documented in `RULESETS.md`. Key rules:

1. **Error Handling**: Always type catch block errors as `unknown`
2. **Mongoose Operations**: Use `(Model as any).method()` pattern
3. **Zod v4 Validation**: Use `.refine()` for URL/email validation
4. **JSON Parsing**: Type assert `await request.json()` and `await response.json()`
5. **Better Auth Imports**: Use `better-auth/client/plugins` for client-side plugins
6. **JSX Files**: Always use `.tsx` extension for files containing JSX
7. **Middleware**: Always use `proxy.ts`, never `middleware.ts`
8. **IP Addresses**: Extract IP from headers, not `req.ip`
9. **Lazy Initialization**: For third-party clients requiring environment variables
10. **No Duplicate Indexes**: Use only one indexing method for Mongoose

See `RULESETS.md` for complete rules and examples.

### Database

#### Hybrid Database Approach

**Prisma (Better Auth):**
- Managed in `lib/db/prisma.ts`
- Used exclusively by Better Auth for authentication
- Schema generated via Better Auth CLI
- Type-safe with auto-generated Prisma client

**Mongoose (Application Features):**
- Connection managed in `lib/db/mongoose.ts`
- Used for AI agents, custom features, and application data
- Models defined in `lib/models/`
- Rich schema validation and middleware support

Both use the same MongoDB database (Atlas recommended).

**Usage Example:**
```typescript
import { connectDB } from "@/lib/db/mongoose"
import { ScreenAgent } from "@/lib/models/screen-agent"

export async function GET() {
  await connectDB()
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents = await (ScreenAgent as any).find({ organizationId: "org-123" })
  
  return Response.json(agents)
}
```

### Authentication

Better Auth is pre-configured with:
- Email/password authentication
- Google OAuth (optional)
- Email verification via Resend
- MongoDB session storage
- Organization-based multi-tenancy

**Using Auth:**

**Server Component:**
```typescript
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  
  return <div>Hello {session.user.name}</div>
}
```

**Client Component:**
```typescript
"use client"
import { authClient } from "@/lib/auth/client"

export function Component() {
  const { data: session } = authClient.useSession()
  
  if (!session) return <div>Not logged in</div>
  return <div>Hello {session.user.name}</div>
}
```

**Protecting Routes:**

Edit `proxy.ts`:
```typescript
const protectedRoutes = [
  "/dashboard",
  "/settings",
  "/billing",
  "/admin",
  "/platform",
]
```

### Background Job Processing

BullMQ + Redis for reliable background job processing:

**Adding a job to a queue:**
```typescript
import { queueEmail, queueKnowledgeProcessing } from "@/lib/queue"

// Queue an email
await queueEmail({
  to: "user@example.com",
  subject: "Welcome!",
  body: "<p>Thanks for signing up</p>",
})

// Queue knowledge processing
await queueKnowledgeProcessing({
  documentId: "doc-123",
  documentType: "pdf",
  storageLocation: "s3://bucket/file.pdf",
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

**Unit Tests:**
- Vitest with React Testing Library
- Files: `*.test.{ts,tsx}`
- Run: `pnpm test`

**E2E Tests:**
- Playwright
- Directory: `e2e/`
- Run: `pnpm e2e:headless`

**Component Testing:**
- Storybook with test-runner
- Run: `pnpm storybook`

### TypeScript

- Strict mode enabled with `noUncheckedIndexedAccess`
- Uses ts-reset for enhanced type safety
- Absolute imports configured from project root (`@/`)

---

## Additional Resources

- [Better Auth Docs](https://better-auth.com/docs)
- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Mongoose Docs](https://mongoosejs.com/docs/)
- [BullMQ Docs](https://docs.bullmq.io/)

---

## License

MIT

---

**Screen Agent Platform** - Enterprise-grade AI-powered screen presentations.

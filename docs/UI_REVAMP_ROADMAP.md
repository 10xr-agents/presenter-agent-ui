# UI Revamp Roadmap: Screen Agent → Browser Copilot SaaS

**Purpose:** Transform the platform from a "Screen Agent" configuration tool to a **Browser Copilot SaaS** management portal. The core product is now the **Chrome Extension**; this Web App becomes the **Control Center** (Dashboard) for managing history, data, knowledge, and subscriptions.

**Roadmap Format:** Vertical slicing approach — complete one feature/framework at a time before moving to the next. Each task includes Objective, Files to Create/Modify, and Definition of Done checklist.

**Focus:** DOM-based features first. Visual/screenshot-based features (Session Replay with screenshot scrubber) are **moved to end of roadmap** — see **§ Deferred: Visual / Screenshot-Based Features** at end of document.

---

## Executive Summary

### The Transformation

| Before (Screen Agent) | After (Browser Copilot SaaS) |
|----------------------|------------------------------|
| Users configure agents in the web app | Users install Chrome Extension and use Copilot directly |
| Live View / Remote Control screens | Extension handles execution in user's browser |
| Agent Training workflows | Knowledge uploads for RAG augmentation |
| Presentation sessions via LiveKit | Chat sessions logged from extension activity |
| Screen Agent management (CRUD) | Session history and analytics viewing |

### New Information Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER COPILOT SAAS                     │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard (Home)                                               │
│  ├── ROI Metrics: Time Saved, Tasks Automated, Success Rate     │
│  ├── Recent Activity (last 5 sessions with status)              │
│  └── CTA: "Install Extension" / "Open Extension"                │
├─────────────────────────────────────────────────────────────────┤
│  Chats (Activity Log)                                           │
│  ├── Session List: Active, Completed, Failed (Linear-style)     │
│  └── Session Replay: 3-panel debug view (LangSmith-style) — **deferred** (visual/screenshot; see § Deferred) │
│      ├── Left: Chat / User Instructions                         │
│      ├── Center: Screenshot Scrubber (DOM snapshots) — deferred  │
│      └── Right: Execution Steps / Thought Process               │
├─────────────────────────────────────────────────────────────────┤
│  Knowledge (RAG Manager)                                        │
│  ├── Document/Link List with Status (Supabase-style)            │
│  ├── Upload: Drag-drop documents, URL indexing                  │
│  └── Playground: Test RAG retrieval (Pinecone-style)            │
│      ├── Search input: "What is the procedure for X?"           │
│      └── Results: Matching chunks with similarity scores        │
├─────────────────────────────────────────────────────────────────┤
│  Analytics (ROI & Usage)                                        │
│  ├── Hero Metrics: Time Saved, Tasks Automated (Vercel-style)   │
│  ├── Success Rates & Trends (+12% from last week)               │
│  └── Developer Tab: Token Usage, Cost Breakdown, Model Stats    │
├─────────────────────────────────────────────────────────────────┤
│  Billing                                                        │
│  ├── Current Plan & Usage Meter                                 │
│  ├── Payment Methods                                            │
│  └── Invoice History                                            │
├─────────────────────────────────────────────────────────────────┤
│  Settings / Profile                                             │
│  ├── General, Members, API Keys (Supabase Settings-style)       │
│  └── User preferences, Theme                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Production Readiness Status

| Component | Status | Phase | Notes |
|-----------|--------|-------|-------|
| **Legacy Cleanup** | ✅ Complete | 1 | Screen Agent config, Live View, Presentations removed |
| **New Sidebar & Shell** | ✅ Complete | 1 | Updated navigation with new IA |
| **Dashboard (Home)** | ✅ Complete | 1 | ROI metrics, Extension CTA implemented |
| **Chats List (Linear-style)** | 🔲 Planned | 2 | Compact session rows with status icons |
| **Knowledge List (Supabase-style)** | 🔲 Planned | 2 | Document/link management with status |
| **Knowledge Playground** | 🔲 Planned | 2 | Test RAG retrieval with similarity scores |
| **ROI & Usage Analytics** | 🔲 Planned | 3 | Time Saved hero, Developer tab for tokens |
| **Billing Integration** | 🔲 Planned | 3 | Plans, limits, invoices |
| **Session Replay (LangSmith-style)** | 🔲 Deferred | — | 3-panel debug view with screenshot scrubber — **visual/screenshot**; see § Deferred at end |

**Legend:** ✅ = Complete | 🔄 = In Progress | 🔲 = Planned

**Critical Path:** ~~Legacy Cleanup~~ → ~~New Shell~~ → ~~Dashboard~~ → Chats (list) → Knowledge → Analytics → Billing. **Session Replay (screenshot-based)** is at end of roadmap.

---

## Phase 1: Cleanup & Shell

This phase establishes the new foundation by removing legacy "Screen Agent" functionality and implementing the new navigation shell. Complete this phase before any feature work.

### Task 1.1: Remove Screen Agent Configuration Screens

**Objective:** Delete all "Agent Configuration", "Agent Training", and "Agent Management" screens. Users no longer configure agents in the web app — they use the Chrome Extension directly.

**Files to Delete:**

| Category | Files to Remove |
|----------|-----------------|
| **Pages** | `app/(app)/screen-agents/` (entire directory) |
| | `app/(app)/screen-agents/new/page.tsx` |
| | `app/(app)/screen-agents/[id]/page.tsx` |
| | `app/(app)/screen-agents/[id]/edit/page.tsx` |
| | `app/(app)/screen-agents/[id]/analytics/page.tsx` |
| **Components** | `components/screen-agents/creation-wizard.tsx` |
| | `components/screen-agents/edit-form.tsx` |
| | `components/screen-agents/screen-agent-card.tsx` |
| | `components/screen-agents/screen-agent-detail.tsx` |
| | `components/screen-agents/screen-agent-list.tsx` |
| | `components/screen-agents/screen-agent-table.tsx` |
| | `components/screen-agents/share-modal.tsx` |
| | `components/screen-agents/steps/` (entire directory) |
| **Tests** | `components/screen-agents/creation-wizard.test.tsx` |
| | `components/screen-agents/screen-agent-list.test.tsx` |
| **API Routes** | `app/api/screen-agents/` (entire directory) — **KEEP for extension use** |

**Files to Modify:**

| File | Change |
|------|--------|
| `components/app-shell/app-sidebar.tsx` | Remove "Screen Agents" navigation item |
| `app/(app)/layout.tsx` | Remove any Screen Agent context providers |

**⚠️ CRITICAL:** Keep the API routes (`app/api/screen-agents/`) as the Chrome Extension may still call them. Only remove the **UI** screens.

**Definition of Done:**

- [x] All Screen Agent page routes deleted
- [x] All Screen Agent UI components deleted
- [x] Sidebar navigation updated (no "Screen Agents" link)
- [x] No broken imports or type errors
- [x] Build passes (`pnpm build`)
- [x] Extension API routes still functional

**Implementation Notes (2026-01-28):**
- Deleted `app/(app)/screen-agents/` directory (5 pages)
- Deleted `components/screen-agents/` directory (12 components + tests)
- API routes (`app/api/screen-agents/`) preserved for extension use

---

### Task 1.2: Remove Presentation & Live View Screens

**Objective:** Delete all "Presentation", "Live View", and "Remote Control" functionality. The Chrome Extension now handles execution in the user's browser — no server-side streaming needed.

**Files to Delete:**

| Category | Files to Remove |
|----------|-----------------|
| **Pages** | `app/present/` (entire directory) |
| | `app/present/[token]/page.tsx` |
| **Components** | `components/presentations/` (entire directory) |
| | `components/presentations/presentation-controls.tsx` |
| | `components/presentations/presentation-interface.tsx` |
| | `components/presentations/presentation-video.tsx` |
| | `components/presentations/viewer-interaction.tsx` |
| **API Routes** | `app/api/presentations/` (entire directory) — **Evaluate before deleting** |

**Files to Modify:**

| File | Change |
|------|--------|
| `components/app-shell/app-sidebar.tsx` | Remove any "Presentations" or "Live View" navigation items |
| `lib/presentations/` | **Archive or delete** — evaluate if session logic is reused |

**⚠️ CRITICAL:** Evaluate `lib/presentations/` before deleting. If session management logic is reused for the new "Chats" feature, refactor rather than delete.

**Definition of Done:**

- [x] All Presentation page routes deleted
- [x] All Presentation UI components deleted
- [x] LiveKit integration removed from active use (lib preserved for future)
- [x] No broken imports or type errors
- [x] Build passes (`pnpm build`)

**Implementation Notes (2026-01-28):**
- Deleted `app/present/` directory (1 page)
- Deleted `components/presentations/` directory (4 components)
- Preserved `lib/presentations/` for potential future use

---

### Task 1.3: Implement New Sidebar & Navigation Shell

**Objective:** Replace the current sidebar with the new Browser Copilot SaaS information architecture. The sidebar should reflect the new product focus: Dashboard, Chats, Knowledge, Analytics, Billing, Settings.

**Files to Modify:**

| File | Change |
|------|--------|
| `components/app-shell/app-sidebar.tsx` | Complete rewrite with new navigation structure |
| `components/app-shell/app-header.tsx` | Update branding, add "Install Extension" button |
| `components/app-shell/index.ts` | Update exports if components renamed |

**New Sidebar Structure:**

```
Dashboard        → /dashboard
Chats            → /chats
Knowledge        → /knowledge
Analytics        → /analytics
Billing          → /billing
Settings         → /settings
```

**Navigation Items Schema:**

| Label | Icon (Lucide) | Route | Badge |
|-------|---------------|-------|-------|
| Dashboard | `Home` | `/dashboard` | — |
| Chats | `MessageSquare` | `/chats` | Active count |
| Knowledge | `BookOpen` | `/knowledge` | Indexing count |
| Analytics | `BarChart3` | `/analytics` | — |
| Billing | `CreditCard` | `/billing` | — |
| Settings | `Settings` | `/settings` | — |

**Definition of Done:**

- [x] Sidebar displays new navigation items (Dashboard, Chats, Knowledge, Analytics, Billing, Settings)
- [x] Old navigation items removed (Screen Agents, Presentations)
- [x] Active state styling works correctly
- [x] Mobile sidebar updated with same structure
- [x] "Install Extension" CTA visible in header
- [x] Build passes (`pnpm build`)
- [x] No console errors on navigation

**Implementation Notes (2026-01-28):**
- Updated `components/app-shell/app-sidebar.tsx` with new navigation (Home, Chats, Knowledge, Analytics, Billing, Settings)
- Updated `components/app-shell/mobile-sidebar.tsx` with matching structure
- Updated `components/app-shell/app-header.tsx` with "Browser Copilot" branding and "Install Extension" CTA
- Changed icons: `LayoutDashboard` → `Home`, `Presentation` → `MessageSquare`
- Moved Billing to base navigation (always visible)

---

### Task 1.4: Create New Route Structure

**Objective:** Establish the new route hierarchy for the Browser Copilot SaaS. Create placeholder pages for each major section.

**Files to Create:**

| Route | File to Create | Purpose |
|-------|----------------|---------|
| `/dashboard` | `app/(app)/dashboard/page.tsx` | **Modify existing** — repurpose for new dashboard |
| `/chats` | `app/(app)/chats/page.tsx` | Session list (Active + Archived) |
| `/chats/[sessionId]` | `app/(app)/chats/[sessionId]/page.tsx` | Session detail view |
| `/knowledge` | `app/(app)/knowledge/page.tsx` | **Keep existing** — knowledge list |
| `/knowledge/upload` | `app/(app)/knowledge/upload/page.tsx` | Document upload form |
| `/analytics` | `app/(app)/analytics/page.tsx` | **Keep existing** — update for new metrics |
| `/billing` | `app/(app)/billing/page.tsx` | Create or link to settings/billing |

**Files to Modify:**

| File | Change |
|------|--------|
| `app/(app)/dashboard/page.tsx` | Repurpose for new summary dashboard |
| `app/(app)/analytics/page.tsx` | Update to show token/cost analytics |
| `app/(app)/knowledge/page.tsx` | Simplify to document/link management |

**Definition of Done:**

- [x] All new routes accessible
- [x] Placeholder pages render without errors
- [x] Navigation links work correctly
- [x] Layout inheritance correct (uses `(app)` layout)
- [x] Build passes (`pnpm build`)

**Implementation Notes (2026-01-28):**
- Created `app/(app)/chats/page.tsx` - Session list placeholder
- Created `app/(app)/chats/[sessionId]/page.tsx` - Session detail placeholder
- Created `app/(app)/billing/page.tsx` - Billing placeholder
- Created `app/(app)/knowledge/upload/page.tsx` - Upload placeholder
- All pages use `PageShell` component for consistent layout

---

### Task 1.5: Update Dashboard (Home) Page

**Objective:** Transform the dashboard into a Browser Copilot SaaS home page with summary metrics, recent activity, and extension installation CTA.

**Files to Modify:**

| File | Change |
|------|--------|
| `app/(app)/dashboard/page.tsx` | Complete rewrite for new dashboard |
| `components/dashboard/overview-dashboard.tsx` | Update or replace with new metrics |

**Files to Create:**

| File | Purpose |
|------|---------|
| `components/dashboard/summary-metrics.tsx` | Tasks completed, Time saved, Tokens used |
| `components/dashboard/recent-activity.tsx` | Recent sessions feed |
| `components/dashboard/extension-cta.tsx` | "Install Extension" card |

**Dashboard Content:**

| Section | Data Source | Display |
|---------|-------------|---------|
| **Summary Metrics** | Session model, TokenUsageLog | Cards: "Tasks Today", "Time Saved", "Tokens Used" |
| **Recent Activity** | Session model (last 5) | List with domain, status, timestamp |
| **Extension CTA** | Static | Card with Chrome Web Store link |

**Definition of Done:**

- [x] Dashboard shows summary metrics (tasks, time saved, tokens)
- [x] Recent activity list displays last 5 sessions
- [x] "Install Extension" CTA prominently displayed
- [x] Loading states with skeletons
- [x] Empty states for new users
- [x] Build passes (`pnpm build`)
- [x] Matches design system (see `.cursorrules`)

**Implementation Notes (2026-01-28):**
- Updated `app/(app)/dashboard/page.tsx` with new description
- Rewrote `components/dashboard/overview-dashboard.tsx` for Browser Copilot:
  - New metrics: Tasks Today, Total Tasks, Time Saved, Tokens Used
  - Chrome Extension CTA card (always visible)
  - Quick navigation cards to Chats and Analytics
  - Empty state with "Install Extension" emphasis
- Removed all "Screen Agent" terminology
- Metrics interface updated: `totalAgents` → `totalSessions`, added `estimatedTimeSaved`, `totalTokens`

---

### Phase 1 Completion Checklist

| Task | Status | Depends On |
|------|--------|------------|
| 1.1: Remove Screen Agent Screens | ✅ Complete | — |
| 1.2: Remove Presentation Screens | ✅ Complete | — |
| 1.3: New Sidebar & Shell | ✅ Complete | 1.1, 1.2 |
| 1.4: New Route Structure | ✅ Complete | 1.3 |
| 1.5: Update Dashboard | ✅ Complete | 1.4 |

**Phase 1 Exit Criteria:**

- [x] All legacy screens removed
- [x] New sidebar navigation functional
- [x] All routes accessible
- [x] Dashboard displays basic metrics
- [x] Build passes with no errors
- [x] No broken links in navigation

**Phase 1 Completed: 2026-01-28**

---

## Phase 2: Core Data Views

This phase implements the primary data management features: viewing session history (Chats) and managing knowledge sources (Knowledge).

### Task 2.1: Implement Chats (Activity Log) List View

**Objective:** Create a unified, high-density list of Active (running) and Archived (completed) sessions from the Chrome Extension's activity. This is the primary way users review their Copilot's work.

**UI Reference:** Linear Issue List (compact rows, status icons, relative timestamps)

**Files to Create:**

| File | Purpose |
|------|---------|
| `app/(app)/chats/page.tsx` | Chats list page |
| `components/chats/session-list.tsx` | Compact list component (Linear-style) |
| `components/chats/session-row.tsx` | Individual row with status icon |
| `components/chats/session-filters.tsx` | Status, date range, domain filters |
| `components/chats/session-status-icon.tsx` | Status icons (Green ✓, Red ✗, Spinner) |
| `components/chats/empty-state-chats.tsx` | Interactive empty state |

**Files to Modify:**

| File | Change |
|------|--------|
| `app/api/session/route.ts` | Ensure list endpoint supports pagination & filters |

**Linear-Style Row Layout:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ✓  │ Add new patient with name "Jas"          │ openemr.io │ 2m ago   │
│ ✓  │ Search for medication dosage info        │ drugs.com  │ 15m ago  │
│ ○  │ Fill out insurance claim form            │ aetna.com  │ running  │
│ ✗  │ Export quarterly report to PDF           │ sheets.go… │ 1h ago   │
└─────────────────────────────────────────────────────────────────────────┘
 ↑       ↑                                           ↑          ↑
Status  Task (truncated userQuery)                 Domain    Timestamp
```

**Status Icons:**

| Status | Icon | Color | Animation |
|--------|------|-------|-----------|
| `completed` | `CheckCircle2` | Green (`text-green-500`) | None |
| `failed` | `XCircle` | Red (`text-red-500`) | None |
| `active` | `Loader2` | Blue (`text-blue-500`) | `animate-spin` |
| `cancelled` | `MinusCircle` | Gray (`text-muted-foreground`) | None |

**Smart Empty State (Interactive):**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                        ┌─────────────────────┐                          │
│                        │   MessageSquare     │                          │
│                        └─────────────────────┘                          │
│                                                                         │
│                    Your first chat awaits                               │
│                                                                         │
│   Open the Browser Copilot extension on any page and try:               │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  "Summarize this page"                                          │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  "Fill out this form with my saved info"                        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  "Find the pricing section"                                     │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│                    [Install Extension]                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Data Model (Existing Session Model):**

| Field | Display |
|-------|---------|
| `_id` | Internal (used for navigation) |
| `domain` | Domain pill, truncated to 12 chars |
| `status` | Status icon (see above) |
| `userQuery` | Task title, truncated to 50 chars |
| `createdAt` | Relative time ("2m ago", "1h ago", "Yesterday") |
| `messageCount` | Shown on hover or in detail |

**Filter Bar:**

| Filter | Type | Options |
|--------|------|---------|
| Status | Dropdown | All, Active, Completed, Failed |
| Domain | Search input | Autocomplete from user's domains |
| Date | Date range picker | Today, Last 7 days, Last 30 days, Custom |

**Definition of Done:**

- [ ] Chats page displays compact session list (Linear-style)
- [ ] Status icons correctly reflect session state
- [ ] Rows are clickable, navigate to session detail
- [ ] Filters work (status, date, domain)
- [ ] Pagination works (20 items, cursor-based)
- [ ] Interactive empty state with example prompts
- [ ] Loading states with skeleton rows
- [ ] Build passes (`pnpm build`)

---

### Task 2.2: Session Replay (Deferred — Visual/Screenshot-Based)

**Status:** **Deferred.** Session Replay (3-panel debug view with **screenshot scrubber**) is a **visual/screenshot-based** feature. Focus is **DOM-based** features first. Full specification moved to **§ Deferred: Visual / Screenshot-Based Features** at end of this document.

**In Phase 2:** Prefer a **DOM-based session detail** (chat + steps + DOM snapshot text/structure only, no screenshot viewer) if a session detail view is needed before the deferred Session Replay.

---

### Task 2.3: Implement Knowledge (RAG Manager) List View

**Objective:** Display the list of knowledge sources (documents and indexed links) with status indicators. Users should quickly see what's indexed and what's still processing.

**UI Reference:** Supabase Settings (left nav + content panel), Pinecone Console

**Files to Modify:**

| File | Change |
|------|--------|
| `app/(app)/knowledge/page.tsx` | Update to new design (keep existing logic) |
| `components/knowledge/knowledge-list.tsx` | Simplify for document/link focus |
| `components/knowledge/knowledge-list-table.tsx` | Update columns |
| `components/knowledge/knowledge-status-badge.tsx` | Keep, may need new statuses |
| `components/knowledge/empty-state-knowledge.tsx` | Interactive empty state with demo data |

**Layout (Supabase-style):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Knowledge Base                        [+ Add Document]  [+ Index Link]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌───────────────────────────────────────────────────────┐ │
│  │  FILTER     │  │                                                       │ │
│  │             │  │  ┌───────────────────────────────────────────────────┐│ │
│  │  All (12)   │  │  │ 📄  company-handbook.pdf           ✓ Ready   47  ││ │
│  │  Documents  │  │  │     Uploaded 2 days ago            chunks        ││ │
│  │  Links      │  │  └───────────────────────────────────────────────────┘│ │
│  │  Sitemaps   │  │  ┌───────────────────────────────────────────────────┐│ │
│  │             │  │  │ 🔗  docs.example.com/api           ✓ Ready   123 ││ │
│  │  ─────────  │  │  │     Sitemap · 45 pages             chunks        ││ │
│  │             │  │  └───────────────────────────────────────────────────┘│ │
│  │  Status     │  │  ┌───────────────────────────────────────────────────┐│ │
│  │  ✓ Ready    │  │  │ 📄  product-specs.docx             ◐ Indexing    ││ │
│  │  ◐ Indexing │  │  │     Processing... 34%                            ││ │
│  │  ✗ Failed   │  │  └───────────────────────────────────────────────────┘│ │
│  │             │  │                                                       │ │
│  └─────────────┘  └───────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Knowledge Source Types:**

| Type | Icon | Description |
|------|------|-------------|
| **Document** | `FileText` | Uploaded PDF, TXT, DOCX, MD |
| **Link** | `Link` | Single page indexed |
| **Sitemap** | `Map` | Multi-page sitemap crawl |
| **Spider** | `Globe` | Recursive crawl from URL |

**Status Indicators:**

| Status | Icon | Color | Animation |
|--------|------|-------|-----------|
| `pending` | `Clock` | Yellow | None |
| `indexing` | `Loader2` | Blue | `animate-spin` + progress % |
| `ready` | `CheckCircle` | Green | None |
| `failed` | `AlertCircle` | Red | None |
| `paused` | `PauseCircle` | Gray | None |

**Source Card Layout:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📄  company-handbook.pdf                                    [⋮] Actions    │
│      Uploaded 2 days ago by john@example.com                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ✓ Ready                                    47 chunks │ 1.2 MB │ PDF        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Actions Dropdown:**

| Action | Icon | Description |
|--------|------|-------------|
| View Chunks | `Eye` | Open Knowledge Playground with this source |
| Resync | `RefreshCw` | Re-index this source |
| Pause | `Pause` | Stop indexing (for links) |
| Delete | `Trash2` | Remove source and all chunks |

**Smart Empty State (with Demo Data):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                        ┌─────────────────────┐                              │
│                        │     BookOpen        │                              │
│                        └─────────────────────┘                              │
│                                                                             │
│                   Your knowledge base is empty                              │
│                                                                             │
│   Upload documents or index websites to give your Copilot context.          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  📄 Upload Documents                                                │   │
│   │     PDF, DOCX, TXT, MD files up to 10MB                            │   │
│   │                                              [Upload Files]         │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🔗 Index a Website                                                 │   │
│   │     Enter a URL to index documentation or help pages               │   │
│   │                                              [Add Link]             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ─────────────────────────  or try our demo  ─────────────────────────    │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🏥 Load Example: Healthcare Policy Guide                           │   │
│   │     See how RAG works with a sample medical policy document         │   │
│   │                                              [Load Demo]            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Demo Data Options:**

| Demo | Description | Chunks | Use Case |
|------|-------------|--------|----------|
| Healthcare Policy Guide | Sample insurance policy | 34 chunks | Medical/Insurance |
| Software Documentation | Sample API docs | 67 chunks | Developer tools |
| Employee Handbook | Sample HR policies | 28 chunks | HR/Onboarding |

**Definition of Done:**

- [ ] Knowledge list displays all sources with Supabase-style layout
- [ ] Left sidebar filter works (type, status)
- [ ] Source cards show type icon, name, status, chunks
- [ ] Actions dropdown (View, Resync, Pause, Delete) functional
- [ ] Interactive empty state with upload/link options
- [ ] "Load Demo" button loads sample knowledge
- [ ] Progress indicator for indexing sources
- [ ] Build passes (`pnpm build`)

---

### Task 2.4: Implement Knowledge Upload Flow

**Objective:** Create a streamlined upload interface for adding documents (PDF/TXT/DOCX) and links/sitemaps to the knowledge base.

**Files to Create:**

| File | Purpose |
|------|---------|
| `app/(app)/knowledge/upload/page.tsx` | Upload page |
| `components/knowledge/upload-form.tsx` | Unified upload form |
| `components/knowledge/document-uploader.tsx` | File drop zone |
| `components/knowledge/link-indexer.tsx` | URL input with strategy selector |

**Files to Modify:**

| File | Change |
|------|--------|
| `app/api/knowledge/ingest/route.ts` | Ensure file upload works |
| `app/api/knowledge/index-link/route.ts` | Ensure link indexing works |

**Upload Form Tabs:**

| Tab | Content |
|-----|---------|
| **Documents** | File drop zone (PDF, TXT, DOCX, MD) |
| **Links** | URL input + strategy selector (single, sitemap, spider) |

**Document Upload:**

| Feature | Implementation |
|---------|----------------|
| **Drop Zone** | Drag-and-drop + click to browse |
| **Supported Types** | PDF, TXT, DOCX, MD, HTML |
| **File Size Limit** | 10MB per file |
| **Batch Upload** | Multiple files at once |
| **Progress** | Per-file progress bar |

**Link Indexing:**

| Feature | Implementation |
|---------|----------------|
| **URL Input** | Text field with validation |
| **Strategy Selector** | Radio: Single page, Sitemap, Spider crawl |
| **Options (Sitemap/Spider)** | Max pages, Max depth |
| **Preview** | Show estimated pages before confirming |

**Definition of Done:**

- [ ] Document upload works (drag-drop + click)
- [ ] Link indexing works (all strategies)
- [ ] Progress indicators during upload
- [ ] Redirect to knowledge list on success
- [ ] Error handling with toast notifications
- [ ] Validation (file types, URL format)
- [ ] Build passes (`pnpm build`)

---

### Task 2.5: Knowledge Playground (Trust Builder)

**Objective:** Create a "Test Retrieval" interface that allows users to query their knowledge base and see exactly which chunks would be retrieved. This builds trust in the RAG system and reduces "my agent is hallucinating" support tickets.

**UI Reference:** Pinecone Console, Algolia Dashboard, Elasticsearch Kibana

**Files to Create:**

| File | Purpose |
|------|---------|
| `app/(app)/knowledge/playground/page.tsx` | Playground page |
| `components/knowledge/playground-search.tsx` | Search input with options |
| `components/knowledge/chunk-result-card.tsx` | Individual chunk result display |
| `components/knowledge/similarity-score.tsx` | Visual similarity indicator |

**Files to Modify:**

| File | Change |
|------|--------|
| `app/api/knowledge/query/[knowledge_id]/route.ts` | Add playground query mode |
| `components/knowledge/knowledge-list.tsx` | Add "Test" action to source cards |

**Playground Layout:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Knowledge Playground                                                       │
│  Test how your Copilot retrieves information from uploaded documents        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🔍  What is the procedure for handling a flu patient?              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Source: [All Sources ▾]     Top K: [5 ▾]     Min Score: [0.7 ▾]           │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Found 5 matches (0.34s)                                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ████████████░░░░  0.94                                             │   │
│  │  📄 healthcare-policy.pdf · Page 47 · Chunk 156                     │   │
│  │                                                                     │   │
│  │  "...For patients presenting with flu-like symptoms, the standard   │   │
│  │   procedure is as follows: 1) Conduct initial triage assessment,    │   │
│  │   2) Administer rapid flu test if indicated, 3) If positive,        │   │
│  │   prescribe antiviral medication within 48 hours of symptom         │   │
│  │   onset for maximum efficacy..."                                    │   │
│  │                                                                     │   │
│  │  [Copy Chunk]  [View in Document]                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  █████████░░░░░░░  0.87                                             │   │
│  │  📄 healthcare-policy.pdf · Page 52 · Chunk 178                     │   │
│  │                                                                     │   │
│  │  "...Flu vaccination is recommended annually for all healthcare     │   │
│  │   workers. Patients with confirmed flu should be isolated using     │   │
│  │   standard respiratory precautions. Oseltamivir (Tamiflu) is        │   │
│  │   the preferred antiviral treatment..."                             │   │
│  │                                                                     │   │
│  │  [Copy Chunk]  [View in Document]                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Show More Results]                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Search Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| Source | Dropdown | "All Sources" | Filter to specific document/link |
| Top K | Dropdown | 5 | Number of results to return (3, 5, 10, 20) |
| Min Score | Slider | 0.7 | Minimum similarity threshold (0.5-0.95) |
| Search Type | Toggle | "Semantic" | Semantic (vector) vs Keyword (BM25) |

**Chunk Result Card:**

| Element | Purpose |
|---------|---------|
| Similarity Bar | Visual progress bar (0-100%) with score |
| Source Info | Document name, page number, chunk ID |
| Text Content | Raw chunk text with query terms highlighted |
| Actions | Copy to clipboard, View in document context |

**Similarity Score Visual:**

```
Score: 0.94 (Highly Relevant)
████████████████████░░░░░░░░░░  94%

Score: 0.72 (Relevant)
██████████████░░░░░░░░░░░░░░░░  72%

Score: 0.51 (Marginal)
██████████░░░░░░░░░░░░░░░░░░░░  51%
```

**API Endpoint:**

```typescript
// POST /api/knowledge/playground/query
interface PlaygroundQueryRequest {
  query: string
  sourceId?: string      // Filter to specific source
  topK?: number          // Default: 5
  minScore?: number      // Default: 0.7
  searchType?: "semantic" | "keyword"
}

interface PlaygroundQueryResponse {
  results: Array<{
    chunkId: string
    sourceId: string
    sourceName: string
    sourceType: "document" | "link" | "sitemap"
    pageNumber?: number
    content: string
    score: number
    highlightedContent: string  // Query terms wrapped in <mark>
  }>
  queryTime: number      // milliseconds
  totalChunksSearched: number
}
```

**Navigation Integration:**

| Location | Link Text | Route |
|----------|-----------|-------|
| Knowledge sidebar | "Playground" tab | `/knowledge/playground` |
| Source card actions | "Test Retrieval" | `/knowledge/playground?source={id}` |
| Empty results | "Test your knowledge" | `/knowledge/playground` |

**Definition of Done:**

- [ ] Playground page with search input and options
- [ ] Results display with similarity scores and chunk text
- [ ] Query term highlighting in results
- [ ] Source filtering works
- [ ] Top K and Min Score options work
- [ ] "Copy Chunk" button copies text to clipboard
- [ ] Loading state during search
- [ ] Empty state when no results found
- [ ] Build passes (`pnpm build`)

---

### Phase 2 Completion Checklist

| Task | Status | Depends On |
|------|--------|------------|
| 2.1: Chats List View (Linear-style) | 🔲 | Phase 1 |
| 2.2: Session Replay (LangSmith-style) | 🔲 Deferred | End of roadmap (§ Deferred) |
| 2.3: Knowledge List (Supabase-style) | 🔲 | Phase 1 |
| 2.4: Knowledge Upload Flow | 🔲 | 2.3 |
| 2.5: Knowledge Playground | 🔲 | 2.3, 2.4 |

**Phase 2 Exit Criteria:**

- [ ] Chats list with Linear-style compact rows
- [ ] Session Replay with 3-panel debug view and scrubber — **deferred** (visual/screenshot; see § Deferred)
- [ ] Knowledge list with status indicators and demo data option
- [ ] Knowledge upload (documents + links) working
- [ ] Knowledge Playground for testing RAG retrieval
- [ ] All interactive empty states implemented
- [ ] Build passes with no errors

---

## Phase 3: SaaS Features

This phase implements the monetization and operational features: ROI analytics and billing integration.

### Task 3.1: Implement ROI & Usage Analytics

**Objective:** Create a value-focused analytics dashboard that emphasizes **business impact** (time saved, tasks automated) over **costs** (tokens used). Token usage is moved to a "Developer" tab for technical users. This positions the product as a productivity tool, not an expense.

**UI Reference:** Vercel Analytics (big numbers, trend lines), Stripe Home (value metrics)

**Files to Modify:**

| File | Change |
|------|--------|
| `app/(app)/analytics/page.tsx` | Complete rewrite for ROI focus |
| `components/analytics/dashboard.tsx` | Replace with ROI dashboard |
| `components/analytics/metric-cards.tsx` | Add ROI-focused cards |

**Files to Create:**

| File | Purpose |
|------|---------|
| `components/analytics/roi-hero-metrics.tsx` | Big numbers: Time Saved, Tasks Automated |
| `components/analytics/time-saved-chart.tsx` | Time saved trend over time |
| `components/analytics/success-rate-card.tsx` | Success rate with trend arrow |
| `components/analytics/top-tasks-table.tsx` | Most automated tasks by domain |
| `components/analytics/developer-tab.tsx` | Token usage, cost breakdown for devs |

**Files to Modify (API):**

| File | Change |
|------|--------|
| `app/api/analytics/dashboard/route.ts` | Add ROI calculations |
| `app/api/cost/route.ts` | Add time-saved aggregation |

**ROI Dashboard Layout (Vercel-style):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Analytics                                        [This Week ▾]             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
│  │                       │  │                       │  │                 │  │
│  │   14.2 hours          │  │   127 tasks           │  │   94%           │  │
│  │   Time Saved          │  │   Automated           │  │   Success Rate  │  │
│  │                       │  │                       │  │                 │  │
│  │   ▲ +23% vs last week │  │   ▲ +12% vs last week │  │   ▲ +2% vs last │  │
│  │                       │  │                       │  │                 │  │
│  └───────────────────────┘  └───────────────────────┘  └─────────────────┘  │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Time Saved Over Time                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │         ╭─────╮                                                     │   │
│  │     ╭───╯     ╰───╮                                   ╭───────╮     │   │
│  │  ╭──╯             ╰───╮                           ╭───╯       │     │   │
│  │──╯                    ╰───────────────────────────╯           │     │   │
│  │  Mon    Tue    Wed    Thu    Fri    Sat    Sun                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Top Automated Workflows                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Domain              │ Tasks │ Time Saved │ Success │ Trend         │   │
│  ├─────────────────────────────────────────────────────────────────────│   │
│  │  openemr.io          │  45   │   3.2 hrs  │   96%   │  ▲ +15%       │   │
│  │  salesforce.com      │  32   │   2.1 hrs  │   91%   │  ▲ +8%        │   │
│  │  sheets.google.com   │  28   │   1.8 hrs  │   89%   │  ▼ -3%        │   │
│  │  jira.atlassian.com  │  22   │   1.5 hrs  │   95%   │  ▲ +22%       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**ROI Hero Metrics:**

| Metric | Calculation | Display |
|--------|-------------|---------|
| **Time Saved** | `totalSteps * 30 seconds` | "14.2 hours" with trend |
| **Tasks Automated** | Count of completed sessions | "127 tasks" with trend |
| **Success Rate** | `completedSessions / totalSessions * 100` | "94%" with trend |

**Time Saved Calculation:**

```typescript
// Each automated step saves ~30 seconds of manual work
// This is a conservative estimate based on user research

interface ROIMetrics {
  totalSteps: number           // From TaskAction count
  estimatedTimeSavedSeconds: number  // totalSteps * 30
  estimatedTimeSavedFormatted: string  // "14.2 hours"
  
  totalTasks: number           // Session count
  successfulTasks: number      // Sessions with status="completed"
  successRate: number          // percentage
  
  // Week-over-week comparison
  timeSavedTrend: number       // +23% or -5%
  tasksTrend: number
  successRateTrend: number
}
```

**Tabs:**

| Tab | Content | Audience |
|-----|---------|----------|
| **Overview** (default) | ROI metrics, time saved chart, top workflows | Everyone |
| **Developer** | Token usage, cost breakdown, model stats | Technical users |

**Developer Tab Content:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Developer Metrics                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │  245,832            │  │  $12.47             │  │  1,847 ms           │  │
│  │  Total Tokens       │  │  Total Cost         │  │  Avg Latency        │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  │
│                                                                             │
│  Token Usage by Action Type                     Cost by Model               │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
│  │  Planning        ████ 32%   │  │  gpt-4-turbo    ████████░░  $8.23   │   │
│  │  Action Gen      ██████ 45% │  │  gpt-4o-mini    ███░░░░░░░  $2.14   │   │
│  │  Verification    ██░ 15%    │  │  gpt-4o         ██░░░░░░░░  $2.10   │   │
│  │  Correction      █░ 8%      │  │                                     │   │
│  └─────────────────────────────┘  └─────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Time Period Selectors:**

| Period | Default |
|--------|---------|
| Today | — |
| This Week | ✓ |
| This Month | — |
| Last 30 days | — |
| Custom range | — |

**Definition of Done:**

- [ ] ROI hero metrics display (Time Saved, Tasks, Success Rate)
- [ ] Trend indicators show week-over-week comparison
- [ ] Time Saved chart displays correctly
- [ ] Top Automated Workflows table shows domain stats
- [ ] Developer tab shows token/cost metrics
- [ ] Time period selector works
- [ ] Loading states with skeletons
- [ ] Empty state for new users
- [ ] Build passes (`pnpm build`)

---

### Task 3.2: Implement Billing Page

**Objective:** Create a unified billing page showing subscription status, usage limits, payment methods, and invoices.

**Files to Modify:**

| File | Change |
|------|--------|
| `app/(app)/settings/billing/page.tsx` | May merge into main billing page |
| `components/billing/subscription-card.tsx` | Update or keep |
| `components/billing/balance-card.tsx` | Update or keep |

**Files to Create:**

| File | Purpose |
|------|---------|
| `app/(app)/billing/page.tsx` | Main billing page |
| `components/billing/plan-selector.tsx` | Plan comparison/upgrade |
| `components/billing/usage-meter.tsx` | Usage vs limit visualization |
| `components/billing/invoice-list.tsx` | Invoice history table |
| `components/billing/payment-method-card.tsx` | Stored payment methods |

**Billing Sections:**

| Section | Data Source | Display |
|---------|-------------|---------|
| **Current Plan** | Stripe subscription | Plan name, price, renewal date |
| **Usage** | TokenUsageLog / Session | Usage bar (e.g., "450 / 1000 tasks") |
| **Balance** | Stripe | Current balance (pay-as-you-go) |
| **Payment Methods** | Stripe | List with default indicator |
| **Invoices** | Stripe | Table with download links |

**Plan Tiers:**

| Plan | Limits | Price |
|------|--------|-------|
| Free | 20 min/month, 1 knowledge source | $0 |
| Pro | Unlimited tasks, 10 knowledge sources | $X/month |
| Enterprise | Custom | Contact sales |

**Definition of Done:**

- [ ] Current plan displayed correctly
- [ ] Usage meter shows current vs limit
- [ ] Upgrade flow works (Free → Pro)
- [ ] Payment methods manageable
- [ ] Invoice list with download
- [ ] Stripe integration functional
- [ ] Build passes (`pnpm build`)

---

### Task 3.3: Update Settings Pages

**Objective:** Consolidate and update settings pages to match the new product focus. Remove Screen Agent-specific settings, keep tenant and user settings.

**Files to Modify:**

| File | Change |
|------|--------|
| `app/(app)/settings/page.tsx` | Update navigation tabs |
| `app/(app)/settings/general/page.tsx` | Keep, update if needed |
| `app/(app)/settings/members/page.tsx` | Keep |
| `app/(app)/settings/billing/page.tsx` | May merge with `/billing` |

**Files to Delete (if Screen Agent specific):**

| File | Reason |
|------|--------|
| Any Screen Agent-specific settings | No longer needed |

**Settings Tabs:**

| Tab | Route | Content |
|-----|-------|---------|
| General | `/settings/general` | Tenant name, timezone |
| Members | `/settings/members` | Team management |
| Billing | `/settings/billing` → `/billing` | Redirect or embed |
| Security | `/settings/security` | 2FA, sessions |

**Definition of Done:**

- [ ] Settings navigation updated
- [ ] All tabs functional
- [ ] No broken links
- [ ] Screen Agent settings removed
- [ ] Build passes (`pnpm build`)

---

### Phase 3 Completion Checklist

| Task | Status | Depends On |
|------|--------|------------|
| 3.1: ROI & Usage Analytics | 🔲 | Phase 2, Cost Tracking |
| 3.2: Billing Page | 🔲 | Phase 2 |
| 3.3: Update Settings | 🔲 | Phase 2 |

**Phase 3 Exit Criteria:**

- [ ] ROI analytics with Time Saved as hero metric
- [ ] Developer tab for token/cost metrics
- [ ] Billing page functional with Stripe
- [ ] Settings consolidated and updated
- [ ] All SaaS features accessible
- [ ] Build passes with no errors

---

## Implementation Timeline Summary

| Phase | Tasks | Estimated Effort | Dependencies |
|-------|-------|------------------|--------------|
| **Phase 1: Cleanup & Shell** | 5 tasks | Medium | None |
| **Phase 2: Core Data Views** | 5 tasks | High | Phase 1 |
| **Phase 3: SaaS Features** | 3 tasks | Medium | Phase 2, Cost Tracking |

**Recommended Order:**

```
Week 1:  Task 1.1 → Task 1.2 → Task 1.3 → Task 1.4 → Task 1.5 (✅ DONE)
Week 2:  Task 2.1 → Task 2.2
Week 3:  Task 2.3 → Task 2.4 → Task 2.5
Week 4:  Task 3.1 → Task 3.2 → Task 3.3
```

---

## Documentation Reference by Task

This section maps each task to the specific documentation you should reference during implementation. Focus on the **Primary** docs first, then **Secondary** for enhancements.

### Phase 1: Cleanup & Shell

#### Task 1.1-1.2: Legacy Cleanup
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Next.js** | [App Router - Route Groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups) | Understanding `(app)` route group structure before deletion |
| Primary | **Next.js** | [File Conventions](https://nextjs.org/docs/app/api-reference/file-conventions) | Ensuring proper cleanup of `page.tsx`, `layout.tsx` files |

#### Task 1.3: New Sidebar & Navigation Shell
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Shadcn UI** | [Sidebar](https://ui.shadcn.com/docs/components/sidebar) | Main sidebar component structure |
| Primary | **Shadcn UI** | [Navigation Menu](https://ui.shadcn.com/docs/components/navigation-menu) | Navigation item patterns |
| Primary | **Shadcn UI** | [Sheet](https://ui.shadcn.com/docs/components/sheet) | Mobile sidebar drawer |
| Secondary | **Framer Motion** | [Layout Animations](https://www.framer.com/motion/layout-animations/) | Sidebar expand/collapse animation |
| Secondary | **NuQS** | [useQueryState](https://nuqs.47ng.com/) | Persisting sidebar state in URL |

#### Task 1.4: New Route Structure
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Next.js** | [Dynamic Routes](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes) | `/chats/[sessionId]` route pattern |
| Primary | **Next.js** | [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) | API route structure |
| Primary | **Next.js** | [Loading UI](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming) | Placeholder loading states |

#### Task 1.5: Dashboard (Home) Page
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Shadcn UI** | [Card](https://ui.shadcn.com/docs/components/card) | Metric cards, CTA cards |
| Primary | **Shadcn UI** | [Skeleton](https://ui.shadcn.com/docs/components/skeleton) | Loading states |
| Primary | **React Query** | [useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) | Fetching dashboard metrics |
| Secondary | **Magic UI** | [Number Ticker](https://magicui.design/docs/components/number-ticker) | Animated metric numbers |
| Secondary | **Framer Motion** | [Animate Presence](https://www.framer.com/motion/animate-presence/) | Card entrance animations |
| Secondary | **Tremor** | [Metric](https://www.tremor.so/docs/components/metric) | Alternative metric card style |

---

### Phase 2: Core Data Views

#### Task 2.1: Chats List View (Linear-style)
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Shadcn UI** | [Data Table](https://ui.shadcn.com/docs/components/data-table) | TanStack Table integration |
| Primary | **Shadcn UI** | [Badge](https://ui.shadcn.com/docs/components/badge) | Status badges |
| Primary | **Shadcn UI** | [Dropdown Menu](https://ui.shadcn.com/docs/components/dropdown-menu) | Filter dropdowns |
| Primary | **NuQS** | [useQueryStates](https://nuqs.47ng.com/docs/batching) | URL-synced filters (status, date, domain) |
| Primary | **React Query** | [Infinite Queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) | Cursor-based pagination |
| Secondary | **Framer Motion** | [Reorder](https://www.framer.com/motion/reorder/) | Drag to reorder (future) |

#### Task 2.2: Session Replay (LangSmith-style)
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Shadcn UI** | [Resizable](https://ui.shadcn.com/docs/components/resizable) | 3-panel resizable layout |
| Primary | **Shadcn UI** | [Slider](https://ui.shadcn.com/docs/components/slider) | Scrubber bar |
| Primary | **Shadcn UI** | [Scroll Area](https://ui.shadcn.com/docs/components/scroll-area) | Chat/steps scroll containers |
| Primary | **Shadcn UI** | [Tabs](https://ui.shadcn.com/docs/components/tabs) | Mobile tab layout |
| Primary | **React Query** | [useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) | Session detail fetching |
| Primary | **Langfuse** | [Tracing](https://langfuse.com/docs/tracing) | Understanding trace visualization patterns |
| Secondary | **Framer Motion** | [useScroll](https://www.framer.com/motion/use-scroll/) | Scroll-linked animations |
| Secondary | **Framer Motion** | [AnimatePresence](https://www.framer.com/motion/animate-presence/) | Step transition animations |

#### Task 2.3: Knowledge List (Supabase-style)
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Shadcn UI** | [Tabs](https://ui.shadcn.com/docs/components/tabs) | Vertical sidebar tabs (filter) |
| Primary | **Shadcn UI** | [Card](https://ui.shadcn.com/docs/components/card) | Knowledge source cards |
| Primary | **Shadcn UI** | [Progress](https://ui.shadcn.com/docs/components/progress) | Indexing progress indicator |
| Primary | **Shadcn UI** | [Alert Dialog](https://ui.shadcn.com/docs/components/alert-dialog) | Delete confirmation |
| Primary | **React Query** | [useMutation](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation) | Delete/Resync actions |
| Primary | **NuQS** | [useQueryState](https://nuqs.47ng.com/) | Filter state in URL |

#### Task 2.4: Knowledge Upload Flow
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Next.js** | [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) | File upload handling |
| Primary | **Shadcn UI** | [Form](https://ui.shadcn.com/docs/components/form) | React Hook Form integration |
| Primary | **Shadcn UI** | [Input](https://ui.shadcn.com/docs/components/input) | URL input field |
| Primary | **Shadcn UI** | [Radio Group](https://ui.shadcn.com/docs/components/radio-group) | Indexing strategy selector |
| Primary | **React Query** | [useMutation](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation) | Upload mutation with progress |
| Secondary | **Framer Motion** | [Drag](https://www.framer.com/motion/gestures/#drag) | Enhanced drag-drop zone |
| Secondary | **Magic UI** | [File Upload](https://magicui.design/docs/components/file-upload) | Animated upload component |

#### Task 2.5: Knowledge Playground
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Shadcn UI** | [Command](https://ui.shadcn.com/docs/components/command) | Search input with suggestions |
| Primary | **Shadcn UI** | [Select](https://ui.shadcn.com/docs/components/select) | Source filter, Top K selector |
| Primary | **Shadcn UI** | [Slider](https://ui.shadcn.com/docs/components/slider) | Min score threshold |
| Primary | **Shadcn UI** | [Progress](https://ui.shadcn.com/docs/components/progress) | Similarity score bars |
| Primary | **React Query** | [useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) | Search query with debounce |
| Primary | **LangGraph** | [RAG Tutorial](https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_agentic_rag/) | Understanding RAG retrieval patterns |
| Secondary | **Framer Motion** | [Layout](https://www.framer.com/motion/layout-animations/) | Search results animation |

---

### Phase 3: SaaS Features

#### Task 3.1: ROI & Usage Analytics
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Tremor** | [Area Chart](https://www.tremor.so/docs/visualizations/area-chart) | Time Saved trend chart |
| Primary | **Tremor** | [Bar Chart](https://www.tremor.so/docs/visualizations/bar-chart) | Token usage by action type |
| Primary | **Tremor** | [Donut Chart](https://www.tremor.so/docs/visualizations/donut-chart) | Model breakdown pie chart |
| Primary | **Tremor** | [Metric](https://www.tremor.so/docs/components/metric) | Hero metric cards |
| Primary | **Tremor** | [Table](https://www.tremor.so/docs/components/table) | Top workflows table |
| Primary | **Shadcn UI** | [Tabs](https://ui.shadcn.com/docs/components/tabs) | Overview / Developer tabs |
| Primary | **NuQS** | [useQueryState](https://nuqs.47ng.com/) | Time period selector in URL |
| Primary | **React Query** | [useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) | Analytics data fetching |
| Primary | **Langfuse** | [Analytics](https://langfuse.com/docs/analytics) | Token/cost tracking patterns |
| Secondary | **Magic UI** | [Number Ticker](https://magicui.design/docs/components/number-ticker) | Animated hero numbers |
| Secondary | **Framer Motion** | [useInView](https://www.framer.com/motion/use-in-view/) | Chart entrance animations |

#### Task 3.2: Billing Page
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Shadcn UI** | [Card](https://ui.shadcn.com/docs/components/card) | Plan cards, payment method cards |
| Primary | **Shadcn UI** | [Progress](https://ui.shadcn.com/docs/components/progress) | Usage meter |
| Primary | **Shadcn UI** | [Table](https://ui.shadcn.com/docs/components/table) | Invoice list |
| Primary | **Shadcn UI** | [Dialog](https://ui.shadcn.com/docs/components/dialog) | Upgrade plan modal |
| Primary | **React Query** | [useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) | Stripe data fetching |
| Secondary | **Magic UI** | [Bento Grid](https://magicui.design/docs/components/bento-grid) | Plan comparison layout |

#### Task 3.3: Settings Pages
| Priority | Library | Documentation | Why |
|----------|---------|---------------|-----|
| Primary | **Shadcn UI** | [Tabs](https://ui.shadcn.com/docs/components/tabs) | Horizontal settings tabs |
| Primary | **Shadcn UI** | [Form](https://ui.shadcn.com/docs/components/form) | Settings forms |
| Primary | **Shadcn UI** | [Switch](https://ui.shadcn.com/docs/components/switch) | Toggle settings |
| Primary | **Shadcn UI** | [Separator](https://ui.shadcn.com/docs/components/separator) | Section dividers |
| Primary | **React Query** | [useMutation](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation) | Save settings |

---

### Cross-Cutting Concerns

#### State Management
| Library | Documentation | Use Case |
|---------|---------------|----------|
| **NuQS** | [Getting Started](https://nuqs.47ng.com/docs) | URL-synced filters, pagination, tabs |
| **React Query** | [Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation) | Cache updates after mutations |

#### Animations & Microinteractions
| Library | Documentation | Use Case |
|---------|---------------|----------|
| **Framer Motion** | [Variants](https://www.framer.com/motion/variants/) | Consistent animation definitions |
| **Framer Motion** | [Spring Physics](https://www.framer.com/motion/transition/#spring) | Default: `{ stiffness: 400, damping: 30 }` |
| **Magic UI** | [Shimmer Button](https://magicui.design/docs/components/shimmer-button) | Primary CTA buttons |
| **Aceternity UI** | [Background Beams](https://ui.aceternity.com/components/background-beams) | Empty state backgrounds |

#### Data Visualization
| Library | Documentation | Use Case |
|---------|---------------|----------|
| **Tremor** | [Getting Started](https://www.tremor.so/docs/getting-started/installation) | All charts and metrics |
| **Tremor** | [Theming](https://www.tremor.so/docs/getting-started/theming) | Match design system colors |

#### Observability Integration
| Library | Documentation | Use Case |
|---------|---------------|----------|
| **Langfuse** | [JS/TS SDK](https://langfuse.com/docs/sdk/typescript) | Session cost tracking |
| **Langfuse** | [Traces](https://langfuse.com/docs/tracing) | Session Replay visualization |
| **LangGraph** | [Persistence](https://langchain-ai.github.io/langgraph/concepts/persistence/) | Agent state management |

---

### Quick Reference: Component → Library Mapping

| UI Pattern | Primary Library | Component |
|------------|-----------------|-----------|
| Data tables | Shadcn UI | `DataTable` (TanStack Table) |
| Charts | Tremor | `AreaChart`, `BarChart`, `DonutChart` |
| Metric cards | Tremor | `Metric` with trend indicator |
| Forms | Shadcn UI | `Form` (React Hook Form + Zod) |
| Modals/Dialogs | Shadcn UI | `Dialog`, `AlertDialog`, `Sheet` |
| Dropdowns | Shadcn UI | `DropdownMenu`, `Select`, `Command` |
| URL State | NuQS | `useQueryState`, `useQueryStates` |
| Server State | React Query | `useQuery`, `useMutation` |
| Animations | Framer Motion | `motion`, `AnimatePresence` |
| Resizable panels | Shadcn UI | `ResizablePanelGroup` |
| Loading states | Shadcn UI | `Skeleton` |
| Progress indicators | Shadcn UI | `Progress` |
| Special effects | Magic UI | `NumberTicker`, `Shimmer` |
| Background effects | Aceternity UI | `BackgroundBeams`, `SparklesCore` |

---

## UI Reference Gallery

This section provides concrete UI archetypes to replicate for each major screen, enabling fast implementation using shadcn/ui components.

### Dashboard (Task 1.5) — Clone: Vercel Dashboard

**Why:** Masterclass in "Grid of Cards" with clear hierarchy.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐        │
│  │  14.2 hours       │  │  127 tasks        │  │  94% success      │        │
│  │  Time Saved       │  │  Automated        │  │  Rate             │        │
│  │  ▲ +23%           │  │  ▲ +12%           │  │  ▲ +2%            │        │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘        │
│                                                                             │
│  Recent Activity                                           Quick Actions    │
│  ┌─────────────────────────────────────────────┐  ┌─────────────────────┐   │
│  │  ✓  Add patient "Jas"   openemr.io   2m ago│  │  + Add Knowledge    │   │
│  │  ✓  Search medication   drugs.com   15m ago│  │  + Invite Team      │   │
│  │  ○  Fill claim form     aetna.com   running│  │  → View All Chats   │   │
│  └─────────────────────────────────────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Shadcn Components:** `Card`, `Table`, `Badge`, `Button` (outline variant)

---

### Session List (Task 2.1) — Clone: Linear Issue List

**Why:** Handles high-density information perfectly.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ✓  │ Add new patient with name "Jas"          │ openemr.io │ 2m ago       │
│  ✓  │ Search for medication dosage             │ drugs.com  │ 15m ago      │
│  ○  │ Fill out insurance claim form            │ aetna.com  │ running      │
│  ✗  │ Export quarterly report                  │ sheets.go… │ 1h ago       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Patterns:**
- Compact rows with fixed column widths
- Status icon on far left (colored)
- Title truncated with ellipsis
- Domain as secondary text
- Relative timestamp on far right

**Shadcn Components:** `DataTable` (TanStack Table), `DropdownMenu`, `Badge`, `Avatar`

---

### Session Replay (Task 2.2) — Clone: LangSmith Traces

**Why:** Debug console pattern for AI agent traces.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CHAT (1/3)      │     SCREENSHOT (2/3)        │     STEPS (1/3)            │
├─────────────────────────────────────────────────────────────────────────────┤
│  User:           │  ┌─────────────────────┐    │  1. ✓ Open menu            │
│  "Add patient    │  │                     │    │  2. ✓ Click New            │
│   named Jas"     │  │   [DOM at Step 3]   │    │  3. → Fill name            │
│                  │  │                     │    │  4. ○ Submit               │
│  Assistant:      │  │   Name: [Jas|]      │    │                            │
│  "Filling form"  │  │                     │    │  Thought: "Found #101"     │
│                  │  └─────────────────────┘    │  Action: setValue(101)     │
├─────────────────────────────────────────────────────────────────────────────┤
│  ◄──────────────────────●─────────────────────────────────────────────────► │
│       Step 1       Step 2       Step 3*      Step 4       Step 5            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Patterns:**
- 3-panel layout with resizable panels
- Scrubber bar at bottom for time travel
- Keyboard navigation (arrow keys)
- Synchronized updates across panels

**Shadcn Components:** `ResizablePanelGroup`, `ScrollArea`, `Tabs` (mobile), `Slider` (scrubber)

---

### Knowledge List (Task 2.3) — Clone: Supabase Settings

**Why:** Clean separation of navigation and content.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────┐  ┌───────────────────────────────────────────────────────┐ │
│  │  FILTER     │  │  ┌───────────────────────────────────────────────────┐│ │
│  │  All (12)   │  │  │ 📄  company-handbook.pdf         ✓ Ready   47    ││ │
│  │  Documents  │  │  │     2 days ago                   chunks          ││ │
│  │  Links      │  │  └───────────────────────────────────────────────────┘│ │
│  │             │  │  ┌───────────────────────────────────────────────────┐│ │
│  │  ─────────  │  │  │ 🔗  docs.example.com/api         ✓ Ready   123   ││ │
│  │  Status     │  │  │     45 pages                     chunks          ││ │
│  │  ✓ Ready    │  │  └───────────────────────────────────────────────────┘│ │
│  │  ◐ Indexing │  │                                                       │ │
│  └─────────────┘  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Patterns:**
- Vertical sidebar for filters
- Card-based content list
- Status badges with icons
- Action buttons in card header

**Shadcn Components:** `Tabs` (vertical), `Card`, `Badge`, `DropdownMenu`, `Separator`

---

### Knowledge Playground (Task 2.5) — Clone: Pinecone Console

**Why:** Perfect for testing vector search.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔍  What is the procedure for flu?                                         │
│                                                                             │
│  Source: [All ▾]    Top K: [5 ▾]    Min Score: [0.7]                       │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Found 5 matches (0.34s)                                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ████████████░░░░  0.94   📄 healthcare-policy.pdf · Page 47        │   │
│  │  "...For patients with flu-like symptoms, the standard procedure    │   │
│  │   is: 1) Conduct triage, 2) Administer rapid test..."               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Patterns:**
- Search input at top
- Filter controls below search
- Result cards with similarity bars
- Expandable text content

**Shadcn Components:** `Input`, `Select`, `Slider`, `Card`, `Progress`

---

### ROI Analytics (Task 3.1) — Clone: Vercel Analytics

**Why:** Big numbers that tell a story.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
│  │                       │  │                       │  │                 │  │
│  │   14.2 hours          │  │   127 tasks           │  │   94%           │  │
│  │   TIME SAVED          │  │   AUTOMATED           │  │   SUCCESS       │  │
│  │                       │  │                       │  │                 │  │
│  │   ▲ +23% vs last week │  │   ▲ +12% vs last week │  │   ▲ +2%         │  │
│  │   ───────────────     │  │   ───────────────     │  │   ────────      │  │
│  │   Green trend line    │  │   Green trend line    │  │   Green line    │  │
│  └───────────────────────┘  └───────────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Patterns:**
- Large hero numbers (text-4xl font-bold)
- Small labels below (text-xs text-muted-foreground)
- Trend indicator with color (green up, red down)
- Mini sparkline chart

**Shadcn Components:** `Card`, `Badge` (for trends), custom chart component (recharts)

---

### Component Mapping Summary

| Screen | Primary Reference | Shadcn Components |
|--------|-------------------|-------------------|
| Dashboard | Vercel Dashboard | Card, Table, Badge, Button |
| Session List | Linear Issue List | DataTable, DropdownMenu, Badge |
| Session Replay | LangSmith Traces | ResizablePanelGroup, ScrollArea, Slider |
| Knowledge List | Supabase Settings | Tabs, Card, Badge, DropdownMenu |
| Knowledge Playground | Pinecone Console | Input, Select, Progress, Card |
| ROI Analytics | Vercel Analytics | Card, Badge, Chart (recharts) |
| Billing | Stripe Dashboard | Card, Table, Button |
| Settings | Supabase Settings | Tabs, Form, Input, Switch |

---

## Technical Considerations

### API Dependencies

The following API routes are **required** and should not be deleted:

| Route | Used By | Purpose |
|-------|---------|---------|
| `app/api/agent/interact/route.ts` | Extension | Core Copilot API |
| `app/api/session/` | Chats feature | Session CRUD |
| `app/api/knowledge/` | Knowledge feature | Document/link management |
| `app/api/cost/route.ts` | Analytics | Cost aggregation |
| `app/api/billing/` | Billing feature | Stripe integration |

### Data Models

| Model | Location | Used By |
|-------|----------|---------|
| Session | `lib/models/session.ts` | Chats feature |
| Message | `lib/models/message.ts` | Session detail |
| TaskAction | `lib/models/task-action.ts` | Execution steps |
| KnowledgeSource | `lib/models/knowledge-source.ts` | Knowledge feature |
| TokenUsageLog | `lib/models/token-usage-log.ts` | Analytics |

### Design System

Follow the design system rules in `.cursorrules`:

| Element | Specification |
|---------|---------------|
| Page titles | `text-lg font-semibold` |
| Page descriptions | `text-sm text-foreground` |
| Cards | `bg-muted/30`, `CardContent` with `pt-6` |
| Buttons | `size="sm"` always |
| Inputs | `h-9` height |
| Tables | Use `advanced-table.tsx` component |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking extension API | Only delete UI, keep API routes |
| Data loss | No database migrations in Phase 1 |
| User confusion | Add "legacy view" feature flag if needed |
| Build failures | Run `pnpm build` after each task |
| Design inconsistency | Follow `.cursorrules` strictly |

---

## Definition of Done (Overall)

The UI Revamp is complete when:

**Phase 1: Cleanup & Shell** ✅
- [x] All legacy Screen Agent screens removed
- [x] All legacy Presentation screens removed
- [x] New navigation shell implemented
- [x] Dashboard shows ROI metrics (Time Saved, Tasks, Success Rate)

**Phase 2: Core Data Views**
- [ ] Chats list (Linear-style compact rows)
- [ ] Session Replay (3-panel debug view with scrubber) — **deferred** (§ Deferred: Visual / Screenshot-Based)
- [ ] Knowledge list (Supabase-style with status indicators)
- [ ] Knowledge upload (documents + links)
- [ ] Knowledge Playground (RAG testing with similarity scores)
- [ ] Interactive empty states with demo data

**Phase 3: SaaS Features**
- [ ] ROI Analytics with Time Saved as hero metric
- [ ] Developer tab for token/cost metrics
- [ ] Billing page functional with Stripe
- [ ] Settings consolidated

**Quality Requirements**
- [ ] All routes accessible from navigation
- [ ] Mobile responsive (tab layouts where needed)
- [ ] Loading states with skeletons
- [ ] Interactive empty states (not just "no data")
- [ ] Build passes (`pnpm build`)
- [ ] No console errors
- [ ] Extension API routes still functional

---

## Deferred: Visual / Screenshot-Based Features (End of Roadmap)

**Focus:** We are **DOM-based only** for now. The following are **visual/screenshot-based** and moved to the **end of the roadmap**. Implement after DOM-based features are complete.

### Session Replay (LangSmith-style) — Deferred

**Objective:** Create a 3-panel session detail view with **screenshot scrubber** so users can step through execution history and see what the agent saw at each step (screenshot-based).

**Why deferred:** Center panel is **screenshot viewer** (visual); we prioritize **DOM-based** session detail (chat + steps + DOM snapshot text/structure only) first.

**When un-deferring:** Implement per original Task 2.2 spec:

- **Files:** `app/(app)/chats/[sessionId]/page.tsx`, `session-replay.tsx`, `replay-chat-panel.tsx`, `replay-screenshot-panel.tsx`, `replay-steps-panel.tsx`, `replay-scrubber.tsx`, `step-detail-card.tsx`
- **API:** `session/[sessionId]` and `messages` routes return messages + actions + snapshots (DOM/screenshots)
- **Layout:** 3-panel (Chat | **Screenshot** | Steps), scrubber bar; mobile tabs (Chat | Replay | Steps)
- **DoD:** 3-panel layout, scrubber steps through execution, screenshot updates per step, step details (thought/action/verification), keyboard nav, graceful fallback when no screenshots

**References:** LangSmith Traces, Sentry Replay, Chrome DevTools. Original full spec was in § Task 2.2 (replaced with pointer in Phase 2).

---

## References

| Document | Purpose |
|----------|---------|
| `docs/INTERACT_FLOW_WALKTHROUGH.md` | Interact API architecture |
| `docs/ARCHITECTURE.md` | System architecture |
| `docs/DEVELOPMENT.md` | Development guidelines |
| `.cursorrules` | Design system rules |
| `RULESETS.md` | Code generation rules |
| `lib/cost/` | Cost tracking implementation |
| `lib/models/` | Data model definitions |

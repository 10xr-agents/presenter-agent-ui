# Server-Side Agent Architecture

**Document Version:** 3.0  
**Date:** January 27, 2026  
**Status:** Technical Specification — All Features Complete  
**Changelog (3.0):** Merged `BACKEND_MISSING_ITEMS.md` into this document. Added rate limiting (§4.13), production logging (§4.14), data retention & cleanup (§4.15), error handling enhancements (§4.16), and API usage examples (§17). All implementation tasks complete (100%).  
**Changelog (2.0):** Major update: Added web search functionality (§4.8), chat persistence & session management (§4.9), debug endpoints (§10), Manus-style orchestrator features (§11-15: planning, verification, self-correction, outcome prediction, step refinement), enhanced error handling (§4.10). All features implemented and documented. See `THIN_SERVER_ROADMAP.md` for complete implementation details.  
**Changelog (1.7):** User Preferences API added to Summary (§9): `GET/POST /api/v1/user/preferences` for extension settings. See `THIN_SERVER_ROADMAP.md` §5 for implementation details.  
**Changelog (1.6):** Task 3 complete: `POST /api/agent/interact` implemented (`app/api/agent/interact/route.ts`); `tasks` and `task_actions` Mongoose models; shared RAG helper (`getRAGChunks()`); LLM integration (prompt builder, client, parser); §4.3 updated with implementation details; §8 Implementation Checklist interact items marked complete.  
**Changelog (1.5):** Task 2 complete: `GET /api/knowledge/resolve` implemented (`app/api/knowledge/resolve/route.ts`); §5.3 updated with implementation details; §8 Implementation Checklist resolve items marked complete.  
**Changelog (1.4):** §1.4 Knowledge types & `allowed_domains` as filter (not assert); `hasOrgKnowledge` on interact/resolve; no 403 `DOMAIN_NOT_ALLOWED`; public-only RAG path; extension “no knowledge for this website” dialog.  
**Target:** Next.js Intelligence Layer (Thin Client backend)

**Sync:** This document is the **specification**. Implementation details (MongoDB, Mongoose, Better Auth, Next.js) are in `THIN_SERVER_ROADMAP.md`. Keep both in sync; on conflict, prefer ROADMAP + enriched thread (auth adapters, DB stack, resolve = internal/debugging).

---

## 1. Overview

This document defines the **centralized Intelligence Layer** and **Member-facing API** for the Thin Client architecture. It is the single source of truth for:

- **Auth API** — Login (invite-based), session check, logout. Token issuance for the extension.
- **`POST /api/agent/interact`** — Action Loop: receives `url`, `query`, `dom`, and optional `taskId`/`sessionId`; uses RAG (scoped by **Tenant ID** and **Active Domain**), web search, server-held **action history**, and Manus-style orchestrator (planning, verification, self-correction); calls the LLM; returns **`NextActionResponse`**. Knowledge is injected **only into the LLM prompt**; the extension **never** receives raw chunks or citations — only `thought` and `action`.
- **`GET /api/knowledge/resolve`** — Knowledge Resolution: receives `url` and optional `query`; validates tenant; uses **`allowed_domains` as filter** (§1.4) to decide org-specific vs public-only RAG; returns **`ResolveKnowledgeResponse`** (`hasOrgKnowledge`, chunks, citations). **Internal use and debugging only** — not for extension overlay or end-user display.
- **Debug Endpoints** — Debug logging, session export, metrics collection for debug UI.
- **Session Management** — Persistent conversation threads with Session and Message schemas.

All inference, RAG retrieval, web search, action-history context, and orchestrator state live on the server. The extension acts as an **Action Runner** only. See §5.6 for the **interact vs resolve** distinction.

**Scope:** Member-facing only. Tenant onboarding, user provisioning, artifact ingestion, knowledge indexing, and domain **filter** (`allowed_domains`) management remain out of scope (Admin Terminal).

### 1.1 Conventions

| Convention | Description |
|------------|-------------|
| **Auth** | Bearer token (JWT or opaque). Validated on every request; yields `userId`, `tenantId`. |
| **Tenant ID** | From session/token. All DB and vector queries scoped by `tenant_id`. |
| **Active Domain** | From request `url` (`new URL(url).hostname`). Used as **filter** (when to use org-specific RAG), not to block access. See §1.4. |
| **Task ID** | Server-created UUID per task. Ties `POST /api/agent/interact` calls into a single multi-step workflow; action history stored per `taskId`. |

### 1.2 App Router Layout

```
app/
├── api/
│   ├── auth/
│   │   └── [...all]/route.ts      # Better Auth (toNextJsHandler)
│   ├── v1/
│   │   └── auth/
│   │       ├── login/route.ts     # POST login (adapter → accessToken in body)
│   │       ├── logout/route.ts    # POST logout
│   │       └── session/route.ts   # GET session
│   ├── agent/
│   │   └── interact/
│   │       └── route.ts     # Action Loop
│   └── knowledge/
│       └── resolve/
│           └── route.ts     # Knowledge Resolution (internal/debugging only)
lib/
├── agent/
│   ├── interact.ts          # Interact handler logic
│   ├── rag.ts               # RAG retrieval (tenant + domain)
│   ├── llm.ts               # LLM client + prompt construction
│   └── history.ts           # Action history (server-side)
├── auth/
│   ├── session.ts           # getSessionFromToken, tenant resolution
│   └── login.ts             # Login / logout / session handlers (adapters)
└── knowledge/
    └── resolve.ts           # Resolve handler logic
```

### 1.3 Database Stack & Tenant (Sync with ROADMAP)

- **Database:** **MongoDB** only. **Prisma** (Better Auth) for auth; **Mongoose** for app data. **No SQL migrations.** See `THIN_CLIENT_ROADMAP_SERVER.md` §1.4 and `ARCHITECTURE.md`.
- **Tenant:** In normal mode, tenant = **user** (`userId`). In organization mode, tenant = **organization** (`organizationId`). No separate `tenants` table. Use `getTenantState` / `getActiveOrganizationId`.
- **Auth:** Reuse Better Auth (User, Session, Organization). Add **Mongoose** model `allowed_domains` for domain **filter** (when to use org-specific RAG). **Tasks** and **task_actions** are Mongoose models (`THIN_CLIENT_ROADMAP_SERVER.md` §4.1).

### 1.4 Knowledge Types & `allowed_domains` as Filter (Not Assert)

Two types of knowledge:

| Type | Description | When used |
|------|-------------|-----------|
| **Public knowledge** | Publicly available information. | **Always.** We help on **all** domains. |
| **Organization-specific knowledge** | Knowledge ingested per tenant (DB), scoped by domain. | **Only** when Active Domain matches `allowed_domains` and we have org-specific data. |

**`allowed_domains` is a filter, not an assert.** It decides **when to query org-specific RAG**, not whether to block access.

- **Domain with org-specific knowledge:** Query RAG (org + public); ground results; return as usual. No special UI.
- **Other domains:** Do **not** query org-specific RAG. Use **public knowledge only**. **Never** 403. API returns `hasOrgKnowledge: false` so the **extension** can show: *“There isn’t any knowledge present for this website — all our suggestions are based on publicly available information.”*

We always help (suggestions on all domains). `allowed_domains` filters *when* we add the org-specific layer; it does **not** restrict which domains the user can use the extension on.

---

## 2. Auth API (Token Issuance)

Signup is **invite-based** and handled outside the extension. The extension only supports **login**. Tokens are used for `Authorization: Bearer <accessToken>` on all protected routes.

### 2.1 POST /api/v1/auth/login

**Request:** `Content-Type: application/json`, body `{ email, password }`.

**Response — 200 OK:** `{ accessToken, expiresAt, user: { id, email, name }, tenantId, tenantName }`.

**Zod:** `loginRequestBodySchema` (email, password min 1), `loginResponseSchema` (accessToken, expiresAt, user, tenantId, tenantName).

**Errors:** 400 `VALIDATION_ERROR`, 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_DISABLED`, 500.

### 2.2 GET /api/v1/auth/session

**Request:** `Authorization: Bearer <accessToken>`.

**Response — 200 OK:** `{ user: { id, email, name }, tenantId, tenantName }` (no token).

**Errors:** 401 `UNAUTHORIZED`, 500.

### 2.3 POST /api/v1/auth/logout

**Request:** `Authorization: Bearer <accessToken>`. Body optional.

**Response — 204 No Content.**

**Errors:** 401, 500.

### 2.4 Implementation Notes

- **Auth implementation:** Use **Better Auth** (Bearer plugin, `trustedOrigins` for extension) + **`/api/v1/auth/*` adapters** that wrap it and return `{ accessToken, expiresAt, user, tenantId, tenantName }` in the login body. See `THIN_CLIENT_ROADMAP_SERVER.md` §2.4 for Better Auth vs Next.js.
- **Shared helper:** `getSessionFromToken(Authorization header) → { userId, tenantId } | null`. Implement via `auth.api.getSession({ headers })` when Bearer is present. Use in all protected routes.
- Extension stores `accessToken` in `chrome.storage.local`; sends Bearer on all API calls; `credentials: "omit"`.
- **CORS:** Allow extension origin (`chrome-extension://<id>`) for **`/api/auth/*`**, `/api/v1/*`, `/api/agent/*`, `/api/knowledge/*` (including preflight `OPTIONS`).

---

## 3. Authentication & Tenant Resolution (Protected Routes)

### 3.1 Session Validation

- Every protected route (`/api/agent/*`, `/api/knowledge/*`) validates `Authorization: Bearer <accessToken>`.
- Use **`getSessionFromToken`** to resolve `userId` and `tenantId` from the token (e.g. via `auth.api.getSession({ headers })` when Bearer is present).
- If invalid or expired → **401 Unauthorized**.

### 3.2 Tenant ID

- **Source:** Derived from validated session — **user** (normal mode) or **organization** (org mode). No separate `tenants` table. Use `getTenantState` / `getActiveOrganizationId` (§1.3).
- **Usage:** All database and vector queries MUST be scoped by `tenant_id`. No cross-tenant data access.
- **Storage:** Mongoose models keyed by `tenantId` (or `organizationId` / `userId`); Prisma for auth only.

### 3.3 Active Domain & `allowed_domains` as Filter

- **Source:** Request `url` (from `POST /api/agent/interact` body or `GET /api/knowledge/resolve` query).
- **Derivation:** `const domain = new URL(url).hostname` (e.g. `app.acme.com`).
- **`allowed_domains` as filter (§1.4):** Load tenant’s `allowed_domains`. If `domain` matches a pattern **and** we have org-specific chunks for that domain → query org-specific RAG. Otherwise → use **public knowledge only**. **Never** 403 based on domain.
- **RAG scoping:** When org-specific, use `domain` (and optionally `url` path or `query`) to filter retrieval. When public-only, use public knowledge source.

---

## 4. POST /api/agent/interact (Action Loop)

### 4.1 Purpose

- Receives current **DOM**, **user instructions** (`query`), and **active tab URL** from the extension.
- Optionally receives **`taskId`**: if present, associates the request with an existing task and uses **server-stored action history** for context continuity.
- Validates **tenant** and **domain**; runs **RAG** (tenant + domain scoped); builds **prompt** (system + RAG + dom + action history); calls **LLM**; parses response into `thought` + `action`.
- Appends the new action to **action history** (create task and history on first request if no `taskId`).
- Returns **`NextActionResponse`** (`thought`, `action`, optional `usage`, optional `taskId`).

### 4.2 Contract

**Method:** `POST`  
**Path:** `/api/agent/interact`

**Headers:**

| Header | Value |
|--------|--------|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <accessToken>` |

**Request body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Active tab URL (absolute). Used for domain derivation and **filter** (§1.4). |
| `query` | string | Yes | User task instructions. |
| `dom` | string | Yes | Simplified, templatized DOM string (from extension pipeline). |
| `taskId` | string | No | UUID of existing task. If omitted, server creates a new task. |

**Response — 200 OK**

| Field | Type | Description |
|-------|------|-------------|
| `thought` | string | LLM reasoning for this step. |
| `action` | string | Action string, e.g. `click(123)`, `setValue(123, "x")`, `finish()`, `fail()`. |
| `usage` | object | Optional. `{ promptTokens: number; completionTokens: number }`. |
| `taskId` | string | Optional. Task UUID. Included on first response when server creates task; client sends on subsequent requests. |
| `hasOrgKnowledge` | boolean | Optional. `true` when org-specific RAG was used; `false` when public-only. Extension shows “no knowledge for this website” dialog when `false` (§1.4). |

**Zod schemas (example):**

```ts
// lib/agent/schemas.ts
import { z } from "zod";

export const interactRequestBodySchema = z.object({
  url: z.string().url(),
  query: z.string().min(1).max(10000),
  dom: z.string().min(1).max(500000),
  taskId: z.string().uuid().optional(),
});

export const nextActionResponseSchema = z.object({
  thought: z.string(),
  action: z.string(),
  usage: z
    .object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
    })
    .optional(),
  taskId: z.string().uuid().optional(),
  hasOrgKnowledge: z.boolean().optional(),
});

export type InteractRequestBody = z.infer<typeof interactRequestBodySchema>;
export type NextActionResponse = z.infer<typeof nextActionResponseSchema>;
```

### 4.3 Handler Logic

**Implementation:** `app/api/agent/interact/route.ts` (Task 3 complete).

**Steps:**
1. **OPTIONS:** Handle CORS preflight via `handleCorsPreflight`; return 204 if not extension origin.
2. **POST:**
   - Validate Bearer token via `getSessionFromRequest(req.headers)` → `{ userId, tenantId }`; return **401** if missing/invalid.
   - Parse and validate body with `interactRequestBodySchema` (Zod) from `lib/agent/schemas.ts`; return **400** if invalid.
   - **Task resolution:**
     - If `taskId` provided: Load task via `(Task as any).findOne({ taskId, tenantId })`. If not found → **404**. If `status` is `completed` or `failed` → **409**. Load action history via `(TaskAction as any).find({ tenantId, taskId }).sort({ stepIndex: 1 })`.
     - If no `taskId`: Create new task with UUID `taskId` (via `crypto.randomUUID()`), status `active`.
   - **RAG:** Call `getRAGChunks(url, query, tenantId)` from `lib/knowledge-extraction/rag-helper.ts` (shared with Task 2). Returns `{ chunks, hasOrgKnowledge }`. Inject chunks into prompt; extension never receives them.
   - **Prompt:** Build via `buildActionPrompt()` (`lib/agent/prompt-builder.ts`). System: role, actions, format. User: query, current time, previous actions (from `task_actions`), RAG context, DOM.
   - **LLM:** Call OpenAI via `callActionLLM()` (`lib/agent/llm-client.ts`). Reuses `OPENAI_API_KEY` from `.env.local`. Parse `<Thought>` and `<Action>` via `parseActionResponse()`. Validate action format via `validateActionFormat()`.
   - **History:** Append `{ thought, action, stepIndex }` to `task_actions`. If action is `finish()` or `fail()`, update `tasks.status` to `completed` or `failed`.
   - **Max steps:** Enforce limit (50); return **400** if exceeded.
   - Return `NextActionResponse` with CORS headers.

**See:** `THIN_CLIENT_ROADMAP_SERVER.md` §4.2 for detailed contract; `lib/agent/` for prompt builder, LLM client, schemas.

### 4.4 Action History (Server-Side)

- **Storage:** **Mongoose** models `tasks` (`lib/models/task.ts`) and `task_actions` (`lib/models/task-action.ts`). No SQL migrations. **Implementation:** `taskId` is UUID string (not MongoDB `_id`), generated via `crypto.randomUUID()`. Unique index on `(tenantId, taskId, stepIndex)` for `task_actions`.
- **Create task:** On first `/interact` without `taskId`, create `tasks` doc with UUID `taskId`, status `active`.
- **Append action:** Each successful interact appends a `task_actions` doc with `thought`, `action`, `stepIndex`. Unique on `(tenantId, taskId, stepIndex)`.
- **Prompt:** Include previous `(thought, action)` pairs from `task_actions` in the user message via `buildActionPrompt()` (e.g. “Previous Actions: Step 0: ... Action taken: click(123)”). This **migrates action-history context from client to server** and ensures **context continuity** across the multi-step workflow.
- **Limits:** Enforce max steps per task (50). If exceeded, mark task as `failed` and return **400**.

### 4.5 RAG Pipeline (Tenant + Domain Filter)

- **Input:** `tenantId`, `domain` (from `url`), optionally `url` path, `query`.
- **Steps:**
  1. **Filter (§1.4):** If `domain` matches `allowed_domains` **and** we have org-specific chunks for that domain → use **org-specific RAG**; set `hasOrgKnowledge = true`. Else → use **public knowledge only**; set `hasOrgKnowledge = false`. Never 403.
  2. **Retrieval (org-specific):** Query vector DB / RAG with `tenant_id = tenantId`, `domain` or `url_pattern` in metadata; return top-k chunks. **Retrieval (public-only):** Use public knowledge source; no tenant/domain filters.
  3. **Output:** Top-k **chunks** (id, content, documentTitle, metadata). No embeddings in API response.
- **Usage:** Inject chunks into the LLM user message (e.g. “Relevant company knowledge: …” or “Public context: …”) so the model can use them for next-action decisions.
- **Caching:** Optional. Cache retrieval result per `(tenantId, domain, url, query)` or per `(url, query)` for public-only, with short TTL.

### 4.6 LLM Integration

- **Provider:** OpenAI (or configured alternative). Model selection per tenant or global config.
- **Prompt:** System message (role, actions, format) + user message (query, time, **server-held action history**, **RAG context**, **web search results** (if applicable), current `dom`).
- **Parsing:** Extract `<Thought>...</Thought>` and `<Action>...</Action>`. Validate action format (e.g. `click(n)`, `setValue(n, "s")`, `finish()`, `fail()`, `googleSearch("query")`, `verifySuccess("description")`). On parse failure, retry or return `fail()`.
- **Output:** `thought` string, `action` string. Optionally include `usage` from LLM API in `NextActionResponse`.
- **User-Friendly Language:** All LLM engines produce user-friendly, non-technical messages directly in `<Thought>` responses (no frontend transformation needed).

### 4.7 Web Search Integration

- **Reasoning Layer:** New three-step reasoning pipeline (see `REASONING_LAYER_IMPROVEMENTS.md`):
  1. **Knowledge & Gap Analysis:** LLM analyzes task context to determine if search is needed (`analyzeTaskContext()`)
  2. **Conditional Search:** Search only executes when `needsWebSearch` is true, using refined queries (not hardcoded "how to" format)
  3. **Feasibility Check:** Post-search verification to ensure we have all required information (`verifyInformationCompleteness()`)
- **Pre-Search:** For new tasks, reasoning engine analyzes context before deciding to search. No blind searching.
- **Query Refinement:** Search queries are intelligently refined by the reasoning engine (e.g., "How to register new patient OpenEMR 7.0" instead of "how to add patient demo.openemr.io").
- **Dynamic Search:** LLM can call `googleSearch(query)` action at any step during task execution. Search results are injected into LLM thought for next action.
- **Implementation:** 
  - `lib/agent/reasoning-engine.ts` — Context analysis and information completeness verification
  - `lib/agent/web-search.ts` — Refined query search with adaptive domain filtering
- **Provider:** Tavily API (AI-native, domain-restricted search).
- **Domain Restriction:** Search results are restricted to the domain from the `url` parameter, with adaptive expansion if results are poor (< 3 results).
- **Action:** `googleSearch("query")` — Available as SERVER tool that LLM can call dynamically.

### 4.8 Chat Persistence & Session Management

- **Session Model:** `sessions` collection stores conversation threads with `sessionId`, `userId`, `tenantId`, `url`, `status`, `metadata`.
- **Message Model:** `messages` collection stores individual messages with `messageId`, `sessionId`, `role`, `content`, `actionString`, `status`, `error`, `sequenceNumber`, `timestamp`, `snapshotId`, `domSummary`.
- **DOM Bloat Management:** DOM snapshots stored separately in `snapshots` collection. Messages use `snapshotId` reference and `domSummary` (max 200 chars) for context without bloat. Only create snapshots for DOMs > 1000 chars.
- **History Loading:** Message history excludes full DOMs (uses `.select()` to exclude snapshotId). Prompt builder uses `domSummary` for past actions, full DOM only for current state.
- **Session Endpoints:** See §4.8.1 and §4.8.2 for detailed specifications.

#### 4.8.1 GET /api/session/[sessionId]/messages

**Objective:** Retrieve conversation history for a specific session with pagination and filtering support.

**Method:** `GET`

**Path:** `/api/session/[sessionId]/messages`

**Auth:** Bearer token required (validated via `getSessionFromRequest(req.headers)`)

**Query Parameters:**
- `limit` (optional, number, default: 50, max: 200) — Maximum number of messages to return
- `since` (optional, ISO 8601 date string) — Filter messages created after this timestamp

**Request Validation:**
- `sessionId` must be valid UUID format
- User must own the session (tenant isolation enforced)
- `limit` must be between 1 and 200 (default: 50)
- `since` must be valid ISO 8601 date string if provided

**Response — 200 OK:**
```typescript
{
  sessionId: string; // UUID
  messages: Array<{
    messageId: string; // UUID
    role: 'user' | 'assistant' | 'system';
    content: string;
    actionPayload?: {
      type?: string;
      elementId?: number;
      text?: string;
      [key: string]: unknown;
    };
    actionString?: string; // e.g., "click(123)", "setValue(42, \"text\")"
    status?: 'success' | 'failure' | 'pending';
    error?: {
      message?: string;
      code?: string;
      [key: string]: unknown;
    };
    sequenceNumber: number;
    timestamp: string; // ISO 8601
    domSummary?: string; // Small text summary (max 200 chars) - no full DOM
    metadata?: {
      tokens_used?: { promptTokens?: number; completionTokens?: number };
      latency?: number;
      llm_model?: string;
      [key: string]: unknown;
    };
  }>;
  total: number; // Total message count for the session
}
```

**Error Responses:**
- **401 Unauthorized:** Invalid or missing Bearer token
- **404 Not Found:** Session not found or user doesn't own session
- **400 Bad Request:** Invalid `sessionId` format, invalid `limit` or `since` parameter

**Implementation Notes:**
- **Tenant Isolation:** Query scoped by `tenantId` and `userId` to ensure user owns session
- **DOM Bloat Prevention:** Use `.select()` to exclude `snapshotId` and full DOM. Only include `domSummary` for context
- **Ordering:** Sort by `sequenceNumber` ascending (oldest first)
- **Pagination:** Use `limit` for result count, `since` for time-based filtering
- **Security:** Verify session ownership before returning messages
- **Archived Sessions:** Archived sessions are excluded from this endpoint (Chrome extension compatibility)

**File Location:** `app/api/session/[sessionId]/messages/route.ts`

#### 4.8.2 GET /api/session

**Objective:** List all chat sessions for the authenticated user with filtering and pagination support.

**Method:** `GET`

**Path:** `/api/session`

**Auth:** Bearer token required (validated via `getSessionFromRequest(req.headers)`)

**Query Parameters:**
- `status` (optional, string, enum: `'active' | 'completed' | 'failed' | 'interrupted' | 'archived'`) — Filter by session status
- `includeArchived` (optional, boolean, default: `false`) — Include archived sessions in results
- `limit` (optional, number, default: `20`, max: `100`) — Number of sessions to return
- `offset` (optional, number, default: `0`) — Pagination offset

**Request Validation:**
- `status` must be one of the enum values if provided
- `limit` must be between 1 and 100
- `offset` must be non-negative

**Response — 200 OK:**
```typescript
{
  success: true;
  data: {
    sessions: Array<{
      sessionId: string; // UUID
      url: string; // Initial URL where the task started
      status: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
      createdAt: string; // ISO 8601
      updatedAt: string; // ISO 8601
      messageCount: number; // Total number of messages in the session
      metadata?: {
        taskType?: string;
        initialQuery?: string;
        [key: string]: unknown;
      };
    }>;
    pagination: {
      total: number; // Total number of sessions matching filter
      limit: number;
      offset: number;
      hasMore: boolean; // Whether there are more sessions beyond current page
    };
  };
}
```

**Error Responses:**
- **401 Unauthorized:** Invalid or missing Bearer token
- **400 Bad Request:** Invalid query parameters

**Implementation Notes:**
- **Default Behavior:** By default, only returns `active` sessions (excludes `archived`)
- **Archived Sessions:** Archived sessions are excluded by default to prevent Chrome extension from using them. Set `includeArchived=true` to include them (for UI auditing).
- **Status Filtering:** If `status` is provided, filter by that status. If not provided and `includeArchived=false`, defaults to `active`.
- **Pagination:** Results are sorted by `updatedAt` descending (most recently updated first)
- **Message Count:** Calculated by counting messages with matching `sessionId` and `tenantId`
- **Tenant Isolation:** Query scoped by `tenantId` (from session)
- **Security:** Only return sessions owned by the authenticated user

**File Location:** `app/api/session/route.ts`

#### 4.8.3 POST /api/session (Archive Session)

**Objective:** Archive a session. Archived sessions are not used by Chrome extension but available in UI for auditing and tracking.

**Method:** `POST`

**Path:** `/api/session`

**Auth:** Bearer token required (validated via `getSessionFromRequest(req.headers)`)

**Request Body:**
```typescript
{
  sessionId: string; // UUID of session to archive
}
```

**Response — 200 OK:**
```typescript
{
  success: true;
  data: {
    sessionId: string;
    status: "archived";
    message: "Session archived successfully";
  };
}
```

**Error Responses:**
- **401 Unauthorized:** Invalid or missing Bearer token
- **400 Bad Request:** Invalid `sessionId` format
- **403 Forbidden:** User does not own the session
- **404 Not Found:** Session not found

**Implementation Notes:**
- **Archive Action:** Updates session `status` to `"archived"`
- **Chrome Extension:** Archived sessions are automatically excluded from Chrome extension queries
- **UI Access:** Archived sessions can be retrieved via `GET /api/session?includeArchived=true` for auditing
- **Security:** Only session owner can archive their sessions

**File Location:** `app/api/session/route.ts`

#### 4.8.4 GET /api/session/latest

**Objective:** Get the most recent active session for the current user with optional status filtering.

**Method:** `GET`

**Path:** `/api/session/latest`

**Auth:** Bearer token required (validated via `getSessionFromRequest(req.headers)`)

**Query Parameters:**
- `status` (optional, string, enum: `'active' | 'completed' | 'failed' | 'interrupted'`, default: `'active'`) — Filter by session status

**Request Validation:**
- `status` must be one of: `'active'`, `'completed'`, `'failed'`, `'interrupted'` if provided

**Response — 200 OK:**
```typescript
{
  sessionId: string; // UUID
  url: string; // Initial URL where the task started
  status: 'active' | 'completed' | 'failed' | 'interrupted';
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  messageCount: number; // Total number of messages in the session
  metadata?: {
    taskType?: string;
    initialQuery?: string;
    [key: string]: unknown;
  };
} | null  // null if no sessions exist matching criteria
```

**Error Responses:**
- **401 Unauthorized:** Invalid or missing Bearer token
- **400 Bad Request:** Invalid `status` parameter
- **404 Not Found:** No session found matching criteria (returns 404, not null)

**Implementation Notes:**
- **Latest Definition:** Most recent session by `updatedAt` descending (most recently updated)
- **Tenant Isolation:** Query scoped by `tenantId` (from session)
- **Status Filtering:** If `status` provided, filter by status; otherwise default to `'active'`
- **Message Count:** Calculate by counting messages with matching `sessionId` and `tenantId`
- **Null Response:** Return 404 (not null) if no sessions found — this is a valid state
- **Security:** Only return sessions owned by the authenticated user

**File Location:** `app/api/session/latest/route.ts`

### 4.9 Manus-Style Orchestrator

The agent uses a proactive "Reason-Act-Verify" orchestrator pattern:

- **Planning Engine (§11):** Generates high-level action plans before execution. Plans stored in `tasks.plan` field with steps, currentStepIndex, and status tracking.
- **Verification Engine (§12):** Compares expected vs actual state after each action. Uses DOM-based checks and semantic verification (LLM-based). Stores verification results in `verification_records`.
- **Self-Correction Engine (§13):** Analyzes verification failures and generates alternative approaches. Supports multiple correction strategies (ALTERNATIVE_SELECTOR, ALTERNATIVE_TOOL, GATHER_INFORMATION, UPDATE_PLAN, RETRY_WITH_DELAY). Stores correction records in `correction_records`.
- **Outcome Prediction (§14):** Predicts what should happen after each action. Generates expected outcomes with natural language description and DOM-based expectations. Stored in `task_actions.expectedOutcome`.
- **Step Refinement (§15):** Converts high-level plan steps into specific tool actions. Determines tool type (DOM vs SERVER) and routes execution accordingly.

**Orchestrator Status:** Task status enum extended: `'planning'`, `'executing'`, `'verifying'`, `'correcting'`, `'completed'`, `'failed'`, `'interrupted'`.

### 4.10 Enhanced Error Handling

- **Error Detection:** Errors from client execution reports are detected and injected into LLM context.
- **System Messages:** Failures trigger system messages that inform the LLM about what went wrong.
- **Explicit Verification:** `verifySuccess(description)` action allows LLM to explicitly verify task completion before calling `finish()`. Prevents deadlock scenarios where agent fixes issue but can't finish.
- **Finish() Validation:** System intercepts `finish()` after recent failures and forces `verifySuccess()` first. After verification, `finish()` is allowed.
- **Error Debug Info:** Error responses include `debugInfo` field (when debug mode enabled) with error type, message, context, stack traces (debug only), and recovery suggestions.
- **Information Gap Detection:** Reasoning engine identifies missing information and returns `NEEDS_USER_INPUT` response when user input is required before proceeding.

### 4.11 Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 200 | `NEEDS_USER_INPUT` | Reasoning engine determined that user input is required before proceeding. |
| 400 | `VALIDATION_ERROR` | Invalid body (url, query, dom, taskId). |
| 401 | `UNAUTHORIZED` | Missing or invalid token. |
| 404 | `TASK_NOT_FOUND` | `taskId` provided but task not found for tenant. |
| 409 | `TASK_COMPLETED` | Task already finished; reject further interact. |
| 429 | `RATE_LIMIT` | Per-tenant or per-user rate limit. |
| 500 | `INTERNAL_ERROR` | Server or LLM error. |

**Note:** No **403 `DOMAIN_NOT_ALLOWED`**. `allowed_domains` is a **filter** (§1.4); we always return 200 when authenticated, using org-specific or public-only knowledge.

**New Response Type:** `NEEDS_USER_INPUT` (200 status) — Returned when the reasoning engine determines that missing information requires user input. Response includes `userQuestion` and `missingInformation` fields.

### 4.12 Response Enhancements

**Enhanced `NextActionResponse` includes:**
- `thought` (string) — LLM reasoning (user-friendly language)
- `action` (string) — Action string
- `usage` (object, optional) — Token usage
- `taskId` (string, optional) — Task UUID
- `sessionId` (string, optional) — Session UUID (for chat persistence)
- `hasOrgKnowledge` (boolean, optional) — Whether org-specific RAG was used
- `ragDebug` (object, optional) — RAG debug metadata (domain matching, chunk count, etc.)
- `metrics` (object, optional) — Execution metrics (timing, token usage, step counts)
- `verification` (object, optional) — Verification result (if verification occurred)
- `correction` (object, optional) — Correction result (if self-correction occurred)
- `plan` (object, optional) — Action plan structure (if planning enabled)
- `currentStep` (number, optional) — Current step index in plan
- `totalSteps` (number, optional) — Total number of steps in plan
- `status` (string, optional) — Task status (includes orchestrator statuses)
- `expectedOutcome` (object, optional) — Expected outcome for this action
- `toolAction` (object, optional) — Tool action structure (if step refinement occurred)
- `debugInfo` (object, optional) — Error debug information (when debug mode enabled)

### 4.13 Rate Limiting

**Status:** ✅ **COMPLETE** — January 27, 2026

**Objective:** Prevent API abuse and ensure fair resource usage across tenants.

**Implementation:** `lib/middleware/rate-limit.ts`

**Rate Limit Configuration:**
- **Per-Tenant Limits:** Different limits for different tenant tiers (free, pro, enterprise)
- **Per-Endpoint Limits:** Different limits for different endpoints:
  - `/api/agent/interact` — 10 requests per minute (expensive LLM calls)
  - `/api/knowledge/resolve` — 30 requests per minute (medium cost)
  - `/api/session` — 100 requests per minute (cheap reads)
- **Storage:** MongoDB with TTL indexes for automatic cleanup
- **Key Generation:** `rate-limit:${tenantId}:endpoint` for per-tenant limits

**Rate Limit Headers:**
- `X-RateLimit-Limit` — Maximum requests allowed in window
- `X-RateLimit-Remaining` — Remaining requests in current window
- `X-RateLimit-Reset` — Unix timestamp when window resets

**Error Response — 429 Too Many Requests:**
```typescript
{
  success: false,
  code: "RATE_LIMIT",
  message: "Rate limit exceeded. Please try again later.",
  retryAfter: number; // Seconds until retry allowed
}
```

**Implementation Notes:**
- Applied to all agent endpoints via `applyRateLimit()` middleware
- Per-tenant rate limiting using `tenantId` from session
- IP-based fallback for unauthenticated requests
- TTL indexes for automatic cleanup of expired rate limit records

### 4.14 Production Logging & Monitoring

**Status:** ✅ **COMPLETE** — January 27, 2026

**Implementation:** `lib/utils/logger.ts`

**Structured Logging:**
- **Format:** JSON format for production (log aggregation), human-readable for development
- **Log Levels:** `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- **Context Fields:** `userId`, `tenantId`, `requestId`, `endpoint`, `method`, `statusCode`, `duration`, `metadata`
- **Error Serialization:** Stack traces, error names, and messages included

**Request/Response Logging:**
- All API requests logged with method, path, query params, body (sanitized)
- Response status, duration, token usage (for LLM endpoints)
- Sensitive data excluded (passwords, tokens, PII)

**Log Aggregation:**
- JSON format ready for CloudWatch, Datadog, or similar
- Structured format for easy parsing and filtering

**Health Check Enhancement:**
- `GET /api/health` enhanced with comprehensive service status checks
- Checks MongoDB, Prisma (Better Auth), and Redis connectivity
- Returns service status levels: `healthy`, `degraded`, `unhealthy`
- Includes service latency tracking

### 4.15 Data Retention & Cleanup

**Status:** ✅ **COMPLETE** — January 27, 2026

**Implementation:** `lib/jobs/cleanup.ts`

**Retention Policies:**
- **Tasks:** 90 days (completed/failed), 30 days (interrupted)
- **Sessions:** 90 days (completed/failed), 30 days (interrupted)
- **Snapshots:** 30 days (all snapshots)
- **Debug Logs:** 7 days (all debug logs)
- **Verification Records:** 90 days (all records)
- **Correction Records:** 90 days (all records)

**Cleanup Implementation:**
- **Batch Processing:** 100 records per batch to avoid database load
- **Cascading Deletes:** 
  - `task_actions` deleted with tasks
  - `messages` deleted with sessions
- **Error Handling:** Fail-safe behavior with comprehensive logging
- **Statistics:** Returns `recordsDeleted`, `errors`, `duration` for monitoring

**Usage:**
- Can be called manually or scheduled via BullMQ/cron
- Example: `await runAllCleanupJobs()`

### 4.16 Error Handling Enhancements

**Status:** ✅ **COMPLETE** — January 27, 2026

**Implementation:** `lib/utils/error-codes.ts`, `lib/utils/api-response.ts`

**Standardized Error Codes:**
- **Authentication:** `UNAUTHORIZED`, `FORBIDDEN`
- **Validation:** `VALIDATION_ERROR`, `INVALID_ACTION_FORMAT`, `INVALID_REQUEST`
- **Rate Limiting:** `RATE_LIMIT`, `QUOTA_EXCEEDED`
- **Resources:** `NOT_FOUND`, `SESSION_NOT_FOUND`, `TASK_NOT_FOUND`, `TASK_COMPLETED`, `RESOURCE_CONFLICT`
- **Server Errors:** `INTERNAL_ERROR`, `LLM_ERROR`, `DATABASE_ERROR`, `EXTERNAL_SERVICE_ERROR`
- **Execution:** `PARSE_ERROR`, `MAX_STEPS_EXCEEDED`, `TIMEOUT`

**Standardized Error Response Format:**
```typescript
{
  success: false,
  code: ErrorCode | string,
  message: string,
  details?: {
    field?: string,
    reason?: string,
    [key: string]: unknown
  },
  debugInfo?: {
    errorType: string,
    stack?: string,
    context?: Record<string, unknown>
  },
  retryAfter?: number // For rate limit errors (seconds)
}
```

**Error Recovery:**
- Error recovery strategies implemented in `lib/utils/error-debug.ts`
- Context-aware suggestions for different error types
- Error classification for better handling

---

## 5. GET /api/knowledge/resolve

### 5.1 Purpose

- Returns **knowledge context** (chunks and citations) for **internal use and debugging only** (no inference, no LLM).
- Validates **tenant**; uses **`allowed_domains` as filter** (§1.4) to decide org-specific vs public-only. **Org-specific:** **proxy** to the **browser automation / knowledge extraction service** (no duplicate storage or RAG in Next.js). **Public-only:** no extraction call; return `hasOrgKnowledge: false`, empty context. Returns **`ResolveKnowledgeResponse`** with `hasOrgKnowledge`.
- **Not** for extension overlay, side panel, or tooltips shown to end users. Use resolve to inspect what knowledge returns for a given `url`/`query` (e.g. debugging, tooling, internal dashboards). Extraction service contract → **`BROWSER_AUTOMATION_RESOLVE_SCHEMA.md`**; proxy details → `THIN_CLIENT_ROADMAP_SERVER.md` §3.1, §3.2.

### 5.2 Contract

**Method:** `GET`  
**Path:** `/api/knowledge/resolve`

**Headers:**

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <accessToken>` |

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Active tab URL. Used for domain and **filter** (§1.4). |
| `query` | string | No | Optional query for relevance filtering. |

**Response — 200 OK**

| Field | Type | Description |
|-------|------|-------------|
| `allowed` | boolean | Always `true` when 200. |
| `domain` | string | Resolved domain (e.g. `app.acme.com`). |
| `hasOrgKnowledge` | boolean | `true` when org-specific RAG was used; `false` when public-only. Extension uses this to show “no knowledge for this website” dialog (§1.4). |
| `context` | array | Chunks: `{ id, content, documentTitle, metadata? }`. |
| `citations` | array | Optional. `{ documentId, documentTitle, section?, page? }`. |

**Zod schemas (example):**

```ts
export const knowledgeChunkSchema = z.object({
  id: z.string(),
  content: z.string(),
  documentTitle: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const citationSchema = z.object({
  documentId: z.string(),
  documentTitle: z.string(),
  section: z.string().optional(),
  page: z.number().optional(),
});

export const resolveKnowledgeResponseSchema = z.object({
  allowed: z.literal(true),
  domain: z.string(),
  hasOrgKnowledge: z.boolean(),
  context: z.array(knowledgeChunkSchema),
  citations: z.array(citationSchema).optional(),
});

export type ResolveKnowledgeResponse = z.infer<typeof resolveKnowledgeResponseSchema>;
```

### 5.3 Handler Logic

**Implementation:** `app/api/knowledge/resolve/route.ts` (Task 2 complete).

**Steps:**
1. **OPTIONS:** Handle CORS preflight via `handleCorsPreflight`; return 204 if not extension origin.
2. **GET:**
   - Validate Bearer token via `getSessionFromRequest(req.headers)` → `{ userId, tenantId }`; return **401** if missing/invalid.
   - Read query params: `url` (required), `query` (optional). Validate `url` with `new URL()`; return **400** if missing/invalid.
   - Derive domain: `domain = new URL(url).hostname`.
   - Load `allowed_domains`: `connectDB()`, then `(AllowedDomain as any).find({ tenantId })`; check if any pattern matches via `matchesDomainPattern(domain, pattern)`.
   - **If match:** `hasOrgKnowledge = true`; **proxy** to extraction service via `fetchResolveFromExtractionService(url, query, tenantId)` (schema: **`BROWSER_AUTOMATION_RESOLVE_SCHEMA.md`**); normalize response → `context`, `citations`.
   - **If no match:** `hasOrgKnowledge = false`; `context = []`, `citations = []`; no extraction call. **Never 403.**
   - Return `{ allowed: true, domain, hasOrgKnowledge, context, citations? }` with CORS headers.
   - Handle errors: proxy/extraction errors → **500** with Sentry; outer catch → **500**; all responses include CORS.

**See:** `THIN_CLIENT_ROADMAP_SERVER.md` §3.2 for detailed contract; `lib/knowledge-extraction/resolve-client.ts` for extraction service client.

### 5.4 Tenant ID and Active Domain

- **Tenant ID:** From session only (§1.3, §3.2). Derived from **user** (normal) or **organization** (org). All org-specific retrieval scoped by `tenant_id`.
- **Active Domain:** From `url`. Used as **filter** (§1.4) to decide when to use org-specific vs public-only RAG (same logic as `/interact`). No 403 based on domain. No cross-tenant or cross-domain data when org-specific.

### 5.5 Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Missing or invalid `url`. |
| 401 | `UNAUTHORIZED` | Missing or invalid token. |
| 500 | `INTERNAL_ERROR` | Server or RAG error. |

**Note:** No **403 `DOMAIN_NOT_ALLOWED`**. `allowed_domains` is a **filter** (§1.4); resolve always returns 200 when authenticated, with `hasOrgKnowledge` indicating org vs public-only.

### 5.6 Interact vs Resolve

| Endpoint | Who uses the knowledge? | What the extension gets | Use case |
|----------|--------------------------|--------------------------|----------|
| **`POST /api/agent/interact`** | LLM (inside backend) | `thought`, `action`, `hasOrgKnowledge?` — **no** chunks/citations | Task execution: RAG (org or public) grounds the LLM; user sees **results** (actions, thought). When `hasOrgKnowledge === false`, extension shows “no knowledge for this website” dialog (§1.4). |
| **`GET /api/knowledge/resolve`** | Internal / debugging | `context`, `citations`, `hasOrgKnowledge` — raw chunks | **Internal use and debugging only.** Inspect what RAG returns for a URL/query; **not** for overlay or end-user display. |

- **Interact:** Extension sends `url`, `query`, `dom`, `taskId?`. Backend uses **`allowed_domains` as filter** (§1.4); runs RAG (org-specific or public-only), injects knowledge **into the LLM prompt**, calls LLM, returns **`NextActionResponse`** with `hasOrgKnowledge`. The extension **never** receives raw chunks or citations — only the next action. When `hasOrgKnowledge === false`, extension shows dialog: “No knowledge for this website — all suggestions are from publicly available information.”
- **Resolve:** Same filter + RAG logic, **no LLM**. Returns **`ResolveKnowledgeResponse`** (`hasOrgKnowledge`, `context`, `citations`). Used for **internal tooling and debugging** only. See `THIN_CLIENT_ROADMAP_SERVER.md` §1.5, §1.6.

---

## 6. Data Isolation Summary

| Concept | Source | Usage |
|--------|--------|--------|
| **Tenant ID** | Session (token); **user** or **organization** per §1.3 | All DB and vector queries scoped by `tenant_id`. No cross-tenant access. |
| **Active Domain** | Request `url` | **Filter** (§1.4): when to use org-specific vs public-only RAG. No 403. |
| **Task ID** | Server-created | Keys action history. All history rows scoped by `tenant_id` + `task_id`. |

RAG and action history MUST use **Tenant ID** and **Active Domain** as above to ensure strict isolation and correct context for each request. Persistence uses **Mongoose** (app) and **Prisma** (auth only); see `THIN_CLIENT_ROADMAP_SERVER.md` §1.4, §4.1.

---

## 7. Migration of Action History (Client → Server)

### 7.1 Before (Client-Held)

- Extension stored `history: Array<{ prompt, response, action, usage }>`.
- Each LLM call used `previousActions` from this history to build the next prompt.
- History lived only in extension memory; not shared across devices or sessions.

### 7.2 After (Server-Held)

- **Server** stores action history per `taskId` (and `tenantId`).
- **Create task:** First `POST /api/agent/interact` without `taskId` → server creates task, returns `taskId`.
- **Subsequent requests:** Client sends same `taskId` with updated `dom`. Server loads `task_actions` for that task, builds “previous actions” from it, calls LLM, appends new `{ thought, action }`, returns `NextActionResponse`.
- **Context continuity:** Full multi-step workflow context lives on the server; client no longer sends or maintains action history for inference.
- **Client:** Can keep a **display-only** list of `{ thought, action, usage? }` from each response for TaskHistory UI, but it is not used for prompt construction.

### 7.3 Implementation Notes

- **Idempotency:** Avoid appending the same action twice (e.g. retries). Use `step_index` or idempotency keys if needed.
- **Retention:** Define retention for `tasks` and `task_actions` (e.g. TTL, archive). Enforce per-tenant limits.
- **Concurrency:** Prefer single-writer per `taskId` (e.g. one interact request at a time per task). Reject or queue overlapping requests if needed.

---

## 8. Implementation Checklist

- [x] **Auth:** Better Auth (Bearer plugin, `trustedOrigins`) + **`/api/v1/auth/*` adapters** (login, session, logout). Implement **`getSessionFromToken`** via `auth.api.getSession({ headers })`; use in all protected routes. See `THIN_SERVER_ROADMAP.md` §2.4.
- [x] **Persistence:** **Mongoose** models `allowed_domains`, `tasks`, `task_actions`, `sessions`, `messages`, `snapshots`, `debug_logs`, `verification_records`, `correction_records`, `user_preferences`. No new auth schemas; reuse Better Auth. No SQL migrations. See `THIN_SERVER_ROADMAP.md`.
- [x] Implement `POST /api/agent/interact`: validate body; **`allowed_domains` as filter** (§1.4); task create/load; RAG (org or public); web search; prompt build; LLM call; history append; orchestrator features (planning, verification, self-correction); return `NextActionResponse` with `hasOrgKnowledge`. Knowledge injected **into LLM prompt only**; extension never receives chunks/citations. **Implementation:** `app/api/agent/interact/route.ts` (complete). Uses shared `getRAGChunks()` helper, `buildActionPrompt()`, `callActionLLM()`, `parseActionResponse()`, `validateActionFormat()`, planning engine, verification engine, self-correction engine, outcome prediction engine, step refinement engine.
- [x] Implement `GET /api/knowledge/resolve`: validate query params; **`allowed_domains` as filter** (§1.4); **proxy** to extraction service (org) or public-only (no call); return `ResolveKnowledgeResponse` with `hasOrgKnowledge`. **Internal use and debugging only** — not for extension overlay. Extraction service schema → **`BROWSER_AUTOMATION_RESOLVE_SCHEMA.md`**; proxy details → `THIN_SERVER_ROADMAP.md` §3.1, §3.2. **Implementation:** `app/api/knowledge/resolve/route.ts` (complete).
- [x] Resolve **proxies** to extraction service; no duplicate RAG/storage in Next.js. Org-specific calls use **Tenant ID** and **Active Domain**; no cross-tenant or cross-domain leakage.
- [x] Web search: Pre-search for new tasks; dynamic `googleSearch()` tool for mid-task searches. **Implementation:** `lib/agent/web-search.ts` (complete).
- [x] Chat persistence: Session and Message models; DOM bloat management with Snapshot model. **Implementation:** `lib/models/session.ts`, `lib/models/message.ts`, `lib/models/snapshot.ts` (complete).
- [x] Debug endpoints: Debug logging, session export, metrics collection. **Implementation:** `GET /api/debug/logs`, `GET /api/debug/session/[taskId]/export` (complete).
- [x] Manus orchestrator: Planning, verification, self-correction, outcome prediction, step refinement. **Implementation:** `lib/agent/planning-engine.ts`, `lib/agent/verification-engine.ts`, `lib/agent/self-correction-engine.ts`, `lib/agent/outcome-prediction-engine.ts`, `lib/agent/step-refinement-engine.ts` (complete).
- [x] Enhanced error handling: Error detection, system messages, explicit verification, finish() validation. **Implementation:** `lib/utils/error-debug.ts`, error handling in `app/api/agent/interact/route.ts` (complete).
- [x] **CORS:** Allow extension origin (`chrome-extension://<id>`) for **`/api/auth/*`**, `/api/v1/*`, `/api/agent/*`, `/api/knowledge/*`, `/api/debug/*`, `/api/session/*` (including preflight `OPTIONS`).

---

## 9. Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/v1/auth/login` | POST | None | Login (invite-based); returns `accessToken`. |
| `/api/v1/auth/logout` | POST | Bearer | Invalidate token. |
| `/api/v1/auth/session` | GET | Bearer | Check session; return user/tenant. |
| `/api/v1/user/preferences` | GET/POST | Bearer | User preferences API: fetch/save preferences (theme, etc.) per tenant. For extension settings page. |
| `/api/agent/interact` | POST | Bearer | Action loop: receive dom/query/url/taskId/sessionId; RAG + web search + LLM; server-held history; Manus orchestrator (planning, verification, self-correction); return `NextActionResponse`. Extension gets **only** thought/action — not chunks/citations. **Rate limited:** 10 requests/minute. |
| `/api/knowledge/resolve` | GET | Bearer | **Proxy** to extraction service (org) or public-only; return `ResolveKnowledgeResponse`. **Internal use and debugging only** — not for extension overlay. **Rate limited:** 30 requests/minute. |
| `/api/session` | GET | Bearer | List all sessions for current user (with filtering and pagination). **Rate limited:** 100 requests/minute. |
| `/api/session` | POST | Bearer | Archive a session (mark as archived). **Rate limited:** 100 requests/minute. |
| `/api/session/[sessionId]/messages` | GET | Bearer | Retrieve message history for a session. **Rate limited:** 100 requests/minute. |
| `/api/session/latest` | GET | Bearer | Get latest session for current user. **Rate limited:** 100 requests/minute. |
| `/api/debug/logs` | GET | Bearer | Retrieve debug logs for debug UI (query params: taskId, logType, limit, since). |
| `/api/debug/session/[taskId]/export` | GET | Bearer | Export complete debug session data for a specific task. |
| `/api/health` | GET | None | Health check endpoint with comprehensive service status (MongoDB, Prisma, Redis). |

**Tenant ID** (from session; user or organization per §1.3) and **Active Domain** (from URL) drive **strict data isolation** for RAG, action history, sessions, and messages. **Action history** is migrated to the server and keyed by **taskId** to preserve **context continuity** across the multi-step workflow. **Chat persistence** uses **sessionId** to maintain conversation threads across requests.

**Implementation Status:** All features complete (100%). Rate limiting (§4.13), production logging (§4.14), data retention & cleanup (§4.15), and error handling enhancements (§4.16) are fully implemented and production-ready. See §14 for API usage examples.

---

## 12. Extension (Client) Implementation Notes

- **Storage:** Persist `accessToken` and `expiresAt` in `chrome.storage.local`. Clear on logout.
- **Requests:** Use `fetch` with `Content-Type: application/json`, `Authorization: Bearer <accessToken>`, and `credentials: "omit"`. Handle 401 (clear token, show login). **No** 403 from domain; use `hasOrgKnowledge` from interact/resolve to show “no knowledge for this website” dialog when applicable (§1.4).
- **Startup:** Call `GET /api/v1/auth/session`; if 401, show login UI and block task run.
- **Agent interact:** Call `POST /api/agent/interact` with `{ url, query, dom, taskId?, sessionId? }`; execute returned `NextActionResponse` (click/setValue) or handle finish/fail. Send `taskId` and `sessionId` on subsequent requests. During task execution, the extension **never** receives raw knowledge (chunks/citations) — only `thought` and `action`.
- **Knowledge resolve:** `GET /api/knowledge/resolve` is for **internal use and debugging only**. The extension does **not** use it for overlay, tooltips, or end-user display. Use resolve only in tooling, dashboards, or debugging flows (e.g. “what RAG returns for this URL”).
- **User preferences:** Call `GET /api/v1/user/preferences` to fetch preferences; call `POST /api/v1/user/preferences` to save preferences (theme, etc.). Preferences are scoped per tenant. See `THIN_SERVER_ROADMAP.md` §5 for implementation details.
- **Session management:** Use `sessionId` from interact response to maintain conversation threads. Call `GET /api/session/[sessionId]/messages` to retrieve message history if needed. Call `GET /api/session` to list all sessions (archived sessions excluded by default for Chrome extension). Call `POST /api/session` to archive a session (archived sessions are not used by Chrome extension but available in UI for auditing).
- **Debug endpoints:** Use `GET /api/debug/logs` and `GET /api/debug/session/[taskId]/export` for debug UI. Debug endpoints are for development and troubleshooting only.
- **CORS:** Backend must allow `chrome-extension://<extension-id>` for **`/api/auth/*`**, `/api/v1/*`, `/api/agent/*`, `/api/knowledge/*`, `/api/debug/*`, `/api/session/*`. See `THIN_SERVER_ROADMAP.md` §1.3, §2.4.

---

## 13. References

| Document | Purpose |
|----------|---------|
| **`THIN_SERVER_ROADMAP.md`** | Complete implementation roadmap: MongoDB, Mongoose, Better Auth, Next.js, all tasks (auth, resolve, interact, preferences, web search, chat persistence, debug, orchestrator). **Keep in sync with this spec.** |
| **`ARCHITECTURE.md`** | Hybrid DB (Prisma + Mongoose), tenant model (user / organization), multi-tenancy. |
| **`BROWSER_AUTOMATION_RESOLVE_SCHEMA.md`** | **Browser automation / extraction service** `GET /api/knowledge/resolve` request & response schema. Used when Next.js proxies resolve (§5); referenced by Task 2 and `lib/knowledge-extraction/resolve-client.ts`. |
| **`DEBUG_VIEW_IMPROVEMENTS.md`** | Debug View requirements (client-focused, but server provides debug data). |
| **`MANUS_ORCHESTRATOR_ARCHITECTURE.md`** | Manus orchestrator architecture specification. |
| **Better Auth** | [Browser Extension Guide](https://www.better-auth.com/docs/guides/browser-extension-guide), [Bearer Plugin](https://beta.better-auth.com/docs/plugins/bearer), [trustedOrigins](https://www.better-auth.com/docs/reference/options). |
| **Next.js** | [Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware) (CORS), [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers). |

---

## 14. API Usage Examples

**Status:** ✅ **COMPLETE** — January 27, 2026

This section provides practical code examples for integrating with the Screen Agent Platform API. All examples use real API endpoints and data structures.

### 14.1 Authentication

#### 14.1.1 Login

```typescript
// POST /api/v1/auth/login
const response = await fetch("https://yourdomain.com/api/v1/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "user@example.com",
    password: "password123",
  }),
})

const data = await response.json()
// {
//   success: true,
//   data: {
//     accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
//     expiresAt: "2026-01-28T00:00:00.000Z",
//     user: { id: "user-123", email: "user@example.com", name: "John Doe" },
//     tenantId: "tenant-123",
//     tenantName: "My Organization",
//   },
// }
```

#### 14.1.2 Using Bearer Token

```typescript
// All protected endpoints require Bearer token
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

const response = await fetch("https://yourdomain.com/api/agent/interact", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  },
  body: JSON.stringify({ /* ... */ }),
})
```

### 14.2 Agent Interaction

#### 14.2.1 Basic Task Execution

```typescript
// POST /api/agent/interact
const response = await fetch("https://yourdomain.com/api/agent/interact", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  },
  body: JSON.stringify({
    url: "https://example.com/login",
    query: "Log in with email test@example.com and password test123",
    dom: "<html>...</html>", // Current page DOM
  }),
})

const data = await response.json()
// {
//   success: true,
//   data: {
//     thought: "I need to find the email input field...",
//     action: "setValue(42, \"test@example.com\")",
//     taskId: "task-uuid",
//     sessionId: "session-uuid",
//     hasOrgKnowledge: true,
//   },
// }
```

#### 14.2.2 Continuing a Task

```typescript
// Subsequent requests include taskId and sessionId
const response = await fetch("https://yourdomain.com/api/agent/interact", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  },
  body: JSON.stringify({
    url: "https://example.com/login",
    query: "Continue with the login",
    dom: "<html>...</html>", // Updated DOM after previous action
    taskId: "task-uuid", // From previous response
    sessionId: "session-uuid", // From previous response
    lastActionStatus: "success", // Report action execution status
  }),
})
```

#### 14.2.3 Error Reporting

```typescript
// Report action failure for anti-hallucination
const response = await fetch("https://yourdomain.com/api/agent/interact", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  },
  body: JSON.stringify({
    url: "https://example.com/login",
    query: "Continue",
    dom: "<html>...</html>",
    taskId: "task-uuid",
    sessionId: "session-uuid",
    lastActionStatus: "failure",
    lastActionError: {
      message: "Element not found",
      code: "ELEMENT_NOT_FOUND",
      action: "click(123)",
      elementId: 123,
    },
  }),
})
```

### 14.3 Session Management

#### 14.3.1 Get Session Messages

```typescript
// GET /api/session/[sessionId]/messages
const sessionId = "session-uuid"
const response = await fetch(
  `https://yourdomain.com/api/session/${sessionId}/messages?limit=50&since=2026-01-27T00:00:00.000Z`,
  {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  }
)

const data = await response.json()
// {
//   success: true,
//   data: {
//     sessionId: "session-uuid",
//     messages: [
//       {
//         messageId: "msg-uuid",
//         role: "user",
//         content: "Log in with email test@example.com",
//         sequenceNumber: 0,
//         timestamp: "2026-01-27T00:00:00.000Z",
//       },
//       {
//         messageId: "msg-uuid-2",
//         role: "assistant",
//         content: "I'll help you log in...",
//         actionString: "setValue(42, \"test@example.com\")",
//         status: "success",
//         sequenceNumber: 1,
//         timestamp: "2026-01-27T00:00:01.000Z",
//         domSummary: "Login page with email and password fields",
//       },
//     ],
//     total: 2,
//   },
// }
```

#### 14.3.2 Get Latest Session

```typescript
// GET /api/session/latest?status=active
const response = await fetch(
  "https://yourdomain.com/api/session/latest?status=active",
  {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  }
)

const data = await response.json()
// {
//   success: true,
//   data: {
//     sessionId: "session-uuid",
//     url: "https://example.com/login",
//     status: "active",
//     createdAt: "2026-01-27T00:00:00.000Z",
//     updatedAt: "2026-01-27T00:05:00.000Z",
//     messageCount: 10,
//   },
// }
```

### 14.4 Error Handling

#### 14.4.1 Standard Error Response

All errors follow this format:

```typescript
{
  success: false,
  code: "ERROR_CODE", // e.g., "VALIDATION_ERROR", "RATE_LIMIT", "UNAUTHORIZED"
  message: "Human-readable error message",
  details: {
    field: "url", // For validation errors
    reason: "Invalid URL format",
  },
  retryAfter: 60, // For rate limit errors (seconds)
  debugInfo: { // Only in debug mode
    errorType: "VALIDATION_ERROR",
    context: { /* ... */ },
  },
}
```

#### 14.4.2 Error Handling Example

```typescript
try {
  const response = await fetch("https://yourdomain.com/api/agent/interact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ /* ... */ }),
  })

  const data = await response.json()

  if (!data.success) {
    switch (data.code) {
      case "UNAUTHORIZED":
        // Redirect to login
        break
      case "RATE_LIMIT":
        // Wait and retry after data.retryAfter seconds
        await new Promise((resolve) => setTimeout(resolve, data.retryAfter * 1000))
        // Retry request
        break
      case "VALIDATION_ERROR":
        // Show validation error to user
        console.error("Validation error:", data.details)
        break
      default:
        // Handle other errors
        console.error("Error:", data.message)
    }
  } else {
    // Process successful response
    const { thought, action, taskId, sessionId } = data.data
    // Execute action, update UI, etc.
  }
} catch (error) {
  // Network or other errors
  console.error("Request failed:", error)
}
```

### 14.5 Rate Limiting

#### 14.5.1 Rate Limit Headers

All responses include rate limit headers:

```typescript
const response = await fetch("https://yourdomain.com/api/agent/interact", {
  /* ... */
})

// Check rate limit headers
const limit = response.headers.get("X-RateLimit-Limit") // "10"
const remaining = response.headers.get("X-RateLimit-Remaining") // "5"
const reset = response.headers.get("X-RateLimit-Reset") // Unix timestamp

console.log(`Rate limit: ${remaining}/${limit} requests remaining`)
console.log(`Resets at: ${new Date(parseInt(reset) * 1000)}`)
```

#### 14.5.2 Handling Rate Limits

```typescript
const response = await fetch("https://yourdomain.com/api/agent/interact", {
  /* ... */
})

if (response.status === 429) {
  const data = await response.json()
  const retryAfter = data.retryAfter || 60 // seconds

  // Wait and retry
  await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
  // Retry request
}
```

### 14.6 Chrome Extension Integration

#### 14.6.1 Complete Integration Example

```typescript
// Chrome extension background script
class AgentClient {
  private baseURL = "https://yourdomain.com"
  private token: string | null = null

  async login(email: string, password: string) {
    const response = await fetch(`${this.baseURL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()
    if (data.success) {
      this.token = data.data.accessToken
      await chrome.storage.local.set({
        accessToken: data.data.accessToken,
        expiresAt: data.data.expiresAt,
      })
    }
    return data
  }

  async interact(url: string, query: string, dom: string, taskId?: string, sessionId?: string) {
    if (!this.token) {
      throw new Error("Not authenticated")
    }

    const response = await fetch(`${this.baseURL}/api/agent/interact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        url,
        query,
        dom,
        taskId,
        sessionId,
      }),
    })

    // Check rate limiting
    const remaining = response.headers.get("X-RateLimit-Remaining")
    if (remaining === "0") {
      console.warn("Rate limit reached")
    }

    if (response.status === 429) {
      const data = await response.json()
      throw new Error(`Rate limited: ${data.message}`)
    }

    if (response.status === 401) {
      // Token expired, re-authenticate
      this.token = null
      await chrome.storage.local.remove("accessToken")
      throw new Error("Authentication required")
    }

    const data = await response.json()
    return data
  }

  async getSessionMessages(sessionId: string, limit = 50) {
    if (!this.token) {
      throw new Error("Not authenticated")
    }

    const response = await fetch(
      `${this.baseURL}/api/session/${sessionId}/messages?limit=${limit}`,
      {
        headers: {
          "Authorization": `Bearer ${this.token}`,
        },
      }
    )

    const data = await response.json()
    return data
  }
}

// Usage
const client = new AgentClient()
await client.login("user@example.com", "password")

const result = await client.interact(
  "https://example.com",
  "Click the login button",
  document.documentElement.outerHTML
)

// Execute action from result
const action = result.data.action // e.g., "click(123)"
// Parse and execute action in content script
```

### 14.7 Common Patterns

#### 14.7.1 Retry Logic

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options)

      // Retry on rate limit
      if (response.status === 429) {
        const data = await response.json()
        const retryAfter = data.retryAfter || Math.pow(2, i) * 1000 // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, retryAfter))
        continue
      }

      return response
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000))
    }
  }
  throw new Error("Max retries exceeded")
}
```

#### 14.7.2 Token Refresh

```typescript
async function ensureAuthenticated() {
  const { accessToken, expiresAt } = await chrome.storage.local.get([
    "accessToken",
    "expiresAt",
  ])

  if (!accessToken || new Date(expiresAt) < new Date()) {
    // Token expired or missing, redirect to login
    throw new Error("Authentication required")
  }

  return accessToken
}
```

### 14.8 Error Codes Reference

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `RATE_LIMIT` | 429 | Rate limit exceeded |
| `NOT_FOUND` | 404 | Resource not found |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `LLM_ERROR` | 500 | LLM service error |
| `DATABASE_ERROR` | 500 | Database error |

---

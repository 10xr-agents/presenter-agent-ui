# Server-Side Agent Architecture

**Document Version:** 1.7  
**Date:** January 26, 2026  
**Status:** Technical Specification  
**Changelog (1.7):** User Preferences API added to Summary (§9): `GET/POST /api/v1/user/preferences` for extension settings. See `THIN_CLIENT_ROADMAP_SERVER.md` §5 for implementation details.  
**Changelog (1.6):** Task 3 complete: `POST /api/agent/interact` implemented (`app/api/agent/interact/route.ts`); `tasks` and `task_actions` Mongoose models; shared RAG helper (`getRAGChunks()`); LLM integration (prompt builder, client, parser); §4.3 updated with implementation details; §8 Implementation Checklist interact items marked complete.  
**Changelog (1.5):** Task 2 complete: `GET /api/knowledge/resolve` implemented (`app/api/knowledge/resolve/route.ts`); §5.3 updated with implementation details; §8 Implementation Checklist resolve items marked complete.  
**Changelog (1.4):** §1.4 Knowledge types & `allowed_domains` as filter (not assert); `hasOrgKnowledge` on interact/resolve; no 403 `DOMAIN_NOT_ALLOWED`; public-only RAG path; extension “no knowledge for this website” dialog.  
**Target:** Next.js Intelligence Layer (Thin Client backend)

**Sync:** This document is the **specification**. Implementation details (MongoDB, Mongoose, Better Auth, Next.js) are in `THIN_CLIENT_ROADMAP_SERVER.md`. Keep both in sync; on conflict, prefer ROADMAP + enriched thread (auth adapters, DB stack, resolve = internal/debugging).

---

## 1. Overview

This document defines the **centralized Intelligence Layer** and **Member-facing API** for the Thin Client architecture. It is the single source of truth for:

- **Auth API** — Login (invite-based), session check, logout. Token issuance for the extension.
- **`POST /api/agent/interact`** — Action Loop: receives `url`, `query`, `dom`, and optional `taskId`; uses RAG (scoped by **Tenant ID** and **Active Domain**) and server-held **action history**; calls the LLM; returns **`NextActionResponse`**. Knowledge is injected **only into the LLM prompt**; the extension **never** receives raw chunks or citations — only `thought` and `action`.
- **`GET /api/knowledge/resolve`** — Knowledge Resolution: receives `url` and optional `query`; validates tenant; uses **`allowed_domains` as filter** (§1.4) to decide org-specific vs public-only RAG; returns **`ResolveKnowledgeResponse`** (`hasOrgKnowledge`, chunks, citations). **Internal use and debugging only** — not for extension overlay or end-user display.

All inference, RAG retrieval, and action-history context live on the server. The extension acts as an **Action Runner** only. See §5.6 for the **interact vs resolve** distinction.

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
- **Prompt:** System message (role, actions, format) + user message (query, time, **server-held action history**, **RAG context**, current `dom`).
- **Parsing:** Extract `<Thought>...</Thought>` and `<Action>...</Action>`. Validate action format (e.g. `click(n)`, `setValue(n, "s")`, `finish()`, `fail()`). On parse failure, retry or return `fail()`.
- **Output:** `thought` string, `action` string. Optionally include `usage` from LLM API in `NextActionResponse`.

### 4.7 Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid body (url, query, dom, taskId). |
| 401 | `UNAUTHORIZED` | Missing or invalid token. |
| 404 | `TASK_NOT_FOUND` | `taskId` provided but task not found for tenant. |
| 409 | `TASK_COMPLETED` | Task already finished; reject further interact. |
| 429 | `RATE_LIMIT` | Per-tenant or per-user rate limit. |
| 500 | `INTERNAL_ERROR` | Server or LLM error. |

**Note:** No **403 `DOMAIN_NOT_ALLOWED`**. `allowed_domains` is a **filter** (§1.4); we always return 200 when authenticated, using org-specific or public-only knowledge.

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

- [ ] **Auth:** Better Auth (Bearer plugin, `trustedOrigins`) + **`/api/v1/auth/*` adapters** (login, session, logout). Implement **`getSessionFromToken`** via `auth.api.getSession({ headers })`; use in all protected routes. See `THIN_CLIENT_ROADMAP_SERVER.md` §2.4.
- [ ] **Persistence:** **Mongoose** models `allowed_domains`, `tasks`, `task_actions`. No new auth schemas; reuse Better Auth. No SQL migrations. See ROADMAP §2.1, §4.1.
- [x] Implement `POST /api/agent/interact`: validate body; **`allowed_domains` as filter** (§1.4); task create/load; RAG (org or public); prompt build; LLM call; history append; return `NextActionResponse` with `hasOrgKnowledge`. Knowledge injected **into LLM prompt only**; extension never receives chunks/citations. **Implementation:** `app/api/agent/interact/route.ts` (Task 3 complete). Uses shared `getRAGChunks()` helper, `buildActionPrompt()`, `callActionLLM()`, `parseActionResponse()`, `validateActionFormat()`.
- [x] Implement `GET /api/knowledge/resolve`: validate query params; **`allowed_domains` as filter** (§1.4); **proxy** to extraction service (org) or public-only (no call); return `ResolveKnowledgeResponse` with `hasOrgKnowledge`. **Internal use and debugging only** — not for extension overlay. Extraction service schema → **`BROWSER_AUTOMATION_RESOLVE_SCHEMA.md`**; proxy details → `THIN_CLIENT_ROADMAP_SERVER.md` §3.1, §3.2. **Implementation:** `app/api/knowledge/resolve/route.ts` (Task 2 complete).
- [x] Resolve **proxies** to extraction service; no duplicate RAG/storage in Next.js. Org-specific calls use **Tenant ID** and **Active Domain**; no cross-tenant or cross-domain leakage.
- [ ] Add rate limiting, logging, and error handling for all endpoints.
- [ ] **CORS:** Allow extension origin (`chrome-extension://<id>`) for **`/api/auth/*`**, `/api/v1/*`, `/api/agent/*`, `/api/knowledge/*` (including preflight `OPTIONS`).

---

## 9. Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/v1/auth/login` | POST | None | Login (invite-based); returns `accessToken`. |
| `/api/v1/auth/logout` | POST | Bearer | Invalidate token. |
| `/api/v1/auth/session` | GET | Bearer | Check session; return user/tenant. |
| `/api/v1/user/preferences` | GET/POST | Bearer | User preferences API: fetch/save preferences (theme, etc.) per tenant. For extension settings page. |
| `/api/agent/interact` | POST | Bearer | Action loop: receive dom/query/url/taskId; RAG + LLM; server-held history; return `NextActionResponse`. Extension gets **only** thought/action — not chunks/citations. |
| `/api/knowledge/resolve` | GET | Bearer | **Proxy** to extraction service (org) or public-only; return `ResolveKnowledgeResponse`. **Internal use and debugging only** — not for extension overlay. |

**Tenant ID** (from session; user or organization per §1.3) and **Active Domain** (from URL) drive **strict data isolation** for RAG and action history. **Action history** is migrated to the server and keyed by **taskId** to preserve **context continuity** across the multi-step workflow.

---

## 10. Extension (Client) Implementation Notes

- **Storage:** Persist `accessToken` and `expiresAt` in `chrome.storage.local`. Clear on logout.
- **Requests:** Use `fetch` with `Content-Type: application/json`, `Authorization: Bearer <accessToken>`, and `credentials: "omit"`. Handle 401 (clear token, show login). **No** 403 from domain; use `hasOrgKnowledge` from interact/resolve to show “no knowledge for this website” dialog when applicable (§1.4).
- **Startup:** Call `GET /api/v1/auth/session`; if 401, show login UI and block task run.
- **Agent interact:** Call `POST /api/agent/interact` with `{ url, query, dom, taskId? }`; execute returned `NextActionResponse` (click/setValue) or handle finish/fail. Send `taskId` on subsequent requests. During task execution, the extension **never** receives raw knowledge (chunks/citations) — only `thought` and `action`.
- **Knowledge resolve:** `GET /api/knowledge/resolve` is for **internal use and debugging only**. The extension does **not** use it for overlay, tooltips, or end-user display. Use resolve only in tooling, dashboards, or debugging flows (e.g. “what RAG returns for this URL”).
- **User preferences:** Call `GET /api/v1/user/preferences` to fetch preferences; call `POST /api/v1/user/preferences` to save preferences (theme, etc.). Preferences are scoped per tenant. See `THIN_CLIENT_ROADMAP_SERVER.md` §5 for implementation details.
- **CORS:** Backend must allow `chrome-extension://<extension-id>` for **`/api/auth/*`**, `/api/v1/*`, `/api/agent/*`, and `/api/knowledge/*`. See `THIN_CLIENT_ROADMAP_SERVER.md` §1.3, §2.4.

---

## 11. References

| Document | Purpose |
|----------|---------|
| **`THIN_CLIENT_ROADMAP_SERVER.md`** | Implementation roadmap: MongoDB, Mongoose, Better Auth, Next.js, Tasks 1–4 (auth, resolve, interact, preferences), auth adapters (§2.4), DB stack (§1.4), interact vs resolve (§1.5), user preferences API (§5). **Keep in sync with this spec.** |
| **`ARCHITECTURE.md`** | Hybrid DB (Prisma + Mongoose), tenant model (user / organization), multi-tenancy. |
| **`BROWSER_AUTOMATION_RESOLVE_SCHEMA.md`** | **Browser automation / extraction service** `GET /api/knowledge/resolve` request & response schema. Used when Next.js proxies resolve (§5); referenced by Task 2 (§3.1, §3.2) and `lib/knowledge-extraction/resolve-client.ts`. |
| **Better Auth** | [Browser Extension Guide](https://www.better-auth.com/docs/guides/browser-extension-guide), [Bearer Plugin](https://beta.better-auth.com/docs/plugins/bearer), [trustedOrigins](https://www.better-auth.com/docs/reference/options). |
| **Next.js** | [Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware) (CORS), [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers). |

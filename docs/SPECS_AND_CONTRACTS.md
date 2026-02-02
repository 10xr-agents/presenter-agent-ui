# Specs & Contracts

**Purpose:** API contracts, verification contract, and feature specifications for the Chrome extension and backend.
**Last Updated:** February 2, 2026

---

## Table of Contents

1. [Verification Contract (Extension → Backend)](#1-verification-contract-extension--backend)
2. [Tab-Scoped Sessions (Domain Metadata)](#2-tab-scoped-sessions-domain-metadata)
3. [Session Init Contract (Extension → Backend)](#3-session-init-contract-extension--backend)
4. [Chat UI Contract (Backend → Extension)](#4-chat-ui-contract-backend--extension)
5. [Robust Element Selectors](#5-robust-element-selectors)
6. [Hybrid Vision + Skeleton](#6-hybrid-vision--skeleton)
7. [Semantic JSON Protocol](#7-semantic-json-protocol)
8. [Backend Implementation: Browser-Use & Midscene Support](#8-backend-implementation-browser-use--midscene-support)
9. [Atomic Actions & Action Chaining](#9-atomic-actions--action-chaining)
10. [File Attachments & Chat-Only Mode](#10-file-attachments--chat-only-mode)
11. [Report Download API](#11-report-download-api)
12. [Changelog](#12-changelog)
13. [Related Documentation](#13-related-documentation)

---

## 1. Verification Contract (Extension → Backend)

**Purpose:** Define what the Chrome extension sends on each `POST /api/agent/interact` call so the backend's observation-based verification can run correctly.

### Required (Verification Works With Only These)

| Field | Sent by extension | Purpose |
|------|-------------------|---------|
| **dom** | ✅ Every call | Current page DOM snapshot (templatized). Backend uses it as "after" state and saves **beforeState** when generating the next action. |
| **url** | ✅ Every call | Current page URL captured just before sending the request. Used in before/after comparison. |
| **query** | ✅ Every call | User instruction for this loop iteration. |
| **taskId** | ✅ After first call | Backend loads previous action + beforeState to run observation-based verification. |

### Optional (Improve Accuracy)

These are supported by the current request schema (`lib/agent/schemas.ts`):

| Field | Sent by extension | Purpose |
|------|-------------------|---------|
| **previousUrl** | ✅ When available | URL before the last action. Helps URL-change verification when beforeState is missing or ambiguous. |
| **clientObservations** | ✅ When available | `{ didNetworkOccur?, didDomMutate?, didUrlChange? }` — extension-witnessed facts. Helps reduce false "no change" failures. |
| **clientVerification** | ✅ When available | `{ elementFound, selector?, urlChanged?, timestamp? }` — client-side selector check results (when an expected selector is known). |
| **lastActionStatus** | ✅ When available | `success \| failure \| pending` — used for message/status bookkeeping. |
| **lastActionError** | ✅ On failure | `{ message, code, action, elementId? }` — anti-hallucination / failure debugging. |
| **lastActionResult** | ✅ When available | `{ success, actualState? }` — supports verification/debugging. |

### Request Body Shape (Summary)

```ts
{
  url?: string,          // OPTIONAL — current URL (required for web tasks, optional for chat-only)
  query: string,         // required — user instruction
  dom?: string,          // OPTIONAL — current DOM (required for web tasks, optional for chat-only)
  taskId?: string,       // required after first request
  sessionId?: string,

  // === FILE ATTACHMENT (NEW - Phase 7) ===
  attachment?: {
    s3Key: string,       // S3 storage key from upload response
    filename: string,    // Original filename (e.g., "sales.csv")
    mimeType: string,    // MIME type (e.g., "text/csv", "application/pdf")
    size: number,        // File size in bytes
  },
  domain?: string,
  title?: string,
  lastActionStatus?: 'success' | 'failure' | 'pending',
  lastActionError?: { message: string, code: string, action: string, elementId?: number },
  lastActionResult?: { success: boolean, actualState?: string },
  previousUrl?: string,
  clientVerification?: { elementFound: boolean, selector?: string, urlChanged?: boolean, timestamp?: number },
  clientObservations?: { didNetworkOccur?: boolean, didDomMutate?: boolean, didUrlChange?: boolean },

  // === SEMANTIC FIELDS (PRIMARY) ===
  domMode?: "semantic" | "skeleton" | "hybrid" | "full",  // "semantic" is the API field name
  interactiveTree?: Array<{
    i: string,                              // Element ID
    r: string,                              // Role (minified: btn, inp, link, chk, etc.)
    n: string,                              // Name/label
    v?: string,                             // Value
    s?: string,                             // State (disabled, checked, etc.)
    xy?: [number, number],                  // Center coordinates
    box?: [number, number, number, number], // Bounding box [x, y, w, h]
    scr?: { depth: string, h: boolean },    // Scrollable container info
    occ?: boolean,                          // Occluded by modal/overlay
  }>,
  viewport?: { width: number, height: number },
  pageTitle?: string,

  // === ADVANCED SEMANTIC FIELDS ===
  scrollPosition?: string,                  // Page scroll depth "0%", "50%", etc.
  scrollableContainers?: Array<{            // Virtual list containers detected
    id: string,
    depth: string,
    hasMore: boolean,
  }>,
  recentEvents?: string[],                  // Mutation log: ["Added: 'Success'", "Error: 'Invalid'"]
  hasErrors?: boolean,                      // Recent errors detected
  hasSuccess?: boolean,                     // Recent success messages detected

  // === SENTINEL VERIFICATION ===
  verification_passed?: boolean,            // Previous action verification result
  verification_message?: string,            // Human-readable verification feedback
  errors_detected?: string[],               // Errors caught by verification
  success_messages?: string[],              // Success messages caught by verification

  // === DOM RAG (for huge pages) ===
  dom_filtered?: boolean,                   // True if DOM was filtered
  filter_reason?: string,                   // Why filtering was applied
  original_node_count?: number,             // Count before filtering
  token_reduction?: number,                 // Percentage reduction achieved

  // === HYBRID/SKELETON FIELDS ===
  screenshot?: string | null,
  skeletonDom?: string,
  screenshotHash?: string,
}
```

---

## 2. Tab-Scoped Sessions (Domain Metadata)

**Status:** ✅ Implemented (Extension)

### Overview

Sessions are **tab-scoped**: the extension maintains **one active chat session per Chrome `tabId`**.

- When the same tab navigates (even across domains), we **keep the same session** and update the session's `url` + `domain` **as metadata** for UI awareness.
- When the user switches tabs, the UI switches to the session mapped for that tab.

Session titles typically follow (based on the URL at session creation time):

- `{domain}: {task description}`
- Examples: `google.com: Search for SpaceX`, `github.com: Review PR #123`

### Extension Implementation

- **Session selection is client-side**: `tabId -> sessionId` mapping lives in Zustand (`sessions.tabSessionMap`).
- **Session metadata is updated** on navigation: `session.url` and `session.domain` (best-effort).

### Backend

No backend changes are required for tab-scoped sessions because:

- The backend already keys message history and task state by `sessionId`.
- `tabId` is a **client-only** identifier and is **not stable across browser restarts**. The backend may store it as **debug metadata**, but must not treat it as a stable identifier/primary key.

### Backend Endpoints (Used)

| Method | Path | Purpose |
|--------|------|---------|
| PATCH | `/api/session/[sessionId]` | Rename a session; sets `isRenamed: true` |
| GET | `/api/session/latest` | Get most recent session; includes `title`, `domain`, `isRenamed` |

### Backend Endpoints (Optional / Legacy)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/session/by-domain/[domain]` | **Legacy**: domain-based session lookup. The extension no longer relies on this for session selection. |

### Backend Utilities

- `lib/utils/domain.ts`
  - `extractDomain(url)` — extracts root domain (supports `co.uk`-style TLDs, `localhost`, IPs)
  - `generateSessionTitle(domain, taskDescription)` — `{domain}: {taskDescription}`

### Tab Cleanup

Session mappings (`tabId → sessionId`) are cleaned up in two scenarios:

#### 1. On Tab Close (Runtime Cleanup)

When a tab is closed during runtime:

- **Why:** Prevents ghost sessions. Chrome may reuse the same tabId for a new tab, which would incorrectly reuse the old session.
- **How:**
  1. Background service worker broadcasts `TAB_CLOSED` message
  2. UI (`App.tsx`) receives message and calls `clearTabSessionMapping(tabId)`
  3. Removes entry from `tabSessionMap` and clears `currentTabId` if it was the closed tab
- **Location:**
  - `src/pages/Background/index.ts` - broadcasts `TAB_CLOSED`
  - `src/common/App.tsx` - listens and calls cleanup
  - `src/state/sessions.ts` - `clearTabSessionMapping()` action

#### 2. On Startup (Stale Cleanup)

When the extension initializes:

- **Why:** Tab IDs are not stable across browser restarts. Old mappings from crashed/closed tabs would point to non-existent tabs.
- **How:** `initializeDomainAwareSessions()` queries all open Chrome tabs and removes any `tabSessionMap` entries for tabs that no longer exist.
- **Location:** `src/state/sessions.ts` (lines 486-535)

```typescript
// Clean up stale tabId -> sessionId mappings
const tabs = await chrome.tabs.query({});
const openTabIds = new Set(tabs.map(t => t.id));
// Remove mappings for tabs not in openTabIds
```

### Authentication & Token Lifecycle

**Token Storage:**
- Access token stored in `chrome.storage.local` as `accessToken`
- Additional fields: `expiresAt`, `user`, `tenantId`, `tenantName`

**Token Usage:**
- All API requests include `Authorization: Bearer ${token}` header
- Pusher/WebSocket auth via `/api/pusher/auth` also includes Bearer token

**Token Refresh:**
- **Current behavior:** Token refresh is NOT implemented
- On 401 response, extension clears stored token and user must re-login
- The `expiresAt` field is stored but not used for proactive refresh
- For short-lived automation tasks, this is acceptable; long sessions may require re-login

**Location:** `src/api/client.ts` (token storage: lines 466-529, auth header: line 648)

---

## 3. Session Init Contract (Extension → Backend)

**Status:** ✅ Implemented (February 2026)

**Purpose:** Ensure sessions exist on the backend BEFORE subscribing to Pusher channels. This prevents 403 errors from `/api/pusher/auth` when a new tab opens or local storage is lost.

### 3.1 The Problem

When a new tab opens (or local storage is cleared), the extension creates a local session with a UUID. However, if the extension immediately tries to subscribe to Pusher for real-time updates, the `/api/pusher/auth` endpoint returns **403 Forbidden** because the session doesn't exist on the backend yet.

**Problematic Flow (Before):**
```
New tab opens
    ↓
Extension generates local UUID (sessionId)
    ↓
Saves to chrome.storage.local (local only)
    ↓
Tries to subscribe to Pusher channel: private-session-{sessionId}
    ↓
POST /api/pusher/auth → 403 FORBIDDEN (session doesn't exist!)
```

### 3.2 The Solution: POST /api/session/init

The extension now calls `POST /api/session/init` to create the session on the backend BEFORE subscribing to Pusher.

**Correct Flow (After):**
```
New tab opens
    ↓
Extension generates local UUID (sessionId)
    ↓
POST /api/session/init { sessionId, url, domain }
    ↓
Backend creates session row, returns { created: true }
    ↓
Extension saves to chrome.storage.local
    ↓
Pusher subscribes to private-session-{sessionId}
    ↓
POST /api/pusher/auth → 200 OK (session exists!)
```

### 3.3 API Contract

#### POST /api/session/init

**Request:**
```json
{
  "sessionId": "uuid-v4",
  "url": "https://example.com/page",
  "domain": "example.com",
  "initialQuery": "Optional task description",
  "tabId": 123
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | ✅ | Client-generated UUID v4 |
| `url` | string | No | URL where session was started |
| `domain` | string | No | Root domain (e.g., "google.com") |
| `initialQuery` | string | No | Initial task description |
| `tabId` | number | No | Chrome tab ID (client-only metadata) |

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid-v4",
    "created": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` on 2xx |
| `data.sessionId` | string | The session ID that was created/verified |
| `data.created` | boolean | `true` if new session was created, `false` if already existed |

**Response (Error):**
- **401 Unauthorized:** Invalid or missing Bearer token
- **400 Bad Request:** Invalid sessionId format
- **500 Server Error:** Database error

### 3.4 Extension Implementation

#### When Init is Called

| Scenario | When Called | Location |
|----------|-------------|----------|
| **New tab opened** | In `createNewSession()` after generating UUID | `src/services/sessionService.ts` |
| **Before Pusher subscribe** | In `messageSyncManager.startSync()` before `pusherTransport.connect()` | `src/services/messageSyncService.ts` |
| **Session recovery** | When recovering sessions from backend after storage loss | `src/services/sessionService.ts` |

#### Key Functions

**`ensureSessionInitialized(sessionId, metadata)`** — The critical function that ensures a session exists on the backend.

```typescript
// src/services/sessionService.ts
export async function ensureSessionInitialized(
  sessionId: string,
  metadata?: { url?: string; domain?: string; initialQuery?: string; tabId?: number }
): Promise<boolean> {
  // 1. Check cache (already initialized)
  if (isSessionInitialized(sessionId)) return true;

  // 2. Check in-flight (prevent duplicate calls)
  if (initInFlightMap.has(sessionId)) return initInFlightMap.get(sessionId);

  // 3. Call backend
  const response = await apiClient.initSession(sessionId, metadata);
  if (response.success) {
    await markSessionInitialized(sessionId);
    return true;
  }
  return false;
}
```

**`recoverSessionsFromBackend(currentUrl)`** — Handles the storage loss scenario.

```typescript
// src/services/sessionService.ts
export async function recoverSessionsFromBackend(currentUrl?: string): Promise<string | null> {
  // 1. Check if local storage is empty
  const localSessions = await getLocalSessions();
  if (localSessions.length > 0) return null; // No recovery needed

  // 2. Fetch sessions from backend
  const response = await apiClient.listSessions({ status: 'active' });

  // 3. Save recovered sessions to local storage
  // 4. Mark all as initialized (they already exist on backend)
  // 5. Return best match (by domain) or most recent
}
```

#### Caching & Deduplication

- **`initialized_sessions`** key in `chrome.storage.local` tracks which sessions are known to exist on backend
- **In-memory cache** (`initializedSessionsCache`) prevents redundant API calls within the same session
- **In-flight deduplication** (`initInFlightMap`) prevents parallel init calls for the same session

### 3.5 Scenarios Handled

| Scenario | How It's Handled |
|----------|------------------|
| **New tab + extension active** | `createNewSession()` calls `ensureSessionInitialized()` (fire-and-forget), then `startSync()` awaits init before Pusher connect |
| **Open extension on existing tab** | Same as above — init happens in `startSync()` before Pusher |
| **Storage loss + browser restart** | `initializeDomainAwareSessions()` calls `recoverSessionsFromBackend()` which fetches sessions from backend and marks them as initialized |
| **Offline mode** | Init fails gracefully; falls back to polling (no Pusher) |

### 3.6 Backend Requirements

The backend must implement `POST /api/session/init` that:

1. **Accepts a client-generated sessionId** (UUID v4)
2. **Creates the session row** if it doesn't exist (idempotent)
3. **Returns `created: true/false`** indicating if new or existing
4. **Associates session with authenticated user** (from Bearer token)
5. **Stores optional metadata** (url, domain, initialQuery)

**Idempotency:** Calling init multiple times with the same sessionId should be safe and return `created: false` on subsequent calls.

### 3.7 Source Files

| File | Purpose |
|------|---------|
| `src/api/client.ts` | `initSession()` method — calls `POST /api/session/init` |
| `src/services/sessionService.ts` | `ensureSessionInitialized()`, `recoverSessionsFromBackend()`, `initializeSessionService()` |
| `src/services/messageSyncService.ts` | Calls `ensureSessionInitialized()` before Pusher connect |
| `src/state/sessions.ts` | `initializeDomainAwareSessions()` calls recovery logic on startup |

---

## 4. Chat UI Contract (Backend → Extension)

**Purpose:** Define what the Side Panel chat UI expects from the backend so the user can distinguish user vs agent messages, see the live plan, and understand task completion.

### 3.1 Backend Requirements Summary

| # | Requirement | Status |
|---|-------------|--------|
| 1 | `POST /api/agent/interact` returns `plan` with `steps` and `currentStepIndex` | ✅ Implemented |
| 2 | Each plan step has `id`, `description`, `status` | ✅ Implemented |
| 3 | `GET /api/session/[sessionId]/messages` returns `role` per message | ✅ Implemented |
| 4 | WebSocket `new_message` payload includes `role` | ✅ Implemented |
| 5 | Task completion signaled by `action: "finish()"` or `action: "fail()"` | ✅ Implemented |

### 3.2 POST /api/agent/interact — Response Shape

| Requirement | Field / Behavior | Client Use |
|-------------|------------------|------------|
| **Plan (recommended)** | Include `plan` when the orchestrator has a plan. | **PlanWidget** shows stepper (past / current / future). If missing, UI shows "Planning…" skeleton. |
| **Plan shape** | `plan: { steps: PlanStep[], currentStepIndex: number }` | Stepper highlights current step, dims past, grays future. |
| **PlanStep shape** | Each step: `{ id: string, index: number, description: string, status: 'pending' \| 'active' \| 'completed' \| 'failed', ... }` | `id` identifies the step; `description` is shown in the list; `status` is used for styling. |
| **currentStepIndex** | Zero-based index of the step currently being executed. | Must stay in sync with the step that produced this response. |
| **Orchestrator status** | `status?: 'planning' \| 'executing' \| 'verifying' \| 'correcting' \| 'completed' \| 'failed' \| 'needs_user_input'` | Client stores it; PlanWidget uses `planning` to show skeleton when no steps yet. |
| **Task completion** | When the task is done, return `action: "finish()"`. On failure, return `action: "fail()"`. | Client sets `currentTask.status` to `'success'` or `'error'`; **TaskHeader** and **TaskCompletedCard** use this. |
| **Thought & action** | Keep sending `thought` and `action` as today. | **ChatTurn** shows Thought (collapsible), Action (badge), and Observation (✅/❌). |
| **Reasoning / user question** | Optional `reasoning`, `userQuestion`, `missingInformation` as already defined. | Reasoning badge, UserInputPrompt, and evidence in agent bubbles. |

**Example response:**

```json
{
  "success": true,
  "data": {
    "thought": "I'll click the search button to submit the query.",
    "action": "click(42)",
    "actionDetails": {
      "name": "click",
      "elementId": 42,
      "selectorPath": "button[data-testid='search-btn']"
    },
    "taskId": "e49abedb-f50c-45d2-bf81-62662b6a038e",
    "plan": {
      "steps": [
        { "id": "step_0", "index": 0, "description": "Navigate to Google", "status": "completed", "toolType": "DOM" },
        { "id": "step_1", "index": 1, "description": "Enter search query", "status": "completed", "toolType": "DOM" },
        { "id": "step_2", "index": 2, "description": "Click search button", "status": "active", "toolType": "DOM" },
        { "id": "step_3", "index": 3, "description": "Click Wikipedia result", "status": "pending", "toolType": "DOM" }
      ],
      "currentStepIndex": 2,
      "createdAt": "2026-01-30T10:00:00.000Z"
    },
    "currentStep": 2,
    "totalSteps": 4,
    "status": "executing",
    "sessionId": "59adf5f0-cddb-42dd-a20d-658ac57278fd"
  }
}
```

### 3.3 GET /api/session/[sessionId]/messages — Response Shape

| Requirement | Field / Behavior | Client Use |
|-------------|------------------|------------|
| **role per message** | Every message **must** include `role: 'user' \| 'assistant' \| 'system'`. | **ChatTurn** aligns user messages right (blue) and assistant messages left (gray). If `role` is missing, client defaults to `'assistant'`. |
| **Message shape** | At least: `messageId`, `role`, `content`, `timestamp`. Optional: `status`, `actionPayload`, `actionString`, `error`, `sequenceNumber`, `domSummary`, `metadata`. | Client maps to `ChatMessage` and merges with local messages. |

**Example response:**

```json
{
  "sessionId": "59adf5f0-cddb-42dd-a20d-658ac57278fd",
  "messages": [
    {
      "messageId": "uuid-1",
      "role": "user",
      "content": "Go to Google and search for SpaceX",
      "sequenceNumber": 0,
      "timestamp": "2026-01-30T10:00:00.000Z"
    },
    {
      "messageId": "uuid-2",
      "role": "assistant",
      "content": "I'll navigate to Google first.",
      "actionString": "navigate(\"https://www.google.com\")",
      "status": "success",
      "sequenceNumber": 1,
      "timestamp": "2026-01-30T10:00:01.000Z"
    }
  ],
  "total": 2,
  "sessionExists": true
}
```

### 3.4 Task Completion (No New Endpoint)

| Requirement | Backend Behavior | Client Behavior |
|-------------|------------------|-----------------|
| **Success** | Return `action: "finish()"` in the interact response when the task is done. | Sets `currentTask.status = 'success'`; shows COMPLETED badge and Task Completed card. |
| **Failure** | Return `action: "fail()"` when the task fails. | Sets `currentTask.status = 'error'`; shows FAILED badge. |
| **Optional** | You may also send `status: 'completed'` or `status: 'failed'` in the same response. | Client already derives completion from `finish()` / `fail()`. |

No separate "task complete" endpoint or `isTaskComplete` flag is required; the existing interact response is enough.

### 3.5 Plan Preview Messages (System Messages)

**Status:** ✅ Implemented (February 2026)

When the agent generates a plan for complex tasks, a **plan preview system message** is created and broadcast to users before execution begins. This provides transparency into the agent's intended actions.

#### Message Types

| Type | When Created | `metadata.messageType` |
|------|--------------|------------------------|
| **Plan Preview** | New task with plan generated | `"plan_preview"` |
| **Plan Update** | Plan regenerated during replanning | `"plan_update"` |

#### Message Structure

```json
{
  "messageId": "uuid",
  "sessionId": "session-uuid",
  "role": "system",
  "content": "Here's my plan to complete this task:\n\n1. Navigate to login page\n2. Enter email address\n3. Click submit button",
  "sequenceNumber": 1,
  "timestamp": "2026-02-02T10:00:00.000Z",
  "metadata": {
    "messageType": "plan_preview",
    "taskId": "task-uuid",
    "plan": {
      "steps": [
        { "index": 0, "description": "Navigate to login page", "status": "pending" },
        { "index": 1, "description": "Enter email address", "status": "pending" },
        { "index": 2, "description": "Click submit button", "status": "pending" }
      ],
      "totalSteps": 3,
      "currentStepIndex": 0
    }
  }
}
```

#### Client Rendering

Clients should check `metadata.messageType` to render plan messages differently:

- **`plan_preview`**: Show with "Plan" header and ListChecks icon
- **`plan_update`**: Show with "Updated Plan" header and RefreshCw icon
- Render steps as a numbered list in a card with `bg-muted/30` styling
- Distinguish from regular assistant messages (left-aligned gray bubble)

#### Pusher Broadcast

Plan messages are broadcast via **new_message** event on `private-session-<sessionId>` channel with `role: "system"`. Clients receive in real-time and should merge into message list like other messages.

---

### 3.6 WebSocket / Push (Pusher/Sockudo)

Real-time message sync uses **Pusher/Sockudo**: channel `private-session-<sessionId>`, events **new_message** and **interact_response**.

| Requirement | Backend Action | Client Behavior |
|-------------|----------------|-----------------|
| **role in new_message** | When triggering **new_message**, the payload must include a **message** object with **role: 'user' \| 'assistant' \| 'system'**. Same rule as GET session messages. | Client maps payload via `pusherTransport.mapMessagePayload`. If `role` is missing, it defaults to `'assistant'`, so all pushed messages appear as agent (left/gray). |
| **Payload shape for new_message** | Send the same shape as a message in GET /api/session/[sessionId]/messages: `messageId`, `role`, `content`, `timestamp`, and optionally `status`, `sequenceNumber`, `actionPayload`, `error`, `metadata`. | Client merges into `currentTask.messages` (dedup by id, sort by sequenceNumber). |
| **interact_response** | No change. Keep triggering **interact_response** when an interact round completes. | Client calls `loadMessages(sessionId)` and refetches from REST; GET contract (including `role` per message) applies. |
| **Plan / task status over push** | Not required. Plan and task completion are taken from the **POST /api/agent/interact** response. | Optional: add events like **plan_update** or **task_status** for multi-device sync. |

**new_message payload example:**

```json
{
  "type": "new_message",
  "sessionId": "59adf5f0-cddb-42dd-a20d-658ac57278fd",
  "message": {
    "messageId": "uuid",
    "role": "assistant",
    "content": "Navigating to Google...",
    "sequenceNumber": 1,
    "timestamp": "2026-01-30T10:00:01.000Z",
    "status": "success"
  }
}
```

#### WebSocket Auth & Reauth Strategy

**Channel Auth:** POST `/api/pusher/auth` with Bearer token. Returns signed auth string for private channel.

**Reauth on 403/401 Errors:**

When Pusher channel auth fails (403 Forbidden, 401 Unauthorized):

1. **Token Validation First:** Client calls `GET /api/v1/auth/session` to check if token is still valid
2. **If Valid (Transient Error):** Reset failure count, retry connection immediately with fresh credentials
3. **If Invalid:** Enter cooldown period (1 min default, 5 min after 3+ failures), switch to polling fallback
4. **Visibility Reconnect:** When tab becomes visible after idle, calls `forceReconnectWithFreshToken()` which:
   - Bypasses cooldown
   - Validates token via `/api/v1/auth/session`
   - Reconnects with fresh credentials if token is valid
   - Falls back gracefully if token expired (user needs to re-login)

**Location:** `src/services/pusherTransport.ts` (`handleAuthFailure`, `forceReconnectWithFreshToken`, `validateToken`)

### 3.7 What the Backend Does NOT Need to Do

- **No new endpoints** — only correct shape of existing responses.
- **No `isTaskComplete` field** — client infers from `action: "finish()"` / `"fail()"`.
- **No change to request body** of POST /api/agent/interact (existing contract stays).

---

### 3.8 Fields the UI Uses

| Field | Source | Purpose |
|-------|--------|---------|
| **plan** | `POST /api/agent/interact` response | `{ steps: PlanStep[], currentStepIndex: number }`. Rendered in **PlanWidget** (stepper: past/current/future). |
| **currentStepIndex** | Inside `plan` | Which step is active. |
| **Task status** | Extension state `currentTask.status` | Derived from response flow: `idle` \| `running` \| `success` \| `error` \| `interrupted`. **TaskHeader** shows RUNNING / COMPLETED / FAILED / STOPPED. |
| **sender / role** | Message `role` in `ChatMessage` | `'user' \| 'assistant' \| 'system'`. User messages right-aligned blue; agent left-aligned gray. |

**PlanStep** (from backend):

```typescript
interface PlanStep {
  id: string           // e.g., "step_0" — for UI identification
  index: number        // Step index in plan (0-based)
  description: string  // Human-readable step description
  status: 'pending' | 'active' | 'completed' | 'failed'
  reasoning?: string   // Why this step is needed
  toolType: 'DOM' | 'SERVER' | 'MIXED'
  expectedOutcome?: Record<string, unknown>
}
```

---

### 3.9 Implementation Notes

#### 3.9.1 Plan Step ID Generation

The `id` field is generated from `index` in the interact route:

```typescript
steps: graphResult.plan.steps.map((step) => ({
  ...step,
  id: `step_${step.index}`, // Chat UI contract: id: string for PlanWidget stepper
}))
```

#### 3.9.2 Message Role Persistence

The Message model already has `role: 'user' | 'assistant' | 'system'` as a required field. All messages are persisted with their role.

#### 3.9.3 WebSocket Payload

The `triggerNewMessage` function in `lib/pusher/server.ts` already requires `role` in the message payload:

```typescript
export async function triggerNewMessage(
  sessionId: string,
  message: {
    messageId: string
    role: "user" | "assistant" | "system"  // Required
    content: string
    // ... other fields
  }
): Promise<void>
```

---

---

## 5. Robust Element Selectors

**Purpose:** Prevent "stale element ID" failures on dynamic sites by returning a robust `selectorPath` alongside element-id-based actions.

**Status:** ✅ Backend Complete — Extension still needs to consume `actionDetails.selectorPath` in its executor path (if not already wired end-to-end).

### 4.1 Problem Statement

When automating dynamic sites (Google.com, React apps, etc.), element IDs become stale:

```
1. Extension extracts DOM → { id: 13, tag: "textarea", name: "q", ... }
2. Extension sends DOM to backend
3. Backend decides: setValue(13, "space x")
4. Site re-renders (hydration, dynamic updates)
5. Element 13 no longer exists or points to a different element
6. Extension acts on the wrong element OR fails with "Element not found"
```

### 4.2 Contract: `actionDetails` in `POST /api/agent/interact` response

```json
{
  "thought": "I need to type 'space x' into the search box",
  "action": "setValue(13, \"space x\")",
  "actionDetails": {
    "name": "setValue",
    "elementId": 13,
    "selectorPath": "textarea[name='q']",
    "args": {
      "value": "space x"
    }
  },
  "taskId": "abc-123"
}
```

### 4.3 Backend Implementation

**Files:**
- `lib/agent/dom-element-mapping.ts` — extracts elementId → selectorPath mapping and builds `actionDetails`
- `lib/agent/graph/route-integration/run-graph.ts` — includes `actionDetails` in graph output
- `app/api/agent/interact/route.ts` — returns `actionDetails` to the client

---

## 6. Hybrid Vision + Skeleton

**Purpose:** Define the optional fields for the hybrid vision + skeleton mode, which reduces token usage by ~80% while improving accuracy for visual/spatial tasks.

### 5.1 Overview

Instead of sending one massive DOM (10-20k tokens), the extension can send two optimized streams:

1. **Visual Stream (Screenshot)**: Provides layout, spatial context, and visual understanding (~1k tokens)
2. **Action Stream (Skeleton DOM)**: Hyper-compressed DOM containing only interactive elements (~1-2k tokens)

**Result**: Reduce input context from ~15-20k tokens to ~3k tokens while increasing accuracy for complex layouts.

### 5.2 POST /api/agent/interact — Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `screenshot` | `string \| null` | No | Base64-encoded JPEG screenshot (1024px width, 0.7 quality). `null` if unchanged since last request. Max 2MB. |
| `domMode` | `"skeleton" \| "full" \| "hybrid"` | No | Processing mode hint. Defaults to `"full"` for backward compatibility. |
| `skeletonDom` | `string` | No | Skeleton DOM containing only interactive elements. Server extracts from `dom` if not provided. Max 100KB. |
| `screenshotHash` | `string` | No | Perceptual hash for screenshot deduplication. Max 256 chars. |

### 5.3 Mode Selection

The server uses `domMode` as a hint but may override based on query analysis:

| Query Type | Recommended Mode | Example Queries |
|------------|------------------|-----------------|
| Simple action | `skeleton` | "click the Search button", "enter my email" |
| Visual/spatial | `hybrid` | "click the gear icon on the right", "what's the price of the red item" |
| Complex/fallback | `full` | When skeleton is insufficient |

### 5.4 Visual Keywords (Trigger Hybrid Mode)

Queries containing these keywords trigger hybrid mode when `screenshot` is provided:

**Visual descriptors:** icon, image, logo, picture, photo, avatar, thumbnail, banner, color, shape

**Position words:** top, bottom, left, right, corner, center, middle, next to, above, below, beside

**Question patterns:** what is, what does, identify, recognize

### 5.5 Server Behavior

1. **Backward compatible**: If `screenshot`, `domMode`, `skeletonDom` are not provided, server uses full `dom` (existing behavior).
2. **Server-side skeleton**: If `domMode` is `"skeleton"` or `"hybrid"` but `skeletonDom` is not provided, server extracts skeleton from `dom`.
3. **Fallback**: If skeleton is insufficient (element not found), server may request full DOM in the next response via a specific error code.

### 5.6 Extension Implementation (Reference)

#### Screenshot Capture

Use `chrome.tabs.captureVisibleTab()` for viewport capture:

```typescript
async function captureAndOptimizeScreenshot(): Promise<string | null> {
  // 1. Capture the visible tab
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
    format: 'png',
    quality: 100,
  });

  // 2. Create off-screen canvas for optimization
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });

  // 3. Calculate dimensions (max 1024px width, maintain aspect ratio)
  const MAX_WIDTH = 1024;
  let width = img.width;
  let height = img.height;

  if (width > MAX_WIDTH) {
    height = Math.round((height * MAX_WIDTH) / width);
    width = MAX_WIDTH;
  }

  // 4. Draw to canvas and export as JPEG
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.drawImage(img, 0, 0, width, height);

  // 5. Export as JPEG with 0.7 quality
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.7);

  // 6. Extract base64 (remove prefix)
  return jpegDataUrl.split(',')[1];
}
```

#### Skeleton DOM Extraction

**KEEP** these elements:
- `<a href="...">` - Links
- `<button>` - Buttons
- `<input>` - All input types
- `<select>` - Dropdowns
- `<textarea>` - Text areas
- Elements with `onclick` attribute
- Elements with `role="button"`, `role="link"`, `role="menuitem"`, `role="tab"`
- Elements with `tabindex` >= 0 (focusable)
- Elements with `contenteditable="true"`

**DISCARD** these elements:
- Pure container elements: `<div>`, `<span>`, `<section>`, `<article>`, etc.
- Style elements: `<style>`, `<link rel="stylesheet">`
- Scripts: `<script>`, `<noscript>`
- SVG content (keep wrapper if clickable)
- Hidden elements

**KEEP** these attributes:
- `id` - Element identifier (REQUIRED for actions)
- `name` - Form field name
- `type` - Input type
- `href` - Link destination
- `value` - Current value
- `placeholder` - Input placeholder
- `role` - ARIA role
- `aria-label` - Accessibility label
- `data-testid` - Test identifiers

**DISCARD** these attributes:
- `class` - CSS classes
- `style` - Inline styles
- Most `data-*` attributes (except `data-testid`)

### 5.7 Token Cost Comparison

| Mode | DOM Size | Image Tokens | Total Tokens |
|------|----------|--------------|--------------|
| `full` | 12-20k | 0 | 12-20k |
| `skeleton` | 500-1.5k | 0 | 500-1.5k |
| `hybrid` | 500-1.5k | ~1k | 1.5-2.5k |

---

### 5.8 Extension Implementation (Current Behavior)

**Status:** ✅ Implemented

This section documents exactly what DOM data the Chrome extension currently sends to the backend on each `POST /api/agent/interact` call.

#### What's Sent in Each Request

The extension sends **all three** data types, but with conditions:

| Field | When Sent | Typical Size |
|-------|-----------|--------------|
| `dom` (full DOM) | **Always** | 50k-200k chars (truncated) |
| `skeletonDom` | **Always** | ~500-2000 chars |
| `screenshot` | **Only when `domMode === 'hybrid'`** | ~50-150KB base64 JPEG |
| `domMode` | **Always** | `'skeleton'` \| `'hybrid'` \| `'full'` |
| `screenshotHash` | **Only when screenshot captured** | 64-char perceptual hash |

#### Mode Selection Logic

The `selectDomMode()` function in `src/helpers/hybridCapture.ts` selects the mode based on the user query and page context:

**`hybrid` mode is selected when:**
- Query contains visual keywords: `icon`, `image`, `logo`, `picture`, `photo`, `avatar`, `color`, `shape`, `looks like`, `appears`
- Query contains spatial references: `top`, `bottom`, `left`, `right`, `corner`, `next to`, `above`, `below`, `beside`, `near`, `first`, `last`, `middle`
- Query contains visual question patterns: `what is`, `what does`, `how much`, `price`, `chart`, `graph`, `table`
- Page has >50 interactive elements (complex disambiguation needed)
- Page has significant visual content AND complex page structure

**`skeleton` mode is selected when:**
- Query contains simple action keywords: `click`, `type`, `fill`, `select`, `enter`, `press`, `submit`, `check`, `toggle`, `scroll`, `navigate`, `search`, `find`
- Page has medium complexity (20-50 interactive elements)
- Default fallback for efficiency

#### Screenshot Capture Logic

Screenshot is **only captured** when `domMode === 'hybrid'`:

```typescript
// From src/state/currentTask.ts
if (domMode === 'hybrid') {
  try {
    const screenshotResult = await captureAndOptimizeScreenshot();
    if (screenshotResult) {
      screenshotBase64 = screenshotResult.base64;
      screenshotHash = screenshotResult.hash;
    }
  } catch (screenshotError) {
    // Continue without screenshot - skeleton still provides value
  }
}
```

**Screenshot optimization:**
- Captured via `chrome.tabs.captureVisibleTab()`
- Resized to max 1024px width (aspect ratio maintained)
- Exported as JPEG at 0.7 quality (~50-150KB)
- Perceptual hash (8×8 grayscale) computed for deduplication
- Returns `null` if hash matches previous screenshot (unchanged)

#### Full DOM as Fallback

The full DOM is **always sent** in the `dom` field, even in `skeleton` or `hybrid` modes. This enables the server to:

1. Fall back to full DOM if skeleton is insufficient
2. Request a retry with `status: 'needs_full_dom'`

**DOM truncation limits:**
- Default: 50,000 chars
- Extended (for complex pages): 200,000 chars (auto-selected when DOM exceeds 50k)

#### Backend-Driven Negotiation

The extension follows a "semantic-first" principle: send lightweight `semantic` data first, then add heavier artifacts only when the backend explicitly requests them.

**Negotiation Flow:**
1. **Step A (always):** Extension sends `domMode: "semantic"` with `interactiveTree`
2. **Step B (optional):** Backend responds requesting additional artifacts if needed
3. **Step C:** Extension retries with *only* the requested artifacts

**Backend Negotiation Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"needs_context"` or `"needs_full_dom"` | Indicates more context is needed |
| `requestedDomMode` | `"skeleton"` \| `"hybrid"` \| `"full"` | Which mode to use on retry |
| `needsSkeletonDom` | `boolean` | Request skeleton HTML |
| `needsScreenshot` | `boolean` | Request screenshot |
| `reason` | `string` | Why additional context is needed (for debugging) |

**Example negotiation response:**

```json
{
  "status": "needs_context",
  "requestedDomMode": "hybrid",
  "needsScreenshot": true,
  "needsSkeletonDom": true,
  "reason": "User asked about the 'blue' button; semantic tree doesn't encode color reliably."
}
```

**When Backend Should Request More Artifacts:**

| Request | When to Use |
|---------|-------------|
| `skeleton` | Semantic tree lacks surrounding structure (e.g., duplicated labels) |
| `hybrid` | Visual references (color, icon-only, "top-right gear", "second card"), many similar elements |
| `full` | Raw HTML details needed, server-side selector generation requires missing attributes |

#### Fallback Handling

When the server determines semantic/skeleton DOM is insufficient, it responds with negotiation fields. The extension automatically retries:

```typescript
if (response.status === 'needs_full_dom' || response.status === 'needs_context') {
  const requestedMode = response.requestedDomMode || 'full';
  response = await apiClient.agentInteract(
    currentUrl,
    safeInstructions,
    currentDom,
    // ... other params
    {
      screenshot: response.needsScreenshot ? screenshotBase64 : undefined,
      skeletonDom: response.needsSkeletonDom ? skeletonDom : undefined,
      domMode: requestedMode,
      screenshotHash: screenshotHash || undefined,
    }
  );
}
```

#### Summary Table

| Mode | Full DOM Sent? | Skeleton Sent? | Screenshot Sent? | Use Case |
|------|---------------|----------------|------------------|----------|
| `skeleton` | ✅ (as fallback) | ✅ | ❌ | Simple actions: click, type, fill |
| `hybrid` | ✅ (as fallback) | ✅ | ✅ | Visual/spatial queries, complex pages |
| `full` | ✅ | ✅ | ❌ | Fallback when skeleton insufficient |

#### Source Files

| File | Purpose |
|------|---------|
| `src/helpers/hybridCapture.ts` | Mode selection logic, page state capture coordination |
| `src/helpers/skeletonDom.ts` | Skeleton DOM extraction from annotated DOM |
| `src/helpers/screenshotCapture.ts` | Screenshot capture, optimization, and perceptual hashing |
| `src/state/currentTask.ts` | Main action loop that calls `apiClient.agentInteract()` |
| `src/api/client.ts` | API client with `hybridParams` support |

---

## 7. Semantic JSON Protocol

**Purpose:** Replace heavy HTML-based DOM extraction with a lightweight JSON protocol that provides ~95-99% token reduction and eliminates "Element not found" errors through stable element IDs.

**Status:** ✅ Implementation Complete (February 2026)

**Key Principle:** Semantic JSON is the PRIMARY and ONLY source of truth. Full DOM should ONLY be sent when the backend explicitly requests it via `needs_full_dom` response.

### 6.1 Overview

The Semantic JSON Protocol addresses two critical issues with the previous HTML-based approach:

1. **Token Explosion:** Full DOM can be 50-200KB (~15-20k tokens). Skeleton DOM reduces this but still uses HTML format.
2. **ID Drift:** Element IDs are calculated during extraction. By the time the LLM's action is executed, the page may have re-rendered, causing "Element with id X not found" errors.

**Solution:**
- **Persistent Tagging:** Inject stable `data-llm-id` attributes into the DOM immediately when the page loads
- **JSON Format:** Send a simple JSON array instead of nested HTML
- **DOM Stability Waiting:** Wait for the DOM to stop changing before extraction

### 6.2 Key Features

| Feature | Description | Token Impact |
|---------|-------------|--------------|
| **Viewport Pruning** | Skip off-screen elements (below/above viewport) | ~60% reduction on long pages |
| **Minified JSON Keys** | `i/r/n/v/s/xy` instead of `id/role/name/value/state/coordinates` | ~30% reduction |
| **Coordinates Included** | `[x, y]` for direct click targeting | Eliminates coordinate lookups |

**Semantic Payload Example:**

```json
{
  "mode": "semantic",
  "url": "https://google.com",
  "title": "Google",
  "viewport": { "width": 1280, "height": 800 },
  "interactive_tree": [
    { "i": "12", "r": "link", "n": "Gmail", "xy": [900, 20] },
    { "i": "14", "r": "inp", "n": "Search", "v": "SpaceX", "xy": [400, 300] },
    { "i": "15", "r": "btn", "n": "Google Search", "xy": [400, 350] }
  ]
}
```

**Legend (included in system prompt):**
```
- i: element ID (use this in click(i) or setValue(i, text))
- r: role (btn=button, inp=input, link=link, chk=checkbox, sel=select)
- n: name/label visible to user
- v: current value (for inputs)
- s: state (disabled, checked, expanded)
- xy: [x, y] coordinates on screen
```

**Token Comparison:**

| Mode | Typical Size | Token Estimate |
|------|--------------|----------------|
| Full DOM | 50-200 KB | 10,000-50,000 |
| Skeleton | 2-6 KB | 500-1,500 |
| **Semantic** | **100-300 bytes** | **25-75** |

### 6.2.1 Advanced Features (Browser-Use & Midscene Inspired)

Production-grade reliability features inspired by Browser-Use and Midscene DOM extraction:

| Feature | Problem Solved | New Field/Behavior |
|---------|---------------|-------------------|
| **Multi-Point Visibility Scoring** | Modal/overlay blocks clicks | `occ: true` if visibility score < 50% (5-point sampling) |
| **Hidden Event Listener Detection** | React/Vue/Angular invisible click handlers | Elements marked with `data-has-click-listener="true"` via CDP |
| **Atomic Leaf Traversal** | Deep tree structure wastes tokens | Buttons/links treated as leaves; ~30% token reduction |
| **2/3 Visibility Rule** | Partial elements fail to click | Only elements ≥66% visible included |
| **Container Pruning** | Generic divs add noise | Only containers with visual boundaries kept |
| **Explicit Label Association** | Unnamed inputs confuse LLM | Enhanced `n` field via label hunting |
| **Mutation Stream** | Transient toasts missed | `recentEvents`, `hasErrors`, `hasSuccess` |
| **Delta Hashing** | Unchanged DOM wastes bandwidth | Client-side skip when hash unchanged |
| **Virtual List Detection** | Infinite scroll hides content | `scr: { depth: "10%", h: true }` |
| **Self-Healing Recovery** | Stale IDs after re-render | Ghost match by role/name/coordinates |
| **Bounding Box** | Multimodal vision support | `box: [x, y, w, h]` |

**Advanced Payload Example:**

```json
{
  "mode": "semantic",
  "url": "https://amazon.com/checkout",
  "title": "Checkout",
  "viewport": { "width": 1280, "height": 800 },
  "scrollPosition": "25%",
  "interactive_tree": [
    { "i": "5", "r": "inp", "n": "Full Name", "v": "John Doe", "xy": [200, 150], "box": [100, 140, 200, 30] },
    { "i": "6", "r": "inp", "n": "Street", "xy": [200, 200] },
    { "i": "99", "r": "btn", "n": "Place Order", "xy": [600, 700], "occ": true }
  ],
  "scrollableContainers": [
    { "id": "cart-items", "depth": "0%", "hasMore": true }
  ],
  "recentEvents": [
    "[3s ago] Added: 'Shipping calculated'",
    "[1s ago] Error: 'Invalid ZIP code'"
  ],
  "hasErrors": true,
  "hasSuccess": false
}
```

**Advanced Node Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `box` | `[x, y, w, h]` | Bounding box for Set-of-Mark multimodal |
| `scr` | `{ depth, h }` | Scrollable container: depth=scroll%, h=hasMore |
| `occ` | `boolean` | True if covered by overlay (don't click) |

**Advanced Legend (for system prompt):**

```
LEGEND for interactive_tree format:
- i: element ID (use in click(i) or setValue(i, text))
- r: role (btn=button, inp=input, link=link, chk=checkbox, sel=select)
- n: name/label visible to user
- v: current value (for inputs)
- s: state (disabled, checked, expanded, etc.)
- xy: [x, y] center coordinates on screen
- box: [x, y, width, height] bounding box (when included)
- scr: { depth: "0%", h: true } - scrollable container info
- occ: true if element covered by modal (avoid clicking)

SCROLLABLE CONTAINERS:
- If scr.h is true, element has more content below
- Use scroll(id) to load more items in virtual lists

OCCLUDED ELEMENTS:
- If occ: true, element is behind modal/popup
- First dismiss overlay, then click target

RECENT EVENTS:
- Shows DOM changes since last snapshot (success toasts, errors)
- Use to verify if previous action succeeded
```

### 6.3 The "Tag & Freeze" Strategy

Instead of calculating IDs during extraction, we "stamp" permanent IDs onto elements as soon as they appear.

> **Architecture Note:** We use injected `data-llm-id` attributes instead of Chrome's native `backendNodeId` (used by Browser-Use). This trade-off enables "stealth" operation without the Chrome debugger banner, at the cost of potential ID instability when frameworks destroy/recreate DOM nodes. Mitigations include MutationObserver re-tagging and Self-Healing ghost match recovery. See [DOM_EXTRACTION_ARCHITECTURE.md §2.7](./DOM_EXTRACTION_ARCHITECTURE.md#27-element-id-strategy-data-llm-id-vs-backendnodeid) for full details.

```javascript
// Before: IDs calculated during extraction (can drift)
<button data-id="6">Submit</button>  // ID 6 might not exist when clicked

// After: IDs injected early and persist
<button data-llm-id="6">Submit</button>  // ID 6 is physically stamped on the element
```

**Key Benefits:**
- IDs persist across React/Vue/Angular re-renders
- IDs survive DOM mutations
- MutationObserver ensures new elements get tagged immediately

### 6.4 Request Fields (Extension → Backend)

When `domMode` is `"semantic"`, the extension sends:

| Field | Type | Description |
|-------|------|-------------|
| `domMode` | `"semantic"` | Indicates semantic format (API field name) |
| `interactiveTree` | `SemanticNode[]` | Minified array with viewport pruning |
| `pageTitle` | `string` | Page title for context |
| `viewport` | `{ width, height }` | Viewport dimensions |

**SemanticNode Structure (minified keys for token efficiency):**

```typescript
interface SemanticNode {
  i: string;         // Element ID (stable data-llm-id)
  r: string;         // Role (minified: btn, inp, link, chk, sel, etc.)
  n: string;         // Name/label (truncated to 50 chars)
  v?: string;        // Current value for inputs
  s?: string;        // State: 'disabled', 'checked', 'expanded'
  xy?: [number, number]; // [x, y] center coordinates
  f?: number;        // Frame ID (0 = main, omitted if 0)
  box?: [number, number, number, number]; // Bounding box [x, y, w, h]
  scr?: { depth: string; h: boolean }; // Scrollable container info
  occ?: boolean;     // True if occluded by overlay
}
```

### 6.4 Example Payloads

**Before (HTML ~50KB, ~12k tokens):**

```html
<div class="xyz"><div class="abc"><div class="search-container">
  <form role="search"><div class="wrapper"><input name="q" type="text"
  value="SpaceX" placeholder="Search" aria-label="Search"></div>
  <button type="submit" class="btn primary"><span>Search</span></button>
</form></div></div></div>
```

**After (JSON ~200 bytes, ~50 tokens):**

```json
[
  { "id": "6", "role": "searchbox", "name": "Search", "value": "SpaceX", "placeholder": "Search" },
  { "id": "7", "role": "button", "name": "Search" }
]
```

**Token Reduction:** ~99.8% (12,000 → 25-50 tokens)

### 6.6 DOM Mode Selection

**IMPORTANT:** Semantic is the PRIMARY mode. Full DOM should ONLY be sent when explicitly requested by the backend.

| Priority | Condition | Mode Selected | Payload | Tokens |
|----------|-----------|---------------|---------|--------|
| **1 (Default)** | Semantic enabled | `semantic` | Minified JSON + viewport pruning | 25-75 |
| 2 | Semantic fails | `skeleton` | Skeleton HTML | 500-1500 |
| 3 | Visual query | `hybrid` | Screenshot + skeleton | 2000-3000 |
| **4 (ONLY on request)** | Backend returns `needs_full_dom` | `full` | Full HTML | 10k-50k |

**Key Principle:** The extension should NEVER send full DOM proactively. Only send it when the backend explicitly requests it in a `needs_full_dom` response.

```typescript
// Decision flow in currentTask.ts
if (USE_SEMANTIC_EXTRACTION) {
  const result = await callRPC('getSemanticDomV3', ...);
  if (result?.interactive_tree?.length > 0) {
    domMode = 'semantic';  // API field name
  } else {
    domMode = selectDomMode(query, context); // Fallback to skeleton/hybrid
  }
}

// Full DOM ONLY on explicit backend request
if (backendResponse.status === 'needs_full_dom') {
  retryWithFullDom();
}
```

### 6.7 Stability Waiting

Before extracting, the extension waits for the DOM to stabilize:

```typescript
await waitForDomStability({
  timeout: 3000,           // Max wait time
  stabilityThreshold: 300, // Time without mutations
  waitForNetwork: true,    // Also wait for network idle
});
```

This prevents extracting "skeleton" pages that are still loading (e.g., Google search results).

### 6.8 Backend Integration Requirements

For semantic mode support, the backend should:

1. **Accept `domMode: "semantic"`** as the primary mode
2. **Parse `interactiveTree` array** when present
3. **Use stable IDs** for action targeting (e.g., `click("6")` instead of `click(6)`)
4. **Request more context** - if semantic data is insufficient, respond with `needs_context` or `needs_full_dom`

**Response format unchanged** - the backend still returns:

```json
{
  "thought": "I'll click the Search button",
  "action": "click(7)"
}
```

The extension finds element by `[data-llm-id="7"]` instead of the old approach.

### 6.8 Source Files

| File | Purpose |
|------|---------|
| `src/pages/Content/tagger.ts` | Persistent ID injection with MutationObserver |
| `src/pages/Content/semanticTree.ts` | JSON extraction from tagged elements |
| `src/pages/Content/domWait.ts` | DOM stability waiting utilities |
| `src/helpers/pageRPC.ts` | RPC methods: `getSemanticDom`, `initializeTagger` |
| `src/state/currentTask.ts` | Integration with action loop |
| `src/api/client.ts` | API client with `semanticNodes` support |

### 6.9 Migration Path

The semantic extraction is **enabled by default** (`USE_SEMANTIC_EXTRACTION = true`). To disable and use legacy skeleton mode, set to `false` in `currentTask.ts`.

**Backward Compatibility:**
- Old `skeletonDom` field still sent for backends that don't support semantic mode
- Full `dom` always available as fallback
- Existing `skeleton`/`hybrid`/`full` modes still work

---

## 8. Backend Implementation: Browser-Use & Midscene Support

**Purpose:** Document backend changes to leverage the new Browser-Use and Midscene inspired client improvements.

**Status:** 🔶 Optional Enhancements (client improvements work without backend changes)

### 8.1 Overview

The client-side Browser-Use and Midscene improvements provide:
- **50-60% token reduction** (automatic, no backend changes needed)
- **Occlusion detection** (`occ: true` flag on elements behind modals)
- **Cleaner tree structure** (atomic leaves, no empty containers)
- **Stricter visibility filtering** (only ≥66% visible elements)

The backend can optionally enhance its behavior to take advantage of these improvements.

### 8.2 New Semantic Node Fields

The `interactiveTree` nodes now include additional optional fields:

```typescript
interface SemanticNode {
  // Required (unchanged)
  i: string;           // Element ID (stable data-llm-id)
  r: string;           // Role (minified: btn, inp, link, chk, sel, etc.)
  n: string;           // Name/label (truncated to 50 chars)

  // Optional (existing)
  v?: string;          // Current value for inputs
  s?: string;          // State: 'disabled', 'checked', 'expanded'
  xy?: [number, number]; // [x, y] center coordinates
  f?: number;          // Frame ID (0 = main, omitted if 0)
  box?: [number, number, number, number]; // Bounding box [x, y, w, h]
  scr?: { depth: string; h: boolean };    // Scrollable container info

  // NEW: Browser-Use & Midscene Inspired
  occ?: boolean;       // TRUE if element is OCCLUDED by modal/overlay
                       // Backend should NOT generate click actions for occ:true elements
}
```

### 8.3 Occlusion-Aware Action Planning

**Priority: HIGH** — Prevents click failures on elements behind modals.

When the backend generates click/setValue actions, it should check the `occ` field:

```typescript
// lib/agent/action-planning.ts (pseudocode)

function planAction(targetElement: SemanticNode, intent: string): Action {
  // CHECK: Is element occluded by modal/overlay?
  if (targetElement.occ === true) {
    // DO NOT click - element is behind a popup
    return {
      thought: `The "${targetElement.n}" ${targetElement.r} is covered by a modal or overlay. I need to dismiss the overlay first before I can interact with it.`,
      action: 'dismissOverlay()',  // Or: press Escape, click close button
      reasoning: 'Element has occ:true flag indicating it is behind a modal'
    };
  }

  // Normal action planning
  return {
    thought: `I'll click the "${targetElement.n}" ${targetElement.r}.`,
    action: `click(${targetElement.i})`
  };
}
```

**Overlay Dismissal Strategies:**

| Strategy | When to Use | Action |
|----------|-------------|--------|
| Press Escape | Most modals | `pressKey('Escape')` |
| Click backdrop | Dismissible modals | `click(backdropElement.i)` |
| Click X button | Modal with close button | `click(closeButton.i)` |
| Scroll away | Sticky banners | `scroll('down')` |

**Finding the Overlay:**

```typescript
// Look for common overlay patterns in the tree
function findOverlayDismissAction(tree: SemanticNode[]): string | null {
  // 1. Look for close buttons
  const closeBtn = tree.find(n =>
    n.r === 'btn' &&
    (n.n.toLowerCase().includes('close') ||
     n.n.toLowerCase().includes('dismiss') ||
     n.n === '×' || n.n === 'X')
  );
  if (closeBtn && !closeBtn.occ) {
    return `click(${closeBtn.i})`;
  }

  // 2. Look for "Accept" / "Got it" buttons (cookie banners)
  const acceptBtn = tree.find(n =>
    n.r === 'btn' &&
    (n.n.toLowerCase().includes('accept') ||
     n.n.toLowerCase().includes('got it') ||
     n.n.toLowerCase().includes('agree'))
  );
  if (acceptBtn && !acceptBtn.occ) {
    return `click(${acceptBtn.i})`;
  }

  // 3. Default: try Escape key
  return `pressKey('Escape')`;
}
```

### 8.4 Scroll Guidance for Missing Elements

**Priority: MEDIUM** — Helps when target element is below the viewport.

The client now filters elements that are <66% visible. If the backend can't find an element, it should suggest scrolling:

```typescript
// lib/agent/element-finder.ts (pseudocode)

function findElement(query: string, tree: SemanticNode[]): SemanticNode | null {
  // Try to find element by name/role
  const match = tree.find(n =>
    n.n.toLowerCase().includes(query.toLowerCase())
  );

  if (match) return match;

  // Element not in tree - might be below viewport
  return null;
}

function planActionForMissingElement(query: string, tree: SemanticNode[]): Action {
  // Check if there's a scrollable container
  const scrollable = tree.find(n => n.scr?.h === true);

  if (scrollable) {
    return {
      thought: `I can't see "${query}" in the current viewport. There's a scrollable area with more content below. I'll scroll to find it.`,
      action: `scroll(${scrollable.i})`,
      reasoning: 'Element not in tree, scrollable container has hasMore:true'
    };
  }

  // Default: scroll the page
  return {
    thought: `I can't see "${query}" in the current viewport. I'll scroll down to find it.`,
    action: `scroll('down')`,
    reasoning: 'Element not in tree, attempting page scroll'
  };
}
```

### 8.5 System Prompt Updates

**Priority: HIGH** — Ensures LLM understands the new fields.

Add the following to the system prompt sent to the LLM:

```markdown
## Interactive Element Format

Each element in `interactive_tree` has these fields:

| Field | Description |
|-------|-------------|
| `i` | Element ID — use in `click(i)` or `setValue(i, "text")` |
| `r` | Role: `btn`=button, `inp`=input, `link`=link, `chk`=checkbox, `sel`=select |
| `n` | Name/label visible to the user |
| `v` | Current value (for inputs) |
| `s` | State: `disabled`, `checked`, `expanded`, `selected` |
| `xy` | `[x, y]` center coordinates on screen |
| `occ` | **⚠️ OCCLUDED** — `true` if element is BEHIND a modal/overlay |
| `scr` | Scrollable: `{ depth: "25%", h: true }` means 25% scrolled, more content below |

## Critical Rules

### Rule 1: NEVER click occluded elements
If an element has `occ: true`, it is covered by a modal, popup, or overlay.
- **DO NOT** attempt to click it — the click will hit the overlay instead
- **FIRST** dismiss the overlay (click X, press Escape, click "Accept")
- **THEN** retry the original action

### Rule 2: Scroll to find missing elements
If your target element is not in the list:
- It may be below the visible viewport (we only show elements ≥66% visible)
- Check for `scr.h: true` (scrollable container with more content)
- Use `scroll(containerId)` or `scroll("down")` to reveal more elements

### Rule 3: Use coordinates for disambiguation
When multiple elements have similar names, use `xy` coordinates to pick the right one:
- "top" = lower y value
- "bottom" = higher y value
- "left" = lower x value
- "right" = higher x value
```

### 8.6 Action Response: Requesting Scroll

When the backend needs the user to scroll to find an element, use a specific response format:

```json
{
  "thought": "The 'Submit' button is not visible in the current viewport. I need to scroll down to find it.",
  "action": "scroll('down')",
  "status": "needs_scroll",
  "scrollReason": "Target element 'Submit button' not in visible viewport",
  "retryAfterScroll": true
}
```

The client should:
1. Execute the scroll action
2. Re-extract the semantic tree
3. Retry the original request with the updated tree

### 8.7 Validation: Reject Occluded Targets

Before executing any click/setValue action, validate the target:

```typescript
// lib/agent/action-validator.ts

interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

function validateActionTarget(
  action: ParsedAction,
  tree: SemanticNode[]
): ValidationResult {
  if (action.type !== 'click' && action.type !== 'setValue') {
    return { valid: true };
  }

  const target = tree.find(n => n.i === action.elementId);

  if (!target) {
    return {
      valid: false,
      error: `Element ${action.elementId} not found in current viewport`,
      suggestion: 'scroll("down") to reveal more elements'
    };
  }

  if (target.occ === true) {
    return {
      valid: false,
      error: `Element "${target.n}" is occluded by a modal/overlay`,
      suggestion: 'Dismiss the overlay first (press Escape or click close button)'
    };
  }

  if (target.s?.includes('disabled')) {
    return {
      valid: false,
      error: `Element "${target.n}" is disabled`,
      suggestion: 'Check if a prerequisite action is needed'
    };
  }

  return { valid: true };
}
```

### 8.8 Implementation Phases

| Phase | Priority | Changes | Impact |
|-------|----------|---------|--------|
| **Phase 1** | HIGH | Update system prompt with `occ` field documentation | LLM awareness |
| **Phase 2** | HIGH | Add occlusion validation before action execution | Prevent click failures |
| **Phase 3** | MEDIUM | Add scroll suggestions for missing elements | Better element discovery |
| **Phase 4** | LOW | Enhanced overlay dismissal strategies | Smoother modal handling |

### 8.9 Backward Compatibility

All changes are **additive and optional**:

- `occ` field is only present when element is occluded (not sent for visible elements)
- Backends that don't check `occ` will still work (may have occasional click failures on modals)
- Scroll suggestions are optional enhancements
- Existing action parsing remains unchanged

### 8.10 Testing Recommendations

Test these scenarios to validate backend integration:

| Scenario | Expected Behavior |
|----------|-------------------|
| Click element with `occ: true` | Backend suggests dismissing overlay first |
| Element not in tree | Backend suggests scrolling |
| Cookie banner covering page | Backend clicks "Accept" or presses Escape |
| Modal with close button | Backend clicks close button before target |
| Scrollable container with `scr.h: true` | Backend scrolls container to find element |
| Element with `s: "disabled"` | Backend reports element is disabled |

---

## 9. Atomic Actions & Action Chaining

**Status:** ✅ Implemented (February 2026)

This section defines the contract for atomic actions (one Chrome action per step) and action chaining with verification levels.

### 9.1 Atomic Actions Contract

Each plan step MUST represent exactly **ONE Chrome action**. The Chrome extension executes actions sequentially, one at a time.

#### Why Atomic?

| Reason | Explanation |
|--------|-------------|
| **Extension Constraint** | Chrome extension executes ONE action per request |
| **Verification** | Each action needs individual verification |
| **Error Recovery** | If a step fails, we can retry just that step |
| **Chaining** | Atomic actions can be safely chained |

#### Valid Atomic Actions

Each step maps to exactly one action from `CHROME_TAB_ACTIONS.md`:

| Category | Actions |
|----------|---------|
| Navigation | `navigate(url)`, `goBack()`, `search(query)` |
| Input | `setValue(id, text)`, `type(text)` |
| Click | `click(id)`, `doubleClick(id)`, `rightClick(id)` |
| Selection | `check(id)`, `uncheck(id)`, `selectDropdown(id, value)` |
| Keyboard | `press("Enter")`, `press("Tab")` |
| Scroll | `scroll(direction)`, `findText(text)` |

#### Invalid Compound Actions

| Invalid | Split Into |
|---------|------------|
| "Type X and click Submit" | 1. `setValue(id, X)`, 2. `click(submitId)` |
| "Enter email and password" | 1. `setValue(emailId, email)`, 2. `setValue(passId, pass)` |
| "Fill form and submit" | N steps for each field + 1 click |
| "Search and press Enter" | 1. `setValue(searchId, query)`, 2. `press("Enter")` |

#### Server-Side Enforcement

The backend validates plans via `lib/agent/atomic-action-validator.ts`:

1. **Detection**: `analyzeStepAtomicity(description)` checks for compound patterns
2. **Splitting**: `splitCompoundAction(description)` splits into atomic steps
3. **Post-processing**: `validateAndSplitPlan(plan)` processes all steps

### 9.2 Action Chaining Contract

For related atomic actions (e.g., filling multiple form fields), the system can **chain** them with **lighter verification**.

#### Chain Response Shape

```typescript
{
  actions: [
    {
      action: "setValue(101, 'John')",
      description: "Enter first name",
      index: 0,
      targetElementId: 101,
      actionType: "setValue",
      verificationLevel: "client",
      clientVerificationChecks: [
        { type: "value_matches", elementId: 101, expectedValue: "John" }
      ]
    },
    {
      action: "setValue(102, 'Doe')",
      description: "Enter last name",
      index: 1,
      targetElementId: 102,
      actionType: "setValue",
      verificationLevel: "client",
      clientVerificationChecks: [
        { type: "value_matches", elementId: 102, expectedValue: "Doe" }
      ]
    },
    {
      action: "setValue(103, 'john@email.com')",
      description: "Enter email",
      index: 2,
      targetElementId: 103,
      actionType: "setValue",
      verificationLevel: "lightweight"
    }
  ],
  metadata: {
    totalActions: 3,
    safeToChain: true,
    chainReason: "FORM_FILL",
    containerSelector: "form#registration",
    defaultVerificationLevel: "client",
    clientVerificationSufficient: true,
    finalVerificationLevel: "lightweight"
  }
}
```

### 9.3 Verification Levels

| Level | Where | Token Cost | When Used |
|-------|-------|------------|-----------|
| `client` | Extension | 0 | Intermediate form fills, checkboxes |
| `lightweight` | Server (Tier 2) | ~100 | Simple final steps |
| `full` | Server (Tier 3) | ~400+ | Complex verifications, task completion |

### 9.4 Client-Side Verification Checks

When `verificationLevel: "client"`, the extension performs these checks:

| Type | Description | Parameters |
|------|-------------|------------|
| `value_matches` | Input value equals expected | `elementId`, `expectedValue` |
| `state_changed` | Element state changed | `elementId` |
| `element_visible` | Element is visible | `elementId` |
| `element_enabled` | Element is enabled | `elementId` |
| `no_error_message` | No error appeared | `textPattern?` |
| `success_message` | Success message appeared | `textPattern?` |

### 9.5 Chain Reasons

| Reason | Description | Client Verification? |
|--------|-------------|---------------------|
| `FORM_FILL` | Multiple fields in same form | ✅ Sufficient |
| `RELATED_INPUTS` | Related fields (e.g., address) | ✅ Sufficient |
| `BULK_SELECTION` | Multiple checkboxes | ✅ Sufficient |
| `SEQUENTIAL_STEPS` | Ordered steps | ❌ Needs server |
| `OPTIMIZED_PATH` | Optimization | ❌ Needs server |

### 9.6 Extension Contract

When receiving a chained response:

1. **Execute sequentially**: Execute actions in order (index 0, 1, 2...)
2. **Client verify**: For `verificationLevel: "client"`, run `clientVerificationChecks`
3. **Continue on success**: If client check passes, continue to next action
4. **Report on failure**: If any action fails, stop and report partial state
5. **Final verification**: After all actions, send request with final DOM for server verification

#### Partial Failure Reporting

If chain fails mid-execution:

```typescript
{
  // ... normal request fields ...
  chainPartialState: {
    executedActions: ["setValue(101, 'John')", "setValue(102, 'Doe')"],
    domAfterLastSuccess: "...", // DOM after last successful action
    totalActionsInChain: 3
  },
  chainError: {
    action: "setValue(103, 'invalid-email')",
    message: "Element not found",
    code: "ELEMENT_NOT_FOUND",
    elementId: 103,
    failedIndex: 2
  }
}
```

### 9.7 Implementation Files

| File | Purpose |
|------|---------|
| `lib/agent/atomic-action-validator.ts` | Atomic action detection and splitting |
| `lib/agent/chaining/types.ts` | Chain types, verification levels, helpers |
| `lib/agent/chaining/chain-generator.ts` | Chain building with verification levels |
| `lib/agent/chaining/chain-analyzer.ts` | Chain safety analysis |
| `lib/agent/planning-engine.ts` | Uses atomic validator |

---

## 10. File Attachments & Chat-Only Mode

**Status:** ✅ Complete (Phase 7)

This feature enables the agent to function as a **true AI assistant** that can handle tasks without browser interaction.

### Task Types

| Type | Description | Browser | URL Required |
|------|-------------|---------|--------------|
| `web_only` | Standard web automation (existing) | ✅ Required | ✅ Required |
| `web_with_file` | Web automation using attached file data | ✅ Required | ✅ Required |
| `chat_only` | Direct AI response, no browser | ❌ Not needed | ❌ Optional |

### Task Type Classification

The server automatically classifies tasks based on query patterns:

**Chat-Only Patterns:**
- Questions: "What is...", "How many...", "Explain...", "Calculate..."
- File analysis: "From the CSV...", "In the uploaded file...", "Extract from..."
- Memory queries: "What did we discuss...", "Remember when...", "Previously..."

**Web Patterns:**
- Interactions: "Click...", "Fill...", "Navigate to...", "Submit..."
- Form actions: "Enter in the form...", "Select the option..."
- CRUD: "Add a new...", "Delete the...", "Update..."

**Web-With-File Patterns:**
- "Fill the form using data from the CSV"
- "Upload the file to the page"
- "Use the PDF to populate the fields"

### Attachment Schema

```typescript
interface TaskAttachmentInput {
  s3Key: string      // S3 storage key from upload response
  filename: string   // Original filename, max 500 chars
  mimeType: string   // MIME type, max 100 chars
  size: number       // File size in bytes (positive integer)
}
```

### Supported File Types

| Type | MIME Type | Extraction |
|------|-----------|------------|
| PDF | `application/pdf` | Full text + page count |
| CSV | `text/csv` | Structured data + row/column count |
| JSON | `application/json` | Full content + structure info |
| Text | `text/plain` | Full text + line count |
| Markdown | `text/markdown` | Full text |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Full text |
| XML | `application/xml`, `text/xml` | Full content |

### Extension Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Handle `taskType: "chat_only"` | Do NOT execute DOM actions. Display response directly. |
| 2 | File upload before interact | Upload to `/api/knowledge/upload-to-s3` first, then include `attachment` in request. |
| 3 | Allow URL-less requests | For chat-only queries, `url` and `dom` are optional. |
| 4 | Report download button | After task completion, link to report endpoint. |

### Request Examples

**Chat-Only with File:**
```json
{
  "query": "What's the total revenue from this spreadsheet?",
  "sessionId": "sess-123",
  "attachment": {
    "s3Key": "uploads/tenant-1/sales.csv",
    "filename": "sales.csv",
    "mimeType": "text/csv",
    "size": 2048
  }
}
```

**Chat-Only without File (Memory Query):**
```json
{
  "query": "What tasks did we complete yesterday?",
  "sessionId": "sess-123"
}
```

**Web-With-File:**
```json
{
  "query": "Fill the patient form with data from the CSV",
  "url": "https://clinic.example.com/register",
  "dom": "<html>...",
  "sessionId": "sess-123",
  "attachment": {
    "s3Key": "uploads/tenant-1/patients.csv",
    "filename": "patients.csv",
    "mimeType": "text/csv",
    "size": 4096
  }
}
```

### Response Extension

```typescript
interface InteractResponse {
  // ... existing fields
  taskType: "chat_only" | "web_only" | "web_with_file"  // NEW
}
```

When `taskType: "chat_only"`:
- The `action` will always be `finish("response text")` or `fail("error")`
- No DOM execution is needed
- Task is complete in a single request-response cycle

### Implementation Files

| File | Purpose |
|------|---------|
| `lib/agent/task-type-classifier.ts` | Query pattern matching and classification |
| `lib/agent/file-context.ts` | S3 download + content extraction |
| `lib/agent/graph/nodes/chat-response.ts` | Chat-only task handler |
| `lib/models/task.ts` | Extended with `taskType`, `attachments`, `result` |
| `lib/agent/schemas.ts` | Extended request/response schemas |

---

## 11. Report Download API

**Status:** ✅ Complete (Phase 7)

Endpoint for downloading task results as formatted reports.

### Endpoint

```
GET /api/session/{sessionId}/task/{taskId}/report
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | `string` | `"json"` | Report format: `json`, `csv`, or `markdown` |

### Authentication

Requires valid Bearer token. Returns 401 if unauthorized.

### Response

| Format | Content-Type | Filename Pattern |
|--------|--------------|------------------|
| JSON | `application/json` | `task-report-{timestamp}.json` |
| CSV | `text/csv` | `task-report-{timestamp}.csv` |
| Markdown | `text/markdown` | `task-report-{timestamp}.md` |

Response headers include:
- `Content-Disposition: attachment; filename="..."` (triggers download)
- `Cache-Control: no-cache, no-store, must-revalidate`

### Report Contents

**JSON Format:**
```json
{
  "metadata": {
    "taskId": "task-123",
    "sessionId": "sess-456",
    "generatedAt": "2026-02-02T10:30:00Z",
    "format": "json"
  },
  "task": {
    "query": "Add a new patient named John",
    "status": "completed",
    "taskType": "web_only",
    "startedAt": "2026-02-02T10:25:00Z",
    "completedAt": "2026-02-02T10:28:00Z",
    "result": "Successfully added patient John"
  },
  "actionHistory": [
    {
      "stepIndex": 0,
      "action": "click(\"14\")",
      "status": "success",
      "thought": "Clicking the Add Patient button",
      "timestamp": "2026-02-02T10:25:30Z"
    }
  ],
  "summary": {
    "totalSteps": 5,
    "successfulSteps": 5,
    "duration": "3m 0s"
  }
}
```

**CSV Format:**
```csv
Step,Action,Status,Thought,Timestamp
0,"click(""14"")","success","Clicking the Add Patient button","2026-02-02T10:25:30Z"
1,"setValue(""15"", ""John"")","success","Entering patient name","2026-02-02T10:26:00Z"
```

**Markdown Format:**
```markdown
# Task Report

## Overview
- **Query:** Add a new patient named John
- **Status:** completed
- **Duration:** 3m 0s

## Action History

| Step | Action | Status | Thought |
|------|--------|--------|---------|
| 0 | click("14") | ✅ | Clicking the Add Patient button |
| 1 | setValue("15", "John") | ✅ | Entering patient name |

## Result
Successfully added patient John
```

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid format parameter |
| 401 | `UNAUTHORIZED` | Missing or invalid auth token |
| 404 | `NOT_FOUND` | Task not found or not owned by user |
| 500 | `INTERNAL_ERROR` | Server error during generation |

### Implementation Files

| File | Purpose |
|------|---------|
| `app/api/session/[sessionId]/task/[taskId]/report/route.ts` | API route handler |
| `lib/agent/report-generator.ts` | Report generation for all formats |

---

## 12. Changelog

- **2026-02-02**: **File Attachments & Chat-Only Mode (Phase 7)** - Added sections 10-11 documenting:
  - **Task Type Classification**: New `taskType` field (`chat_only`, `web_only`, `web_with_file`) with pattern-based classification
  - **Optional URL/DOM**: Requests can now omit `url` and `dom` for chat-only tasks (questions, file analysis, memory queries)
  - **File Attachment Support**: New `attachment` field in request with `s3Key`, `filename`, `mimeType`, `size`
  - **Supported Formats**: PDF, CSV, JSON, Text, Markdown, DOCX, XML with automatic content extraction
  - **Chat Response Node**: New graph node (`lib/agent/graph/nodes/chat-response.ts`) handles chat-only tasks directly
  - **Report Generation**: New endpoint `/api/session/{sessionId}/task/{taskId}/report` with JSON, CSV, Markdown formats
  - **Extension Requirements**: Handle `taskType: "chat_only"`, file upload flow, URL-less requests, report download button
  - **New Files**: `lib/agent/task-type-classifier.ts`, `lib/agent/file-context.ts`, `lib/agent/report-generator.ts`
  - **Updated Files**: `lib/models/task.ts`, `lib/agent/schemas.ts`, `app/api/agent/interact/route.ts`, `lib/agent/graph/executor.ts`
- **2026-02-02**: **Atomic Actions & Action Chaining** - Added section 9 documenting:
  - **Atomic Action Enforcement**: Each plan step must represent exactly ONE Chrome action. Compound actions like "type X and click Submit" are automatically detected and split.
  - **New Utility**: `lib/agent/atomic-action-validator.ts` with `analyzeStepAtomicity()`, `splitCompoundAction()`, `validateAndSplitPlan()`
  - **Planning Integration**: `planning-engine.ts` now calls `validateAndSplitPlan()` as post-processing step
  - **Verification Levels**: New `VerificationLevel` type (`client`/`lightweight`/`full`) for chained actions
  - **Client-Side Verification**: New `ClientVerificationCheck` type for checks the extension performs locally
  - **Chain Metadata**: Enhanced with `defaultVerificationLevel`, `clientVerificationSufficient`, `finalVerificationLevel`
  - **Updated Types**: `lib/agent/chaining/types.ts` with verification level helpers
  - **Updated Generator**: `lib/agent/chaining/chain-generator.ts` assigns verification levels
- **2026-02-02**: **Plan Preview Messages** - Added plan preview system messages that show users the generated plan before execution begins. New message types: `plan_preview` (initial plan) and `plan_update` (replanning). Messages are persisted to DB and broadcast via Pusher. New files: `lib/agent/graph/route-integration/plan-message.ts`. Updated: `run-graph.ts` (calls createPlanPreviewMessage), `replanning.ts` (calls createPlanUpdateMessage), `agent-chat.tsx` (renders plan messages with special UI). See §3.5 (Plan Preview Messages).
- **2026-02-01**: **Midscene-Inspired Token Optimizations** - Adopted three key optimizations from Midscene's DOM extractor:
  - **Atomic Leaf Traversal**: Stop recursion on interactive elements (buttons, links, inputs). Treats them as leaves and extracts all nested text at once. Reduces tree depth and tokens by ~30%.
  - **2/3 Visibility Rule**: Only include elements that are ≥66% visible in viewport. Prevents LLM from trying to click half-hidden elements that require scrolling.
  - **Container Pruning**: Strip generic `<div>` wrappers without visual boundaries (background, border, shadow). Flattens tree by removing noise.
  - **New Options**: `atomicLeafOptimization`, `minVisibleRatio`, `pruneEmptyContainers` in `extractSemanticTreeV3()`
  - **New Functions**: `isInsideAtomicParent()`, `isReliablyVisible()`, `isMeaningfulContainer()`, `getAtomicElementText()`
  - **Combined Impact**: ~50-60% additional token reduction on complex UIs
  - **New Documentation**: `DOM_EXTRACTION_ARCHITECTURE.md` §2.8 - Midscene-Inspired Optimizations
  - **Reference Documentation**: `docs/midscene-dom-extraction.md` for Midscene architecture
- **2026-02-01**: **Browser-Use Inspired Reliability Improvements** - Enhanced DOM extraction reliability:
  - **Multi-Point Visibility Scoring**: Replaced single center-point occlusion detection with 5-point sampling (center + 4 corners). Elements with < 50% visibility are marked as occluded (`occ: true`). This catches partial occlusions from sticky headers, modals, and overlays that single-point checking misses.
  - **Hidden Event Listener Detection**: New CDP-based detection of React/Vue/Angular click handlers using `getEventListeners()` API via `Runtime.evaluate` with `includeCommandLineAPI: true`. Elements with detected listeners are marked with `data-has-click-listener="true"` attribute.
  - **Element ID Strategy Documentation**: Added comprehensive comparison of our `data-llm-id` approach vs Browser-Use's `backendNodeId`. Documents trade-offs (stealth vs stability) and mitigations (MutationObserver re-tagging, Self-Healing ghost match, coordinate fallback).
  - **New Files**: `src/helpers/hiddenListenerDetector.ts`, `src/pages/Content/semanticTree.ts` (updated `getVisibilityScore()` function)
  - **New Documentation**: `DOM_EXTRACTION_ARCHITECTURE.md` §2.7 - Element ID Strategy comparison
  - **Reference Documentation**: `docs/browser-use-dom-extraction.md` for implementation patterns
- **2026-02-01**: **Session Init Contract (NEW)** - Added `POST /api/session/init` endpoint contract. Extension now initializes sessions on backend BEFORE subscribing to Pusher channels. Prevents 403 errors from `/api/pusher/auth`. Added `ensureSessionInitialized()` function, session recovery logic for storage loss scenarios, and initialized sessions cache. New files: `src/api/client.ts` (initSession method), `src/services/sessionService.ts` (ensureSessionInitialized, recoverSessionsFromBackend, initializeSessionService), `src/services/messageSyncService.ts` (init check before Pusher connect).
- **2026-02-01**: **Tab Close Session Cleanup (FIX)** - Added runtime cleanup of `tabSessionMap` when tabs close. Previously, only startup cleanup existed, leaving ghost mappings during runtime. New files/changes: `sessions.ts` (clearTabSessionMapping action), `Background/index.ts` (TAB_CLOSED broadcast), `App.tsx` (listener for cleanup).
- **2026-02-01**: **Documentation Update** - Added Tab Cleanup section (§2) documenting both runtime and startup cleanup. Added Authentication & Token Lifecycle section (§2) documenting token storage, usage, and the token refresh gap (not implemented, relies on 401 → re-login).
- **2026-02-01**: **PRODUCTION-GRADE FEATURES** - Added DOM RAG for handling massive pages (5000+ elements) with client-side chunking and relevance filtering. Added Sentinel Verification System for verifying action outcomes (catches silent failures like vanishing error toasts). New files: `domRag.ts`, `sentinelVerification.ts`. New request fields: `verification_passed`, `verification_message`, `errors_detected`.
- **2026-02-01**: **ADVANCED SEMANTIC FEATURES** - Added production-grade reliability features: True Visibility Raycasting (modal detection), Explicit Label Association (form fix), Mutation Stream (ghost state detection), Delta Hashing (bandwidth optimization), Virtual List Detection (infinite scroll), Self-Healing Recovery (stale ID fix), Bounding Box (Set-of-Mark multimodal). New files: `mutationLog.ts`, `deltaHash.ts`. New fields: `box`, `scr`, `occ`, `scrollPosition`, `scrollableContainers`, `recentEvents`, `hasErrors`, `hasSuccess`.
- **2026-02-01**: **ULTRA-LIGHT SEMANTIC PROTOCOL** - Major upgrade to semantic extraction. New features: viewport pruning (~60% reduction), minified JSON keys (i/r/n/v/s/xy), coordinates included. Semantic is now PRIMARY; full DOM only on explicit backend request. New files: `axTreeExtractor.ts`. Token reduction: 99.8% (10k → 25-75 tokens).
- **2026-02-01**: **Shadow DOM & Iframe Support** - Added `query-selector-shadow-dom` library for piercing Shadow DOM. Added `domAggregator.ts` for multi-frame extraction. New fields: `isInShadow`, `frameId`, `bounds`.
- **2026-02-01**: Added Semantic JSON Protocol (section 6). New DOM extraction approach with ~95% token reduction and stable IDs. New files: `tagger.ts`, `semanticTree.ts`, `domWait.ts`. New request fields: `interactiveTree`, `pageTitle`, `domMode: "semantic"`.
- **2026-02-01**: Added Extension Implementation (Current Behavior) section (5.8). Documents exactly what DOM data is sent: full DOM always, skeleton DOM always, screenshot only in hybrid mode.
- **2026-01-31**: Added Robust Element Selectors Contract (section 4). Backend implementation complete.
- **2026-01-31**: Added Hybrid Vision + Skeleton Contract (section 5). New request fields: `screenshot`, `domMode`, `skeletonDom`, `screenshotHash`.
- **2026-01-30**: Initial Chat UI Contract documented. Added `id` field to plan steps (mapped from `index`). Added `needs_user_input` to status enum.

---

## 13. Related Documentation

- [DOM_EXTRACTION_ARCHITECTURE.md](./DOM_EXTRACTION_ARCHITECTURE.md) — **Comprehensive guide to DOM extraction and what's sent to the LLM**
- [INTERACT_FLOW_WALKTHROUGH.md](./INTERACT_FLOW_WALKTHROUGH.md) — Detailed interact flow
- [VERIFICATION_PROCESS.md](./VERIFICATION_PROCESS.md) — Verification logic and troubleshooting
- [REALTIME_MESSAGE_SYNC_ROADMAP.md](./REALTIME_MESSAGE_SYNC_ROADMAP.md) — WebSocket implementation roadmap
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture

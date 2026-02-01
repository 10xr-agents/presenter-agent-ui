# Specs & Contracts

**Purpose:** API contracts, verification contract, and feature specifications for the Chrome extension and backend.  
**Last Updated:** February 1, 2026

---

## Table of Contents

1. [Verification Contract (Extension → Backend)](#1-verification-contract-extension--backend)
2. [Domain-Aware Sessions](#2-domain-aware-sessions)
3. [Chat UI Contract (Backend → Extension)](#3-chat-ui-contract-backend--extension)
4. [Robust Element Selectors](#4-robust-element-selectors)
5. [Hybrid Vision + Skeleton](#5-hybrid-vision--skeleton)
6. [Semantic JSON Protocol](#6-semantic-json-protocol)
7. [Changelog](#7-changelog)
8. [Related Documentation](#8-related-documentation)

---

## 1. Verification Contract (Extension → Backend)

**Purpose:** Define what the Chrome extension sends on each `POST /api/agent/interact` call so the backend’s observation-based verification can run correctly.

### Required (Semantic-First Negotiation)

| Field | Sent by extension | Purpose |
|------|-------------------|---------|
| **domMode** | ✅ Every call | Extension currently sends `"semantic"` for all requests. Backend treats `"semantic"` + `interactiveTree` as the V3 semantic-first contract. |
| **interactiveTree** | ✅ Every call | Canonical page state: V3 minified semantic nodes (IDs, roles, labels, optional geometry). |
| **url** | ✅ Every call | Current page URL captured just before sending the request. Used in before/after comparison. |
| **query** | ✅ Every call | User instruction for this loop iteration. |
| **taskId** | ✅ After first call | Backend loads previous action + beforeState to run observation-based verification. |

**Important:** `dom` (full HTML) is **NOT** required in the semantic-first contract and should only be sent when the backend explicitly requests it.  
Even if the extension keeps `domMode: "semantic"`, the backend will use `dom`/`skeletonDom`/`screenshot` when present.

### Optional (Improve Accuracy)

These are supported by the current request schema (`lib/agent/schemas.ts`):

| Field | Sent by extension | Purpose |
|------|-------------------|---------|
| **tabId** | ✅ When available | Chrome tab ID (debug metadata only, not stable across restarts). Used for tab-scoped sessions. |
| **previousUrl** | ✅ When available | URL before the last action. Helps URL-change verification when beforeState is missing or ambiguous. |
| **clientObservations** | ✅ When available | `{ didNetworkOccur?, didDomMutate?, didUrlChange? }` — extension-witnessed facts. Helps reduce false “no change” failures. |
| **clientVerification** | ✅ When available | `{ elementFound, selector?, urlChanged?, timestamp? }` — client-side selector check results (when an expected selector is known). |
| **lastActionStatus** | ✅ When available | `success \| failure \| pending` — used for message/status bookkeeping. |
| **lastActionError** | ✅ On failure | `{ message, code, action, elementId? }` — anti-hallucination / failure debugging. `elementId` may be a **number or string** (iframe-prefixed IDs). |
| **lastActionResult** | ✅ When available | `{ success, actualState? }` — supports verification/debugging. |
| **viewport / pageTitle / scrollPosition / recentEvents** | ✅ When available | Extra metadata for disambiguation and verification. |
| **skeletonDom / screenshot** | ❌ By default | Only sent when the backend requests them (see negotiation response below). |

### Request Body Shape (Summary)

```ts
{
  url: string,           // required — current URL (captured just before send)
  query: string,         // required — user instruction
  // IMPORTANT: In semantic-first mode, `dom` is optional and SHOULD NOT be sent by default.
  dom?: string,
  taskId?: string,       // required after first request
  sessionId?: string,
  tabId?: number,        // Chrome tab ID (debug metadata only, not stable across restarts)
  domain?: string,
  title?: string,
  lastActionStatus?: 'success' | 'failure' | 'pending',
  lastActionError?: { message: string, code: string, action: string, elementId?: number },
  lastActionResult?: { success: boolean, actualState?: string },
  previousUrl?: string,
  clientVerification?: { elementFound: boolean, selector?: string, urlChanged?: boolean, timestamp?: number },
  clientObservations?: { didNetworkOccur?: boolean, didDomMutate?: boolean, didUrlChange?: boolean },

  // === SEMANTIC FIELDS (PRIMARY - use these) ===
  domMode?: "semantic" | "skeleton" | "hybrid" | "full",
  interactiveTree?: Array<{
    i: string,                              // Element ID
    r: string,                              // Role (minified: btn, inp, link, chk, etc.)
    n: string,                              // Name/label
    v?: string,                             // Value
    s?: string,                             // State (disabled, checked, etc.)
    xy?: [number, number],                  // Center coordinates
    // V3 ADVANCED FIELDS:
    box?: [number, number, number, number], // Bounding box [x, y, w, h]
    scr?: { depth: string, h: boolean },    // Scrollable container info
    occ?: boolean,                          // Occluded by modal/overlay
  }>,
  viewport?: { width: number, height: number },
  pageTitle?: string,
  
  // === V3 ADVANCED FIELDS ===
  scrollPosition?: string,                  // Page scroll depth "0%", "50%", etc.
  scrollableContainers?: Array<{            // Virtual list containers detected
    id: string,
    depth: string,
    hasMore: boolean,
  }>,
  recentEvents?: string[],                  // Mutation log: ["Added: 'Success'", "Error: 'Invalid'"]
  hasErrors?: boolean,                      // Recent errors detected
  hasSuccess?: boolean,                     // Recent success messages detected
  
  // === PRODUCTION-GRADE: SENTINEL VERIFICATION ===
  verification_passed?: boolean,            // Previous action verification result
  verification_message?: string,            // Human-readable verification feedback
  errors_detected?: string[],               // Errors caught by verification
  success_messages?: string[],              // Success messages caught by verification
  
  // === PRODUCTION-GRADE: DOM RAG (for huge pages) ===
  dom_filtered?: boolean,                   // True if DOM was filtered
  filter_reason?: string,                   // Why filtering was applied
  original_node_count?: number,             // Count before filtering
  token_reduction?: number,                 // Percentage reduction achieved

  // === V2 SEMANTIC FIELDS (fallback) ===
  semanticNodes?: Array<{ id: string, role: string, name: string, value?: string, state?: string }>,

  // === HYBRID/SKELETON FIELDS ===
  screenshot?: string | null,
  skeletonDom?: string,
  screenshotHash?: string,
}
```

### Negotiation Response (Backend → Extension)

In the semantic-first contract, the backend may request heavier artifacts by returning:

```json
{
  "success": true,
  "data": {
    "status": "needs_context",
    "requestedDomMode": "hybrid",
    "needsScreenshot": true,
    "needsSkeletonDom": true,
    "reason": "User asked about the blue button; semantic tree doesn't encode color reliably."
  }
}
```

The extension must retry the **same** `POST /api/agent/interact` call and include `interactiveTree` again plus **only** the requested artifacts.

---

## 2. Domain-Aware Sessions

**Status:** ✅ Implemented (Backend + Extension)

### Overview

Domain-aware sessions let the extension reuse/switch sessions based on the active tab’s root domain. Session titles typically follow:

- `{domain}: {task description}`
- Examples: `google.com: Search for SpaceX`, `github.com: Review PR #123`

### Tab-Scoped Sessions (Feb 2026)

**Sessions are now tab-scoped** on the extension side: each Chrome tab has one active chat session (`tabId → sessionId`). This provides a more intuitive UX where:

1. **Same tab = same session**: Navigation within a tab (including cross-domain) keeps the same `sessionId`
2. **Different tabs = different sessions**: Switching tabs switches to that tab's session
3. **Domain as metadata**: The session's `domain` and `url` fields are **updated** when navigation occurs (not fixed to the initial URL)

### Session URL/Domain Updates

When the interact route receives a request for an existing session with a different URL:

1. **URL change**: Session's `url` field is updated to the current URL
2. **Cross-domain navigation**: Session's `domain` field is updated; original URL/domain stored in `metadata.initialUrl` / `metadata.initialDomain`
3. **Title unchanged**: Session title keeps the original domain (unless user manually renames)

**Example flow:**
```
1. User starts on google.com → Session created: { domain: "google.com", url: "https://google.com" }
2. User navigates to github.com (same tab) → Session updated: { domain: "github.com", url: "https://github.com", metadata: { initialDomain: "google.com", initialUrl: "https://google.com" } }
3. Session title remains: "google.com: Search for SpaceX" (unless renamed)
```

### Backend Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/session/by-domain/[domain]` | Find most recent session for domain (returns `{ session: ... }` or `{ session: null }`) |
| PATCH | `/api/session/[sessionId]` | Rename a session; sets `isRenamed: true` |
| GET | `/api/session/latest` | Get most recent session; includes `title`, `domain`, `isRenamed` |

### Backend Utilities

- `lib/utils/domain.ts`
  - `extractDomain(url)` — extracts root domain (supports `co.uk`-style TLDs, `localhost`, IPs)
  - `generateSessionTitle(domain, taskDescription)` — `{domain}: {taskDescription}`

### Session Model Fields

| Field | Description |
|-------|-------------|
| `url` | Current URL (updated on navigation within the same tab session) |
| `domain` | Current root domain (updated on cross-domain navigation) |
| `metadata.initialUrl` | Original URL when session was created (preserved for history) |
| `metadata.initialDomain` | Original domain when session was created (preserved for history) |

---

## 3. Chat UI Contract (Backend → Extension)

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

### 3.5 WebSocket / Push (Pusher/Sockudo)

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

### 3.6 What the Backend Does NOT Need to Do

- **No new endpoints** — only correct shape of existing responses.
- **No `isTaskComplete` field** — client infers from `action: "finish()"` / `"fail()"`.
- **No change to request body** of POST /api/agent/interact (existing contract stays).

---

### 3.7 Fields the UI Uses

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

### 3.8 Implementation Notes

#### 3.8.1 Plan Step ID Generation

The `id` field is generated from `index` in the interact route:

```typescript
steps: graphResult.plan.steps.map((step) => ({
  ...step,
  id: `step_${step.index}`, // Chat UI contract: id: string for PlanWidget stepper
}))
```

#### 3.8.2 Message Role Persistence

The Message model already has `role: 'user' | 'assistant' | 'system'` as a required field. All messages are persisted with their role.

#### 3.8.3 WebSocket Payload

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

## 4. Robust Element Selectors

**Purpose:** Prevent “stale element ID” failures on dynamic sites by returning a robust `selectorPath` alongside element-id-based actions.

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

## 5. Hybrid Vision + Skeleton

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

This section documents the **semantic-first** contract the extension should follow in the new analysis framework.

#### What's Sent in Each Request

The extension sends **semantic JSON first**, and sends heavier artifacts only when explicitly requested by the backend:

| Field | When Sent | Typical Size |
|-------|-----------|--------------|
| `domMode` | **Always** | `"semantic"` |
| `interactiveTree` | **Always** | ~100-300 bytes (minified) |
| `dom` (full DOM) | **Only when requested** | 50k-200k chars |
| `skeletonDom` | **Only when requested** | ~500-2000 chars |
| `screenshot` | **Only when requested** | ~50-150KB base64 JPEG |
| `screenshotHash` | **When screenshot is sent** | short hash string |

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

Screenshot is **only captured** when the backend requests it (i.e. when we’re in a “hybrid” retry that includes `screenshot` + `skeletonDom`), even if `domMode` remains `"semantic"`:

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

The full DOM is **not sent by default**. It is only sent when the backend explicitly requests it, which enables:

1. Fall back to full DOM if skeleton is insufficient
2. Request a retry with `status: 'needs_context'` (or legacy `status: 'needs_full_dom'`)

**DOM truncation limits:**
- Default: 50,000 chars
- Extended (for complex pages): 200,000 chars (auto-selected when DOM exceeds 50k)

#### Fallback Handling

When the server determines semantic is insufficient, it responds with `status: 'needs_context'` / `requestedDomMode: 'full'` (or legacy `status: 'needs_full_dom'`). The extension automatically retries and includes the requested artifacts (it may keep `domMode: 'semantic'` for compatibility):

```typescript
if (response.status === 'needs_full_dom') {
  // Retry the same request with full DOM mode
  response = await apiClient.agentInteract(
    currentUrl,
    safeInstructions,
    currentDom,
    // ... other params
    {
      screenshot: screenshotBase64,
      skeletonDom,
      domMode: 'semantic', // Keep semantic; include requested artifacts
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

## 6. Semantic JSON Protocol (V3)

**Purpose:** Replace heavy HTML-based DOM extraction with a lightweight JSON protocol that provides ~95-99% token reduction and eliminates "Element not found" errors through stable element IDs.

**Status:** ✅ V3 Implementation Complete (February 2026)

**Key Principle:** Semantic JSON is the PRIMARY and ONLY source of truth. Full DOM should ONLY be sent when the backend explicitly requests it via `needs_full_dom` response.

### 6.1 Overview

The Semantic JSON Protocol addresses two critical issues with the previous HTML-based approach:

1. **Token Explosion:** Full DOM can be 50-200KB (~15-20k tokens). Skeleton DOM reduces this but still uses HTML format.
2. **ID Drift:** Element IDs are calculated during extraction. By the time the LLM's action is executed, the page may have re-rendered, causing "Element with id X not found" errors.

**Solution:**
- **Persistent Tagging:** Inject stable `data-llm-id` attributes into the DOM immediately when the page loads
- **JSON Format:** Send a simple JSON array instead of nested HTML
- **DOM Stability Waiting:** Wait for the DOM to stop changing before extraction

### 6.2 V3 Enhancements (NEW)

V3 introduces three major optimizations on top of the V2 semantic protocol:

| Enhancement | Description | Token Impact |
|-------------|-------------|--------------|
| **Viewport Pruning** | Skip off-screen elements (below/above viewport) | ~60% reduction on long pages |
| **Minified JSON Keys** | `i/r/n/v/s/xy` instead of `id/role/name/value/state/coordinates` | ~30% reduction |
| **Coordinates Included** | `[x, y]` for direct click targeting | Eliminates coordinate lookups |

**V3 Payload Example:**

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

**V3 Legend (included in system prompt):**
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
| Semantic V2 | 200-500 bytes | 50-125 |
| **Semantic V3** | **100-300 bytes** | **25-75** |

### 6.2.1 V3 Advanced Features (Production-Grade)

V3 Advanced adds production-grade reliability features:

| Feature | Problem Solved | New Field/Behavior |
|---------|---------------|-------------------|
| **True Visibility Raycasting** | Modal/overlay blocks clicks | `occ: true` on occluded elements |
| **Explicit Label Association** | Unnamed inputs confuse LLM | Enhanced `n` field via label hunting |
| **Mutation Stream** | Transient toasts missed | `recentEvents`, `hasErrors`, `hasSuccess` |
| **Delta Hashing** | Unchanged DOM wastes bandwidth | Client-side skip when hash unchanged |
| **Virtual List Detection** | Infinite scroll hides content | `scr: { depth: "10%", h: true }` |
| **Self-Healing Recovery** | Stale IDs after re-render | Ghost match by role/name/coordinates |
| **Bounding Box** | Multimodal vision support | `box: [x, y, w, h]` |

**V3 Advanced Payload Example:**

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

**V3 Advanced Node Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `box` | `[x, y, w, h]` | Bounding box for Set-of-Mark multimodal |
| `scr` | `{ depth, h }` | Scrollable container: depth=scroll%, h=hasMore |
| `occ` | `boolean` | True if covered by overlay (don't click) |

**V3 Advanced Legend (for system prompt):**

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

Instead of calculating IDs during extraction, we "stamp" permanent IDs onto elements as soon as they appear:

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

**V3 Format (PRIMARY - recommended):**

When `domMode` is `"semantic"`, the extension sends:

| Field | Type | Description |
|-------|------|-------------|
| `domMode` | `"semantic"` | Indicates semantic format |
| `interactiveTree` | `SemanticNodeV3[]` | Minified array with viewport pruning |
| `pageTitle` | `string` | Page title for context |
| `viewport` | `{ width, height }` | Viewport dimensions |

**SemanticNodeV3 Structure (minified keys):**

```typescript
interface SemanticNodeV3 {
  i: string;         // Element ID (stable data-llm-id)
  r: string;         // Role (minified: btn, inp, link, chk, sel, etc.)
  n: string;         // Name/label (truncated to 50 chars)
  v?: string;        // Current value for inputs
  s?: string;        // State: 'disabled', 'checked', 'expanded'
  xy?: [number, number]; // [x, y] center coordinates
  f?: number;        // Frame ID (0 = main, omitted if 0)
}
```

**V2 Format (fallback):**

When `domMode` is `"semantic"`, the extension sends:

| Field | Type | Description |
|-------|------|-------------|
| `domMode` | `"semantic"` | Indicates V2 semantic format |
| `semanticNodes` | `SemanticNode[]` | Full-key array of interactive elements |
| `pageTitle` | `string` | Page title for context |
| `dom` | `string` | Minimal DOM fallback (truncated to 10KB) |

**SemanticNode Structure (full keys):**

```typescript
interface SemanticNode {
  id: string;         // Stable data-llm-id (persists across re-renders)
  role: string;       // Semantic role: 'button', 'link', 'input', 'textbox', etc.
  name: string;       // Human-readable label (aria-label > innerText > placeholder)
  value?: string;     // Current value for inputs
  state?: string;     // Element state: 'checked', 'disabled', 'selected', 'expanded'
  type?: string;      // Input type if applicable
  placeholder?: string;
  href?: string;      // For links
  isInShadow?: boolean; // V2: Inside Shadow DOM
  frameId?: number;   // V2: Frame ID (0 = main)
  bounds?: { x, y, width, height }; // V2: Bounding box
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

**Token Reduction:** ~99.8% (12,000 → 25-50 tokens with V3)

### 6.6 DOM Mode Selection (V3 Priority)

**IMPORTANT:** Semantic V3 is now the PRIMARY mode. Full DOM should ONLY be sent when explicitly requested by the backend.

| Priority | Condition | Mode Selected | Payload | Tokens |
|----------|-----------|---------------|---------|--------|
| **1 (Default)** | Semantic enabled | `semantic` | Minified JSON + viewport pruning | 25-75 |
| 2 | V3 fails/empty | `semantic` | Full-key JSON | 50-125 |
| 3 | Semantic fails | `skeleton` | Skeleton HTML | 500-1500 |
| 4 | Visual query | `hybrid` | Screenshot + skeleton | 2000-3000 |
| **5 (ONLY on request)** | Backend returns `needs_full_dom` | `full` | Full HTML | 10k-50k |

**Key Principle:** The extension should NEVER send full DOM proactively. Only send it when the backend explicitly requests it in a `needs_full_dom` response.

```typescript
// Decision flow in currentTask.ts
const mode = 
  USE_SEMANTIC_EXTRACTION ? 'semantic' : // First choice
  USE_SEMANTIC_EXTRACTION ? 'semantic' : // Second choice
  selectDomMode(query, context);         // Fallback to hybrid/skeleton

// Full DOM ONLY on explicit backend request
if (backendResponse.action === 'needs_full_dom') {
  retryWithFullDom();
}
```

### 6.6 Stability Waiting

Before extracting, the extension waits for the DOM to stabilize:

```typescript
await waitForDomStability({
  timeout: 3000,           // Max wait time
  stabilityThreshold: 300, // Time without mutations
  waitForNetwork: true,    // Also wait for network idle
});
```

This prevents extracting "skeleton" pages that are still loading (e.g., Google search results).

### 6.7 Backend Integration Requirements

For full semantic mode support, the backend should:

1. **Accept `domMode: "semantic"`** as a valid mode
2. **Parse `semanticNodes` array** when present
3. **Use stable IDs** for action targeting (e.g., `click("6")` instead of `click(6)`)
4. **Fallback gracefully** - if `semanticNodes` is empty, use `dom` field

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

## 7. Changelog

- **2026-02-01**: **PRODUCTION-GRADE FEATURES** - Added DOM RAG for handling massive pages (5000+ elements) with client-side chunking and relevance filtering. Added Sentinel Verification System for verifying action outcomes (catches silent failures like vanishing error toasts). New files: `domRag.ts`, `sentinelVerification.ts`. New request fields: `verification_passed`, `verification_message`, `errors_detected`.
- **2026-02-01**: **V3 ADVANCED (PRODUCTION-GRADE)** - Added production-grade reliability features: True Visibility Raycasting (modal detection), Explicit Label Association (form fix), Mutation Stream (ghost state detection), Delta Hashing (bandwidth optimization), Virtual List Detection (infinite scroll), Self-Healing Recovery (stale ID fix), Bounding Box (Set-of-Mark multimodal). New files: `mutationLog.ts`, `deltaHash.ts`. New fields: `box`, `scr`, `occ`, `scrollPosition`, `scrollableContainers`, `recentEvents`, `hasErrors`, `hasSuccess`.
- **2026-02-01**: **V3 ULTRA-LIGHT PROTOCOL** - Major upgrade to semantic extraction. New features: viewport pruning (~60% reduction), minified JSON keys (i/r/n/v/s/xy), coordinates included. `interactiveTree` (V3) is PRIMARY; full DOM only on explicit backend request.  
  **Note:** Extension may send `domMode: "semantic"` for all requests; backend treats `"semantic" + interactiveTree` as the semantic-first contract.
- **2026-02-01**: **Shadow DOM & Iframe Support (V2)** - Added `query-selector-shadow-dom` library for piercing Shadow DOM. Added `domAggregator.ts` for multi-frame extraction. New fields: `isInShadow`, `frameId`, `bounds`.
- **2026-02-01**: Added Semantic JSON Protocol (section 6). New DOM extraction approach with ~95% token reduction and stable IDs. New files: `tagger.ts`, `semanticTree.ts`, `domWait.ts`. New request fields: `semanticNodes`, `pageTitle`, `domMode: "semantic"`.
- **2026-02-01**: Added Extension Implementation (Current Behavior) section (5.8). Documents exactly what DOM data is sent: full DOM always, skeleton DOM always, screenshot only in hybrid mode.
- **2026-01-31**: Added Robust Element Selectors Contract (section 4). Backend implementation complete.
- **2026-01-31**: Added Hybrid Vision + Skeleton Contract (section 5). New request fields: `screenshot`, `domMode`, `skeletonDom`, `screenshotHash`.
- **2026-01-30**: Initial Chat UI Contract documented. Added `id` field to plan steps (mapped from `index`). Added `needs_user_input` to status enum.

---

## 8. Related Documentation

- [DOM_EXTRACTION_ARCHITECTURE.md](./DOM_EXTRACTION_ARCHITECTURE.md) — **Comprehensive guide to DOM extraction and what's sent to the LLM**
- [INTERACT_FLOW_WALKTHROUGH.md](./INTERACT_FLOW_WALKTHROUGH.md) — Detailed interact flow
- [VERIFICATION_PROCESS.md](./VERIFICATION_PROCESS.md) — Verification logic and troubleshooting
- [REALTIME_MESSAGE_SYNC_ROADMAP.md](./REALTIME_MESSAGE_SYNC_ROADMAP.md) — WebSocket implementation roadmap
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture

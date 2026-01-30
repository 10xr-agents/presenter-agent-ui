# Specs and Contracts

This document defines the contracts between the backend and frontend/extension for the Browser Copilot application.

---

## 1. Overview

The Browser Copilot system consists of:
- **Backend**: Next.js API routes that orchestrate the AI agent
- **Extension**: Chrome extension that executes actions in the browser
- **Side Panel Chat UI**: React-based chat interface in the extension

This document specifies the API contracts that enable these components to communicate.

---

## 2. API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agent/interact` | POST | Main action loop - returns next action to execute |
| `/api/session/[sessionId]/messages` | GET | Retrieve conversation history for a session |
| `/api/pusher/auth` | POST | Authenticate WebSocket connections |

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

## 4. Fields the UI Uses

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

## 5. Implementation Notes

### 5.1 Plan Step ID Generation

The `id` field is generated from `index` in the interact route:

```typescript
steps: graphResult.plan.steps.map((step) => ({
  ...step,
  id: `step_${step.index}`, // Chat UI contract: id: string for PlanWidget stepper
}))
```

### 5.2 Message Role Persistence

The Message model already has `role: 'user' | 'assistant' | 'system'` as a required field. All messages are persisted with their role.

### 5.3 WebSocket Payload

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

## 6. Changelog

- **2026-01-30**: Initial Chat UI Contract documented. Added `id` field to plan steps (mapped from `index`). Added `needs_user_input` to status enum.

---

## 7. Related Documentation

- [INTERACT_FLOW_WALKTHROUGH.md](./INTERACT_FLOW_WALKTHROUGH.md) — Detailed interact flow
- [VERIFICATION_PROCESS.md](./VERIFICATION_PROCESS.md) — Verification logic and troubleshooting
- [REALTIME_MESSAGE_SYNC_ROADMAP.md](./REALTIME_MESSAGE_SYNC_ROADMAP.md) — WebSocket implementation roadmap
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture

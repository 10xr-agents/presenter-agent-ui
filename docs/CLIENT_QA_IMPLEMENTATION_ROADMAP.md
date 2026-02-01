# Client-Side QA Implementation Roadmap

**Purpose:** Implementation roadmap for Chrome extension changes required to support MANUAL_QA_EFFECTIVE_AGENT.md test cases (Levels 1-5).

**Reference Documents:**
- `docs/MANUAL_QA_EFFECTIVE_AGENT.md` — Target QA test cases
- `docs/REALTIME_MESSAGE_SYNC_ROADMAP.md` — Real-time sync implementation
- `docs/SPECS_AND_CONTRACTS.md` — API contracts

**Last Updated:** January 31, 2026

---

## Executive Summary

| Level | Client Status | Required Changes |
|-------|--------------|------------------|
| **L1** (Basic) | ✅ Ready | None |
| **L2** (Dynamic State) | ✅ Ready | None (already waits for stability) |
| **L3** (Cross-Tab) | ⚠️ Partial | Add `extractedVariables` state + UI |
| **L4** (Reasoning) | ✅ Ready | None (ASK_USER already handled) |
| **L5** (Enterprise) | ⚠️ Partial | Depends on L3 + step progress display |

---

## Table of Contents

1. [Current Client Architecture](#1-current-client-architecture)
2. [Level 1-2: Already Supported](#2-level-1-2-already-supported)
3. [Level 3: Extracted Variables Implementation](#3-level-3-extracted-variables-implementation)
4. [Level 4: ASK_USER Handling (Already Implemented)](#4-level-4-ask_user-handling)
5. [Level 5: Enterprise Workflow Support](#5-level-5-enterprise-workflow-support)
6. [Real-Time Sync Enhancements](#6-real-time-sync-enhancements)
7. [Implementation Checklist](#7-implementation-checklist)

---

## 1. Current Client Architecture

### Relevant Files

```
src/
├── state/
│   └── currentTask.ts          # Task state management (Zustand)
├── services/
│   ├── pusherTransport.ts      # Real-time sync transport
│   ├── messageSyncService.ts   # Message synchronization
│   └── pollingFallbackService.ts
├── api/
│   └── client.ts               # API client (agentInteract, etc.)
├── common/
│   ├── TaskUI.tsx              # Main task UI
│   ├── ChatTurn.tsx            # Message display
│   └── TypingIndicator.tsx     # Processing indicator
└── helpers/
    ├── taskPersistence.ts      # Task ID persistence
    └── domWaiting.ts           # DOM stability waiting
```

### Current Task State Structure

```typescript
// src/state/currentTask.ts
interface CurrentTaskSlice {
  tabId: number;
  instructions: string | null;
  taskId: string | null;
  sessionId: string | null;
  status: TaskStatus;
  displayHistory: DisplayHistoryEntry[];
  messages: ChatMessage[];
  
  // Real-time sync
  wsConnectionState: ConnectionState;
  wsFallbackReason: string | null;
  isServerTyping: boolean;
  serverTypingContext: string | null;
  
  // Loading states
  messagesLoadingState: MessagesLoadingState;
  
  // MISSING for L3+:
  // extractedVariables: Record<string, string>;
}
```

---

## 2. Level 1-2: Already Supported

### Level 1: Basic Interaction ✅

**No changes required.** The extension already supports:

| Action | Implementation | Status |
|--------|---------------|--------|
| `click(elementId)` | `contentScript.ts` → `executeAction` | ✅ |
| `setValue(elementId, value)` | `contentScript.ts` → `executeAction` | ✅ |
| `search(query)` | `contentScript.ts` → `executeAction` | ✅ |
| Navigation | Handled by page | ✅ |

### Level 2: Dynamic State ✅

**No changes required.** The extension already implements:

| Feature | Implementation | Status |
|---------|---------------|--------|
| DOM stability wait | `domWaiting.ts`: `waitForDOMChangesAfterAction` | ✅ |
| Minimum wait (500ms) | `domWaiting.ts` | ✅ |
| Network idle detection | MutationObserver + fetch interception | ✅ |
| Updated DOM after scroll | Automatic re-extraction | ✅ |

**Existing Implementation:**

```typescript
// src/helpers/domWaiting.ts (already exists)
export async function waitForDOMChangesAfterAction(options?: {
  minimumWaitMs?: number;  // Default: 500ms
  maximumWaitMs?: number;  // Default: 5000ms
  networkIdleMs?: number;  // Default: 500ms
  domSettledMs?: number;   // Default: 300ms
}): Promise<DOMChanges>;
```

---

## 3. Level 3: Extracted Variables Implementation

### 3.1 Overview

**Problem:** Level 3 tasks require data persistence across steps and domain changes:
- Task 3.1: Extract CEO name from LinkedIn, use it in Google search
- Task 3.2: Extract product info from Amazon, write to Google Sheets

**Current Gap:** No `extractedVariables` store in client state.

### 3.2 State Changes

**File:** `src/state/currentTask.ts`

```typescript
// ADD to CurrentTaskSlice interface:
interface CurrentTaskSlice {
  // ... existing fields ...
  
  /**
   * Variables extracted during task execution.
   * Persists across steps and domain changes.
   * Keys are variable names (e.g., "ceoName", "productPrice").
   * Values are extracted strings.
   */
  extractedVariables: Record<string, string>;
}

// ADD to actions:
interface CurrentTaskActions {
  // ... existing actions ...
  
  /**
   * Set an extracted variable (received from server response).
   */
  setExtractedVariable: (key: string, value: string) => void;
  
  /**
   * Set multiple extracted variables at once.
   */
  setExtractedVariables: (variables: Record<string, string>) => void;
  
  /**
   * Clear all extracted variables (on new task).
   */
  clearExtractedVariables: () => void;
}
```

**Implementation:**

```typescript
// In createCurrentTaskSlice:
extractedVariables: {},

// Actions:
setExtractedVariable: (key: string, value: string) => {
  set((state) => ({
    currentTask: {
      ...state.currentTask,
      extractedVariables: {
        ...state.currentTask.extractedVariables,
        [key]: value,
      },
    },
  }));
},

setExtractedVariables: (variables: Record<string, string>) => {
  set((state) => ({
    currentTask: {
      ...state.currentTask,
      extractedVariables: {
        ...state.currentTask.extractedVariables,
        ...variables,
      },
    },
  }));
},

clearExtractedVariables: () => {
  set((state) => ({
    currentTask: {
      ...state.currentTask,
      extractedVariables: {},
    },
  }));
},
```

### 3.3 API Contract Updates

**File:** `src/api/client.ts`

```typescript
// ADD to AgentInteractRequest:
interface AgentInteractRequest {
  // ... existing fields ...
  
  /**
   * Current extracted variables to include in server context.
   * Server may update/add variables in response.
   */
  extractedVariables?: Record<string, string>;
}

// ADD to NextActionResponse (already partially defined in server):
interface NextActionResponse {
  // ... existing fields ...
  
  /**
   * Updated extracted variables from server.
   * Client should merge these into state.
   */
  extractedVariables?: Record<string, string>;
}
```

**Update `agentInteract` function:**

```typescript
// In agentInteract():
const response = await fetch(`${API_BASE}/api/agent/interact`, {
  method: 'POST',
  headers: { /* ... */ },
  body: JSON.stringify({
    url,
    query,
    dom,
    taskId,
    sessionId,
    // ADD:
    extractedVariables: getState().currentTask.extractedVariables,
    // ... other fields
  }),
});

// After receiving response:
if (data.extractedVariables) {
  getState().currentTask.actions.setExtractedVariables(data.extractedVariables);
}
```

### 3.4 Persistence (Optional Enhancement)

**Consider:** Persist `extractedVariables` to `chrome.storage.local` alongside `taskId`:

```typescript
// In taskPersistence.ts:
interface PersistedTaskState {
  taskId: string;
  sessionId: string;
  url: string;
  timestamp: number;
  // ADD:
  extractedVariables?: Record<string, string>;
}

// On task response:
await chrome.storage.local.set({
  [`task_${tabId}`]: {
    taskId: response.taskId,
    sessionId: response.sessionId,
    url: response.url,
    timestamp: Date.now(),
    extractedVariables: response.extractedVariables || {},
  },
});

// On task recovery:
const stored = result[`task_${tabId}`];
if (stored?.extractedVariables) {
  actions.setExtractedVariables(stored.extractedVariables);
}
```

### 3.5 UI Display (Optional)

**File:** `src/common/ExtractedVariablesPanel.tsx` (new file)

```typescript
/**
 * Displays extracted variables during task execution.
 * Shown in debug panel or as collapsible section in chat.
 */
import React from 'react';
import { useAppState } from '../state/store';
import { Box, Text, VStack, HStack, Badge } from '@chakra-ui/react';

export const ExtractedVariablesPanel: React.FC = () => {
  const extractedVariables = useAppState(
    (state) => state.currentTask.extractedVariables
  );
  
  const entries = Object.entries(extractedVariables);
  if (entries.length === 0) return null;
  
  return (
    <Box p={2} bg="gray.50" borderRadius="md" fontSize="sm">
      <Text fontWeight="semibold" mb={1}>Extracted Data</Text>
      <VStack align="stretch" spacing={1}>
        {entries.map(([key, value]) => (
          <HStack key={key} justify="space-between">
            <Badge colorScheme="blue">{key}</Badge>
            <Text isTruncated maxW="200px">{value}</Text>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
};
```

---

## 4. Level 4: ASK_USER Handling

### Already Implemented ✅

The extension already handles `needs_user_input` status:

**Detection (TaskUI.tsx):**
```typescript
const waitingForUserInput = lastMessage?.userQuestion &&
  (lastMessage.status === 'pending' || 
   lastMessage.meta?.reasoning?.source === 'ASK_USER');
```

**Display (ChatTurn.tsx):**
- Shows `userQuestion` in chat bubble
- Enables input field for user response

**No client changes required for Level 4.** Server-side needs to implement login-failure detection.

---

## 5. Level 5: Enterprise Workflow Support

### 5.1 Dependencies

Level 5 requires:
1. ✅ Real-time sync (already implemented)
2. ⚠️ Extracted variables (Section 3)
3. ⚠️ Step progress display (below)
4. 🔲 Server-side: branching logic, API integrations

### 5.2 Step Progress Display (Enhancement)

**Problem:** Long-running L5 tasks need progress feedback.

**New Event:** `step_progress` (server → client via Pusher)

```typescript
// src/services/realtimeTypes.ts - ADD:
interface StepProgressPayload {
  taskId: string;
  currentStep: number;
  totalSteps: number;
  stepDescription: string;
  stepStatus: 'pending' | 'executing' | 'completed' | 'failed';
}
```

**State Update:**

```typescript
// In currentTask.ts - ADD:
interface CurrentTaskSlice {
  // ... existing ...
  
  /** Current step progress for multi-step tasks */
  stepProgress: {
    currentStep: number;
    totalSteps: number;
    stepDescription: string;
    stepStatus: string;
  } | null;
}
```

**Pusher Handler:**

```typescript
// In pusherTransport.ts - ADD event binding:
channel.bind('step_progress', (payload: StepProgressPayload) => {
  this.emit('stepProgress', payload);
});

// In messageSyncService.ts - ADD handler:
pusherTransport.on('stepProgress', (payload) => {
  this.setState((draft) => {
    draft.currentTask.stepProgress = {
      currentStep: payload.currentStep,
      totalSteps: payload.totalSteps,
      stepDescription: payload.stepDescription,
      stepStatus: payload.stepStatus,
    };
  });
});
```

**UI Component:**

```typescript
// src/common/StepProgressIndicator.tsx (new file)
import React from 'react';
import { useAppState } from '../state/store';
import { Box, Progress, Text, HStack } from '@chakra-ui/react';

export const StepProgressIndicator: React.FC = () => {
  const stepProgress = useAppState((state) => state.currentTask.stepProgress);
  
  if (!stepProgress) return null;
  
  const percent = (stepProgress.currentStep / stepProgress.totalSteps) * 100;
  
  return (
    <Box p={2} bg="blue.50" borderRadius="md">
      <HStack justify="space-between" mb={1}>
        <Text fontSize="sm" fontWeight="medium">
          Step {stepProgress.currentStep}/{stepProgress.totalSteps}
        </Text>
        <Text fontSize="xs" color="gray.600">
          {stepProgress.stepStatus}
        </Text>
      </HStack>
      <Progress value={percent} size="sm" colorScheme="blue" />
      <Text fontSize="xs" mt={1} color="gray.700">
        {stepProgress.stepDescription}
      </Text>
    </Box>
  );
};
```

---

## 6. Real-Time Sync Enhancements

### 6.1 Current Status ✅

| Feature | Status |
|---------|--------|
| Pusher/Sockudo connection | ✅ Implemented |
| `new_message` event | ✅ Implemented |
| `interact_response` event | ✅ Implemented |
| Polling fallback | ✅ Implemented |
| TypingIndicator | ✅ Implemented |
| ConnectionStatusBadge | ✅ Implemented (debug panel) |

### 6.2 New Events for QA Support

| Event | Purpose | Priority |
|-------|---------|----------|
| `step_progress` | Show current step in multi-step tasks | P2 (L5) |
| `variable_extracted` | Real-time display of extracted data | P3 (nice-to-have) |

### 6.3 Message Schema Enhancement

**Current ChatMessage type** needs to support extracted variables display:

```typescript
// src/types/chatMessage.ts - ADD:
interface ChatMessage {
  // ... existing fields ...
  
  /**
   * Variables extracted during this turn.
   * Displayed as badges or inline data.
   */
  extractedVariables?: Record<string, string>;
}
```

---

## 7. Implementation Checklist

### Priority 0: Required for Level 3 (Cross-Tab Memory)

- [ ] **C-P0-1:** Add `extractedVariables` to `CurrentTaskSlice` state
- [ ] **C-P0-2:** Add `setExtractedVariable`, `setExtractedVariables`, `clearExtractedVariables` actions
- [ ] **C-P0-3:** Update `agentInteract()` to send `extractedVariables` in request
- [ ] **C-P0-4:** Update `agentInteract()` to merge `extractedVariables` from response
- [ ] **C-P0-5:** Clear `extractedVariables` on new task (`startNewChat`)

### Priority 1: Nice-to-Have for Level 3

- [ ] **C-P1-1:** Persist `extractedVariables` in `chrome.storage.local`
- [ ] **C-P1-2:** Create `ExtractedVariablesPanel` component
- [ ] **C-P1-3:** Add panel to TaskUI or debug view

### Priority 2: Required for Level 5

- [ ] **C-P2-1:** Add `stepProgress` to state
- [ ] **C-P2-2:** Add `step_progress` event handler in pusherTransport
- [ ] **C-P2-3:** Create `StepProgressIndicator` component
- [ ] **C-P2-4:** Add indicator to TaskUI

### Priority 3: Enhancements

- [ ] **C-P3-1:** Add `extractedVariables` to ChatMessage type
- [ ] **C-P3-2:** Display extracted variables in ChatTurn component
- [ ] **C-P3-3:** Add `variable_extracted` real-time event

---

## Testing Checklist

### Level 3 Testing

- [ ] Extract data on Page A, verify it persists to Page B
- [ ] Tab switch maintains `extractedVariables`
- [ ] Domain change (LinkedIn → Google) maintains variables
- [ ] New task clears previous variables
- [ ] Variables display correctly in UI (if implemented)

### Level 5 Testing

- [ ] Multi-step task shows progress indicator
- [ ] Progress updates in real-time via Pusher
- [ ] Long-running task feels responsive to user

---

## Changelog

- **2026-01-31:** Initial document created. Defined client-side implementation roadmap for QA levels 1-5.

---

**End of Document**

# Server-Side QA Implementation Roadmap

**Purpose:** Implementation roadmap for backend changes required to support MANUAL_QA_EFFECTIVE_AGENT.md test cases (Levels 1-5).

**Reference Documents:**
- `docs/MANUAL_QA_EFFECTIVE_AGENT.md` — Target QA test cases
- `docs/INTERACT_FLOW_WALKTHROUGH.md` — Interact flow details
- `docs/PLANNER_PROCESS.md` — Planning engine documentation
- `docs/VERIFICATION_PROCESS.md` — Verification engine documentation
- `docs/SPECS_AND_CONTRACTS.md` — API contracts
- `docs/CLIENT_QA_IMPLEMENTATION_ROADMAP.md` — Companion client-side roadmap

**Last Updated:** January 31, 2026

---

## Executive Summary

| Level | Server Status | Required Changes | Priority |
|-------|--------------|------------------|----------|
| **L1** (Basic) | ✅ Ready | None | — |
| **L2** (Dynamic State) | ✅ Mostly Ready | Minor: blocker logic prompt | P2 |
| **L3** (Cross-Tab) | ❌ **Gap** | `extractedVariables` store + actions | **P0** |
| **L4** (Reasoning) | ⚠️ Partial | Login-failure → ASK_USER routing | **P1** |
| **L5** (Enterprise) | ❌ **Gap** | Branching + API integrations | P3 |

---

## Table of Contents

1. [Current Server Architecture](#1-current-server-architecture)
2. [Level 1-2: Current Support](#2-level-1-2-current-support)
3. [Level 3: Extracted Variables (P0)](#3-level-3-extracted-variables-p0)
4. [Level 4: Login-Failure Detection (P1)](#4-level-4-login-failure-detection-p1)
5. [Level 2: Blocker Logic Enhancement (P2)](#5-level-2-blocker-logic-enhancement-p2)
6. [Level 5: Enterprise Workflow (P3)](#6-level-5-enterprise-workflow-p3)
7. [API Contract Updates](#7-api-contract-updates)
8. [Real-Time Event Enhancements](#8-real-time-event-enhancements)
9. [Implementation Checklist](#9-implementation-checklist)

---

## 1. Current Server Architecture

### Relevant Files

```
lib/
├── agent/
│   ├── graph/
│   │   ├── types.ts              # InteractGraphState definition
│   │   ├── executor.ts           # Graph execution
│   │   └── nodes/
│   │       ├── planning.ts       # Planning node
│   │       ├── action-generation.ts
│   │       └── verification.ts
│   ├── planning-engine.ts        # Plan generation
│   ├── step-refinement-engine.ts # Step → action conversion
│   ├── verification/
│   │   └── semantic-verification.ts
│   ├── conditional-planning.ts   # Popup/modal handling
│   ├── action-config.ts          # Available actions
│   └── schemas.ts                # Request/response schemas
├── models/
│   └── task.ts                   # Task persistence model
├── pusher/
│   └── server.ts                 # Real-time event triggers
└── cost/
    └── index.ts                  # Usage tracking

app/api/agent/interact/route.ts   # Main API endpoint
```

### Current Graph State (InteractGraphState)

```typescript
// lib/agent/graph/types.ts
interface InteractGraphState {
  // Request context
  tenantId: string;
  userId: string;
  url: string;
  query: string;
  dom: string;
  
  // Session context
  sessionId?: string;
  taskId?: string;
  isNewTask: boolean;
  
  // RAG context
  ragChunks: ResolveKnowledgeChunk[];
  hasOrgKnowledge: boolean;
  
  // Planning
  plan?: TaskPlan;
  currentStepIndex: number;
  
  // Previous actions
  previousActions: PreviousAction[];
  
  // Verification
  verificationResult?: VerificationResult;
  
  // Action generation
  actionResult?: ActionResult;
  
  // Status
  status: GraphTaskStatus;
  
  // MISSING for L3+:
  // extractedVariables?: Record<string, string>;
}
```

---

## 2. Level 1-2: Current Support

### Level 1: Basic Interaction ✅ READY

All required actions are implemented in `lib/agent/action-config.ts`:

| Action | Status | Notes |
|--------|--------|-------|
| `click(elementId)` | ✅ | DOM action |
| `setValue(elementId, value)` | ✅ | DOM action |
| `search(query)` | ✅ | Compound action (focus + type + enter) |
| `scroll()` | ✅ | Page/element scrolling |
| `navigate(url)` | ✅ | Navigation |

### Level 2: Dynamic State ✅ MOSTLY READY

| Feature | Status | Notes |
|---------|--------|-------|
| Scroll action | ✅ | `scroll()` in action-config |
| Modal detection | ✅ | `checkPopupCondition` in conditional-planning |
| Observation-based verification | ✅ | DOM/URL diff comparison |
| Waiting actions | ✅ | `waitForElement()`, `wait_for()` |

**Minor Gap:** Blocker logic is implicit. See [Section 5](#5-level-2-blocker-logic-enhancement-p2).

---

## 3. Level 3: Extracted Variables (P0)

### 3.1 Problem Statement

**From MANUAL_QA_EFFECTIVE_AGENT.md:**
> Graph state (`InteractGraphState`) and task persistence do **not** currently expose an **extracted variables** (or **stored data**) store that survives across steps and domain changes. So "CEO name = Satya Nadella" is not explicitly stored and passed to the next step as a variable for the Google query.

**Required for:**
- Task 3.1: Data Ferry (LinkedIn → Google)
- Task 3.2: Google Sheets integration
- Task 5.1: Rich Lead Sequence

### 3.2 Schema Changes

#### 3.2.1 Graph State Update

**File:** `lib/agent/graph/types.ts`

```typescript
// ADD to InteractGraphState:
export interface InteractGraphState {
  // ... existing fields ...
  
  /**
   * Variables extracted during task execution.
   * Persists across steps and domain changes within a task.
   * 
   * Examples:
   * - { "ceoName": "Satya Nadella" }
   * - { "productName": "iPhone 15", "productPrice": "$999" }
   */
  extractedVariables?: Record<string, string>;
}
```

#### 3.2.2 Request Schema Update

**File:** `lib/agent/schemas.ts`

```typescript
// ADD to interactRequestBodySchema:
export const interactRequestBodySchema = z.object({
  // ... existing fields ...
  
  /**
   * Variables extracted in previous steps.
   * Client sends current state; server may update.
   */
  extractedVariables: z.record(z.string(), z.string()).optional(),
});
```

#### 3.2.3 Task Model Update

**File:** `lib/models/task.ts`

```typescript
// ADD to ITask interface:
export interface ITask extends mongoose.Document {
  // ... existing fields ...
  
  /**
   * Variables extracted during task execution.
   * Persisted for task lifetime; cleared on new task.
   */
  extractedVariables?: Record<string, string>;
}

// ADD to TaskSchema:
const TaskSchema = new Schema<ITask>({
  // ... existing fields ...
  
  extractedVariables: {
    type: Schema.Types.Mixed,
    default: {},
  },
});
```

### 3.3 Action Implementation

#### 3.3.1 New Actions

**File:** `lib/agent/action-config.ts`

```typescript
// ADD to ACTION_DEFINITIONS:
{
  name: 'extractValue',
  description: 'Extract and store a value from the page for later use',
  examples: [
    'extractValue("ceoName", "Satya Nadella")',
    'extractValue("productPrice", "$999")',
  ],
  parameters: [
    { name: 'key', type: 'string', description: 'Variable name (e.g., "ceoName")' },
    { name: 'value', type: 'string', description: 'Value to store' },
  ],
  toolType: 'SERVER',  // Handled server-side, not by extension
},
{
  name: 'useVariable',
  description: 'Reference a previously extracted variable',
  examples: [
    'setValue(42, useVariable("ceoName"))',
    'search(useVariable("productName") + " price")',
  ],
  parameters: [
    { name: 'key', type: 'string', description: 'Variable name to retrieve' },
  ],
  toolType: 'SERVER',
},
```

#### 3.3.2 Server-Side Action Handler

**File:** `lib/agent/variable-extraction.ts` (new file)

```typescript
/**
 * Variable Extraction Service
 * 
 * Handles extractValue and useVariable actions.
 * Manages extractedVariables in graph state and task persistence.
 */

import type { InteractGraphState } from "./graph/types"

/**
 * Extract and store a variable.
 */
export function extractVariable(
  state: InteractGraphState,
  key: string,
  value: string
): InteractGraphState {
  const current = state.extractedVariables || {};
  return {
    ...state,
    extractedVariables: {
      ...current,
      [key]: value,
    },
  };
}

/**
 * Get a variable value.
 */
export function getVariable(
  state: InteractGraphState,
  key: string
): string | undefined {
  return state.extractedVariables?.[key];
}

/**
 * Replace useVariable("key") references in action string with actual values.
 */
export function resolveVariables(
  action: string,
  variables: Record<string, string>
): string {
  // Pattern: useVariable("key") or useVariable('key')
  const pattern = /useVariable\(["']([^"']+)["']\)/g;
  
  return action.replace(pattern, (match, key) => {
    const value = variables[key];
    if (value === undefined) {
      console.warn(`[VariableExtraction] Variable not found: ${key}`);
      return match; // Keep original if not found
    }
    return JSON.stringify(value); // Properly escape the value
  });
}

/**
 * Detect if action is an extractValue action.
 */
export function isExtractValueAction(action: string): boolean {
  return action.trim().startsWith('extractValue(');
}

/**
 * Parse extractValue action.
 */
export function parseExtractValueAction(
  action: string
): { key: string; value: string } | null {
  // Pattern: extractValue("key", "value") or extractValue('key', 'value')
  const match = action.match(
    /extractValue\(["']([^"']+)["'],\s*["']([^"']*)["']\)/
  );
  
  if (!match) return null;
  
  return {
    key: match[1]!,
    value: match[2]!,
  };
}
```

### 3.4 Integration Points

#### 3.4.1 API Route Update

**File:** `app/api/agent/interact/route.ts`

```typescript
// In POST handler, extract from request:
const {
  // ... existing fields ...
  extractedVariables: requestExtractedVariables,
} = validationResult.data;

// Pass to graph:
const graphResult = await runInteractGraph({
  // ... existing fields ...
  extractedVariables: requestExtractedVariables,
});

// Include in response:
return NextResponse.json({
  // ... existing response fields ...
  extractedVariables: graphResult.finalState?.extractedVariables,
});
```

#### 3.4.2 Graph Executor Update

**File:** `lib/agent/graph/executor.ts`

```typescript
// In initialState:
const initialState: Partial<InteractGraphState> = {
  // ... existing fields ...
  extractedVariables: params.extractedVariables || {},
};
```

#### 3.4.3 Action Generation Update

**File:** `lib/agent/graph/nodes/action-generation.ts`

```typescript
import {
  resolveVariables,
  isExtractValueAction,
  parseExtractValueAction,
  extractVariable,
} from "@/lib/agent/variable-extraction";

// In action generation node:
export async function actionGenerationNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  // ... existing logic ...
  
  // If action is extractValue, handle it server-side:
  if (isExtractValueAction(actionResult.action)) {
    const parsed = parseExtractValueAction(actionResult.action);
    if (parsed) {
      return extractVariable(state, parsed.key, parsed.value);
    }
  }
  
  // Resolve useVariable references in action:
  if (state.extractedVariables) {
    actionResult.action = resolveVariables(
      actionResult.action,
      state.extractedVariables
    );
  }
  
  return {
    actionResult,
    // ... other fields ...
  };
}
```

#### 3.4.4 Prompt Injection

**File:** `lib/agent/prompt-builder.ts`

```typescript
// ADD to buildActionPrompt:
export function buildActionPrompt(params: ActionPromptParams): PromptResult {
  const { extractedVariables, ...rest } = params;
  
  let variablesSection = "";
  if (extractedVariables && Object.keys(extractedVariables).length > 0) {
    variablesSection = `
## Previously Extracted Data

You have access to the following previously extracted values:
${Object.entries(extractedVariables)
  .map(([key, value]) => `- **${key}**: "${value}"`)
  .join("\n")}

You can reference these values using useVariable("key") in your actions.
For example: setValue(42, useVariable("ceoName"))
`;
  }
  
  // Include in prompt...
}
```

### 3.5 Task Persistence

**File:** `lib/agent/graph/route-integration/persistence.ts`

```typescript
// In saveTaskState:
export async function saveTaskState(
  taskId: string,
  state: InteractGraphState
): Promise<void> {
  await (Task as any).findOneAndUpdate(
    { taskId },
    {
      $set: {
        // ... existing fields ...
        extractedVariables: state.extractedVariables || {},
      },
    }
  );
}

// In loadTaskState:
export async function loadTaskState(
  taskId: string
): Promise<Partial<InteractGraphState> | null> {
  const task = await (Task as any).findOne({ taskId });
  if (!task) return null;
  
  return {
    // ... existing fields ...
    extractedVariables: task.extractedVariables || {},
  };
}
```

---

## 4. Level 4: Login-Failure Detection (P1)

### 4.1 Problem Statement

**From MANUAL_QA_EFFECTIVE_AGENT.md:**
> We do **not** yet map **login/credential error patterns** (e.g. "Invalid Credentials", "Login failed") from the verification result or DOM to a deliberate `needs_user_input` with a user-friendly message. Today the agent may retry or correct with another click instead of asking for new credentials.

### 4.2 Implementation

#### 4.2.1 Error Pattern Detection

**File:** `lib/agent/login-failure-detection.ts` (new file)

```typescript
/**
 * Login Failure Detection
 * 
 * Detects login/authentication errors in page content
 * and routes to ASK_USER instead of retry/correction.
 */

/**
 * Common login failure patterns (case-insensitive).
 */
const LOGIN_FAILURE_PATTERNS = [
  // Generic authentication errors
  /invalid\s+(credentials?|username|password|login)/i,
  /login\s+failed/i,
  /authentication\s+failed/i,
  /incorrect\s+(password|username|credentials?)/i,
  /wrong\s+(password|username|credentials?)/i,
  
  // Account issues
  /account\s+(not\s+found|locked|disabled|suspended)/i,
  /user\s+not\s+found/i,
  /no\s+account\s+(found|exists)/i,
  
  // Session/token errors
  /session\s+expired/i,
  /please\s+(log\s*in|sign\s*in)\s+again/i,
  /unauthorized/i,
  
  // MFA/2FA issues
  /verification\s+code\s+(invalid|incorrect|expired)/i,
  /two.?factor\s+(failed|invalid)/i,
  
  // Rate limiting
  /too\s+many\s+(attempts|tries|requests)/i,
  /temporarily\s+locked/i,
];

/**
 * Context indicators that suggest we're on a login-related page.
 */
const LOGIN_CONTEXT_PATTERNS = [
  /login/i,
  /sign\s*in/i,
  /log\s*in/i,
  /authenticate/i,
  /password/i,
  /username/i,
];

export interface LoginFailureResult {
  detected: boolean;
  pattern?: string;
  userMessage?: string;
}

/**
 * Detect if the page shows a login failure.
 */
export function detectLoginFailure(
  dom: string,
  url?: string
): LoginFailureResult {
  // Check if we're in a login context
  const inLoginContext =
    (url && LOGIN_CONTEXT_PATTERNS.some((p) => p.test(url))) ||
    LOGIN_CONTEXT_PATTERNS.some((p) => p.test(dom.slice(0, 5000)));
  
  if (!inLoginContext) {
    return { detected: false };
  }
  
  // Look for failure patterns
  for (const pattern of LOGIN_FAILURE_PATTERNS) {
    const match = dom.match(pattern);
    if (match) {
      return {
        detected: true,
        pattern: match[0],
        userMessage: generateUserMessage(match[0]),
      };
    }
  }
  
  return { detected: false };
}

/**
 * Generate a user-friendly message based on the error pattern.
 */
function generateUserMessage(pattern: string): string {
  const lower = pattern.toLowerCase();
  
  if (lower.includes('invalid') || lower.includes('incorrect') || lower.includes('wrong')) {
    return `I tried to log in, but the site says "${pattern}". Could you double-check your credentials or provide different ones?`;
  }
  
  if (lower.includes('locked') || lower.includes('disabled') || lower.includes('suspended')) {
    return `The login failed because "${pattern}". You may need to contact support to unlock or reactivate your account.`;
  }
  
  if (lower.includes('too many') || lower.includes('temporarily')) {
    return `Login is temporarily blocked: "${pattern}". Please wait a few minutes before trying again.`;
  }
  
  if (lower.includes('expired') || lower.includes('again')) {
    return `Your session has expired. Please provide your credentials again.`;
  }
  
  return `Login failed with message: "${pattern}". Please check your credentials and try again.`;
}
```

#### 4.2.2 Integration in Verification

**File:** `lib/agent/verification/semantic-verification.ts`

```typescript
import { detectLoginFailure } from "@/lib/agent/login-failure-detection";

// In verifyActionWithObservations:
export async function verifyActionWithObservations(
  state: InteractGraphState
): Promise<VerificationResult> {
  // Check for login failure BEFORE normal verification
  const loginFailure = detectLoginFailure(state.dom, state.url);
  
  if (loginFailure.detected) {
    return {
      success: false,
      confidence: 0.95,
      reason: `Login failure detected: ${loginFailure.pattern}`,
      goalAchieved: false,
      action_succeeded: false,
      task_completed: false,
      // Special flag for routing
      isLoginFailure: true,
      loginFailureMessage: loginFailure.userMessage,
    };
  }
  
  // Continue with normal verification...
}
```

#### 4.2.3 Router Update

**File:** `lib/agent/graph/nodes/verification.ts`

```typescript
// In verification router:
export function verificationRouter(
  state: InteractGraphState
): NodeName {
  const result = state.verificationResult;
  
  // Route login failures to ASK_USER
  if (result?.isLoginFailure) {
    return "needs_user_input";
  }
  
  // ... existing routing logic ...
}
```

#### 4.2.4 ASK_USER Response

**File:** `lib/agent/graph/nodes/finalize.ts`

```typescript
// When routing to needs_user_input from login failure:
if (state.verificationResult?.isLoginFailure) {
  return {
    status: "needs_user_input",
    actionResult: {
      thought: "Login failed. I need to ask the user for help with credentials.",
      action: `askUser("${state.verificationResult.loginFailureMessage}")`,
    },
    // Set userQuestion for client display
    userQuestion: state.verificationResult.loginFailureMessage,
  };
}
```

### 4.3 Verification Result Type Update

**File:** `lib/agent/graph/types.ts`

```typescript
export interface VerificationResult {
  // ... existing fields ...
  
  /**
   * True when a login/authentication failure was detected.
   * Routes to ASK_USER instead of correction.
   */
  isLoginFailure?: boolean;
  
  /**
   * User-friendly message explaining the login failure.
   */
  loginFailureMessage?: string;
}
```

---

## 5. Level 2: Blocker Logic Enhancement (P2)

### 5.1 Problem Statement

**From MANUAL_QA_EFFECTIVE_AGENT.md:**
> There is no explicit "target obscured by overlay → first dismiss overlay then retry" rule in the planner. The agent may learn this from the prompt and verification, but if QA shows the agent reading modal text instead of the headline, add explicit guidance.

### 5.2 Implementation

#### 5.2.1 Prompt Enhancement

**File:** `lib/agent/prompt-builder.ts`

Add to the system prompt:

```typescript
const BLOCKER_LOGIC_GUIDANCE = `
## Handling Overlays and Modals

When your target content is covered by a modal, dialog, cookie banner, or overlay:

1. **Detect the blocker**: If you cannot interact with or read the target element because something is covering it (modal, popup, cookie consent, etc.), first plan to dismiss the blocker.

2. **Dismiss strategies** (in order of preference):
   - Click "Close", "X", "Dismiss", "Accept", "OK", or similar buttons
   - Press Escape key: \`pressKey("Escape")\`
   - Click outside the modal if it has a backdrop
   - Use \`dismissDialog()\` for native browser dialogs (alert, confirm, prompt)

3. **Then proceed**: After dismissing the blocker, verify it's gone, then interact with your original target.

**Example flow:**
- User asks: "Read the headline"
- Page has cookie banner covering content
- Plan: Step 1: Click "Accept" on cookie banner → Step 2: Read headline

Never read or interact with blocker content when the user asked about main page content.
`;
```

#### 5.2.2 Conditional Planning Enhancement

**File:** `lib/agent/conditional-planning.ts`

```typescript
/**
 * Check if an element is obscured by an overlay.
 * Called during step refinement when action targets an element.
 */
export function checkElementObscured(
  dom: string,
  targetElementId: number
): { obscured: boolean; blockerSelector?: string } {
  // Parse DOM to check for common overlay patterns
  const overlayPatterns = [
    // Cookie banners
    { selector: '[class*="cookie"]', priority: 1 },
    { selector: '[class*="consent"]', priority: 1 },
    { selector: '[class*="gdpr"]', priority: 1 },
    // Modals
    { selector: '[class*="modal"]', priority: 2 },
    { selector: '[class*="dialog"]', priority: 2 },
    { selector: '[role="dialog"]', priority: 2 },
    // Overlays
    { selector: '[class*="overlay"]', priority: 3 },
    { selector: '[class*="backdrop"]', priority: 3 },
    // Popups
    { selector: '[class*="popup"]', priority: 4 },
    { selector: '[class*="popover"]', priority: 4 },
  ];
  
  // Implementation: check if any overlay is visible and positioned above target
  // This would require DOM parsing to determine z-index and visibility
  
  // Simplified: Check if common overlay selectors exist in DOM
  for (const pattern of overlayPatterns) {
    if (dom.includes(pattern.selector.replace('[class*="', '').replace('"]', ''))) {
      return {
        obscured: true,
        blockerSelector: pattern.selector,
      };
    }
  }
  
  return { obscured: false };
}
```

---

## 6. Level 5: Enterprise Workflow (P3)

### 6.1 Dependencies

Level 5 requires all P0/P1 work plus:

| Component | Priority | Status |
|-----------|----------|--------|
| Extracted variables | P0 | Section 3 |
| Login-failure detection | P1 | Section 4 |
| Branching logic | P3 | Below |
| Gmail API integration | P3 | Below |
| Google Sheets API | P3 | Below |

### 6.2 Branching Logic

**Problem:** Need "if condition then continue, else stop" pattern.

**File:** `lib/agent/conditional-planning.ts`

```typescript
/**
 * Conditional branch step.
 * Evaluates a condition and determines whether to continue or stop.
 */
export interface ConditionalBranch {
  condition: string;  // e.g., "company is a software company"
  onTrue: "continue" | PlanStep[];  // Continue with plan or insert steps
  onFalse: "stop" | "ask_user" | PlanStep[];  // Stop, ask, or alternative steps
}

/**
 * Evaluate a condition against extracted context.
 */
export async function evaluateBranchCondition(
  condition: string,
  context: {
    dom: string;
    url: string;
    extractedVariables: Record<string, string>;
    ragChunks: ResolveKnowledgeChunk[];
  }
): Promise<{ result: boolean; confidence: number; reason: string }> {
  // Use LLM to evaluate natural language condition
  const prompt = `
Evaluate whether the following condition is TRUE or FALSE based on the context.

Condition: "${condition}"

Context:
- Current URL: ${context.url}
- Extracted variables: ${JSON.stringify(context.extractedVariables)}
- Page content summary: ${context.dom.slice(0, 2000)}

Respond with JSON:
{
  "result": true/false,
  "confidence": 0.0-1.0,
  "reason": "explanation"
}
`;
  
  const result = await generateWithGemini(/* ... */);
  return JSON.parse(result);
}
```

### 6.3 API Integrations (Deferred)

#### Gmail Draft API

```typescript
// lib/integrations/gmail-draft.ts (future implementation)
export async function createGmailDraft(params: {
  to: string;
  subject: string;
  body: string;
  accessToken: string;
}): Promise<{ draftId: string; webLink: string }>;
```

#### Google Sheets API

```typescript
// lib/integrations/sheets.ts (future implementation)
export async function appendToSheet(params: {
  spreadsheetId: string;
  range: string;
  values: string[][];
  accessToken: string;
}): Promise<{ updatedRange: string }>;
```

**Note:** These require OAuth integration and are deferred to post-P0/P1 work.

---

## 7. API Contract Updates

### 7.1 Request Schema

**File:** `lib/agent/schemas.ts`

```typescript
export const interactRequestBodySchema = z.object({
  url: z.string(),
  query: z.string(),
  dom: z.string(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  
  // Hybrid vision + skeleton (existing)
  screenshot: z.string().max(2000000).nullable().optional(),
  domMode: domModeSchema.optional(),
  skeletonDom: z.string().max(100000).optional(),
  screenshotHash: z.string().max(256).optional(),
  
  // NEW: Extracted variables
  extractedVariables: z.record(z.string(), z.string()).optional(),
});
```

### 7.2 Response Schema

**File:** `app/api/agent/interact/route.ts`

```typescript
// Response type (add to existing):
interface InteractResponse {
  // ... existing fields ...
  
  /**
   * Updated extracted variables.
   * Client should merge these into local state.
   */
  extractedVariables?: Record<string, string>;
  
  /**
   * Step progress for multi-step tasks.
   */
  stepProgress?: {
    currentStep: number;
    totalSteps: number;
    stepDescription: string;
  };
}
```

### 7.3 SPECS_AND_CONTRACTS.md Update

Add new section:

```markdown
## 7. Extracted Variables Contract

### Request Field

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `extractedVariables` | `Record<string, string>` | No | Previously extracted variables to include in context |

### Response Field

| Field | Type | Description |
|-------|------|-------------|
| `extractedVariables` | `Record<string, string>` | Updated variables (may include new extractions) |

### Server Actions

| Action | Description | Handled By |
|--------|-------------|------------|
| `extractValue(key, value)` | Store extracted data | Server (not sent to extension) |
| `useVariable(key)` | Reference stored data | Server resolves before sending action |

### Persistence

- Variables persist for the lifetime of a task
- Cleared when a new task is started
- Stored in Task model (`extractedVariables` field)
```

---

## 8. Real-Time Event Enhancements

### 8.1 Step Progress Event

**File:** `lib/pusher/server.ts`

```typescript
/**
 * Trigger step progress event for multi-step tasks.
 */
export async function triggerStepProgress(
  sessionId: string,
  progress: {
    taskId: string;
    currentStep: number;
    totalSteps: number;
    stepDescription: string;
    stepStatus: 'pending' | 'executing' | 'completed' | 'failed';
  }
): Promise<void> {
  const pusher = getPusher();
  await pusher.trigger(
    `private-session-${sessionId}`,
    'step_progress',
    {
      type: 'step_progress',
      sessionId,
      ...progress,
    }
  );
}
```

**Integration:** Call in `lib/agent/graph/nodes/planning.ts` after plan generation and step transitions.

### 8.2 Variable Extracted Event (Optional)

```typescript
/**
 * Trigger when a variable is extracted (for real-time UI update).
 */
export async function triggerVariableExtracted(
  sessionId: string,
  variable: { key: string; value: string }
): Promise<void> {
  const pusher = getPusher();
  await pusher.trigger(
    `private-session-${sessionId}`,
    'variable_extracted',
    {
      type: 'variable_extracted',
      sessionId,
      ...variable,
    }
  );
}
```

---

## 9. Implementation Checklist

### Priority 0: Extracted Variables (Required for L3)

- [ ] **S-P0-1:** Add `extractedVariables` to `InteractGraphState` in `lib/agent/graph/types.ts`
- [ ] **S-P0-2:** Add `extractedVariables` to `interactRequestBodySchema` in `lib/agent/schemas.ts`
- [ ] **S-P0-3:** Add `extractedVariables` to `ITask` interface and schema in `lib/models/task.ts`
- [ ] **S-P0-4:** Create `lib/agent/variable-extraction.ts` with extraction functions
- [ ] **S-P0-5:** Add `extractValue` action to `lib/agent/action-config.ts`
- [ ] **S-P0-6:** Update `lib/agent/graph/executor.ts` to initialize `extractedVariables`
- [ ] **S-P0-7:** Update `lib/agent/graph/nodes/action-generation.ts` to handle `extractValue` and `useVariable`
- [ ] **S-P0-8:** Update `lib/agent/prompt-builder.ts` to inject variables into prompts
- [ ] **S-P0-9:** Update `lib/agent/graph/route-integration/persistence.ts` to save/load variables
- [ ] **S-P0-10:** Update `app/api/agent/interact/route.ts` to pass and return variables
- [ ] **S-P0-11:** Update `docs/SPECS_AND_CONTRACTS.md` with extracted variables contract

### Priority 1: Login-Failure Detection (Required for L4)

- [ ] **S-P1-1:** Create `lib/agent/login-failure-detection.ts` with pattern matching
- [ ] **S-P1-2:** Add `isLoginFailure` and `loginFailureMessage` to `VerificationResult` type
- [ ] **S-P1-3:** Update `lib/agent/verification/semantic-verification.ts` to call detection
- [ ] **S-P1-4:** Update verification router to route login failures to `needs_user_input`
- [ ] **S-P1-5:** Update finalize node to generate ASK_USER response for login failures

### Priority 2: Blocker Logic (Helpful for L2)

- [ ] **S-P2-1:** Add blocker logic guidance to `lib/agent/prompt-builder.ts`
- [ ] **S-P2-2:** Add `checkElementObscured` to `lib/agent/conditional-planning.ts`
- [ ] **S-P2-3:** Update step refinement to check for blockers before action

### Priority 3: Enterprise Workflow (Required for L5)

- [ ] **S-P3-1:** Add `ConditionalBranch` type to `lib/agent/conditional-planning.ts`
- [ ] **S-P3-2:** Implement `evaluateBranchCondition` function
- [ ] **S-P3-3:** Update planner to support branching steps
- [ ] **S-P3-4:** Add `triggerStepProgress` to `lib/pusher/server.ts`
- [ ] **S-P3-5:** Integrate step progress events in graph nodes
- [ ] **S-P3-6:** (Future) Gmail API integration
- [ ] **S-P3-7:** (Future) Google Sheets API integration

---

## Testing Checklist

### Level 3 Testing (after P0 complete)

- [ ] Extract CEO name from LinkedIn profile page
- [ ] Navigate to Google, verify variable still accessible
- [ ] Use extracted variable in search query
- [ ] Task restart clears variables
- [ ] Variables persist across page navigation within task

### Level 4 Testing (after P1 complete)

- [ ] Login with wrong credentials
- [ ] Agent detects "Invalid Credentials" message
- [ ] Agent returns `needs_user_input` status
- [ ] Agent provides helpful user message
- [ ] Agent does NOT loop on retry

### Level 5 Testing (after P3 complete)

- [ ] Multi-step workflow with branching
- [ ] Step progress updates in real-time
- [ ] Variables flow through entire workflow
- [ ] Conditional branches work correctly

---

## Changelog

- **2026-01-31:** Initial document created. Defined server-side implementation roadmap for QA levels 1-5.

---

**End of Document**

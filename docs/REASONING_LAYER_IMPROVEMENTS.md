# Reasoning Layer Improvements

**⚠️ CLIENT-SIDE INFORMATION CONSOLIDATED**

**Client-side implementation details have been consolidated.** All client-side Reasoning Layer support (popup/dropdown handling, NEEDS_USER_INPUT response handling) is now documented in **[CLIENT_ARCHITECTURE.md](./CLIENT_ARCHITECTURE.md)** §8 (Reasoning Layer Client Support).

**For client-side Reasoning Layer information, see:**
- **[CLIENT_ARCHITECTURE.md](./CLIENT_ARCHITECTURE.md)** §8 — Complete Reasoning Layer client support (Task 10 complete)
- **[ROADMAP.md](./ROADMAP.md)** §10 — Detailed task-based implementation reference

**This document focuses on server-side Reasoning Layer architecture.** Client-side parts are documented in CLIENT_ARCHITECTURE.md.

---

**Document Version:** 2.0  
**Date:** January 27, 2026  
**Status:** Architecture Specification (Enhanced with Confidence Scoring & Dual-Model Routing) — **Server-Side Focus**  
**Author:** Principal AI Architect & Principal AI Engineer

---

## 1. Overview

This document defines the refactored **Reasoning Layer** for the Agent system. The new architecture implements a **"Human-Like Reasoning Loop"** that verifies knowledge, refines search queries, and checks for missing information before acting.

### 1.1 Current Issues

**Issue 1: Blind Searching**
- We search on every new task unless RAG hits
- We don't check if the LLM already knows the answer
- We don't verify if the user provided enough context first

**Issue 2: Bad Query Formatting**
- We simply concatenate `"how to " + query + domain`
- For queries like "Add patient Jaswanth", this works
- For queries like "Fix the billing error", strictly searching the current domain might fail if docs are elsewhere
- The query format is too rigid and doesn't adapt to the task type

**Issue 3: No Information Gap Check**
- If search results indicate missing information (e.g., "To add a patient, you need a Date of Birth"), our agent doesn't stop to ask the user
- It just tries to proceed and fails
- No feedback loop to request missing information

### 1.2 Solution: Human-Like Reasoning Pipeline (4-Step)

The new architecture introduces a **four-step reasoning pipeline** that:
1. **Context & Gap Analysis** - Checks Memory (Chat History), Page (DOM), and classifies missing info
2. **Execution** - Takes action based on source (MEMORY/PAGE/WEB_SEARCH/ASK_USER)
3. **Evaluation & Iteration** - Evaluates search results and refines queries iteratively (max 2-3 hops)
4. **Verification** - Final check before proceeding to action planning

### 1.3 Critical Improvements

**Improvement 1: Memory & Visual Check**
- Checks Chat History before searching (user might have provided info earlier)
- Checks Current Page/DOM for visible information (error messages, form fields)
- Prevents unnecessary searches when information is already available

**Improvement 2: Iterative Deep Dives**
- Evaluates search results to determine if they solve the problem
- Refines query and searches again if results are insufficient (max 2-3 hops)
- Handles complex enterprise queries that require multiple search iterations

**Improvement 3: Ask vs. Search Classification**
- Distinguishes between External Knowledge (search) vs Private Data (ask user)
- Classifies missing information appropriately
- Prevents searching for information that only the user can provide

**Improvement 4: Confidence Scoring & Dual-Model Routing (NEW)**
- **Dual-Model Architecture:** Smart models (`gpt-4o`) for thinking tasks, fast models (`gpt-4o-mini`) for routine operations
- **Confidence Scoring:** All reasoning outputs include confidence scores (0.0 - 1.0) based on evidence
- **Threshold-Based Routing:** Confidence thresholds determine execution path (safety valve)
- **Evidence-Based Evaluation:** Models evaluate confidence based on evidence quality, not guessing

### 1.4 Popup/Dropdown Expected Outcome Handling (CRITICAL FIX)

**Problem Identified:**
The agent was failing verification on dropdown/menu buttons because the expected outcome generator assumed clicking any button would change the URL. When clicking a "Patient" button with `hasPopup="menu"`, a dropdown appeared (correct behavior), but the URL didn't change. The verification logic marked this as FAILED, causing the agent to try alternative selectors like "Visits" in a panic loop.

**Root Cause:**
Elements with `aria-haspopup` attribute don't navigate to new pages. They open popups, dropdowns, or menus. The expected outcome generator must recognize this.

**Client-Side Fix (Implemented):**
The browser extension now extracts and passes `hasPopup` information:

```typescript
// src/helpers/accessibilityFilter.ts - Added hasPopup extraction
interface SimplifiedAXElement {
  // ... existing fields
  hasPopup?: string;   // 'menu', 'listbox', 'tree', 'grid', 'dialog', 'true'
  expanded?: boolean;  // Current expanded state
}

// src/helpers/simplifyDom.ts - Added to allowedAttributes
const allowedAttributes = [
  // ... existing
  'aria-haspopup',   // CRITICAL: popup/dropdown indicator
  'aria-expanded',   // Current expanded state
  'data-has-popup',  // Alternative indicator
];
```

**Backend Fix Required:**

When generating expected outcomes in `generateExpectedOutcome()`:

```typescript
function generateExpectedOutcome(
  action: ParsedAction,
  element: HybridElement
): ExpectedOutcome {
  // CRITICAL: Check for popup/dropdown elements
  const hasPopup = element.attributes?.['aria-haspopup'] || 
                   element.attributes?.['data-has-popup'] ||
                   element.hasPopup;
  
  if (hasPopup) {
    // DO NOT expect URL change for popup elements
    return {
      urlShouldChange: false,  // CRITICAL: Dropdowns don't navigate!
      attributeChanges: [
        { attribute: 'aria-expanded', expectedValue: 'true' }
      ],
      elementsToAppear: [
        { role: 'menuitem' },      // For menu popups
        { role: 'option' },        // For listbox popups
        { role: 'dialog' },        // For dialog popups
      ],
      elementsToDisappear: [],
      reason: `Clicking element with hasPopup="${hasPopup}" - expecting popup to open`
    };
  }
  
  // Default behavior for non-popup elements
  return {
    urlShouldChange: true,
    // ... existing logic
  };
}
```

**Verification Logic Update:**

```typescript
function verifyAction(
  expectedOutcome: ExpectedOutcome,
  currentDOM: string,
  previousDOM: string
): VerificationResult {
  // If expecting popup to open
  if (expectedOutcome.attributeChanges?.some(
    c => c.attribute === 'aria-expanded' && c.expectedValue === 'true'
  )) {
    // Check if new menu/dropdown elements appeared
    const newElements = findNewElements(currentDOM, previousDOM);
    const hasMenuItems = newElements.some(
      el => el.role === 'menuitem' || el.role === 'option'
    );
    
    if (hasMenuItems) {
      return {
        success: true,
        confidence: 0.95,
        reason: 'Dropdown menu appeared as expected',
        actualState: `Dropdown opened with ${newElements.length} items`
      };
    }
  }
  // ... existing verification logic
}
```

**System Prompt Update (Backend):**

Add this to the system prompt for the action planning LLM:

```
## Dropdown/Popup Elements

When clicking an element that has `aria-haspopup` or `data-has-popup` attribute:
1. The expected behavior is that a dropdown/popup opens (NOT page navigation)
2. The URL will NOT change
3. New elements will appear with roles like 'menuitem', 'option', 'dialog'
4. The clicked element's `aria-expanded` will change to "true"
5. After the dropdown opens, you must select an option from the dropdown to proceed

Common patterns:
- Navigation buttons with hasPopup="menu" open dropdown menus
- Comboboxes with hasPopup="listbox" open option lists
- Buttons with hasPopup="dialog" open modal dialogs
```

---

## 2. The 4-Step Reasoning Pipeline

### 2.1 Step 1: Context & Gap Analysis (The Brain)

**Purpose:** Determine the BEST SOURCE for information by checking Memory, Page, and classifying missing info.

**Input:**
- `query`: User's task instructions (e.g., "Add patient Jaswanth")
- `url`: Current page URL (e.g., "https://demo.openemr.io/interface/login")
- `chatHistory`: Recent chat history from session messages
- `pageSummary`: Summary of current page/DOM (extracted from DOM or provided)
- `ragChunks`: Available RAG knowledge chunks (if any)
- `hasOrgKnowledge`: Whether organization-specific knowledge exists

**Process:**
Send to a **Smart LLM** (e.g., `gpt-4o`) with a focused prompt that:
1. Checks THREE sources in order (MEMORY, PAGE, WEB_SEARCH, ASK_USER)
2. Evaluates confidence based on EVIDENCE (not guessing)
3. Lists evidence supporting the decision
4. Identifies gaps or uncertainties
1. **MEMORY (Chat History)**: Has the user already provided this information?
2. **PAGE (Current Screen)**: Is the information visible on the current page?
3. **WEB_SEARCH (External Knowledge)**: Can this be found via web search?
4. **ASK_USER (Private Data)**: Is this information that only the user can provide?

**Output:** JSON Decision
```typescript
interface ContextAnalysisResult {
  source: "MEMORY" | "PAGE" | "WEB_SEARCH" | "ASK_USER" // Where to get the information
  missingInfo: Array<{
    field: string // e.g., "patient_dob"
    type: "EXTERNAL_KNOWLEDGE" | "PRIVATE_DATA" // Can be found via search vs must ask user
    description: string
  }>
  searchQuery: string // Refined query for Tavily (if source is WEB_SEARCH)
  reasoning: string // Explanation
  confidence: number // 0.0 - 1.0 (REQUIRED) - Model's certainty based on evidence
  evidence: { // Evidence supporting the decision
    sources: string[] // e.g., ["chat_history", "page_dom", "rag_knowledge"]
    quality: "high" | "medium" | "low" // Quality of evidence
    gaps: string[] // Missing information or uncertainties
  }
}
```

**Confidence Calculation:**
The model self-evaluates confidence based on **evidence**, not guessing. Confidence factors:
1. **Evidence Quality:** How strong is the evidence? (Multiple sources agree = high)
2. **Context Completeness:** How complete is available context? (Full history + RAG = high)
3. **Task Complexity:** How complex is the task? (Simple, well-defined = high)
4. **Source Reliability:** How reliable is the information source? (Verified knowledge = high)

**Examples:**

**Example 1: Simple Task with Sufficient Context**
```json
{
  "hasSufficientContext": true,
  "missingFields": [],
  "needsWebSearch": false,
  "searchQuery": "",
  "reasoning": "The user wants to click the login button. This is a straightforward action that doesn't require additional information or documentation."
}
```

**Example 2: Complex Task Needing Search**
```json
{
  "hasSufficientContext": false,
  "missingFields": ["patient_dob", "patient_phone"],
  "needsWebSearch": true,
  "searchQuery": "How to register new patient in OpenEMR 7.0 with required fields",
  "reasoning": "Adding a patient requires specific fields (Date of Birth, Phone Number) that the user hasn't provided. We need to search for the exact requirements and workflow."
}
```

**Example 3: Task Needing User Input**
```json
{
  "hasSufficientContext": false,
  "missingFields": ["billing_error_id", "error_description"],
  "needsWebSearch": false,
  "searchQuery": "",
  "reasoning": "To fix a billing error, we need specific information about the error (ID, description) that only the user can provide. No search will help without this information."
}
```

### 2.2 Step 2: Execution (The Action)

**Purpose:** Execute action based on the source determined in Step 1.

**Process:**

**IF** `source == MEMORY`:
- Extract information from chat history
- Proceed directly to planning/execution

**IF** `source == PAGE`:
- Extract information from current page/DOM
- Proceed directly to planning/execution

**IF** `source == WEB_SEARCH`:
- Execute iterative search with Search Manager (see Step 3)
- Handles query refinement and retries

**IF** `source == ASK_USER`:
- Stop and return `ASK_USER` response to frontend
- Include `missingInfo` with user-friendly questions

### 2.3 Step 3: Evaluation & Iteration (The Check) - Iterative Deep Dives

**Purpose:** Evaluate search results and refine queries iteratively if needed.

**Process:**

1. **Execute Initial Search:**
   - Use refined query from Step 1
   - Execute Tavily search with domain filtering

2. **Evaluate Results:**
   - Feed search results to LLM
   - Question: "Did these results solve the problem?"
   - Determine: `solved`, `shouldRetry`, `shouldAskUser`

3. **Iterative Refinement (Max 2-3 hops):**
   - **IF** `solved == true`: Proceed to Step 4
   - **IF** `shouldRetry == true` AND `refinedQuery` provided:
     * Refine query (e.g., "OpenEMR billing module error 505 logs" instead of "error 505")
     * Search again with refined query
     * Re-evaluate results
     * Repeat up to max attempts (default: 3)
   - **IF** `shouldAskUser == true`: Return `ASK_USER` response

**Key Features:**
- **Iterative Deep Dives:** Handles complex queries that require multiple search iterations
- **Query Refinement:** Automatically refines queries based on result quality
- **Adaptive Domain Filtering:** Expands search scope if domain-filtered results are poor

### 2.4 Step 4: Final Verification (Post-Search)

**Purpose:** Verify if we have all required information to complete the task after search.

**Input:**
- `query`: Original user query
- `searchResults`: Web search results (if search was performed)
- `missingFields`: Fields identified as missing in Step 1
- `ragChunks`: Available RAG knowledge

**Process:**
Feed to LLM with prompt:

```
Based on the search results and available knowledge, determine if we have all required information to perform the user's request.

User Query: {query}
Missing Fields Identified: {missingFields}
Search Results: {searchResults summary}
Available Knowledge: {ragChunks summary}

Respond with JSON:
{
  "canProceed": boolean,
  "missingInformation": string[],
  "userQuestion": string,
  "reasoning": string
}
```

**Output:** JSON Decision
```typescript
interface InformationCompletenessCheck {
  canProceed: boolean // Can we proceed with execution?
  missingInformation: string[] // What information is still missing?
  userQuestion: string // Question to ask user (if canProceed is false)
  reasoning: string // Explanation
  confidence: number // 0.0 - 1.0 (REQUIRED) - Confidence in completeness assessment
  evidence: {
    sources: string[] // Sources used for verification
    quality: "high" | "medium" | "low" // Quality of evidence
    gaps: string[] // Missing information or uncertainties
  }
}
```

**Outcomes:**

**Outcome 1: Can Proceed**
```json
{
  "canProceed": true,
  "missingInformation": [],
  "userQuestion": "",
  "reasoning": "The search results provide clear instructions on how to add a patient. We have all required information to proceed."
}
```

**Outcome 2: Needs User Input**
```json
{
  "canProceed": false,
  "missingInformation": ["patient_dob", "patient_phone"],
  "userQuestion": "I found how to add a patient in OpenEMR, but I need the Date of Birth and Phone Number to proceed. Can you provide these?",
  "reasoning": "The documentation shows that Date of Birth and Phone Number are required fields, but the user hasn't provided them."
}
```

**Outcome 3: Search Insufficient**
```json
{
  "canProceed": false,
  "missingInformation": ["workflow_steps"],
  "userQuestion": "I couldn't find clear documentation on how to fix billing errors in this system. Could you provide more details about the specific error you're encountering?",
  "reasoning": "The search results don't contain specific information about fixing billing errors. We need more context from the user."
}
```

---

## 3. Integration with Existing System

### 3.1 Flow Integration

**New Flow:**
```
1. User Query → /api/agent/interact
2. Authentication & Validation
3. **NEW: Reasoning Layer**
   a. Step 1: analyzeTaskContext() → TaskContextAnalysis
   b. Step 2: Conditional Search (if needed)
   c. Step 3: verifyInformationCompleteness() → InformationCompletenessCheck
4. If canProceed → Planning Engine → Action Generation
5. If !canProceed → Return NEEDS_USER_INPUT response
```

### 3.2 Response Types

**New Response Type: `NEEDS_USER_INPUT`**

```typescript
interface NeedsUserInputResponse {
  success: true
  data: {
    status: "needs_user_input"
    thought: string // User-friendly explanation
    userQuestion: string // Specific question to ask
    missingInformation: string[] // What we need
    context: {
      searchPerformed: boolean
      searchSummary?: string
      reasoning: string
    }
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "status": "needs_user_input",
    "thought": "I found instructions on how to add a patient, but I need some additional information to complete this task.",
    "userQuestion": "I need the Date of Birth and Phone Number for the patient. Can you provide these?",
    "missingInformation": ["patient_dob", "patient_phone"],
    "context": {
      "searchPerformed": true,
      "searchSummary": "Found OpenEMR patient registration documentation",
      "reasoning": "The documentation shows that Date of Birth and Phone Number are required fields."
    }
  }
}
```

### 3.3 Backward Compatibility

- Existing responses (`NextActionResponse`) remain unchanged
- `NEEDS_USER_INPUT` is a new response type that clients should handle
- If client doesn't support it, they can display the `userQuestion` in the UI

---

## 4. Dual-Model Architecture & Confidence Routing

### 4.1 Two-Model Architecture

**Smart LLM (Thinking Tasks):**
- **Primary:** `gpt-4o` or `claude-sonnet-3-5-20241022`
- **Fallback:** `gpt-4o-mini` (if smart model unavailable)
- **Use Cases:**
  - `analyzeContext()` - Context & Gap Analysis
  - `verifyInformationCompleteness()` - Post-search verification
  - `evaluateSearchResults()` - Search result evaluation
  - Complex reasoning tasks requiring deep understanding

**Fast LLM (Doing Tasks):**
- **Primary:** `gpt-4o-mini`
- **Use Cases:**
  - `generateSearchSummary()` - Summarizing search results
  - `buildActionPrompt()` - Action generation (routine)
  - Simple text processing and summarization
  - High-volume, low-complexity tasks

**Configuration:**
```bash
# Smart Model Configuration
SMART_MODEL_NAME=gpt-4o                    # Primary smart model
SMART_MODEL_FALLBACK=gpt-4o-mini           # Fallback if primary unavailable
SMART_MODEL_TEMPERATURE=0.3                # Lower temperature for consistency

# Fast Model Configuration
FAST_MODEL_NAME=gpt-4o-mini                # Fast model for routine tasks
FAST_MODEL_TEMPERATURE=0.7                 # Higher temperature for variety
```

### 4.2 Routing Matrix (The "Safety Valve")

**Confidence Thresholds:**

**High Confidence (0.9 - 1.0):**
- **Action:** Trust the model's decision
- **Verification:** Minimal or none
- **Use Case:** Clear, well-supported decisions with strong evidence

**Medium Confidence (0.5 - 0.9):**
- **Action:** Force verification or additional search
- **Verification:** Required before proceeding
- **Use Case:** Decisions with moderate evidence or some uncertainty

**Low Confidence (< 0.5):**
- **Action:** Block execution, force user input or search
- **Verification:** Mandatory, cannot proceed without
- **Use Case:** Weak evidence, high uncertainty, or conflicting information

**Source-Specific Routing Rules:**

**MEMORY Source:**
```typescript
if (result.source === 'MEMORY') {
  if (result.confidence >= 0.9) {
    // High confidence: Trust memory, proceed directly
    proceedToExecution()
  } else if (result.confidence >= 0.7) {
    // Medium confidence: Verify memory with page check
    verifyMemoryWithPage()
    if (verificationPasses) proceedToExecution()
    else switchToWebSearch()
  } else {
    // Low confidence: Don't trust memory, force search
    console.log("Low confidence memory. Switching to WEB_SEARCH.")
    result.source = 'WEB_SEARCH'
    result.searchQuery = generateRefinedQuery(result)
  }
}
```

**PAGE Source:**
```typescript
if (result.source === 'PAGE') {
  if (result.confidence >= 0.9) {
    // High confidence: Trust page, proceed directly
    proceedToExecution()
  } else if (result.confidence >= 0.7) {
    // Medium confidence: Verify page with search
    performVerificationSearch()
    if (verificationPasses) proceedToExecution()
    else askUser()
  } else {
    // Low confidence: Don't trust page, force search
    console.log("Low confidence page. Switching to WEB_SEARCH.")
    result.source = 'WEB_SEARCH'
    result.searchQuery = generateRefinedQuery(result)
  }
}
```

**WEB_SEARCH Source:**
```typescript
if (result.source === 'WEB_SEARCH') {
  if (result.confidence >= 0.7) {
    // Medium-high confidence: Proceed with search
    performSearch()
  } else {
    // Low confidence: Search might not help, ask user
    console.log("Low confidence search query. Switching to ASK_USER.")
    result.source = 'ASK_USER'
  }
}
```

**Verification Search:**
A lightweight search performed to verify a medium-confidence decision:
- **Trigger:** Confidence between 0.5 - 0.9, Source is MEMORY or PAGE
- **Process:** Generate verification query → Quick search → Evaluate → Proceed or switch source

---

## 5. Implementation Details

### 5.1 LLM Client Upgrade (`lib/agent/llm-client.ts`)

**New Functions:**
```typescript
/**
 * Get Smart LLM client for thinking tasks
 * Uses SMART_MODEL_NAME or falls back to FAST_MODEL_NAME
 */
export function getSmartLLM(): OpenAI {
  const modelName = process.env.SMART_MODEL_NAME || process.env.FAST_MODEL_NAME || "gpt-4o-mini"
  const temperature = parseFloat(process.env.SMART_MODEL_TEMPERATURE || "0.3")
  
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

/**
 * Get Fast LLM client for routine tasks
 * Uses FAST_MODEL_NAME or defaults to gpt-4o-mini
 */
export function getFastLLM(): OpenAI {
  const modelName = process.env.FAST_MODEL_NAME || "gpt-4o-mini"
  const temperature = parseFloat(process.env.FAST_MODEL_TEMPERATURE || "0.7")
  
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}
```

**Backward Compatibility:**
- Existing `callActionLLM()` should continue to work
- Can optionally use `getFastLLM()` internally
- No breaking changes to existing code

### 5.2 New Module: `lib/agent/reasoning-engine.ts`

**Functions:**

#### `analyzeTaskContext(params): Promise<TaskContextAnalysis>`

**Parameters:**
```typescript
interface AnalyzeTaskContextParams {
  query: string
  url: string
  pageSummary?: string // Optional: brief page state summary
  ragChunks: ResolveKnowledgeChunk[]
  hasOrgKnowledge: boolean
}
```

**Implementation:**
- Use **Smart LLM** (`getSmartLLM()`) for analysis
- Updated prompt to require confidence and evidence evaluation
- Structured output with JSON mode (includes confidence and evidence fields)
- Apply routing matrix based on confidence thresholds
- Error handling: fallback to conservative defaults (needsWebSearch: true, confidence: 0.5)

#### `verifyInformationCompleteness(params): Promise<InformationCompletenessCheck>`

**Parameters:**
```typescript
interface VerifyInformationCompletenessParams {
  query: string
  searchResults: WebSearchResult | null
  missingFields: string[]
  ragChunks: ResolveKnowledgeChunk[]
}
```

**Implementation:**
- Use **Smart LLM** (`getSmartLLM()`) for verification
- Updated prompt to require confidence and evidence evaluation
- Structured output with JSON mode (includes confidence and evidence fields)
- Apply threshold logic: if `canProceed && confidence < 0.6`, force user input
- Error handling: fallback to `canProceed: true` (optimistic) with warning, confidence: 0.5

### 5.3 Context Analyzer Upgrade (`lib/agent/reasoning/context-analyzer.ts`)

**Updated `analyzeContext`:**
- Use **Smart LLM** (`getSmartLLM()`) for context analysis
- Updated prompt to require confidence and evidence evaluation
- Apply routing matrix based on confidence:
  - MEMORY with confidence < 0.7 → Switch to WEB_SEARCH
  - PAGE with confidence < 0.7 → Switch to WEB_SEARCH
  - WEB_SEARCH with confidence < 0.5 → Switch to ASK_USER

### 5.4 Search Manager Upgrade (`lib/agent/reasoning/search-manager.ts`)

**Updated `evaluateSearchResults`:**
- Use **Smart LLM** (`getSmartLLM()`) for evaluation
- Updated prompt to require confidence and evidence
- Apply threshold logic: if `solved && confidence < 0.6`, force retry

### 5.5 Refactored Module: `lib/agent/web-search.ts`

**Changes:**

1. **Remove hardcoded query formatting:**
   - Remove: `const searchQuery = \`how to ${query} ${baseDomain}\``
   - Accept: `refinedQuery: string` parameter

2. **Update function signature:**
   ```typescript
   // OLD
   export async function performWebSearch(
     query: string,
     url: string,
     tenantId: string
   ): Promise<WebSearchResult | null>

   // NEW
   export async function performWebSearch(
     refinedQuery: string, // From reasoning engine
     url: string,
     tenantId: string,
     options?: {
       strictDomainFilter?: boolean // Default: true, but can be relaxed
       allowDomainExpansion?: boolean // If true, retry without filter if results poor
     }
   ): Promise<WebSearchResult | null>
   ```

3. **Adaptive domain filtering:**
   - Start with domain filter
   - If results < 3 and `allowDomainExpansion` is true, retry without filter
   - Log the decision for debugging

### 5.6 Updated Endpoint: `app/api/agent/interact/route.ts`

**Integration Points:**

1. **Before Task Creation (New Tasks):**
   ```typescript
   // OLD: Blind search
   webSearchResult = await performWebSearch(query, url, tenantId)

   // NEW: Reasoning loop
   const contextAnalysis = await analyzeTaskContext({
     query,
     url,
     ragChunks: chunks,
     hasOrgKnowledge,
   })

   if (contextAnalysis.needsWebSearch) {
     webSearchResult = await performWebSearch(
       contextAnalysis.searchQuery, // Refined query
       url,
       tenantId,
       { allowDomainExpansion: true }
     )
   }

   // Post-search verification
   const completenessCheck = await verifyInformationCompleteness({
     query,
     searchResults: webSearchResult,
     missingFields: contextAnalysis.missingFields,
     ragChunks: chunks,
   })

   if (!completenessCheck.canProceed) {
     // Return NEEDS_USER_INPUT response
     return NextResponse.json({
       success: true,
       data: {
         status: "needs_user_input",
         thought: completenessCheck.reasoning,
         userQuestion: completenessCheck.userQuestion,
         missingInformation: completenessCheck.missingInformation,
         context: {
           searchPerformed: !!webSearchResult,
           searchSummary: webSearchResult?.summary,
           reasoning: completenessCheck.reasoning,
         },
       },
     })
   }
   ```

2. **Response Schema Update:**
   - Add `NEEDS_USER_INPUT` to response type union
   - Update `NextActionResponse` schema to include new status

**Integration Points:**
- Apply routing matrix based on confidence after context analysis
- Check search evaluation confidence before proceeding
- Force ASK_USER if confidence is very low (< 0.5)

---

## 6. Error Handling & Edge Cases

### 5.1 LLM Analysis Failures

**Scenario:** `analyzeTaskContext()` fails or returns invalid JSON

**Handling:**
- Fallback to conservative defaults: `needsWebSearch: true`, `searchQuery: query`
- Log error to Sentry
- Continue with execution (don't block user)

### 5.2 Search Failures

**Scenario:** Tavily API fails or returns no results

**Handling:**
- Continue to Step 3 (Feasibility Check) with `searchResults: null`
- Let the feasibility check decide if we can proceed without search results
- Log warning but don't fail the request

### 5.3 Verification Failures

**Scenario:** `verifyInformationCompleteness()` fails

**Handling:**
- Fallback to optimistic: `canProceed: true`
- Log warning to Sentry
- Continue with execution (assume we have enough info)

### 6.4 Missing RAG Context

**Scenario:** No RAG chunks available

**Handling:**
- Pass empty array to reasoning engine
- Reasoning engine should account for this in analysis
- May result in `needsWebSearch: true` more often

### 6.5 Model Unavailability

**Smart Model Fails:**
1. Try fallback model (`SMART_MODEL_FALLBACK`)
2. If fallback fails, use fast model
3. Log warning about degraded reasoning quality
4. Continue with lower confidence threshold (0.6 instead of 0.7)

**Fast Model Fails:**
1. Retry once
2. If still fails, use smart model (degraded performance)
3. Log error

### 6.6 Invalid Confidence Scores

**Validation:**
- Ensure confidence is between 0.0 and 1.0
- If invalid, default to 0.5 (medium confidence)
- Log warning about invalid confidence

**Sanitization:**
```typescript
const confidence = Math.max(0, Math.min(1, Number(analysis.confidence) || 0.5))
```

---

## 7. Performance Considerations

### 7.1 LLM Call Overhead

**Current:** 1 LLM call (action generation)  
**New:** 2-3 LLM calls (analysis + verification + action generation)

**Mitigation:**
- Use **Smart models** (`gpt-4o`) for critical thinking tasks
- Use **Fast models** (`gpt-4o-mini`) for routine operations
- Cache analysis results for similar queries (future optimization)
- Parallel execution where possible

**Expected Latency:**
- Analysis: ~1-2s (smart model)
- Verification: ~1-2s (smart model)
- Action Generation: ~2-3s (full model)
- **Total:** ~4-7s (vs ~2-3s before, but with better accuracy)

**Cost Impact:**
- Smart models are more expensive but used only for critical decisions
- Fast models handle high-volume routine tasks
- Overall cost increase expected but manageable with selective usage

### 7.2 Search Optimization

**Current:** Always search (if no RAG)  
**New:** Conditional search (only when needed)

**Expected Reduction:**
- ~30-50% reduction in search calls
- Faster response times for simple tasks

---

## 8. Monitoring & Observability

### 8.1 Confidence Metrics

**Track:**
- Average confidence scores by source (MEMORY, PAGE, WEB_SEARCH, ASK_USER)
- Confidence distribution (histogram)
- Low confidence rate (< 0.5)
- Routing decisions (how often we switch sources)

**Logging:**
```typescript
console.log(`[Confidence] Source: ${result.source}, Confidence: ${result.confidence}, Evidence: ${result.evidence.quality}`)
```

**Sentry Events:**
- Log low confidence decisions (< 0.3) as warnings
- Track confidence trends over time
- Alert on sudden confidence drops

### 8.2 Performance Metrics

**Track:**
- Smart model latency vs fast model latency
- Model selection (which model was used)
- Fallback rate (how often we fallback to fast model)
- Cost impact (smart models are more expensive)

---

## 9. Testing Strategy

### 9.1 Unit Tests

- `analyzeTaskContext()`: Test various query types
- `verifyInformationCompleteness()`: Test with/without search results
- `performWebSearch()`: Test refined query handling

### 9.2 Integration Tests

- End-to-end flow: Query → Analysis → Search → Verification → Response
- Edge cases: Missing fields, search failures, LLM failures

### 9.3 Manual Testing Scenarios

1. **Simple Task (No Search):** "Click the login button"
2. **Complex Task (Search Needed):** "Add patient Jaswanth"
3. **Task Needing User Input:** "Fix the billing error"
4. **Task with Sufficient RAG:** Query with org-specific knowledge
5. **High Confidence MEMORY:** User provided info earlier, confidence > 0.9
6. **Medium Confidence MEMORY:** User provided info, but confidence 0.7, should verify
7. **Low Confidence MEMORY:** Confidence < 0.7, should switch to WEB_SEARCH
8. **High Confidence PAGE:** Clear page state, confidence > 0.9
9. **Low Confidence PAGE:** Unclear page state, should switch to WEB_SEARCH
10. **Low Confidence WEB_SEARCH:** Poor search query, should switch to ASK_USER

---

## 10. Migration Plan

### 10.1 Phase 1: Infrastructure (Week 1)
- Implement `getSmartLLM()` and `getFastLLM()`
- Add environment variable configuration
- Update model selection logic
- Add backward compatibility

### 10.2 Phase 2: Confidence Scoring (Week 2)
- Update all reasoning functions to output confidence
- Update prompts to require evidence evaluation
- Add confidence validation and sanitization
- Update TypeScript interfaces

### 10.3 Phase 3: Routing Matrix (Week 3)
- Implement threshold logic in all reasoning functions
- Add verification search logic
- Update integration points
- Add logging and monitoring

### 10.4 Phase 4: Testing & Optimization (Week 4)
- Comprehensive testing
- Performance optimization
- Confidence threshold tuning
- Documentation updates

### 10.5 Phase 5: Rollout (Week 5)

- Create `reasoning-engine.ts`
- Refactor `web-search.ts`
- Update `interact/route.ts`
- Add tests

- Deploy with feature flag
- Monitor performance and accuracy
- Collect feedback

---

## 11. Success Metrics

### 11.1 Accuracy Metrics

- **Reduction in failed actions:** Target 30% reduction (improved from 20%)
- **Reduction in false positives:** Target 30% reduction in incorrect decisions
- **Confidence calibration:** Confidence scores should correlate with actual accuracy
- **User input requests:** Track frequency and user satisfaction
- **Search relevance:** Measure if refined queries produce better results
- **Routing effectiveness:** Routing decisions should improve task success rate

### 11.2 Performance Metrics

- **Response time:** Keep under 7s (p95) - increased due to smart model usage
- **Smart model latency:** Keep under 2s (p95)
- **Fast model latency:** Keep under 1s (p95)
- **Search call reduction:** Target 30-50% reduction
- **LLM token usage:** Monitor cost impact (smart models are more expensive)
- **Fallback rate:** Track how often we fallback to fast model

### 11.3 User Experience Metrics

- **Task completion rate:** Should increase with better routing
- **User satisfaction:** Measure via feedback
- **Error recovery:** Faster recovery from failures
- **User input requests:** Should decrease (fewer unnecessary asks)

---

## 12. Future Enhancements

### 12.1 Caching

- Cache `analyzeContext()` results for similar queries
- Cache search results for common queries
- TTL-based invalidation
- Confidence-aware caching (don't cache low-confidence results)

### 12.2 Multi-Step Reasoning

- Iterative refinement: If verification fails, refine search query and retry
- Confidence-based retry logic: Only retry if confidence can improve

### 12.3 User Context Learning

- Learn from user responses to `NEEDS_USER_INPUT`
- Build user preference profiles
- Adaptive query refinement based on user history
- Confidence calibration based on user feedback

### 12.4 Advanced Confidence Features

- Dynamic threshold adjustment based on task type
- Confidence aggregation across multiple reasoning steps
- Confidence-based model selection (use smart model only when needed)

---

**Last Updated:** January 27, 2026  
**Status:** Enhanced with Confidence Scoring & Dual-Model Routing - Ready for Implementation

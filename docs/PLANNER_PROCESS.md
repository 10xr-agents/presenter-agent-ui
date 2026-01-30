# Planner Process: Step-by-Step Walkthrough

**Purpose:** Explain how the planning system produces and maintains step-by-step plans for the interact flow. This document is the **canonical** flow description and **implementation roadmap** for the planner process. Keep this doc in sync with code and use it as the single source of truth for planning, step refinement, re-planning, conditional planning, and hierarchical planning.

**Example flow:** User says "Add a new patient with name Jas" → context analysis + optional web search → **generate plan** (e.g. Open Patient menu, Click New/Search, Fill form, Submit) → **step refinement** turns current step into `click(68)` → after verification pass, **next step** (or re-plan if URL/DOM changed).

**Focus:** Planning is **DOM-based only** (DOM snapshot, URL, element structure). Vision/screenshot-based planning is **out of scope** for now.

---

## Critical: Plan and Step Advancement

- **Plan** is created once per task (or regenerated when re-planning triggers). **currentStepIndex** advances per executed action: at graph invocation, `currentStepIndex` is set from task context (plan.currentStepIndex or full action count; see route-integration `run-graph.ts` and `context.ts`). The planning node **reuses** the existing plan when present; it does not re-run `generatePlan` for continuation.
- **Step refinement** turns the current plan step into a concrete DOM action (e.g. `click(68)`). If refinement fails or returns a SERVER tool, the graph falls back to **action_generation** (LLM). Action generation uses **structured output** (Gemini `responseJsonSchema`: thought + action) so the response is valid JSON only — see `docs/GEMINI_USAGE.md` § Structured outputs. **Rolling context:** When `previousActions.length` > 10, only the last 10 raw actions are passed to step_refinement; a short summary (e.g. "N earlier steps completed.") is prepended to the prompt to avoid context explosion.
- **Re-planning** runs after verification (when URL or DOM changed). Triggers: URL change, DOM similarity < 70%, or structural changes. Actions: `continue` (plan valid), `modify` (apply suggested changes), `regenerate` (full replan). Router uses **only** `replanningResult.planRegenerated === true` and `minorModificationsOnly` (see VERIFICATION_PROCESS.md and replanning-engine).
- **Semantic loop prevention (velocity check):** If the agent performs 5+ consecutive successful verifications without task_completed (e.g. clicking "Next Page" forever), the verification router routes to finalize with a reflection message. See VERIFICATION_PROCESS.md and `lib/agent/graph/nodes/verification.ts` (`consecutiveSuccessWithoutTaskComplete`).

**Files:** `lib/agent/planning-engine.ts`, `lib/agent/step-refinement-engine.ts`, `lib/agent/replanning-engine.ts`, `lib/agent/graph/nodes/planning.ts`, `lib/agent/graph/nodes/step-refinement.ts`, `lib/agent/graph/nodes/verification.ts`, `lib/agent/graph/nodes/replanning.ts`, `lib/agent/graph/route-integration/run-graph.ts`, `lib/agent/graph/route-integration/context.ts` (currentStepIndex, rolling summary).

---

## Production Readiness Status

| Component | Status | Phase | Notes |
|-----------|--------|-------|-------|
| **Planning Engine** | ✅ Implemented | — | `lib/agent/planning-engine.ts` — generatePlan(query, url, dom, chunks, hasOrgKnowledge, webSearchResult) |
| **Planning Node** | ✅ Implemented | — | `lib/agent/graph/nodes/planning.ts` — reuses plan or generates new |
| **Step Refinement Engine** | ✅ Implemented | — | `lib/agent/step-refinement-engine.ts` — refineStep(currentStep, dom, url, previousActions, …) |
| **Step Refinement Node** | ✅ Implemented | — | `lib/agent/graph/nodes/step-refinement.ts` — refines current plan step to DOM action |
| **Action Generation Node** | ✅ Implemented | — | Fallback when no plan or refinement fails; uses LLM for action |
| **Re-planning Engine** | ✅ Implemented | 3 | `lib/agent/replanning-engine.ts` — plan health check on URL/DOM change; continue / modify / regenerate |
| **Re-planning Node** | ✅ Implemented | 3 | `lib/agent/graph/nodes/replanning.ts` — runs after verification for existing tasks |
| **DOM Similarity** | ✅ Implemented | 3 | `lib/agent/dom-similarity.ts` — Jaccard similarity on element signatures; triggers replan when < 70% |
| **Conditional Planning** | ✅ Implemented | 4 | `lib/agent/conditional-planning.ts` — contingencies (POPUP_DETECTED, ELEMENT_MISSING, etc.); check before Correction LLM |
| **Hierarchical Planning** | ✅ Implemented | 4 | `lib/agent/hierarchical-planning.ts` — sub-task decomposition; not yet wired into interact graph |
| **Plan in Graph State** | ✅ Implemented | — | plan, currentStepIndex passed through state; plan persisted with task |
| **Verification outcome in planner context** | ✅ Implemented | 3.0.4 | Pass action_succeeded / task_completed into planning and step_refinement for "next step" context (VerificationSummary in PlanningContext and refineStep; see VERIFICATION_PROCESS.md Task 7) |
| **Hierarchical in graph** | ✅ Implemented | 4.x | hierarchicalPlan in graph state; planning node calls decomposePlan; persisted with task; verification node uses sub_task_completed to advance/fail sub-task (see VERIFICATION_PROCESS.md Task 5) |
| **Semantic loop prevention (velocity check)** | ✅ Implemented | — | After 5 consecutive successful verifications without task_completed, route to finalize with reflection message. Task field `consecutiveSuccessWithoutTaskComplete`; verification node and router. See INTERACT_FLOW_WALKTHROUGH.md § Logical improvements. |
| **Rolling summarization (context cap)** | ✅ Implemented | — | When previousActions.length > 10, keep only last 10 raw actions; pass `previousActionsSummary` (e.g. "N earlier steps completed.") to step_refinement. loadTaskContext trims; currentStepIndex from plan or full count. |

**Legend:** ✅ = Complete | 🔄 = In Progress | 🔲 = Planned

**Critical Path:** Planning Engine → Step Refinement → Re-planning (Phase 3) → Conditional / Hierarchical (Phase 4)

---

## Implementation Tasks (by priority)

Tasks below are ordered by importance (1 = highest). Same status legend: ✅ = Complete | 🔄 = In Progress | 🔲 = Planned.

| Priority | Task | Status | Phase | Notes |
|----------|------|--------|-------|-------|
| **1** | **Pass verification outcome into planning / step_refinement** | ✅ Complete | 3.0.4 | Pass action_succeeded and task_completed into planning and step_refinement so the prompt says "Previous action succeeded; full goal not yet achieved." **Files:** `lib/agent/verification/types.ts` (VerificationSummary), `lib/agent/planning-engine.ts`, `lib/agent/step-refinement-engine.ts`, `lib/agent/graph/nodes/step-refinement.ts`, `lib/agent/graph/nodes/replanning.ts`. See VERIFICATION_PROCESS.md Task 7. |
| **2** | **Wire hierarchical planning into interact graph** | ✅ Complete | 4.x | hierarchicalPlan in graph state; planning node calls decomposePlan after generating plan (when step count or phases warrant); hierarchicalPlan persisted with task; verification consumes sub_task_completed for sub-task advancement. **Files:** `lib/agent/graph/types.ts`, `lib/agent/graph/interact-graph.ts`, `lib/agent/graph/nodes/planning.ts`, `lib/agent/graph/executor.ts`, `lib/agent/graph/route-integration/context.ts`, `lib/agent/graph/route-integration/persistence.ts`, `lib/agent/graph/route-integration/run-graph.ts`, `lib/models/task.ts`. |
| **3** | **Plan schema: optional verification summary in context** | ✅ Complete | 3.0.4 | VerificationSummary (action_succeeded, task_completed) passed into generatePlan (PlanningContext) and refineStep so the LLM has explicit continuation context. **Files:** planning-engine.ts (PlanningContext.verificationSummary), step-refinement-engine.ts (verificationSummary param). |

---

## Unified Task Order (Verification + Planner)

Planner and verification are **dependent**: planner needs verification outcomes (action_succeeded, task_completed) for "next step" context, and hierarchical planning requires sub-task-level verification. Use this **single ordered sequence** so both flows stay in sync.

| Order | Flow | Task | Depends on | Notes |
|-------|------|------|------------|-------|
| **1** | Verification | Split semantic: **action_succeeded** vs **task_completed** | — | **Do first.** Establishes the contract that planner will consume (Verification Task 1). |
| **2** | Verification | Low-confidence completion handling | 1 | Verification Task 2. |
| **3** | Verification | State drift: skeleton-primary diff, client witness override | — | Verification Task 3. |
| **4** | Verification | Explicit step-level vs task-level in prompt | 1 | Verification Task 4. |
| **5** | Verification + Planner | **Pass verification outcome into planning / step_refinement** | 1 | **Planner Task 1 + Verification Task 7** — do together. Planning and step_refinement nodes receive action_succeeded and task_completed (or goalAchieved); prompts get "Previous action succeeded; full goal not yet achieved." |
| **6** | Planner | **Optional verification summary in plan context** | 5 | ✅ Complete. Planner Task 3. VerificationSummary (action_succeeded, task_completed) in generatePlan (PlanningContext) and refineStep; prompts get continuation sentence when action_succeeded && !task_completed. See § Optional verification summary in plan context (Task 6). |
| **7** | Verification | Extension beforeDomHash (optional) | — | Verification Task 6. Independent. |
| **8** | Planner | **Wire hierarchical planning into interact graph** | — | ✅ Complete. hierarchicalPlan in graph state; planning node calls decomposePlan after generating plan; persisted with task; executor and route integration pass hierarchicalPlan. **Must be before** sub-task-level verification. |
| **9** | Verification | **Sub-task-level verification** (when hierarchical in graph) | 8 | ✅ Complete. Verification engine accepts optional subTaskObjective; returns sub_task_completed; verification node advances/fails sub-task via completeSubTask; goalAchieved when all sub-tasks complete. See VERIFICATION_PROCESS.md Task 5. |

**Summary:** Do **Verification 1–4** first (contract and robustness), then **5 + 6** (verification outcome → planner), then **7** (optional), then **8 → 9** (hierarchical: wire planner, then add verification sub-task support). See **VERIFICATION_PROCESS.md** § Unified Task Order for the same table and verification-side details.

---

## High-Level Loop (Planning)

1. **New task (no taskId):** Context analysis → optional web search → create task → **planning node**: no plan in state → `generatePlan(query, url, dom, ragChunks, hasOrgKnowledge, webSearchResult)` → store plan, currentStepIndex = 0.
2. **Existing task (taskId, previous actions):** Load task and plan; **currentStepIndex = previousActions.length** (set at graph input in run-graph.ts). If **replanning** triggers (URL/DOM change), run replanning node → continue / modify / regenerate plan.
3. **Planning node:** If plan exists → return currentStepIndex (reuse plan). If no plan → generate new plan.
4. **Step refinement node:** Refine `plan.steps[currentStepIndex]` → concrete action (e.g. `click(68)`). If refinement fails or returns SERVER tool → fall back to action_generation.
5. After **verification** (pass): router goes back to planning → same plan, currentStepIndex already advanced for next request (via previousActions.length). Step refinement then refines the **next** step.

**Step advancement:** currentStepIndex is **not** incremented inside the graph during a single run. It is set at **invocation** from `previousActions.length`. So after the client executes one action and sends the next request, the new request has previousActions.length = N → currentStepIndex = N → we refine step N.

---

## Planning Engine

**Where:** `lib/agent/planning-engine.ts` — `generatePlan(query, url, dom, ragChunks, hasOrgKnowledge, webSearchResult, context)`.

**Inputs:** User query, current URL, DOM snapshot, RAG chunks, hasOrgKnowledge, optional web search result, optional **context** (tenantId, userId, sessionId, taskId, **verificationSummary**). Planning receives RAG and webSearchResult; it does **not** decide when to search — that is decided by context analysis before planning.

**Output:** TaskPlan with steps (description, reasoning, toolType, expectedOutcome per step). Plan is stored in graph state and persisted with the task.

**When called:** Only when there is **no plan** in state (new task or after full regenerate in re-planning). For continuation, the planning node reuses the existing plan and does not call generatePlan again. When **replanning** regenerates a plan, it passes **verificationSummary** from `state.verificationResult` so the plan prompt can include continuation context (see § Optional verification summary below).

**Gemini config:** Planning uses **Grounding with Google Search** (`useGoogleSearchGrounding: true`) and **thinking level high** (`thinkingLevel: "high"`) so the model can reason deeply and use current web information when generating steps. See `docs/GEMINI_USAGE.md` § Thinking and § Grounding with Google Search.

---

## Step Refinement

**Where:** `lib/agent/step-refinement-engine.ts` — `refineStep(currentStep, dom, url, previousActions, ragChunks, hasOrgKnowledge, verificationSummary, context)`.

**Inputs:** Current plan step, DOM, URL, previous actions (for context), RAG, hasOrgKnowledge, optional **verificationSummary** (action_succeeded, task_completed), context (tenantId, userId, sessionId, taskId).

**Output:** Concrete DOM action (e.g. `click(68)`, `setValue(101, "Jas")`) or SERVER tool (then graph falls back to action_generation).

**When called:** When plan exists and currentStepIndex is within plan.steps. Step refinement node runs; if it returns a valid DOM action, we go to outcome_prediction → finalize. If it fails or returns SERVER, we route to action_generation. The node passes **verificationSummary** from `state.verificationResult` when available (e.g. after verification → replanning → step_refinement in the same run); see § Optional verification summary below.

---

## Optional verification summary in plan context (Task 6)

**Purpose:** Give the planning and step-refinement LLMs explicit continuation context so they do not repeat the same step or emit "we're done" too early.

**Contract:** Type **VerificationSummary** (`lib/agent/verification/types.ts`): `action_succeeded?: boolean`, `task_completed?: boolean`. When **both** `action_succeeded === true` and `task_completed === false`, the engines prepend a single sentence to the user prompt.

**Where used:**

| Call site | Summary source | Prompt addition (when applicable) |
|-----------|----------------|------------------------------------|
| **generatePlan** (replanning node) | `state.verificationResult` → context.verificationSummary | "Previous action succeeded; the full user goal is not yet achieved. Create or adjust the plan for the remaining steps." |
| **refineStep** (step_refinement node) | `state.verificationResult` → verificationSummary param | "Previous action succeeded; the full user goal is not yet achieved. Continue with the next step." |

**When it applies:** Only when the last verification outcome indicated "action succeeded but task not complete" (e.g. form opened, next step needed). If verificationSummary is undefined or task_completed is true or action_succeeded is false, no sentence is added.

**Example (sanitized):** After verification passes with `action_succeeded: true`, `task_completed: false`, the step refinement prompt starts with: *"Previous action succeeded; the full user goal is not yet achieved. Continue with the next step."* followed by the plan step to refine and DOM/URL context.

**Files:** `lib/agent/verification/types.ts` (VerificationSummary), `lib/agent/planning-engine.ts` (PlanningContext.verificationSummary), `lib/agent/step-refinement-engine.ts` (verificationSummary param), `lib/agent/graph/nodes/step-refinement.ts`, `lib/agent/graph/nodes/replanning.ts`. Tests: `lib/agent/__tests__/step-refinement-engine.test.ts`, `lib/agent/__tests__/planning-engine.test.ts`.

---

## Re-planning

**Where:** `lib/agent/replanning-engine.ts`, `lib/agent/graph/nodes/replanning.ts`, `lib/agent/dom-similarity.ts`.

**Triggers:** URL change (vs previousUrl), DOM similarity < 70% (Jaccard on element signatures; interactive elements weighted), or major structural changes (e.g. form removed). Re-planning node runs **after verification** for existing tasks when replanning is triggered.

**Actions:**

- **continue** — Plan still valid; proceed with next action.
- **modify** — Apply suggested changes (skip step N, change step N to …). Uses **minorModificationsOnly** (set when building PlanValidationResult); router uses only this (no parsing of reason text). See VERIFICATION_PROCESS.md.
- **regenerate** — Full replan. New plan generated; currentStepIndex reset to 0. Router uses **only** `replanningResult.planRegenerated === true` for routing.

**Plan Validator:** Fast LLM (e.g. gpt-4o-mini): "Given the current screen, can the remaining plan steps still be executed?" Returns valid, reason, suggestedChanges, needsFullReplan.

---

## Conditional Planning

**Where:** `lib/agent/conditional-planning.ts`.

**Purpose:** Plans can include **contingencies** (e.g. if popup appears, if element missing). On verification failure, **checkContingencies()** is run before the heavy Correction LLM; if a contingency matches, apply its action (e.g. click "Close") and optionally skip or simplify the Correction LLM.

**Contingency types:** POPUP_DETECTED, ELEMENT_MISSING, ERROR_DISPLAYED, FORM_VALIDATION, URL_CHANGED.

---

## Hierarchical Planning

**Where:** `lib/agent/hierarchical-planning.ts`.

**Purpose:** For complex tasks (>5 steps or distinct phases), a "Manager" LLM decomposes the request into **SubTasks**. Each SubTask has inputs, outputs, estimated steps, status. Sub-tasks run sequentially; **accumulated outputs** (e.g. patient ID) are passed to the next sub-task. Context can be trimmed between sub-tasks to avoid context window pollution.

**Wired in graph (Task 8):** hierarchicalPlan is in graph state; **planning node** calls decomposePlan after generating a new plan (when step count > 5 or distinct phases detected). hierarchicalPlan is persisted with the Task and loaded on continuation. **Verification node** (Task 9) passes current sub-task objective to verification; when sub_task_completed && confidence ≥ 0.7 the node advances the sub-task (completeSubTask); when all sub-tasks complete, goalAchieved is set. See VERIFICATION_PROCESS.md Task 5.

---

## Data Structures (Logical)

- **TaskPlan:** steps (PlanStep[]), currentStepIndex. Persisted with Task. PlanStep: index, description, reasoning, toolType, expectedOutcome, status.
- **ReplanningResult:** triggered, planValid, reason, planRegenerated, suggestedChanges, minorModificationsOnly (set when building result; used for modify vs regenerate). See replanning-engine and VERIFICATION_PROCESS.md.
- **HierarchicalPlan (lib):** goal, subTasks (SubTask[]), currentSubTaskIndex, accumulatedOutputs. SubTask: id, name, objective, inputs, outputs, status, result.

---

## Common Errors and Pitfalls

1. **Assuming plan is regenerated every request:** For existing tasks, the plan is **reused**; currentStepIndex is set from previousActions.length at graph input. Only when re-planning triggers do we modify or regenerate the plan.
2. **Parsing reason text for re-planning routing:** Use only **planRegenerated** and **minorModificationsOnly** (set when building PlanValidationResult). Do not parse suggestedChanges strings in determineReplanAction.
3. **Missing verification context in planner:** Without passing "previous action succeeded; task not complete" into planning/step_refinement, the LLM may repeat the same step or say "we're done" too early. Task 1 in Implementation Tasks addresses this.

---

## Configuration

- **Planning:** No dedicated env var; uses same LLM config as other agent calls. RAG and webSearchResult are passed from context analysis. **Grounding with Google Search** is enabled for planning (`useGoogleSearchGrounding: true`), so plans can be grounded in current web info (e.g. procedures, product steps); see [Gemini Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search).
- **Re-planning:** DOM similarity threshold 0.7 (configurable in validatePlanHealth). Uses default Gemini model (`DEFAULT_PLANNING_MODEL`).
- **Tavily:** When the reasoning engine triggers web search (e.g. insufficient RAG), we use **Tavily** for domain-restricted search. Use Tavily when confidence from Google Search grounding is lower or when domain-specific results are needed.
- **Step advancement:** currentStepIndex = previousActions.length at graph invocation (run-graph.ts). Client must send taskId and updated dom/url so that previousActions are loaded and count is correct.

---

## Changelog (Summary)

- **v1.0 (doc):** Initial planner process doc. Current state: planning engine, step refinement, re-planning, conditional planning, hierarchical planning (lib only). Implementation tasks: pass verification outcome into planner (3.0.4), wire hierarchical into graph (4.x), optional verification summary in plan context. Content consolidated from INTERACT_FLOW_WALKTHROUGH.md; that doc now references this and VERIFICATION_PROCESS.md.
- **Progress (Verification + Planner):** Pass verification outcome into planning/step_refinement. Added `VerificationSummary` (`lib/agent/verification/types.ts`) with `action_succeeded` and `task_completed`. Step-refinement engine accepts optional `verificationSummary` and prepends "Previous action succeeded; the full user goal is not yet achieved. Continue with the next step." when both flags indicate continuation. Planning engine `PlanningContext` includes optional `verificationSummary`; when set (e.g. from replanning), user prompt includes "Previous action succeeded; the full user goal is not yet achieved. Create or adjust the plan for the remaining steps." Step-refinement node passes summary from `state.verificationResult`; replanning node passes it to `generatePlan`. Unit tests: `lib/agent/__tests__/step-refinement-engine.test.ts`, `lib/agent/__tests__/planning-engine.test.ts`. Docs: VERIFICATION_PROCESS.md Task 7, PLANNER_PROCESS.md Tasks 1 and 3 marked complete.
- **Progress (Task 6 — Optional verification summary in plan context):** Task 6 is implemented with Task 5. No new production code; documentation updated: added § Optional verification summary in plan context (Task 6) with contract, where used (generatePlan / refineStep), when it applies, and sanitized example. Planning Engine and Step Refinement sections now list verificationSummary in inputs; Unified Task Order row 6 marked ✅ Complete in PLANNER_PROCESS.md and VERIFICATION_PROCESS.md. All logging in graph nodes uses `logger.child({ process, sessionId, taskId })`. No mock/dummy/TODO in production code; file sizes within 300–500 lines.
- **Progress (Tasks 8 + 9 — Hierarchical planning and sub-task verification):** **Task 8:** hierarchicalPlan added to InteractGraphState and graph channels; planning node calls decomposePlan after generating a new plan (when step count or phases warrant); hierarchicalPlan persisted with Task (Schema.Types.Mixed); executor and route integration (context, persistence, run-graph) pass hierarchicalPlan. **Task 9:** VerificationResult and SemanticVerificationResult include sub_task_completed; verification engine verifyActionWithObservations accepts optional subTaskObjective; semantic verification prompt and parser support sub_task_completed when subTaskObjective provided; verification node gets current sub-task objective from hierarchicalPlan, passes to engine, advances sub-task (completeSubTask) when sub_task_completed && confidence ≥ 0.7, fails sub-task when sub_task_completed === false && !success; goalAchieved set when all sub-tasks complete (isHierarchicalPlanComplete). Docs: PLANNER_PROCESS and VERIFICATION_PROCESS Tasks 2/5 and Unified Order 8/9 marked complete.

---

*Document maintained by Engineering. For implementation details, see `lib/agent/planning-engine.ts`, `lib/agent/step-refinement-engine.ts`, `lib/agent/replanning-engine.ts`, `lib/agent/conditional-planning.ts`, `lib/agent/hierarchical-planning.ts`, and graph nodes planning, step_refinement, replanning. For verification flow and task complete logic, see VERIFICATION_PROCESS.md.*

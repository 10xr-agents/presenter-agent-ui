# Verification Process — Details

This document continues [VERIFICATION_PROCESS.md](./VERIFICATION_PROCESS.md). It contains Step 5 (Run Verification), Semantic Verification LLM contract, Semantic Skeleton Diff, DOM-Based Checks, Confidence calculation, Action Type, Outcome Prediction, Correction, Data Structures, Goal_Achieved node, Common Errors, Configuration, and Changelog. Each file is kept under 500 lines for maintainability.

---

## Step 5 — Run Verification (Observation-Based Only)

**Where:** Verification node → `verifyActionWithObservations` in verification engine.

**Inputs:** beforeState (url, domHash, optional semanticSkeleton), currentDom, currentUrl, action, userGoal, clientObservations, context.

**Logic:**

1. **Compute after state:** `afterDomHash = computeDomHash(currentDom)`.
2. **Build observation list:** `buildObservationList(...)` returns `{ observations, meaningfulContentChange }` (Task 3: state drift).
   - **URL:** If beforeState.url ≠ currentUrl → "Navigation occurred: URL changed from … to …". Else → "URL did not change".
   - **Page content (skeleton-primary):**
     - If `beforeState.semanticSkeleton` and `currentDom` are both present:
       - Extract current skeleton from currentDom (`extractSemanticSkeleton`).
       - Diff before vs current skeleton with microdiff (`getGranularObservation`).
       - If diff returns items → add those as observations; **meaningfulContentChange = true**.
       - If diff is empty but domHash changed → "Page content updated (DOM changed; no interactive element changes detected)"; **meaningfulContentChange = false** (Task 3: avoid false positive from tickers/ads).
       - If diff is empty and domHash same → "Page content did not change (no interactive element or alert changes)".
       - On any skeleton/diff error → fall back to hash-only; meaningfulContentChange = (domHash changed).
     - **Hash-only path:** If beforeState.domHash ≠ afterDomHash → "Page content updated (DOM changed)", meaningfulContentChange = true. Else → "Page content did not change (DOM hash identical)".
   - **Focus:** If activeElement changed, add observation.
   - **Client witness:** If clientObservations.didNetworkOccur → add "Background network activity detected"; if didDomMutate → "DOM was mutated"; if didUrlChange defined → "Extension reported URL changed: true/false".
3. **No change at all (Task 3):** somethingChanged = urlChanged OR meaningfulContentChange OR clientSawSomething, where clientSawSomething = didNetworkOccur OR didDomMutate OR didUrlChange. If **!somethingChanged** → **return failure without calling the LLM** (confidence 0.2, reason includes observation list). Do **not** set goalAchieved. When clientSawSomething is true but !urlChanged && !meaningfulContentChange, log "Client witness override: proceeding with LLM (extension reported change)".
4. **Semantic verdict:** Call LLM with **only** user goal, action, and observation list (no full DOM). LLM returns **match** (boolean), confidence, reason. **Contract (see Semantic Verification LLM below):** `match` = true only when the user's goal was achieved; the system uses `match` deterministically — do not rely on wording in `reason`.
5. **Result:** success = (confidence ≥ 0.70). Set **goalAchieved** via `computeGoalAchieved(task_completed, confidence)`: goalAchieved = task_completed && confidence ≥ 0.70; when goalAchieved && confidence < 0.85 log "Low confidence completion". Return VerificationResult with success, confidence, reason, comparison.semanticMatch, and **goalAchieved**.
6. **Graph router (verification node):** Uses **only** `verificationResult.goalAchieved === true` to route to **goal_achieved**. No parsing of `reason` (no word-based signals). If goalAchieved → goal_achieved node → sets actionResult = { action: "finish()", thought: "..." } → finalize → status **completed**.

**Logging:** All verification logs use `logger.child({ process: "Verification", sessionId: context?.sessionId, taskId: context?.taskId ?? "" })` so every log line is attributable to a specific chat thread (sessionId) and message/task (taskId).

---

## Semantic Verification LLM Contract

**Where:** `lib/agent/verification/semantic-verification.ts` — `performSemanticVerificationOnObservations`.

**Input:** User goal, action executed, observation list (URL change, element appeared/disappeared, clientObservations, etc.). No full DOM.

**Output (JSON only):** `{ "match": true|false, "confidence": 0.0-1.0, "reason": "Brief explanation" }`.

**Contract (must be reflected in the prompt):**

- **`match`** (legacy) / **`task_completed`**: Set to **true** only when the **entire** user goal was achieved. Set to **false** for intermediate steps (Task 4: step-level vs task-level).
- **`action_succeeded`**: true when this action did something useful (e.g. form opened); false when nothing useful happened.
- The system uses **task_completed** and **action_succeeded** deterministically for routing. Do **not** rely on wording in **`reason`**.
- **`reason`**: User-friendly explanation for logs and UI only.

**Step-level vs task-level (Task 4):** The prompt explicitly states: task_completed = true ONLY when the entire user request is done; for multi-step tasks, set task_completed = false until the final step is done. Example in prompt: "Add a patient named Jas" → form open = action_succeeded true, task_completed false; final step (Save clicked, success) = action_succeeded true, task_completed true. Implemented via `STEP_TASK_LEVEL_CONTRACT` and `STEP_TASK_LEVEL_EXAMPLE` in `lib/agent/verification/semantic-verification.ts`.

**Guidelines in prompt:** URL changed + navigation goal → action_succeeded true; task_completed true only if that was the full goal. Page content updated but more steps needed → action_succeeded true, task_completed false. No changes → action_succeeded false, task_completed false. Be decisive; high confidence when observations clearly support success or failure.

---

## Semantic Skeleton Diff (Granular Observations)

**Where:** `lib/agent/observation/diff-engine.ts` (Cheerio + microdiff).

**Goal:** Move from binary "something changed / nothing changed" (hash) to **what** changed, so the LLM can judge success accurately (e.g. "Save" → "Saved", new toast "Successfully updated").

**Logic (high level):**

1. **Extract semantic skeleton from HTML**
   - Parse HTML with Cheerio.
   - **Interactive elements:** For each `button`, `a`, `input`, `select`, `textarea`, and elements with `role="button"`, `role="link"`, `role="menuitem"`: key by id/name or index; store a small descriptor: tag, text (trimmed, first 50 chars), value, disabled, ariaExpanded, href, role.
   - **Alerts/messages:** For `[role="alert"]`, `.toast`, `.error`, `.success`, `.alert`, `[data-toast]`: key by index; store trimmed text.
   - Result: a JSON map (skeleton) of meaningful UI state.

2. **Diff before vs after skeleton**
   - Use microdiff(beforeSkeleton, afterSkeleton).
   - Map diff items to human-readable lines:
     - CREATE → "New element appeared: …" or "New message/alert appeared: …".
     - REMOVE → "Element disappeared: …".
     - CHANGE → "Element 'id' changed 'attribute' from 'oldValue' to 'newValue'".

3. **When used**
   - When saving an action: we optionally call `extractSemanticSkeleton(dom)` and store in `beforeState.semanticSkeleton`. On extraction error we keep only url + domHash.
   - When verifying: if `beforeState.semanticSkeleton` and currentDom exist, we use the diff result as the "page content" observations; otherwise we use hash-only.

**Benefits:** Fewer false positives (timers/ads change hash but not skeleton); LLM sees concrete changes (e.g. button text, new alert) instead of "Page content updated".

---

## DOM-Based Checks (Supporting Paths)

**Where:** `lib/utils/dom-helpers.ts`. Used by the **prediction-based** verification path (`verifyAction`), not the observation-based path.

| Check | Purpose |
|-------|---------|
| Element exists | Regex-based: id, class, data-testid, or text. |
| Element NOT exists | Inverse of above. |
| Element has text | Find element, check text content. |
| URL changed | Compare path + query (significant change). |
| Aria expanded | Check aria-expanded="true". |
| Roles exist | Check for role="menuitem", etc. |

---

## Confidence Calculation (Prediction-Based Path)

Used when we run `verifyAction` (expectedOutcome + DOM checks + full-DOM semantic verification), e.g. for correction or legacy paths. **Not** used for observation-based verification, which uses the LLM confidence directly.

**Weights / rules (conceptual):**
- Client verification (element found) → strong positive (e.g. +40%); element not found → cap confidence at 60%.
- Expected element not found in DOM → cap 60% (except when URL changed as expected for navigation).
- DOM check score → average of element/URL/attribute/elementsAppeared checks.
- URL changed as expected → boost (e.g. 75% minimum for navigation).
- Semantic confidence > 0.85 → allow LLM to override DOM failures (still respect cap).
- Default: weighted mix of DOM score and semantic confidence; then apply cap.

Success threshold: confidence ≥ 0.70.

---

## Action Type Classification

**Where:** `lib/agent/action-type.ts`. Used for outcome prediction templates and for prediction-based verification.

**Logic (short):**
- `navigate()` or `goBack()` → navigation.
- `click(id)` → resolve element in DOM: if `aria-haspopup` → dropdown; if `<a>`, `href`, or `role="link"` → navigation; else generic.
- Otherwise → generic.

Navigation/dropdown use **fixed** expected-outcome templates (no LLM prediction for what should appear). Generic uses LLM outcome prediction (can be wrong on selectors).

---

## Outcome Prediction

**Where:** `lib/agent/outcome-prediction-engine.ts`. Used for **correction** and logging, **not** for observation-based verification.

When we generate an action, we optionally predict expected outcome (description + domChanges). For dropdown/navigation we use fixed templates; for generic we use LLM. LLM often guesses wrong selectors; that's why verification is observation-based (compare before/after state, not prediction vs DOM).

---

## Correction Loop

**Where:** `lib/agent/graph/nodes/correction.ts`.

When observation-based verification fails (confidence < 70%), the correction node gets the failure reason and DOM and suggests a recovery strategy (e.g. RETRY_WITH_DELAY, ALTERNATIVE_SELECTOR, SCROLL_INTO_VIEW, REFRESH_PAGE, FAIL after max retries). Strategy is converted to a retry action (e.g. `wait(0.5)`, new selector, `fail()`).

---

## Data Structures (Logical)

- **beforeState (TaskAction):** `{ url, domHash, activeElement?, semanticSkeleton? }`. Captured when the action is generated. Verification compares this to current url/dom/skeleton.
- **VerificationResult (engine):** success (confidence ≥ 0.70), confidence, reason, expectedState, actualState, comparison (domChecks, semanticMatch, overallMatch, nextGoalCheck), **goalAchieved**, **semanticSummary**. **goalAchieved** = task_completed && confidence ≥ 0.70 (Task 2: low-confidence band); when confidence < 0.85 we log "Low confidence completion". **semanticSummary** = first 300 chars of semantic verdict reason (for display only). Set by engine only; graph uses goalAchieved only to route; goal_achieved node uses semanticSummary for description (no parsing of reason).
- **VerificationResult (graph state):** Same shape; goalAchieved and semanticSummary passed through from engine. Router checks **only** `verificationResult.goalAchieved === true`.
- **ClientObservations (request):** Optional `{ didNetworkOccur?, didDomMutate?, didUrlChange? }` from the extension. Task 3: all three are used for "something happened" (client witness override).
- **ObservationListResult (Task 3):** `buildObservationList` returns `{ observations: string[], meaningfulContentChange: boolean }`. meaningfulContentChange is true only when skeleton diff had items or (no skeleton) domHash changed; skeleton diff empty but hash changed → false (avoids ticker/ads false positive).
- **ExpectedOutcome:** Used for correction and prediction-based path; includes description, domChanges (elementShouldExist, urlShouldChange, attributeChanges, elementsToAppear), nextGoal.

---

## Goal_Achieved Node and Task Complete Flow

**Where:** `lib/agent/graph/nodes/goal-achieved.ts`, `lib/agent/graph/interact-graph.ts`.

**When:** Router sees `verificationResult.goalAchieved === true` after the verification node.

**What:** goal_achieved node sets:
- **actionResult** = `{ thought: "Task complete. ...", action: "finish()" }`.
- **expectedOutcome** = description from **verificationResult.semanticSummary** (set by engine); fallback to reason substring if semanticSummary missing. Do not parse reason text (e.g. "Semantic verdict: ...") for display.
- Then graph edges: goal_achieved → **finalize**. Finalize node sees actionResult.action.startsWith("finish(") and sets status to **completed**.

**Why:** Stops the "multiple time" loop: without this, after verification passed the graph always went to planning → action_generation and produced another click (e.g. click(169) again). With goalAchieved and the goal_achieved node, we complete the task once when the semantic LLM says task_completed=true with confidence ≥ 0.70 (Task 2: includes low-confidence band).

**Critical:** Do not replace this with word-based checks on reason (e.g. "successful", "completed"). Use only the **goalAchieved** flag set by the engine from the LLM's **task_completed** field.

---

## Common Errors and Pitfalls

1. **Parsing `reason` to decide task complete:** Do not scan for words like "successful", "completed", "aligns with the user's goal" in verificationResult.reason. Routing must use only **goalAchieved** (set from LLM **task_completed** and confidence) and **success** (set from **action_succeeded** and confidence).
2. **Relying on LLM wording in `reason`:** The prompt must state that **action_succeeded** and **task_completed** are the contract. If the prompt does not make this clear, the LLM might set task_completed=false but write "task completed" in reason — routing would then fail to complete the task.
3. **Missing goalAchieved on error path:** If verification throws, the catch block returns a synthetic success (e.g. confidence 0.5). Do **not** set goalAchieved in that path (leave undefined) so we don't complete the task on error.
4. **Skipping verification when beforeState is missing:** If lastAction exists but beforeState is missing, we skip verification and continue (log warning). In that case verificationResult is undefined; goalAchieved is not set; router goes to planning. Document this so future changes don't assume verificationResult is always present after verification node.
5. **Changing confidence threshold without doc:** goalAchieved uses confidence ≥ 0.70 (Task 2: low-confidence completion band); we log "Low confidence completion" when confidence < 0.85. If these thresholds are changed in code, update this doc and the "Configuration" section.
6. **Parsing critic or replanning text for routing:** Critic approval must come only from `<Approved>YES|NO</Approved>`. Replanning modify vs regenerate must use `minorModificationsOnly` only (set when building PlanValidationResult); do not re-parse suggestedChanges strings in determineReplanAction.
7. **Changing state-drift logic without doc (Task 3):** meaningfulContentChange and clientSawSomething (including didUrlChange) determine "something changed". If buildObservationList or verification-engine logic for skeleton-primary or client witness is changed, update this doc and Step 5.

---

## Configuration

- **VERIFICATION_MODEL:** Model for semantic verification (default e.g. gpt-4o-mini).
- **Success threshold:** 0.70 (success = action_succeeded && confidence ≥ 0.70 → route to next action; else correction).
- **Goal-achieved threshold:** 0.70 (goalAchieved = task_completed && confidence ≥ 0.70). When task_completed is true we allow finish in the [0.70, 0.85) band (Task 2: low-confidence completion); single finish, no correction.
- **Low-confidence completion:** When goalAchieved is true and confidence < 0.85 we log "Low confidence completion" for observability; routing is unchanged (goal_achieved → finish).
- Observation-based path (Task 3): no change = !urlChanged && !meaningfulContentChange && !clientSawSomething (clientSawSomething = didNetworkOccur || didDomMutate || didUrlChange). When no change → fail without LLM. Client witness overrides: if extension reports change we proceed with LLM.

---

## Changelog (Summary)

- **v3.0.9 (impl):** **Task 4 — Explicit step-level vs task-level in prompt.** Semantic verification prompts (full-DOM and observation) now include a dedicated "Step-level vs task-level (Task 4)" block using `STEP_TASK_LEVEL_CONTRACT` and `STEP_TASK_LEVEL_EXAMPLE`. Contract: task_completed = true ONLY when entire user request is done; for multi-step tasks set task_completed = false until final step. Example: "Add a patient named Jas" → form open = action_succeeded true, task_completed false. **Progress:** Files: `lib/agent/verification/semantic-verification.ts`. Tests: `lib/agent/__tests__/semantic-verification.test.ts` (2 new tests for prompt contract constants; 10 tests total, all pass). Next: Task 5 (Verification + Planner — pass verification outcome into planning/step_refinement).
- **v3.0.8 (impl):** **Task 3 — State drift: skeleton-primary diff, client witness override.** `buildObservationList` now returns `{ observations, meaningfulContentChange }`. meaningfulContentChange is true only when skeleton diff had items or (no skeleton) domHash changed; when skeleton diff empty but hash changed (e.g. tickers/ads) → false. Engine uses somethingChanged = urlChanged || meaningfulContentChange || clientSawSomething; clientSawSomething includes didUrlChange. When proceeding only due to client report, log "Client witness override". **Progress:** Files: `lib/agent/verification/observation-builder.ts`, `lib/agent/verification-engine.ts`, `lib/agent/verification/index.ts`, `lib/agent/verification/__tests__/observation-builder.test.ts`. Tests: 5 new observation-builder tests + 5 verification-engine tests, all pass. Next: Task 4 (explicit step-level vs task-level in prompt).
- **v3.0.7 (impl):** **Task 2 — Low-confidence completion handling.** When task_completed === true and confidence in [0.70, 0.85) we set goalAchieved = true (single finish) and log "Low confidence completion". Prevents routing to correction or generating another action when the LLM said the goal is done but confidence is medium. Implemented via `computeGoalAchieved(task_completed, confidence)` in `lib/agent/verification-engine.ts`; used in both observation and prediction paths. **Progress:** Files changed: `lib/agent/verification-engine.ts`. Tests: `lib/agent/__tests__/verification-engine.test.ts` (5 tests, all pass). Next: Task 3 (state drift).
- **v3.0.6 (impl):** **Task 1 — Split semantic verification: action_succeeded vs task_completed.** LLM now returns **action_succeeded** (did this action do something useful?) and **task_completed** (is the entire user goal done?). Engine sets goalAchieved = task_completed && confidence ≥ 0.70 (Task 2 band); success = action_succeeded && confidence ≥ 0.7. Router: goalAchieved → goal_achieved; success → planning; else → correction. Prevents premature finish when only one step of N succeeded. **Progress:** Files changed: `lib/agent/verification/semantic-verification.ts` (prompts + parsing + `parseSemanticVerificationResponse`), `lib/agent/verification-engine.ts`, `lib/agent/verification/types.ts`, `lib/agent/graph/types.ts`, `lib/agent/graph/nodes/verification.ts`, `lib/agent/verification/index.ts`. Tests: `lib/agent/__tests__/semantic-verification.test.ts` (8 tests, all pass). Next: Task 2 (low-confidence completion handling).
- **v3.0.5 (doc):** **Client contract and troubleshooting:** Added subsection "Client contract: why the same step can repeat" and "Troubleshooting: same step repeats even when client sends taskId" (taskId required for continuation; check TaskAction persisted, previousActions.length, router). Content consolidated from INTERACT_FLOW_WALKTHROUGH.md; that doc now references this and PLANNER_PROCESS.md.
- **v3.0.4 (doc):** **Multi-step verification and implementation roadmap:** (1) New section **Multi-Step Tasks: Verify Every Step** — N steps ⇒ N verifications (one after each action); goalAchieved only when entire user goal is done; example "Add a patient named Jas" (3 steps). (2) New section **Implementation Tasks (by priority)** — six tasks in order of importance: split action_succeeded vs task_completed, low-confidence completion, state drift (skeleton-primary + client witness), explicit step-level vs task-level in prompt, sub-task-level verification (when hierarchical in graph), extension beforeDomHash (optional).
- **v3.0.3:** **Broader deterministic patterns:** (1) **Critic:** approved set only from `<Approved>YES|NO</Approved>` (no free-text fallback). (2) **Replanning:** `PlanValidationResult.minorModificationsOnly` set when building result; `determineReplanAction` uses only this for modify vs regenerate (no parsing of suggestedChanges text). (3) **Verification display:** `VerificationResult.semanticSummary` set by engine; goal_achieved node uses semanticSummary for description (no parsing of reason for "Semantic verdict: ...").
- **v3.0.2:** **Deterministic task complete:** VerificationResult has **goalAchieved** (set by engine when success && LLM **match** === true && confidence ≥ 0.85). Graph router uses **only** goalAchieved to route to **goal_achieved** node; no parsing of reason text. **goal_achieved** node sets actionResult = finish() → finalize → status completed. Semantic verification prompt updated: contract that **match** = true only when user's goal achieved; system uses match deterministically. Stops "multiple time" loop (repeated click(169)/click(170)). See "Critical: Deterministic Task Complete" and "Common Errors and Pitfalls".
- **v3.0.1:** Verification node uses **only** observation-based verification (`verifyActionWithObservations`). If beforeState is missing, verification is skipped (log warning). Client must send DOM on every call.
- **v3.0:** beforeState (url, domHash, optional semanticSkeleton), clientObservations, buildObservationList, semantic verdict on observations only, verifyActionWithObservations; no full DOM in observation path.
- **v2.1.1:** URL change handling fixes, action type for `<a>` as navigation, "Not Found" penalty exception when URL changed.
- **v2.1:** clientVerification, Not Found penalty cap, client verification weight.
- **v2.0:** urlAtAction, smart previousUrl, regex DOM checks, smart DOM context, confidence tuning.

---

## Progress (Task 3 — State drift)

**What was implemented:** Skeleton-primary: `buildObservationList` returns `meaningfulContentChange` (true only when skeleton diff had items or, without skeleton, domHash changed). When skeleton diff empty but hash changed → no meaningful change (avoids false positive from tickers/ads). Client witness override: `clientSawSomething` includes `didDomMutate` and `didUrlChange`; when extension reports change we proceed with LLM even if server sees no change; log "Client witness override: proceeding with LLM (extension reported change)".

**Files changed:** `lib/agent/verification/observation-builder.ts` (ObservationListResult, meaningfulContentChange), `lib/agent/verification-engine.ts` (use meaningfulContentChange and clientSawSomething with didUrlChange), `lib/agent/verification/index.ts` (export ObservationListResult), `lib/agent/verification/__tests__/observation-builder.test.ts` (new; 5 tests), `docs/VERIFICATION_PROCESS.md`, `docs/VERIFICATION_PROCESS_DETAILS.md`.

**Test summary:** `lib/agent/verification/__tests__/observation-builder.test.ts` — 5 tests, all pass. `lib/agent/__tests__/verification-engine.test.ts` — 5 tests, all pass. Build passes.

**Next steps:** Task 5 (Verification + Planner): Pass verification outcome into planning/step_refinement. See Unified Task Order in VERIFICATION_PROCESS.md.

---

## Progress (Task 4 — Explicit step-level vs task-level in prompt)

**What was implemented:** Both semantic verification prompts (full-DOM and observation-only) now include an explicit "Step-level vs task-level (Task 4)" block. Contract: task_completed = true ONLY when the entire user request is done; for multi-step tasks set task_completed = false until the final step is done. Example: "Add a patient named Jas" → form open = action_succeeded true, task_completed false; final step (Save clicked, success) = action_succeeded true, task_completed true. Implemented via exported constants `STEP_TASK_LEVEL_CONTRACT` and `STEP_TASK_LEVEL_EXAMPLE` in `lib/agent/verification/semantic-verification.ts`.

**Files changed:** `lib/agent/verification/semantic-verification.ts`, `lib/agent/__tests__/semantic-verification.test.ts`, `docs/VERIFICATION_PROCESS.md`, `docs/VERIFICATION_PROCESS_DETAILS.md`.

**Test summary:** `lib/agent/__tests__/semantic-verification.test.ts` — 10 tests (8 existing + 2 new for Task 4 prompt contract), all pass. Build passes.

**Next steps:** Task 5 (Verification + Planner): Pass verification outcome into planning/step_refinement. See Unified Task Order in VERIFICATION_PROCESS.md.

---

## Progress (Task 2 — Low-confidence completion)

**What was implemented:** goalAchieved = task_completed && confidence ≥ 0.70 (single finish); when confidence in [0.70, 0.85) we log "Low confidence completion". No change to routing (goal_achieved → finish). Helper `computeGoalAchieved(task_completed, confidence)` in `lib/agent/verification-engine.ts`; used in both observation and prediction paths.

**Files changed:** `lib/agent/verification-engine.ts`, `lib/agent/__tests__/verification-engine.test.ts`, `docs/VERIFICATION_PROCESS.md`, `docs/VERIFICATION_PROCESS_DETAILS.md` (new; doc split for ≤500 lines).

**Test summary:** `lib/agent/__tests__/verification-engine.test.ts` — 5 tests, all pass (computeGoalAchieved boundaries and low-confidence band). Build passes.

---

*Document maintained by Engineering. For implementation details, see `lib/agent/verification-engine.ts`, `lib/agent/verification/` (including `semantic-verification.ts` for LLM contract), `lib/agent/graph/nodes/verification.ts` (router), `lib/agent/graph/nodes/goal-achieved.ts`, and `lib/agent/observation/diff-engine.ts`. This doc is the single source of truth for verification and task-complete logic; keep it in sync to avoid errors.*

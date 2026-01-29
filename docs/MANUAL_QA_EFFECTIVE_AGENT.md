# Manual QA: Effective Agent Certification

**Purpose:** Manual QA checklist to verify the Spadeworks Copilot graduates from **"Clicking Buttons"** to **"Managing Work."**  
**Reference:** Interact flow → `docs/INTERACT_FLOW_WALKTHROUGH.md`; Verification → `docs/VERIFICATION_PROCESS.md`; Planner → `docs/PLANNER_PROCESS.md`.

**Target:** For Hackathon, confidently pass **Level 3 (Cross-Tab)** and attempt **Level 4 (Reasoning)**. For customers, aim for **Level 5 (Enterprise Workflow)**.

---

## How to Use This Doc

- **Manual QA:** Run each task as a user would (same prompt, same success criteria).
- **Implementation notes:** For each level/task we note what the codebase already supports and what (if anything) must be built or clarified.
- **Scoring:** Use the rubric at the end to diagnose failures.

---

## Level 1: The "Toddler" Test (Basic Interaction)

**Goal:** Prove the thin client can read the DOM and execute basic CDP actions.

### Task 1.1: The Search & Click

| Item | Detail |
|------|--------|
| **Prompt** | *"Go to Google, search for 'SpaceX', and click the Wikipedia result."* |
| **Tech challenge** | Input text (`setValue`), Press Enter (`dispatchKeyEvent` or submit), Identify correct link (semantic selection), Navigation. |
| **Success** | The active tab is the Wikipedia page for SpaceX. |

**Implementation notes:**

- **Already in place:** Action set includes `click`, `setValue`, `search` (see `lib/agent/action-config.ts`). Step refinement turns high-level intent into `setValue(..., "SpaceX")` and `click(...)`; prompt and RAG guide semantic selection. Extension executes actions; backend does not run CDP directly.
- **Gap / QA focus:** Ensure the extension implements Enter-in-search (e.g. submit form or `dispatchKeyEvent` for Enter) so "search for X" doesn’t require a separate "click Search button" step when Enter suffices. If the agent emits a "click search button" step, that’s also acceptable.
- **Action:** None required if search + click on the correct result works. If not, verify extension action mapping and step-refinement output for search flows.

---

### Task 1.2: The Static Form

| Item | Detail |
|------|--------|
| **Prompt** | *"Go to [Demo Form URL], fill in 'John Doe' as name, 'john@test.com' as email, and submit."* |
| **Tech challenge** | Handling different input types (text, email, button). |
| **Success** | The "Success" or "Thank You" page is visible. |

**Implementation notes:**

- **Already in place:** `setValue` and form-fill chaining (`lib/agent/chaining/`) support multiple inputs and submit; prompt describes form behaviour.
- **Gap:** Provide a concrete **Demo Form URL** (e.g. a simple public form that shows a success page on submit) or use an internal test page. Document it in this section for repeatable QA.
- **Action:** Add a stable Demo Form URL (or "use [URL] from env/test config") and re-run QA.

**Suggested Demo Form URL (for QA):**  
*[Add a URL here, e.g. a form that echoes inputs and shows "Success" or "Thank you" on submit.]*

---

## Level 2: The "Teenager" Test (Dynamic State & Waiting)

**Goal:** Prove the verification engine works: the agent understands that the web is slow and state changes take time.

### Task 2.1: Infinite Scroll / Lazy Load

| Item | Detail |
|------|--------|
| **Prompt** | *"Go to YouTube, search for 'Gemini API', and find the 5th video in the list."* |
| **Tech challenge** | The 5th video may not be in the DOM initially. Agent must scroll, wait for hydration, then interact. |
| **Success** | The agent scrolls down and opens the correct (5th) video. |

**Implementation notes:**

- **Already in place:** `scroll` action exists (`lib/agent/action-config.ts`, chaining types). Verification is observation-based (DOM/URL diff); planner and step refinement can emit scroll-then-click steps.
- **Gap:** No explicit "wait for network idle" or "wait for element" in the backend; the extension may need to wait after scroll before sending the next DOM. Backend relies on the next request’s DOM (after scroll) to verify and choose the next action.
- **Action:** If the agent consistently picks the wrong index or never scrolls, (1) confirm the extension sends updated DOM after scroll, (2) add prompt guidance for "scroll until the Nth item is visible, then click it" if needed.

---

### Task 2.2: Modal/Popup Battler

| Item | Detail |
|------|--------|
| **Prompt** | *"Go to [News Site with Cookie Banner], dismiss the cookie banner, and read the top headline."* |
| **Tech challenge** | **Blocker logic:** Agent tries to read headline → finds a modal obscuring it → plans sub-task "Close Modal" → executes → verifies visibility → resumes. |
| **Success** | The headline text is returned without cookie banner text mixed in. |

**Implementation notes:**

- **Already in place:** Conditional planning has popup/modal detection (`lib/agent/conditional-planning.ts`: `checkPopupCondition`). Failure-handling and alternative strategies in the prompt tell the agent to try different approaches when something doesn’t work. CHROME_TAB_ACTIONS documents `dismissDialog` for JS dialogs; cookie banners are usually DOM overlays (click "Accept" / "I agree").
- **Gap:** There is no explicit "target obscured by overlay → first dismiss overlay then retry" rule in the planner. The agent may learn this from the prompt and verification (e.g. verification fails because headline isn’t visible, then correction/next step closes modal). If QA shows the agent reading modal text instead of the headline, add explicit guidance: "If the target content is covered by a modal or banner, plan a step to close/dismiss it first, then read the main content."
- **Action:** Run QA; if the agent often reads the banner instead of the headline, add a short "blocker logic" bullet to the action prompt or planner guidance (dismiss overlay before reading primary content).

---

## Level 3: The "Intern" Test (Cross-Tab Memory)

**Goal:** Prove universal clipboard and state management. This is the **MVP** threshold.

### Task 3.1: Data Ferry (Read A → Write B)

| Item | Detail |
|------|--------|
| **Prompt** | *"Get the CEO's name from this LinkedIn profile, then go to Google and find their net worth."* |
| **Tech challenge** | **Context retention:** Store "Name" (e.g. Satya Nadella) in task state, switch domains (LinkedIn → Google), use that variable in the next step. |
| **Success** | The final output is the correct dollar amount (or a clear answer citing the name and net worth). |

**Implementation notes:**

- **Gap (implementation required):** Graph state (`InteractGraphState`) and task persistence do **not** currently expose an **extracted variables** (or **stored data**) store that survives across steps and domain changes. So "CEO name = Satya Nadella" is not explicitly stored and passed to the next step as a variable for the Google query.
- **Required work:**
  1. **Schema:** Add to task state (or graph state) a key-value store, e.g. `extractedVariables: Record<string, string>` (or `storedData`), persisted with the task and sent back on subsequent requests.
  2. **Planner / prompt:** When the plan has "extract X from page A, then use X on page B", the planner (or step refinement) should (a) emit an "extract" or "store" step that writes to `extractedVariables`, and (b) in the next step(s), inject those variables into the prompt so the LLM can use them (e.g. "Use stored CEO name: Satya Nadella").
  3. **API:** Include `extractedVariables` in the interact request/response or task payload so the client can display or debug; persistence in DB (task model) so it’s available for the whole task lifetime.
- **Action:** Implement **Task State / Extracted Variables** (schema + persistence + prompt injection), then re-run this task.

---

### Task 3.2: Google Ecosystem (Sheets) — Hackathon Critical

| Item | Detail |
|------|--------|
| **Prompt** | *"Take this Amazon product page, find the price and name, and add it to a new row in my 'Shopping List' Google Sheet."* |
| **Tech challenge** | Interacting with a complex web app (Sheets): grid of inputs, auth, and navigation. |
| **Success** | A new row appears in the actual Google Sheet with the correct product name and price. |

**Implementation notes:**

- **Already in place:** Multi-step planning, step refinement, and verification can in principle drive "extract from Amazon → open Sheets → add row." No Sheets-specific actions or Google auth in the current codebase.
- **Gaps:** (1) **Google auth:** Sheets access usually requires OAuth; the agent (or extension) must work in an authenticated Google context or use a secure server-side token. (2) **Sheets as grid:** The agent would need to interact with the Sheets UI (or use Sheets API from the backend). Using the Sheets API from the backend is the most reliable; UI-only automation is fragile. (3) **Extracted variables:** Same as 3.1 — product name and price must be stored (e.g. in `extractedVariables`) and then used when writing the row.
- **Action:** For Hackathon, either (a) implement a "write to Google Sheet" server action that uses Sheets API + stored variables, or (b) document that 3.2 is "stretch" and pass 3.1 + other Level 3 criteria first. If doing UI-only, add guidance for "grid of cells" and test with a known Sheet structure.

---

## Level 4: The "Associate" Test (Reasoning & Ambiguity)

**Goal:** Prove the planner and reasoning layer can handle vague prompts and figure out "how."

### Task 4.1: Cheapest Flight (Logic)

| Item | Detail |
|------|--------|
| **Prompt** | *"Find me a flight from NY to London on Expedia for next Tuesday. Pick the cheapest non-stop option."* |
| **Tech challenge** | (1) Date math: resolve "next Tuesday." (2) Filtering: apply non-stop. (3) Comparison: scrape prices, parse to numbers, find min, click that container. |
| **Success** | The checkout (or booking) page for the lowest-priced non-stop flight is open. |

**Implementation notes:**

- **Already in place:** Planning engine, step refinement, conditional planning, and current-time injection in prompts. The LLM can infer "next Tuesday" from current date and produce steps like "set date to X," "apply non-stop filter," "find lowest price and click that row."
- **Gap:** No built-in "min over list of prices" primitive; the agent relies on the LLM to reason over DOM/text and choose the right element. Verification can check that we landed on a booking/checkout page.
- **Action:** No code change strictly required. If the agent often picks the wrong row, improve prompt or step-refinement examples for "choose the option with the lowest price" (e.g. "identify all prices, compare, then click the element corresponding to the minimum").

---

### Task 4.2: Smart Correction (Resilience)

| Item | Detail |
|------|--------|
| **Prompt** | *"Login to [Portal] with username 'wrongUser'."* (Intentionally wrong.) |
| **Tech challenge** | **Error handling:** Agent tries login → sees "Invalid Credentials" (or similar) → stops and asks the user: *"I tried logging in but the site said 'Invalid Credentials'. Do you have a different username?"* |
| **Success** | The agent does **not** loop on Login; it recognizes the failure and asks the user for different credentials. |

**Implementation notes:**

- **Already in place:** `ASK_USER` and `needs_user_input` exist (context analysis, search manager, dynamic interrupt). When the analyzer or search says "should ask user," we return `needs_user_input` and a message. Verification returns a reason; correction can suggest alternative actions.
- **Gap:** We do **not** yet map **login/credential error patterns** (e.g. "Invalid Credentials", "Login failed") from the verification result or DOM to a deliberate `needs_user_input` with a user-friendly message. Today the agent may retry or correct with another click instead of asking for new credentials.
- **Required work:**
  1. **Detection:** In verification (or a small post-verification check), detect known error patterns in the page (e.g. text like "Invalid Credentials", "Login failed", "Incorrect password"). Optionally use semantic verification reason or a dedicated classifier.
  2. **Routing:** When such a pattern is detected after a login attempt, set status to `needs_user_input` and set the user-facing message to something like: "I tried logging in but the site said 'Invalid Credentials'. Do you have a different username or password?"
- **Action:** Implement **login-failure → ASK_USER** (pattern detection + routing + message), then re-run this task.

---

## Level 5: The "Manager" Test (Enterprise Workflow)

**Goal:** Prove commercial viability: branching, multi-step search, and synthesis.

### Task 5.1: Rich Lead Sequence

| Item | Detail |
|------|--------|
| **Prompt** | *"Research 'Acme Corp'. If they are a software company, find the VP of Engineering on LinkedIn and draft an email to them in Gmail referencing their latest news."* |
| **Tech challenge** | (1) **Branching:** Check industry; if software → continue; else stop. (2) **Multi-step search:** Google → company site → LinkedIn. (3) **Synthesis:** Combine "company news" + "person name" into a drafted email. |
| **Success** | A Gmail tab is open with a draft like: *"Hi [Name], I saw Acme just launched [Product]..."* |

**Implementation notes:**

- **Already in place:** Context analysis (MEMORY, PAGE, WEB_SEARCH, ASK_USER), conditional planning, multi-step planning, and web search. The planner can emit steps that depend on conditions (e.g. "If software company, then …").
- **Gaps:** (1) **Branching:** Conditional planning supports contingencies (e.g. popups); we don’t yet have a clear "branch on company type and stop if not software" pattern in the planner. This may be expressible as a step that "checks" and then either continues or calls `fail()` / asks user. (2) **Synthesis and variables:** Same as Level 3 — we need `extractedVariables` (or equivalent) for "company news" and "VP name" so the draft step can use them. (3) **Gmail draft:** Either the agent fills the compose form in the UI (fragile) or we have a server action that uses Gmail API; the latter is more reliable.
- **Action:** (1) Implement **extracted variables** (Level 3). (2) Add planner/prompt guidance for "branch on condition; if not met, stop and report." (3) For "draft email," either rely on UI automation with stored variables or add a Gmail-draft API integration. Then re-run QA.

---

## How to Score Your Agent (The "Effective" Rubric)

Use this table to diagnose failures and prioritize fixes.

| Level | Failure mode | Diagnosis |
|-------|--------------|-----------|
| **L1** | Can’t click or type as intended. | Fix selectors / CDP implementation (extension + step refinement). |
| **L2** | Clicks before page or list is ready. | Fix verification loop and waiting (extension sends DOM after load/scroll; backend may need "wait for element" guidance). |
| **L3** | Forgets data between tabs or steps. | Fix server-side **Task State** schema: add **extracted variables** (or stored data), persist and inject into prompts. |
| **L4** | Picks wrong flight/price or loops on login. | Fix planner/LLM prompting and comparison logic (4.1); add **login-failure → ASK_USER** (4.2). |
| **L5** | Gets stuck on a branch or doesn’t synthesize. | Fix orchestrator / conditional planning and self-correction; ensure extracted variables and branching are implemented. |

---

## Implementation Summary (What to Build)

| Priority | Item | Level(s) | Notes |
|----------|------|----------|--------|
| **P0** | **Extracted variables / task state store** | 3.1, 3.2, 5.1 | Schema + persistence + prompt injection for key-value data across steps/domains. |
| **P1** | **Login-failure → ASK_USER** | 4.2 | Detect "Invalid Credentials" (or similar) and return `needs_user_input` with a clear message. |
| **P2** | **Blocker logic (modal first)** | 2.2 | Optional prompt/planner rule: if target is obscured by overlay, plan "dismiss overlay" then retry. |
| **P2** | **Demo Form URL** | 1.2 | Document a stable URL for static form QA. |
| **P3** | **Sheets integration** | 3.2 | Sheets API + auth or UI automation; document as stretch for Hackathon. |
| **P3** | **Branching pattern (if/else stop)** | 5.1 | Planner guidance or step type for "check condition; if not met, stop." |
| **P3** | **Gmail draft** | 5.1 | API or UI; depends on extracted variables. |

---

## Changelog

- **Initial:** Level 1–5 manual QA tasks, success criteria, implementation notes, rubric, and implementation summary.

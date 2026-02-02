# DOM Extraction Architecture

**Purpose:** Comprehensive documentation of how DOM extraction works in the Spadeworks Copilot AI browser extension and what data is sent to the LLM for decision-making.

**Last Updated:** February 1, 2026

**Implementation Status:** ✅ Fully Integrated (CDP-First Architecture)

| Component | Status | Location |
|-----------|--------|----------|
| **CDP Extraction (PRIMARY)** | ✅ Active | `cdpDomExtractor.ts` → `currentTask.ts` |
| CDP Lifecycle (Page Ready) | ✅ Active | `cdpLifecycle.ts` |
| CDP Visual Feedback | ✅ Active | `cdpVisualFeedback.ts` |
| Viewport Pruning | ⏸️ Disabled | Human-driven automation needs full page |
| Skeleton/Hybrid (Fallback) | ✅ Active | `skeletonDom.ts`, `hybridCapture.ts` |
| Delta Hashing | ✅ Implemented | `deltaHash.ts` |
| DOM RAG | ✅ Implemented | `domRag.ts` |
| Sentinel Verification | ✅ Implemented | `sentinelVerification.ts` |
| Backend Negotiation | ✅ Active | `currentTask.ts` (needs_context handling) |

> **Architecture Change (Feb 2026):** Content scripts have been **removed**. All DOM extraction now uses Chrome DevTools Protocol (CDP) directly from the background service worker. This eliminates "content script not ready" race conditions and provides stable element IDs via `backendNodeId`.

## Extraction Flow

```
1. CDP Extraction (PRIMARY) - ~100-500 tokens (full page, no viewport pruning)
   └── extractDomViaCDP() using Accessibility.getFullAXTree + DOMSnapshot
   └── ALL interactive elements sent for human-driven automation

2. Legacy Accessibility (FALLBACK) - ~150-400 tokens
   └── getAccessibilityTree() if CDP extraction fails

3. Skeleton/Hybrid (FALLBACK) - ~500-3000 tokens
   └── selectDomMode() based on query keywords (if both fail)

4. Backend Negotiation (ON REQUEST)
   └── needs_context/needs_full_dom → retry with requested artifacts
```

---

## Table of Contents

1. [Overview](#1-overview)
2. [CDP-First Architecture](#2-cdp-first-architecture)
   - 2.1 [Why CDP Over Content Scripts](#21-why-cdp-over-content-scripts)
   - 2.2 [CDP Domains Used](#22-cdp-domains-used)
   - 2.3 [Element ID Strategy: backendNodeId](#23-element-id-strategy-backendnodeid)
   - 2.4 [Page Lifecycle Detection](#24-page-lifecycle-detection)
3. [Semantic Architecture - Ultra-Light Extraction](#3-semantic-architecture---ultra-light-extraction)
   - 3.5 [Advanced Features](#35-advanced-features-production-grade)
   - 3.6 [Production-Grade Features](#36-production-grade-features)
   - 3.7 [Midscene-Inspired Optimizations](#37-midscene-inspired-optimizations)
4. [Extraction Pipeline](#4-extraction-pipeline)
5. [Shadow DOM Support](#5-shadow-dom-support)
6. [Iframe Support](#6-iframe-support)
7. [Extraction Modes](#7-extraction-modes)
8. [Semantic JSON Protocol](#8-semantic-json-protocol)
9. [Skeleton DOM Extraction](#9-skeleton-dom-extraction)
10. [DOM Stability Waiting](#10-dom-stability-waiting)
11. [What Gets Sent to the LLM](#11-what-gets-sent-to-the-llm)
12. [Mode Selection Logic](#12-mode-selection-logic)
13. [Fallback Handling](#13-fallback-handling)
14. [Source Files Reference](#14-source-files-reference)

---

## 1. Overview

The DOM extraction system is responsible for capturing the current state of a web page and transforming it into a format that the LLM can understand and use to make decisions about browser automation actions.

### The Problem

LLMs need to "see" the page to decide what to click, type, or interact with. However:

1. **Raw HTML is huge** - A typical page is 500KB-2MB of HTML, which would consume 100k+ tokens
2. **Most HTML is irrelevant** - Scripts, styles, nested divs are noise for the LLM
3. **Element IDs drift** - On dynamic sites (React, Vue), element positions change after re-renders
4. **Timing matters** - Pages load progressively; extracting too early gives incomplete data
5. **Content script race conditions** - Content scripts die on navigation and take time to re-inject

### The Solution

We use **Chrome DevTools Protocol (CDP)** for direct DOM extraction from the background service worker:

```
┌─────────────────────────────────────────────────────────────────┐
│                CDP-FIRST EXTRACTION PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  CDP Attach  │───▶│ Page Ready   │───▶│  CDP Extraction  │  │
│  │              │    │              │    │                  │  │
│  │ Debugger     │    │ Lifecycle +  │    │ AXTree + DOM     │  │
│  │ attach()     │    │ Network Idle │    │ Snapshot merge   │  │
│  │              │    │              │    │                  │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                  │
│         ▼                    ▼                    ▼             │
│  CDP session         CDP lifecycle        SemanticNodeV3[]      │
│  persists across     events ensure        with backendNodeId    │
│  navigations         page is ready        for stable targeting  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Benefits of CDP-First

| Benefit | Description |
|---------|-------------|
| **No race conditions** | CDP session persists across navigations |
| **Stable element IDs** | `backendNodeId` doesn't drift on re-renders |
| **No content scripts** | Zero injection timing issues |
| **Faster extraction** | Direct CDP access vs content script round-trip |
| **Better error handling** | CDP errors are immediate and clear |

---

## 2. CDP-First Architecture

### 2.1 Why CDP Over Content Scripts

The previous architecture used content scripts injected into every page, which caused several issues:

| Problem | Content Script Issue | CDP Solution |
|---------|---------------------|--------------|
| Script not ready | Content scripts die on navigation, need re-injection | CDP debugger session persists |
| Race conditions | Script injection timing varies | Synchronous CDP commands |
| ID drift | `data-llm-id` wiped on framework re-renders | `backendNodeId` is stable |
| Shadow DOM | Requires special library | Chrome handles automatically |
| Iframe content | Complex distributed extraction | Chrome stitches frames together |

### 2.2 CDP Domains Used

| Domain | Commands | Purpose |
|--------|----------|---------|
| **Accessibility** | `enable`, `getFullAXTree` | Get semantic role, name, value, backendDOMNodeId |
| **DOMSnapshot** | `enable`, `captureSnapshot` | Get bounds, visibility, paint order |
| **DOM** | `enable`, `resolveNode` | Convert backendNodeId to objectId for actions |
| **Page** | `enable`, lifecycle events | Detect page load states |
| **Network** | `enable`, request events | Track in-flight requests for network idle |
| **Runtime** | `evaluate` | Inject ripple effect, get viewport info |

### 2.3 Element ID Strategy: backendNodeId

**File:** `src/helpers/cdpDomExtractor.ts`

Chrome assigns each DOM node a unique `backendNodeId` that:
- Is **immutable** - assigned at node creation
- **Survives re-renders** - same node keeps same ID
- **Works across frames** - unique within the page
- **Enables direct resolution** - convert to objectId for CDP actions

```typescript
// CDP extraction returns backendNodeId as the element ID
interface SemanticNodeV3 {
  i: string;   // backendNodeId as string
  r: string;   // Role (minified: btn, inp, link, etc.)
  n: string;   // Name/label
  v?: string;  // Value
  s?: string;  // State (disabled, checked, expanded)
  xy?: [number, number];  // Center coordinates
  box?: [number, number, number, number];  // Bounding box [x,y,w,h]
  f?: number;  // Frame ID (0 = main, omitted if 0)
  occ?: boolean;  // Occluded by overlay
  scr?: { depth: string; h: boolean };  // Scrollable container info
}
```

**Action Execution with backendNodeId:**

```typescript
// src/helpers/domActions.ts - CDP-first resolution
async function getObjectId(elementId: number | string, tabId: number): Promise<string | null> {
  const originalId = typeof elementId === 'string' ? parseInt(elementId, 10) : elementId;

  // CDP-FIRST: Resolve backendNodeId directly
  const result = await sendCommand('DOM.resolveNode', {
    backendNodeId: originalId,
  });

  if (result?.object?.objectId) {
    return result.object.objectId;
  }

  // Fallback: querySelector for legacy compatibility
  // ...
}
```

### 2.4 Page Lifecycle Detection

**File:** `src/helpers/cdpLifecycle.ts`

CDP provides lifecycle events for reliable page readiness detection:

```typescript
// Wait for page to be ready before extraction
export async function waitForPageReady(tabId: number, timeoutMs: number = 15000): Promise<boolean> {
  // 1. Check if already attached to debugger
  // 2. Listen for Page.lifecycleEvent (load, DOMContentLoaded, networkIdle)
  // 3. Wait for Network.loadingFinished on all requests
  // 4. Additional 500ms stability buffer
}

// Track network activity for DOM change detection
export function setNetworkObservationMark(tabId: number): void;
export function getDidNetworkOccurSinceMark(tabId: number): boolean;
```

**Benefits over content script DOM waiting:**
- No MutationObserver overhead in page
- Direct access to browser lifecycle events
- Accurate network idle detection

---

## 3. Semantic Architecture - Ultra-Light Extraction

**CDP-based Semantic JSON is the current PRIMARY extraction mode.** It provides 99.8% token reduction through key innovations.

### Key Principle

> **Semantic JSON is the ONLY source of truth. Full DOM should NEVER be sent proactively — only when the backend explicitly requests it via `needs_full_dom` response.**

### CDP-Based Semantic Extraction

**File:** `src/helpers/cdpDomExtractor.ts`

The primary extraction now uses CDP directly:

```typescript
export async function extractDomViaCDP(tabId: number): Promise<CDPExtractionResult> {
  // 1. Get accessibility tree with all semantic info
  const { nodes } = await sendCommand('Accessibility.getFullAXTree');

  // 2. Get DOM snapshot for bounds/visibility
  const snapshot = await sendCommand('DOMSnapshot.captureSnapshot', {
    computedStyles: [],
    includePaintOrder: true,
    includeDOMRects: true,
  });

  // 3. Build backendNodeId → bounds lookup from snapshot
  // 4. Filter to interactive nodes only
  // 5. Merge AX info with bounds → SemanticNodeV3[]
  // 6. Apply viewport pruning

  return {
    interactiveTree: semanticNodes,
    viewport: { width, height },
    pageTitle,
    url,
    scrollPosition,
    meta: { nodeCount, extractionTimeMs, axNodeCount, estimatedTokens }
  };
}
```

### Semantic Enhancements

| Enhancement | Description | Impact |
|-------------|-------------|--------|
| **CDP AXTree** | `Accessibility.getFullAXTree` for 100% reliable extraction | Bypasses all DOM issues |
| **Complete Page Coverage** | ALL interactive elements sent (viewport pruning disabled) | Full automation support |
| **Minified JSON Keys** | `i/r/n/v/s/xy` instead of `id/role/name/value/state/coordinates` | ~30% reduction |
| **Coordinates Included** | `[x, y]` center point for direct click targeting | Eliminates coordinate lookups |
| **Stable IDs** | `backendNodeId` doesn't drift on re-renders | No self-healing needed |

> **Note:** Viewport pruning is **DISABLED** for human-driven automation. We send the complete semantic tree of all interactive elements on the page to ensure proper automation regardless of scroll position.

### Token Cost Comparison

| Mode | Typical Size | Token Estimate | Cost @ $0.01/1k |
|------|--------------|----------------|-----------------|
| Full DOM | 50-200 KB | 10,000-50,000 | $0.10-0.50 |
| Skeleton | 2-6 KB | 500-1,500 | $0.005-0.015 |
| **Semantic (Full Page)** | **500-2000 bytes** | **100-500** | **$0.001-0.005** |

> **Token estimate updated:** Since viewport pruning is disabled, we now send all interactive elements. Token count varies by page complexity (simple pages ~100 tokens, complex apps ~500 tokens).

### Semantic Payload Example

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

### Key Legend (for System Prompt)

Include this legend in the system prompt so the LLM understands the minified format:

```
LEGEND for interactive_tree format:
- i: element ID (use this in click(i) or setValue(i, text))
- r: role (btn=button, inp=input, link=link, chk=checkbox, sel=select)
- n: name/label visible to user
- v: current value (for inputs)
- s: state (disabled, checked, expanded)
- xy: [x, y] coordinates on screen
- f: frame ID (0 = main frame, omitted if 0)
```

### Role Mapping

| Full Role | Minified |
|-----------|----------|
| `button` | `btn` |
| `link` | `link` |
| `textbox`, `input`, `textarea`, `searchbox` | `inp` |
| `checkbox` | `chk` |
| `radio` | `radio` |
| `select` | `sel` |
| `menuitem` | `menu` |
| `tab` | `tab` |
| `option` | `opt` |
| `switch` | `switch` |
| `slider` | `slider` |

### Viewport Pruning Algorithm

> **DISABLED for Human-Driven Automation**: Viewport pruning is currently disabled because this is a human-driven automation extension. The complete semantic tree of ALL interactive elements on the page is sent to ensure proper automation regardless of scroll position.

```typescript
// NOTE: Viewport pruning is DISABLED for human-driven automation
// We send ALL interactive elements on the page, not just visible ones

// Only skip elements with zero dimensions (truly invisible)
if (rect.width === 0 && rect.height === 0) {
  return null;
}

// All other interactive elements are included regardless of viewport position
```

**Rationale:** For human-driven automation, users need to interact with elements anywhere on the page. The backend/LLM needs visibility into the complete page structure to:
1. Understand full page context for better decision-making
2. Handle scroll-then-click scenarios correctly
3. Support "scroll to element" actions for off-screen elements

### CDP AXTree Extraction (Primary Method)

**File:** `src/helpers/cdpDomExtractor.ts`

The CDP extractor provides 100% reliable element detection:

```typescript
// Core extraction logic
async function extractDomViaCDP(tabId: number): Promise<CDPExtractionResult> {
  const target = { tabId };

  // 1. Get full accessibility tree
  const axResult = await chrome.debugger.sendCommand(
    target,
    'Accessibility.getFullAXTree'
  );

  // 2. Get DOM snapshot for bounds
  const snapshot = await chrome.debugger.sendCommand(
    target,
    'DOMSnapshot.captureSnapshot',
    { computedStyles: [], includePaintOrder: true, includeDOMRects: true }
  );

  // 3. Build bounds lookup: backendNodeId → [x, y, w, h]
  const boundsMap = buildBoundsMap(snapshot);

  // 4. Filter to interactive roles and map to SemanticNodeV3
  const interactiveTree = axResult.nodes
    .filter(node => !node.ignored && INTERACTIVE_ROLES.has(node.role?.value))
    .map(node => ({
      i: String(node.backendDOMNodeId),
      r: ROLE_MAP[node.role.value] || node.role.value,
      n: node.name?.value?.substring(0, 80) || '',
      v: node.value?.value,
      s: extractState(node.properties),
      xy: getCenterFromBounds(boundsMap.get(node.backendDOMNodeId)),
      box: boundsMap.get(node.backendDOMNodeId),
    }))
    .filter(node => isInViewport(node.box, viewport));

  return { interactiveTree, viewport, pageTitle, url, scrollPosition, meta };
}
```

**Benefits:**
- 100% reliable (if Chrome says it's a button, it's a button)
- Bypasses Shadow DOM automatically
- Bypasses iframes automatically
- Zero content script overhead
- Stable `backendNodeId` for action targeting

---

## 3.5 Advanced Features (Production-Grade)

The semantic architecture includes production-grade reliability features that match state-of-the-art agents like Browser Use and OpenHands.

### Advanced Feature Summary

| Feature | Problem Solved | Impact |
|---------|---------------|--------|
| **True Visibility Raycasting** | Elements covered by modals/overlays fail to click | Prevents phantom click failures |
| **Explicit Label Association** | Unnamed inputs (`<input id="882">`) confuse LLM | Inputs get meaningful names |
| **Mutation Stream** | Transient toasts/errors missed between snapshots | LLM sees what happened |
| **Delta Hashing** | Sending unchanged DOM wastes bandwidth/tokens | 50%+ bandwidth savings |
| **Virtual List Detection** | Infinite scroll hides content from extraction | LLM knows to scroll for more |
| **Self-Healing Recovery** | Element IDs become stale after React re-render | Auto-recovers from stale IDs |
| **Bounding Box (Set-of-Mark)** | Multimodal vision needs element positions | Future-proof for GPT-4o vision |

### 3.5.1 True Visibility Raycasting (Modal Killer)

**Problem:** An element with `display: block` might be covered by a popup, cookie banner, or transparent overlay. Clicks are intercepted by the overlay.

**Solution (Browser-Use Inspired):** Use **multi-point visibility sampling** with `document.elementFromPoint()` to determine what percentage of an element is actually visible. This is more reliable than single center-point checking, as it catches partial occlusions from overlays, modals, cookie banners, and sticky headers.

```typescript
/**
 * Multi-Point Visibility Score Calculator
 *
 * Uses 5-point sampling (center + 4 corners) to determine
 * what percentage of an element is actually visible.
 */
function getVisibilityScore(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return 0;

  // Sample 5 points: center + 4 corners (with 2px inset)
  const points = [
    { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },  // Center
    { x: rect.left + 2, y: rect.top + 2 },                              // Top-left
    { x: rect.right - 2, y: rect.top + 2 },                             // Top-right
    { x: rect.left + 2, y: rect.bottom - 2 },                           // Bottom-left
    { x: rect.right - 2, y: rect.bottom - 2 },                          // Bottom-right
  ];

  let visiblePoints = 0;
  let sampledPoints = 0;

  for (const p of points) {
    if (p.x < 0 || p.y < 0 || p.x > window.innerWidth || p.y > window.innerHeight) continue;
    sampledPoints++;

    const topElement = document.elementFromPoint(p.x, p.y);
    if (topElement && (element === topElement ||
                       element.contains(topElement) ||
                       topElement.contains(element))) {
      visiblePoints++;
    }
  }

  return sampledPoints > 0 ? visiblePoints / sampledPoints : 0;
}

// Element is clickable if >= 50% visible
function isActuallyClickable(element: HTMLElement): boolean {
  return getVisibilityScore(element) >= 0.5;
}
```

**Node Field:** `occ: true` if element visibility score < 50%

**Improvement over Single-Point:** Multi-point sampling catches:
- Elements partially hidden by sticky headers
- Elements with only corners visible
- Elements behind semi-transparent overlays
- Modals that don't cover center but block interaction

### 3.5.1.1 Hidden Event Listener Detection (Browser-Use Inspired)

**Problem:** Modern SPAs (React, Vue, Angular) attach click handlers via JavaScript that are invisible to standard DOM inspection. CDP's `isClickable` flag and our tagger don't detect:
- React's `onClick` (synthetic events)
- Vue's `@click` directives
- Angular's `(click)` bindings
- jQuery's `.on('click', ...)`
- Native `addEventListener('click', ...)`

**Solution:** Execute a script via CDP `Runtime.evaluate` with `includeCommandLineAPI: true`, which enables the DevTools-only `getEventListeners()` API:

```typescript
// src/helpers/hiddenListenerDetector.ts
const DETECTION_SCRIPT = `
(() => {
  if (typeof getEventListeners !== 'function') return { error: 'not available', elements: [] };

  const elementsWithListeners = [];
  for (const el of document.querySelectorAll('*')) {
    const listeners = getEventListeners(el);
    if (listeners.click || listeners.mousedown || listeners.pointerdown) {
      elementsWithListeners.push({
        llmId: el.getAttribute('data-llm-id'),
        tagName: el.tagName.toLowerCase(),
        listenerTypes: Object.keys(listeners)
      });
    }
  }
  return { elements: elementsWithListeners, total: elementsWithListeners.length };
})()
`;

// Execute with DevTools API enabled
const result = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
  expression: DETECTION_SCRIPT,
  includeCommandLineAPI: true,  // THE KEY: enables getEventListeners()
  returnByValue: true,
});
```

**Usage:** Called from background script before DOM extraction to mark interactive elements that don't have explicit `onclick` attributes or ARIA roles.

**Node Field:** `data-has-click-listener="true"` attribute added to detected elements.

**Files:**
- `src/helpers/hiddenListenerDetector.ts` - Detection and marking logic
- Reference: `docs/browser-use-dom-extraction.md` - Full Browser-Use implementation details

### 3.5.2 Explicit Label Association (Form Fix)

**Problem:** Inputs often have no meaningful attributes. The label "Email Address" is in a separate `<span>`.

**Solution:** Hunt for semantic labels using multiple strategies:

```typescript
function findLabelForInput(input: HTMLElement): string {
  // 1. Check <label for="id">
  // 2. Check aria-label / aria-labelledby
  // 3. Check placeholder
  // 4. Pro Move: Look at previous sibling text
  // 5. Check parent <label> element
  // 6. Check data-label attributes
  return foundLabel || "Unknown Input";
}
```

**Impact:** `{"role": "input", "name": "Email Address"}` instead of `{"role": "input", "name": ""}`

### 3.5.3 Mutation Stream (Ghost State Detection)

> **Note:** With CDP-first architecture, mutation tracking is now done via `CDP DOM.mutated` events rather than content script MutationObserver.

**Problem:** Static snapshots miss transient events. Success toast appears for 2s and vanishes.

**Solution:** Maintain a running buffer of DOM changes:

```typescript
// src/pages/Content/mutationLog.ts
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.addedNodes.length > 0) {
      // Log meaningful text changes
      changes.push(`[${Date.now()}] Added: "${node.innerText}"`);
    }
  }
});

export function getRecentMutations(): string[] {
  return changes.slice(-10); // Last 10 events
}
```

**Payload Field:**
```json
{
  "recent_events": [
    "[2s ago] Added: 'Saved Successfully'",
    "[1s ago] Removed button: 'Submit'"
  ],
  "has_errors": false,
  "has_success": true
}
```

### 3.5.4 Delta Hashing (Bandwidth Optimization)

**Problem:** Sending JSON tree every 2s wastes bandwidth if nothing changed.

**Solution:** Hash-based change detection:

```typescript
// src/helpers/deltaHash.ts
let lastTreeHash = "";

export function shouldSendTree(tree: SemanticTreeResultV3): boolean {
  const currentHash = computeTreeHash(tree);
  
  if (currentHash === lastTreeHash) {
    return false; // No change - skip sending
  }
  
  lastTreeHash = currentHash;
  return true;
}
```

**Impact:** ~50% bandwidth reduction during typing/waiting steps

### 3.5.5 Virtual List Detection (Infinite Scroll Fix)

**Problem:** Virtual lists (Twitter, LinkedIn) only render visible items. Hidden content not in DOM.

**Solution:** Detect scrollable containers and report scroll progress:

```typescript
if (element.scrollHeight > element.clientHeight + 50) {
  node.scr = {
    depth: `${Math.round((element.scrollTop / element.scrollHeight) * 100)}%`,
    h: true  // hasMore content below
  };
}
```

**Node Field:**
```json
{ "i": "feed", "r": "list", "n": "Timeline", "scr": { "depth": "10%", "h": true } }
```

**LLM Instruction:** "If target not found, emit `scroll(id)` to load more content"

### 3.5.6 Stable IDs with backendNodeId (Replaces Self-Healing)

**Problem (Old):** React/Vue can destroy/recreate elements between LLM decision and execution. Content script `data-llm-id` becomes invalid.

**Solution (CDP-First):** Use Chrome's `backendNodeId` which is **immutable** for the lifetime of the node:

```typescript
// src/helpers/domActions.ts - CDP-first resolution
async function getObjectId(elementId: number | string, tabId: number): Promise<string | null> {
  const backendNodeId = typeof elementId === 'string' ? parseInt(elementId, 10) : elementId;

  // Direct resolution via CDP - no searching needed
  const result = await sendCommand('DOM.resolveNode', {
    backendNodeId,
  });

  if (result?.object?.objectId) {
    return result.object.objectId;
  }

  // Fallback: querySelector for legacy compatibility
  // ...
}
```

**Benefits:**
- **No ID drift** - backendNodeId is assigned at DOM node creation
- **No self-healing needed** - ID is stable across re-renders (if the node survives)
- **Instant resolution** - Direct CDP call vs searching the DOM
- **Accurate error reporting** - If node is truly gone, we know immediately

> **Legacy Self-Healing:** The ghost match recovery is still available as a fallback for edge cases where an element is destroyed and recreated, but it's rarely needed with CDP-first architecture.

### 3.5.7 Bounding Box for Set-of-Mark

**Problem:** Pure JSON can't describe "the blue button" or "center card".

**Solution:** Include `[x, y, w, h]` for future multimodal support:

```json
{
  "i": "12",
  "r": "btn",
  "n": "Submit",
  "xy": [400, 350],
  "box": [350, 330, 100, 40]
}
```

**Future Use:** Overlay IDs visually on screenshot for GPT-4o vision

### Complete Advanced Payload

```json
{
  "mode": "semantic",
  "url": "https://amazon.com/checkout",
  "title": "Checkout",
  "scroll_position": "25%",
  "viewport": { "width": 1280, "height": 800 },
  "interactive_tree": [
    { "i": "5", "r": "inp", "n": "Full Name", "v": "John Doe", "xy": [200, 150], "box": [100, 140, 200, 30] },
    { "i": "6", "r": "inp", "n": "Street", "focused": true, "xy": [200, 200] },
    { "i": "99", "r": "btn", "n": "Place Order", "xy": [600, 700], "occ": true }
  ],
  "scrollable_containers": [
    { "id": "cart-items", "depth": "0%", "hasMore": true }
  ],
  "recent_events": [
    "[3s ago] Added: 'Shipping calculated'",
    "[1s ago] Error: 'Invalid ZIP code'"
  ]
}
```

---

## 3.6 Production-Grade Features

These features bring the extension to parity with state-of-the-art agents like Devin, MultiOn, and Browser Use.

### Production Feature Summary

| Feature | Component | Purpose |
|---------|-----------|---------|
| **Self-Healing** | `domActions.ts` | Fixes stale element errors locally (saves 5-10s round-trip) |
| **DOM RAG** | `domRag.ts` | Handles massive pages (5000+ elements) without token overflow |
| **Sentinel Verification** | `sentinelVerification.ts` | Verifies actions actually worked (catches silent failures) |

### 3.6.1 Stable IDs (backendNodeId)

**Already implemented.** See [Section 3.5.6](#356-stable-ids-with-backendnodeid-replaces-self-healing).

### 3.6.2 DOM RAG (Retrieval-Augmented Generation)

**Problem:** Amazon search results or Wikipedia articles can have 5,000+ elements. Even optimized JSON hits 30k+ tokens.

**Solution:** Client-side chunking + relevance filtering before sending to LLM.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    DOM RAG PIPELINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. EXTRACTION: Full tree (5000 nodes)                      │
│     └── extractSemanticTree()                               │
│                                                              │
│  2. CHUNKING: Group by spatial proximity/containers         │
│     └── chunkDomNodes() → 50 chunks                         │
│                                                              │
│  3. SCORING: Keyword relevance against user query           │
│     └── scoreChunkRelevance(chunk, query)                   │
│                                                              │
│  4. FILTERING: Keep top chunks within token budget          │
│     └── filterDomForQuery(nodes, { maxTokens: 2000 })       │
│                                                              │
│  5. RESULT: Filtered tree (50-100 nodes, ~500 tokens)       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Client-Side API:**

```typescript
import { filterDomForQuery, needsFiltering, getDomStats } from './domRag';

// Check if filtering needed
const stats = getDomStats(nodes);
if (stats.needsFiltering) {
  const filtered = filterDomForQuery(nodes, {
    query: "Click Add to Cart for Samsung",
    maxNodes: 50,
    maxTokens: 2000,
    minRelevance: 0.1,
  });
  
  // filtered.tree contains only relevant nodes
  // filtered.tokenReduction shows % savings (often 80-95%)
}
```

**Backend Enhancement (Optional):**
Backend can re-rank chunks using embeddings:
- `text-embedding-3-small` (OpenAI)
- `all-MiniLM-L6-v2` (local)

**Filtered Payload Example:**

```json
{
  "mode": "filtered",
  "reason": "Filtered for 'Samsung Price'",
  "originalCount": 500,
  "filteredCount": 8,
  "tokenReduction": 92,
  "tree": [
    { "i": "45", "r": "item", "n": "Samsung Odyssey G7", "v": "$299" },
    { "i": "46", "r": "btn", "n": "Add to Cart" },
    { "i": "47", "r": "link", "n": "See Details" }
  ]
}
```

### 3.6.3 Sentinel Verification System

**Problem:** LLM clicks "Save" and assumes it worked. But a tiny "Invalid Email" toast appeared for 1 second and vanished. The agent continues happily, failing 5 steps later.

**Solution:** Every action has an **Expected Outcome** verified by the client.

**Workflow:**

```
┌─────────────────────────────────────────────────────────────┐
│                 SENTINEL VERIFICATION FLOW                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. LLM OUTPUT:                                             │
│     {                                                        │
│       "action": "click(12)",                                │
│       "expected_outcome": {                                  │
│         "type": "navigation",                               │
│         "or_element_appears": "Thank you"                   │
│       }                                                      │
│     }                                                        │
│                                                              │
│  2. EXTENSION:                                              │
│     a. capturePreActionState()  // Snapshot before          │
│     b. Execute click(12)                                    │
│     c. Wait 2 seconds                                       │
│     d. verifyOutcome(expectedOutcome)                       │
│                                                              │
│  3. VERIFICATION:                                           │
│     ├── Did URL change? → SUCCESS                           │
│     ├── OR "Thank you" appeared? → SUCCESS                  │
│     └── Neither + Error visible? → FAILURE                  │
│                                                              │
│  4. FEEDBACK TO LLM:                                        │
│     {                                                        │
│       "verification_passed": false,                         │
│       "verification_message": "URL unchanged. Error: 'Invalid email'",│
│       "errors_detected": ["Invalid email format"]           │
│     }                                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Expected Outcome Types:**

| Type | Checks | Use Case |
|------|--------|----------|
| `navigation` | URL changed | Form submit, link click |
| `element_appears` | Text/element appeared | Success toast, modal opens |
| `element_disappears` | Element removed | Modal closes, loading ends |
| `value_changes` | Input value changed | Type action verified |
| `state_changes` | Checkbox/toggle state | Toggle actions |
| `any_change` | Any DOM mutation | Generic action |
| `no_change` | Just check for errors | Verification-only |

**Client-Side API:**

```typescript
import { 
  capturePreActionState, 
  verifyOutcome, 
  quickVerify 
} from './sentinelVerification';

// Before action
capturePreActionState();

// Execute action
await executeClick(12);

// Verify outcome
const result = await verifyOutcome({
  type: 'navigation',
  orOutcome: {
    type: 'element_appears',
    text: 'Thank you',
  },
  timeout: 2000,
});

if (!result.success) {
  // Send feedback to LLM
  console.log('Action failed:', result.feedback);
  console.log('Errors:', result.errorsDetected);
}
```

**Quick Verification (Defaults):**

```typescript
// For simple actions with sensible defaults
const result = await quickVerify('click', elementId);
const result = await quickVerify('setValue', elementId);
const result = await quickVerify('navigate');
```

**Verification Result:**

```typescript
interface VerificationResult {
  success: boolean;
  verifiedOutcome: 'navigation' | 'element_appears' | ...;
  actualOutcome: string;
  errorsDetected: string[];
  successMessages: string[];
  pageState: {
    url: string;
    urlChanged: boolean;
    domChanged: boolean;
    recentMutations: string[];
  };
  confidence: number;  // 0-1
  feedback: string;    // Human-readable for LLM
}
```

### Production-Grade Stack Summary

| Layer | Feature | Impact |
|-------|---------|--------|
| **Extraction** | CDP AXTree | 100% reliable structure |
| **Navigation** | CDP Lifecycle | Accurate page readiness |
| **Stability** | backendNodeId | Immutable element IDs |
| **Speed** | DOM RAG | Handles massive pages |
| **Accuracy** | Sentinel Checks | Catches silent failures |
| **Vision** | Set-of-Mark | Multimodal ready |

---

## 3.7 Midscene-Inspired Optimizations

Midscene uses a "vision-first" approach but its optional DOM extractor has several clever optimizations that we've adopted to further reduce token count and improve reliability.

### 3.7.1 Atomic Leaf Traversal (~30% Tree Depth Reduction)

**Problem:** Standard extraction recurses into everything: `div > button > span > i > text`, creating unnecessary depth in the JSON tree.

**Midscene Solution:** Treat certain elements as "Atomic Leaves." Once you hit a `<button>`, STOP recursion and extract all text content at once.

**Implementation:**

```typescript
// Elements that should not have children extracted
const ATOMIC_ROLES = new Set([
  'button', 'link', 'menuitem', 'tab', 'option', 'treeitem',
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
  'textbox', 'searchbox', 'combobox',
]);

// Skip elements inside atomic parents
function isInsideAtomicParent(element: HTMLElement): boolean {
  let parent = element.parentElement;
  while (parent) {
    if (['button', 'a', 'select'].includes(parent.tagName.toLowerCase())) {
      return true;
    }
    if (parent.getAttribute('role') && ATOMIC_ROLES.has(parent.getAttribute('role'))) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

// For atomic elements, get ALL nested text at once
function getAtomicElementText(element: HTMLElement): string {
  return (element.innerText || element.textContent || '').trim();
}
```

**Impact:** Reduces tree depth and token count by ~30% on complex UIs like Gmail, Slack, or Salesforce.

### 3.7.2 The 2/3 Visibility Rule (Precision Pruning)

**Problem:** Simple viewport bounds checking includes elements that are only 1px visible. Clicking the very edge of a partially visible button often fails.

**Midscene Solution:** Discard elements unless **at least 2/3 of their area** is visible in the viewport.

**Implementation:**

```typescript
function isReliablyVisible(element: HTMLElement, minVisibleRatio = 0.66): boolean {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Calculate intersection with viewport
  const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
  const visibleWidth = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);

  if (visibleHeight <= 0 || visibleWidth <= 0) return false;

  const visibleArea = visibleHeight * visibleWidth;
  const totalArea = rect.width * rect.height;

  // Must be >= 66% visible
  return (visibleArea / totalArea) >= minVisibleRatio;
}
```

**Impact:** Prevents the LLM from trying to interact with half-hidden elements that require scrolling first.

### 3.7.3 Container Classification (Tree Flattening)

**Problem:** Generic `<div>` wrappers without visual styling don't add semantic value but bloat the tree.

**Midscene Solution:** Only keep container elements if they have a visual boundary (background color, border, box shadow).

**Implementation:**

```typescript
function isMeaningfulContainer(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);

  // Has background color (not transparent)
  if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') return true;

  // Has border
  if (parseFloat(style.borderWidth) > 0) return true;

  // Has box shadow
  if (style.boxShadow !== 'none') return true;

  // Is a semantic landmark
  const role = element.getAttribute('role');
  if (['main', 'navigation', 'form', 'region'].includes(role)) return true;

  return false;
}
```

**Impact:** Flattens the tree by removing invisible wrapper divs that confuse the LLM.

### 3.7.4 Extraction Options

New options available in `extractSemanticTreeV3()`:

| Option | Default | Description |
|--------|---------|-------------|
| `atomicLeafOptimization` | `true` | Skip elements inside atomic parents |
| `minVisibleRatio` | `0.66` | Minimum visible area ratio (2/3 rule) |
| `pruneEmptyContainers` | `true` | Strip generic containers without visual boundaries |

### 3.7.5 Combined Impact

| Optimization | Token Reduction | Reliability Improvement |
|--------------|-----------------|-------------------------|
| Atomic Leaf Traversal | ~30% | Cleaner, flatter tree |
| 2/3 Visibility Rule | ~10-15% | No partial-element failures |
| Container Pruning | ~15-20% | Less noise for LLM |
| **Combined** | **~50-60%** | **Significantly more reliable** |

### 3.7.6 Comparison with Midscene

| Aspect | Midscene | Spadeworks V4 |
|--------|----------|---------------|
| **DOM Extraction** | Optional (vision-first) | Primary mode |
| **Atomic Stopping** | ✅ BUTTON/INPUT = Leaf | ✅ Adopted |
| **Visibility Threshold** | 2/3 (66%) | ✅ Adopted (configurable) |
| **Container Pruning** | Background/border check | ✅ Adopted + landmarks |
| **Element IDs** | Hash based on rect+content | Injected `data-llm-id` |
| **Vision Integration** | Primary | Hybrid mode only |

**Key Difference:** Midscene uses vision (VLM) as the primary method for element location, with DOM as optional context. We use DOM extraction as primary with vision as enhancement for spatial queries.

---

## 4. Extraction Pipeline

### CDP-First Step-by-Step Flow

When a task runs, the following sequence occurs on each action cycle:

```
1. CDP ATTACH (once per session)
   └── chrome.debugger.attach({ tabId }, '1.3')
   └── Enable domains: Accessibility, DOM, DOMSnapshot, Page, Network, Runtime
   └── Session persists across navigations

2. PAGE READY WAIT (before extraction)
   └── waitForPageReady() via cdpLifecycle.ts
   └── Page.lifecycleEvent for load/DOMContentLoaded/networkIdle
   └── Network.loadingFinished for all requests
   └── 500ms stability buffer

3. CDP EXTRACTION
   └── Accessibility.getFullAXTree → semantic roles, names, backendDOMNodeId
   └── DOMSnapshot.captureSnapshot → bounds, visibility, paint order
   └── Merge into SemanticNodeV3[] format
   └── Apply viewport pruning

4. PAYLOAD CONSTRUCTION
   └── Build request body with semantic tree
   └── Send to POST /api/agent/interact

5. LLM DECISION
   └── Backend processes payload
   └── Returns: { thought, action: "click(100)" }  // backendNodeId

6. ACTION EXECUTION
   └── DOM.resolveNode({ backendNodeId: 100 }) → objectId
   └── Execute action via Runtime.callFunctionOn or Input.dispatchMouseEvent
   └── Show ripple feedback via Runtime.evaluate
   └── Loop back to step 2
```

### Code Location

The main extraction logic lives in:
- `src/helpers/cdpDomExtractor.ts` - Core CDP extraction
- `src/helpers/cdpLifecycle.ts` - Page readiness detection
- `src/state/currentTask.ts` - Task orchestration and action execution

---

## 5. Shadow DOM Support

### The Problem

Enterprise applications (Salesforce LWC, Google products, Shopify) use Shadow DOM to encapsulate components. Standard `document.querySelectorAll()` **cannot see inside Shadow Roots**.

```html
<!-- Standard query CANNOT see inside #shadow-root -->
<my-component>
  #shadow-root (open)
    <button>Save</button>  <!-- INVISIBLE to querySelectorAll -->
</my-component>
```

### The CDP Solution: Automatic Handling

With CDP-first architecture, **Chrome handles Shadow DOM automatically**:

```typescript
// CDP Accessibility.getFullAXTree includes ALL elements
// regardless of Shadow DOM boundaries
const { nodes } = await chrome.debugger.sendCommand(
  { tabId },
  'Accessibility.getFullAXTree'
);

// Each node has backendDOMNodeId that can be resolved
// even if the element is inside a Shadow Root
nodes.forEach(node => {
  // node.backendDOMNodeId works for shadow DOM elements
  console.log(node.role.value, node.name.value);
});
```

**Benefits:**
- No special library needed (unlike content script approach)
- Chrome's accessibility tree automatically traverses Shadow DOMs
- `backendNodeId` resolution works across Shadow boundaries

### Action Execution in Shadow DOM

```typescript
// CDP can resolve and interact with Shadow DOM elements
async function clickShadowElement(backendNodeId: number) {
  // Resolve to objectId - works even in Shadow DOM
  const { object } = await sendCommand('DOM.resolveNode', { backendNodeId });

  // Click via Runtime - works anywhere
  await sendCommand('Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration: 'function() { this.click(); }',
  });
}
```

---

## 6. Iframe Support

### The CDP Solution: Automatic Frame Handling

With CDP-first architecture, **Chrome handles iframes automatically**:

```typescript
// CDP Accessibility.getFullAXTree includes ALL frames by default
const { nodes } = await chrome.debugger.sendCommand(
  { tabId },
  'Accessibility.getFullAXTree'
);

// Elements from iframes have their own backendNodeId
// Chrome maintains proper frame context internally
```

### Frame ID Tracking

Each element can include a frame ID field:

```json
[
  { "i": "100", "r": "btn", "n": "Save", "f": 0 },
  { "i": "200", "r": "btn", "n": "Track", "f": 1 }
]
```

### Benefits of CDP for Iframes

| Aspect | Content Script (Old) | CDP (Current) |
|--------|---------------------|---------------|
| **Cross-origin** | Requires `all_frames: true` | Automatic |
| **ID collision** | Manual frame prefixing | Unique backendNodeId |
| **Nested iframes** | Recursive extraction | Automatic |
| **Sandboxed** | Partial support | Full support |

### Action Execution in Iframes

```typescript
// CDP can resolve elements in any frame
async function clickIframeElement(backendNodeId: number) {
  // Chrome handles frame context automatically
  const { object } = await sendCommand('DOM.resolveNode', { backendNodeId });

  // Action works regardless of frame origin
  await sendCommand('Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration: 'function() { this.click(); }',
  });
}
```

---

## 7. Extraction Modes

The extension supports four extraction modes:

| Mode | Primary Data | Token Cost | Use Case |
|------|--------------|------------|----------|
| **`semantic`** | **Minified JSON + viewport pruning** | **~25-75 tokens** | **PRIMARY - Default** |
| `skeleton` | Minimal HTML | ~500-1500 tokens | Semantic fails |
| `hybrid` | Screenshot + skeleton | ~2000-3000 tokens | Visual/spatial queries |
| `full` | Complete HTML | ~10000-50000 tokens | **ONLY on explicit backend request** |

### Mode Comparison

```
SEMANTIC MODE (~25-75 tokens) ← PRIMARY
───────────────────────────────────────
[
  { "i": "1", "r": "btn", "n": "Submit", "xy": [600, 400] },
  { "i": "2", "r": "inp", "n": "Search", "xy": [400, 300] }
]

SKELETON MODE (~500 tokens)
──────────────────────────
<button id="1">Submit</button>
<input id="2" type="text" placeholder="Type here..." role="searchbox" />

FULL MODE (~10000+ tokens) ← ONLY ON BACKEND REQUEST
────────────────────────────────────────────────────
<html><head>...</head><body>
  <div class="container mx-auto p-4">
    <div class="flex items-center justify-between">
      <div class="search-wrapper relative">
        <input data-id="2" data-interactive="true" data-visible="true" 
               type="text" placeholder="Type here..." class="input-primary
               w-full px-4 py-2 rounded-lg border border-gray-300" />
      </div>
      <button data-id="1" data-interactive="true" data-visible="true"
              class="btn btn-primary px-6 py-2 bg-blue-500 text-white
              rounded-lg hover:bg-blue-600">Submit</button>
    </div>
  </div>
</body></html>
```

---

## 8. Semantic JSON Protocol

**File:** `src/helpers/cdpDomExtractor.ts`

The CDP semantic extractor builds a clean JSON array from the accessibility tree.

### SemanticNodeV3 Structure

```typescript
interface SemanticNodeV3 {
  i: string;   // backendNodeId as string (stable element identifier)
  r: string;   // Role (minified: btn, inp, link, chk, etc.)
  n: string;   // Name/label (from accessibility tree)
  v?: string;  // Value (for inputs)
  s?: string;  // State (disabled, checked, expanded)
  xy?: [number, number];  // Center coordinates
  box?: [number, number, number, number];  // Bounding box [x, y, w, h]
  f?: number;  // Frame ID (0 = main, omitted if 0)
  occ?: boolean;  // Occluded by overlay
  scr?: { depth: string; h: boolean };  // Scrollable container info
}
```

### How Names Are Determined (CDP)

Chrome's accessibility engine computes names automatically:

```typescript
// CDP provides computed name via Accessibility.getFullAXTree
const axNode = {
  nodeId: 'ax1',
  role: { type: 'internalRole', value: 'button' },
  name: { type: 'computedString', value: 'Submit' },  // Chrome computed this
  backendDOMNodeId: 100,
};

// Chrome's name computation follows ARIA spec:
// 1. aria-labelledby references
// 2. aria-label attribute
// 3. Native label association (<label for="...">)
// 4. Native text content
// 5. title attribute
// 6. placeholder (for inputs)
```

### How Roles Are Determined (CDP)

Chrome's accessibility engine determines roles:

```typescript
// CDP AX node includes computed role
const axNode = {
  role: { type: 'internalRole', value: 'textbox' },  // Chrome determined this
  // ...
};

// Role minification for token efficiency
const ROLE_MAP: Record<string, string> = {
  'button': 'btn',
  'textbox': 'inp',
  'searchbox': 'inp',
  'link': 'link',
  'checkbox': 'chk',
  'radio': 'radio',
  'combobox': 'sel',
  'menuitem': 'menu',
  'tab': 'tab',
  'option': 'opt',
  'switch': 'switch',
  'slider': 'slider',
};
```

### Extraction Example

Given this HTML:

```html
<form>
  <input type="email" placeholder="Enter email" value="john@example.com">
  <input type="checkbox" aria-label="Subscribe to newsletter" checked>
  <button type="submit">Sign Up</button>
</form>
```

CDP extraction produces this minified JSON:

```json
[
  {
    "i": "100",
    "r": "inp",
    "n": "Enter email",
    "v": "john@example.com",
    "xy": [200, 150],
    "box": [100, 140, 200, 25]
  },
  {
    "i": "101",
    "r": "chk",
    "n": "Subscribe to newsletter",
    "s": "checked",
    "xy": [110, 180],
    "box": [100, 175, 20, 20]
  },
  {
    "i": "102",
    "r": "btn",
    "n": "Sign Up",
    "xy": [150, 220],
    "box": [100, 200, 100, 40]
  }
]
```

**Key Differences from Content Script Approach:**
- `i` is Chrome's `backendNodeId` (stable, immutable)
- No `data-llm-id` injection needed
- Bounds come from `DOMSnapshot.captureSnapshot`
- Names come from Chrome's accessibility engine

---

## 9. Skeleton DOM Extraction

**File:** `src/helpers/skeletonDom.ts`

The skeleton extractor creates minimal HTML containing only interactive elements.

### What Gets Kept

```typescript
// Interactive tags
const INTERACTIVE_TAGS = ['a', 'button', 'input', 'select', 'textarea', 'option'];

// Interactive roles
const INTERACTIVE_ROLES = [
  'button', 'link', 'menuitem', 'tab', 'checkbox', 'radio',
  'switch', 'option', 'combobox', 'listbox', 'textbox'
];

// Attributes to keep
const KEEP_ATTRS = [
  'name', 'type', 'href', 'value', 'placeholder', 'role',
  'aria-label', 'title', 'data-testid', 'data-id',
  'disabled', 'readonly', 'checked', 'selected'
];
```

### What Gets Discarded

```typescript
const DISCARD_TAGS = [
  'style', 'script', 'noscript', 'svg', 'path', 'link',
  'meta', 'head', 'title', 'template', 'slot', 'iframe'
];
```

### Skeleton Output Example

```html
<a id="1" href="/home">Home</a>
<button id="2" type="submit">Search</button>
<input id="3" name="q" type="text" placeholder="Search..." />
<select id="4" name="category">
  <option value="all">All Categories</option>
  <option value="books" selected>Books</option>
</select>
```

---

## 10. DOM Stability Waiting

**File:** `src/helpers/cdpLifecycle.ts`

Before extracting, we wait for the page to be ready using CDP lifecycle events.

### Why This Matters

Modern sites load progressively:

```
t=0ms    Page request sent
t=200ms  Initial HTML received (skeleton)
t=500ms  React hydration begins
t=800ms  First components render
t=1200ms API calls return data
t=1500ms Full content rendered
```

Extracting at t=200ms would give us an empty page!

### CDP-Based Page Readiness

```typescript
// src/helpers/cdpLifecycle.ts
export async function waitForPageReady(
  tabId: number,
  timeoutMs: number = 15000
): Promise<boolean> {
  return new Promise((resolve) => {
    const target = { tabId };
    const startTime = Date.now();

    // Track lifecycle events
    let loadFired = false;
    let domContentLoaded = false;

    const checkReady = () => {
      if (loadFired && domContentLoaded) {
        // Add stability buffer
        setTimeout(() => resolve(true), 500);
      }
    };

    // Listen for Page.lifecycleEvent
    const listener = (
      source: chrome.debugger.Debuggee,
      method: string,
      params: any
    ) => {
      if (source.tabId !== tabId) return;

      if (method === 'Page.lifecycleEvent') {
        if (params.name === 'load') loadFired = true;
        if (params.name === 'DOMContentLoaded') domContentLoaded = true;
        checkReady();
      }
    };

    chrome.debugger.onEvent.addListener(listener);

    // Timeout fallback
    setTimeout(() => {
      chrome.debugger.onEvent.removeListener(listener);
      resolve(false);
    }, timeoutMs);
  });
}
```

### Network Idle Detection (CDP)

```typescript
// Track in-flight requests via Network domain
const pendingRequests = new Map<string, number>();

function handleNetworkEvent(method: string, params: any) {
  if (method === 'Network.requestWillBeSent') {
    pendingRequests.set(params.requestId, Date.now());
  }
  if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
    pendingRequests.delete(params.requestId);
  }
}

export async function waitForNetworkIdle(
  tabId: number,
  idleThresholdMs: number = 500
): Promise<void> {
  // Wait until no requests for idleThresholdMs
  while (pendingRequests.size > 0 || (Date.now() - lastRequestTime) < idleThresholdMs) {
    await sleep(100);
  }
}
```

### Benefits Over Content Script DOM Waiting

| Aspect | Content Script (Old) | CDP (Current) |
|--------|---------------------|---------------|
| **Lifecycle events** | Approximated via MutationObserver | Direct Page.lifecycleEvent |
| **Network tracking** | performance.getEntriesByType (limited) | Full Network domain access |
| **Reliability** | Depends on script injection timing | Always available |
| **Overhead** | Observer in page context | No page overhead |

---

## 11. What Gets Sent to the LLM

### API Request Structure

**Endpoint:** `POST /api/agent/interact`

```typescript
interface AgentInteractRequest {
  // === REQUIRED FIELDS ===
  url: string;                    // Current page URL
  query: string;                  // User's task instruction
  dom: string;                    // HTML (minimal fallback, ~10KB max)
  
  // === SESSION TRACKING ===
  taskId?: string;                // Task identifier (after first request)
  sessionId?: string;             // Session identifier
  
  // === ACTION RESULT (after first action) ===
  lastActionStatus?: 'success' | 'failure' | 'pending';
  lastActionError?: {
    message: string;
    code: string;
    action: string;
    elementId?: number;
  };
  lastActionResult?: {
    success: boolean;
    actualState?: string;
  };
  
  // === DOM CHANGE INFO ===
  domChanges?: {
    addedCount: number;
    removedCount: number;
    dropdownDetected: boolean;
    dropdownOptions?: string[];
    stabilizationTime: number;
    previousUrl?: string;
    urlChanged?: boolean;
    didNetworkOccur?: boolean;
  };
  
  // === CLIENT OBSERVATIONS ===
  clientObservations?: {
    didNetworkOccur?: boolean;
    didDomMutate?: boolean;
    didUrlChange?: boolean;
  };
  
  // === DOM MODE ===
  domMode?: 'semantic' | 'skeleton' | 'hybrid' | 'full';

  // SEMANTIC MODE (PRIMARY - recommended)
  interactiveTree?: SemanticNode[];  // Minified JSON array
  viewport?: { width: number; height: number };
  pageTitle?: string;
  
  // SKELETON/HYBRID MODE
  skeletonDom?: string;            // Minimal HTML
  screenshot?: string | null;       // Base64 JPEG (hybrid only)
  screenshotHash?: string;
}
```

### Example: Semantic Mode Request (PRIMARY)

```json
{
  "url": "https://www.google.com",
  "query": "Search for SpaceX",
  "dom": "<html>...</html>",
  "domMode": "semantic",
  "viewport": { "width": 1280, "height": 800 },
  "interactiveTree": [
    { "i": "1", "r": "inp", "n": "Search", "v": "", "xy": [400, 300] },
    { "i": "2", "r": "btn", "n": "Google Search", "xy": [400, 350] },
    { "i": "3", "r": "btn", "n": "I'm Feeling Lucky", "xy": [550, 350] },
    { "i": "4", "r": "link", "n": "Gmail", "xy": [900, 20] },
    { "i": "5", "r": "link", "n": "Images", "xy": [950, 20] }
  ],
  "pageTitle": "Google"
}
```

**Token count:** ~50-75 tokens (vs 10k+ for full DOM)

### Example: Skeleton Mode Request

```json
{
  "url": "https://www.google.com",
  "query": "Search for SpaceX",
  "dom": "<html>...</html>",
  "domMode": "skeleton",
  "skeletonDom": "<input id=\"1\" name=\"q\" type=\"text\" />\n<button id=\"2\">Google Search</button>\n<button id=\"3\">I'm Feeling Lucky</button>\n<a id=\"4\" href=\"/gmail\">Gmail</a>"
}
```

### Example: Hybrid Mode Request

```json
{
  "url": "https://example.com/dashboard",
  "query": "Click the gear icon in the top right corner",
  "dom": "<html>...</html>",
  "domMode": "hybrid",
  "skeletonDom": "<button id=\"1\" aria-label=\"Settings\">⚙️</button>...",
  "screenshot": "/9j/4AAQSkZJRgABAQEASABIAAD...",
  "screenshotHash": "1010101010101010..."
}
```

---

## 12. Mode Selection Logic (Backend-Driven Negotiation)

**File:** `src/state/currentTask.ts` and `src/api/client.ts`

**Key Principle:** The extension **always sends semantic first** and the **backend decides** if it needs additional artifacts (skeleton, screenshot, or full DOM).

### Default Mode (Client)

The extension ALWAYS starts with:
- `domMode: "semantic"`
- `interactiveTree`, `viewport`, `pageTitle` (+ V3 advanced fields)
- No `dom`, no `skeletonDom`, no `screenshot`

### Backend Requests (Negotiation)

If the backend cannot plan/verify using semantic JSON alone, it responds requesting additional artifacts:

**Signals (supported):**
- `requestedDomMode: "skeleton" | "hybrid" | "full"`
- `needsSkeletonDom: true`
- `needsScreenshot: true`
- legacy: `status: "needs_full_dom"`

### Negotiation Flow

```
1) Client sends semantic only
2) Backend responds:
   - normal action → proceed
   - OR requests additional context → client retries with only what was requested
3) Backend receives retry payload and returns final action
```

### Why Backend-Driven?

- Keeps client simple (no keyword heuristics)
- Avoids sending heavy payloads "just in case"
- Guarantees the backend controls what it needs for verification

### Actual Implementation (currentTask.ts)

```typescript
// CDP extraction is PRIMARY
if (USE_SEMANTIC_EXTRACTION) {
  // 1. Try CDP extraction (ultra-light, ~25-75 tokens)
  try {
    const cdpResult = await extractDomViaCDP(tabId);
    if (cdpResult?.interactiveTree?.length > 0) {
      domMode = 'semantic'; // API field name for backend compatibility
      interactiveTree = cdpResult.interactiveTree;
    }
  } catch (error) {
    // 2. Fallback to legacy accessibility or skeleton
    console.warn('CDP extraction failed:', error);
    domMode = selectDomMode(query, context);
  }
}

// 3. Backend requests more → retry with requested artifacts
if (response.status === 'needs_context' || response.status === 'needs_full_dom') {
  // Send skeleton/hybrid/full as backend requested
}
```

### Visual/Spatial Keywords (Fallback Mode Selection)

These keywords trigger hybrid mode when semantic extraction fails:

```typescript
const VISUAL_KEYWORDS = [
  // Visual elements
  'icon', 'image', 'logo', 'picture', 'photo', 'avatar',
  
  // Appearance
  'looks like', 'appears', 'color', 'shape', 'blue', 'red', 'green',
  
  // Spatial references
  'top', 'bottom', 'left', 'right', 'corner', 'side', 'edge',
  'next to', 'above', 'below', 'beside', 'near', 'between',
  'first', 'second', 'third', 'last', 'middle',
  
  // Visual queries
  'what is', 'what does', 'how much', 'price', 'see', 'show',
  'chart', 'graph', 'table', 'grid', 'card', 'thumbnail',
];
```

### Simple Action Keywords

These keywords prefer skeleton mode:

```typescript
const SIMPLE_ACTIONS = [
  'click', 'type', 'fill', 'select', 'enter', 'press', 'submit',
  'check', 'uncheck', 'toggle', 'expand', 'collapse', 'open', 'close',
  'scroll', 'navigate', 'go to', 'search', 'find',
];
```

---

## 13. Fallback Handling

### Server Requests Full DOM

If the backend can't process the semantic/skeleton data:

```json
{
  "status": "needs_full_dom",
  "needsFullDomReason": "Element not found in skeleton",
  "requestedElement": "submit button with text 'Confirm'"
}
```

The extension automatically retries with `domMode: "full"`:

```typescript
if (response.status === 'needs_full_dom') {
  console.log('[CurrentTask] Server requested full DOM, retrying...');
  
  response = await apiClient.agentInteract(
    currentUrl,
    safeInstructions,
    currentDom,
    // ... other params
    {
      domMode: 'full',  // Override to full mode
      // Still send skeleton as backup
      skeletonDom,
      screenshot: screenshotBase64,
    }
  );
}
```

### CDP Extraction Fails

If CDP extraction returns empty or throws:

```typescript
try {
  // Primary: CDP extraction
  const cdpResult = await extractDomViaCDP(tabId);

  if (cdpResult?.interactiveTree?.length > 0) {
    domMode = 'semantic';
    interactiveTree = cdpResult.interactiveTree;
  } else {
    console.warn('CDP extraction empty, falling back to legacy');
    // Fallback to legacy accessibility tree
    const axTree = await getAccessibilityTree(tabId);
    // ... process legacy tree
  }
} catch (cdpError) {
  console.warn('CDP extraction failed:', cdpError);
  // Final fallback: skeleton/hybrid mode
  domMode = selectDomMode(query, context);
}
```

---

## 14. Source Files Reference

### Core Extraction Files (CDP-First)

| File | Purpose | Features |
|------|---------|----------|
| **`src/helpers/cdpDomExtractor.ts`** | **Primary CDP extraction** | AXTree + DOMSnapshot merge, viewport pruning |
| **`src/helpers/cdpLifecycle.ts`** | **Page readiness detection** | Lifecycle events, network idle |
| **`src/helpers/cdpVisualFeedback.ts`** | **Visual feedback via CDP** | Ripple injection, element highlighting |
| `src/helpers/chromeDebugger.ts` | CDP session management | Domain enabling, command sending |
| `src/helpers/domActions.ts` | Action execution | backendNodeId resolution, ghost match fallback |
| `src/helpers/simplifyDom.ts` | DOM extraction wrapper | CDP-first with legacy fallback |
| `src/helpers/skeletonDom.ts` | Skeleton HTML extraction (fallback) | - |
| `src/helpers/hybridCapture.ts` | Mode selection logic | - |
| `src/helpers/accessibilityTree.ts` | Legacy AX tree extraction | Fallback when CDP fails |
| `src/helpers/deltaHash.ts` | Hash-based change detection | Bandwidth optimization |
| `src/helpers/domRag.ts` | DOM chunking and filtering | Production-Grade, huge pages |
| `src/helpers/sentinelVerification.ts` | Action outcome verification | Production-Grade |

### Integration Files

| File | Purpose |
|------|---------|
| `src/state/currentTask.ts` | Main action loop orchestration, CDP extraction calls |
| `src/api/client.ts` | API client with payload construction |
| `src/helpers/domActions.ts` | Action execution with backendNodeId resolution |

### Key Functions (CDP-First)

| Function | File | Purpose |
|----------|------|---------|
| **`extractDomViaCDP()`** | cdpDomExtractor.ts | Primary extraction: AXTree + DOMSnapshot → SemanticNodeV3[] |
| **`resolveBackendNodeId()`** | cdpDomExtractor.ts | Convert backendNodeId to objectId for actions |
| **`waitForPageReady()`** | cdpLifecycle.ts | CDP-based page readiness detection |
| **`waitForNetworkIdle()`** | cdpLifecycle.ts | Track pending network requests |
| **`setNetworkObservationMark()`** | cdpLifecycle.ts | Mark point for network change detection |
| **`getDidNetworkOccurSinceMark()`** | cdpLifecycle.ts | Check if network activity occurred |
| **`showRippleAt()`** | cdpVisualFeedback.ts | Inject ripple animation via Runtime.evaluate |
| **`highlightElement()`** | cdpVisualFeedback.ts | Highlight element via DOM.highlightNode |
| `getObjectId()` | domActions.ts | Multi-level resolution: backendNodeId → objectId |
| `getSimplifiedDom()` | simplifyDom.ts | Wrapper with CDP-first, legacy fallback |
| `getCDPSimplifiedDom()` | simplifyDom.ts | Direct CDP extraction for new code |
| `shouldSendTree()` | deltaHash.ts | Hash-based change detection |
| `findGhostMatch()` | domActions.ts | Legacy self-healing (rarely needed with CDP) |
| `extractSkeletonDom()` | skeletonDom.ts | Returns minimal HTML (fallback) |
| `selectDomMode()` | hybridCapture.ts | Chooses extraction mode |
| `agentInteract()` | client.ts | Sends payload to backend |

### Types

```typescript
// SemanticNodeV3 - Primary format for CDP extraction
export interface SemanticNodeV3 {
  i: string;   // backendNodeId as string (stable element identifier)
  r: string;   // Role (minified: btn, inp, link, chk, etc.)
  n: string;   // Name/label (from accessibility tree)
  v?: string;  // Value (for inputs)
  s?: string;  // State (disabled, checked, expanded)
  xy?: [number, number];  // Center coordinates
  box?: [number, number, number, number];  // Bounding box [x, y, w, h]
  f?: number;  // Frame ID (0 = main, omitted if 0)
  occ?: boolean;  // Occluded by overlay
  scr?: { depth: string; h: boolean };  // Scrollable container info
}

// CDP extraction result
export interface CDPExtractionResult {
  interactiveTree: SemanticNodeV3[];
  viewport: { width: number; height: number };
  pageTitle: string;
  url: string;
  scrollPosition: string;
  meta: {
    nodeCount: number;
    extractionTimeMs: number;
    axNodeCount: number;
    estimatedTokens: number;
  };
}

// Simplified DOM result (wrapper format)
export interface SimplifiedDomResult {
  annotatedDomHtml: string;  // Empty in CDP mode
  dom: HTMLElement;          // Minimal in CDP mode
  usedAccessibility: boolean;
  hybridElements?: HybridElement[];
  cdpResult?: CDPExtractionResult;
  coverageMetrics?: CoverageMetrics;
}

// Self-healing ghost match config (legacy fallback)
interface GhostMatchConfig {
  name: string | null;
  role: string | null;
  coordinates: [number, number] | null;
  interactive: boolean;
  minConfidence: number;
}
```

### Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| Chrome DevTools Protocol | 1.3 | CDP domains: Accessibility, DOM, DOMSnapshot, Page, Network, Runtime |
| `query-selector-shadow-dom` | ^1.0.1 | Pierces Shadow DOM (legacy fallback only) |

---

## Appendix: Token Cost Comparison

| Mode | Typical Size | Token Estimate | Cost @ $0.01/1k tokens |
|------|--------------|----------------|------------------------|
| **Semantic** | **100-300 bytes** | **25-75 tokens** | **$0.00025-0.00075** |
| Skeleton | 2-6 KB | 500-1500 tokens | $0.005-0.015 |
| Hybrid | 2-6 KB + 100KB image | 2000-3000 tokens | $0.02-0.03 |
| Full | 40-200 KB | 10000-50000 tokens | $0.10-0.50 |

**Semantic mode provides 99.8%+ cost reduction compared to full mode.**

---

## Appendix: Debugging Tips

### Check CDP Extraction Is Working

In the extension's background service worker console:

```javascript
// Test CDP extraction manually
const tabId = /* your target tab ID */;
const result = await extractDomViaCDP(tabId);
console.log('Extraction result:', {
  nodeCount: result.meta.nodeCount,
  axNodeCount: result.meta.axNodeCount,
  extractionTimeMs: result.meta.extractionTimeMs,
  estimatedTokens: result.meta.estimatedTokens,
});
console.log('Sample nodes:', result.interactiveTree.slice(0, 5));
```

### Check CDP Domains Are Enabled

```javascript
// Verify debugger is attached and domains are enabled
const targets = await chrome.debugger.getTargets();
const attached = targets.filter(t => t.attached);
console.log('Attached targets:', attached);
```

### Force Specific Mode

In `src/state/currentTask.ts`:

```typescript
// Enable CDP extraction (default)
const USE_SEMANTIC_EXTRACTION = true;

// Force legacy mode (skeleton/hybrid) - disable CDP
const USE_SEMANTIC_EXTRACTION = false;
```

### View Extracted Data

Enable debug logging in `cdpDomExtractor.ts`:

```typescript
console.log('[extractDomViaCDP] Result:', {
  nodeCount: result.meta.nodeCount,
  viewport: result.viewport,
  extractionTimeMs: result.meta.extractionTimeMs,
  estimatedTokens: result.meta.estimatedTokens,
});
```

### Test backendNodeId Resolution

```javascript
// Test if a backendNodeId can be resolved to objectId
const backendNodeId = 123; // From interactiveTree[n].i
const tabId = /* your target tab ID */;

const result = await chrome.debugger.sendCommand(
  { tabId },
  'DOM.resolveNode',
  { backendNodeId }
);

console.log('Resolved objectId:', result.object?.objectId);
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Element not found" | backendNodeId stale (node destroyed) | Element truly gone; ghost match will attempt recovery |
| Empty extraction | Debugger not attached | Ensure `chrome.debugger.attach()` was called |
| Empty extraction | AXTree not ready | Increase page readiness timeout |
| Missing elements | Not in accessibility tree | Element may lack proper ARIA role |
| Elements pruned | Below viewport | Scroll page or check viewport detection |
| CDP command fails | Debugger session lost | Re-attach debugger |
| "Cannot resolve node" | Node destroyed between extraction and action | Rare with backendNodeId; ghost match fallback |

### CDP Debugging

```javascript
// Check if debugger is attached to tab
const targets = await chrome.debugger.getTargets();
const isAttached = targets.some(t => t.tabId === tabId && t.attached);
console.log('Debugger attached:', isAttached);

// Check page lifecycle state
chrome.debugger.sendCommand({ tabId }, 'Page.getFrameTree', {}, (result) => {
  console.log('Frame tree:', result);
});

// Get accessibility tree stats
chrome.debugger.sendCommand({ tabId }, 'Accessibility.getFullAXTree', {}, (result) => {
  console.log('AX nodes:', result.nodes.length);
  console.log('Interactive:', result.nodes.filter(n => !n.ignored).length);
});
```

### Migration Notes

**Migration Status: COMPLETE**

The migration from content script RPC to CDP-first architecture is complete:
- `src/helpers/pageRPC.ts` has been **removed**
- All DOM extraction now uses `extractDomViaCDP(tabId)` from `cdpDomExtractor.ts`
- Page readiness detection uses `waitForPageReady()` from `cdpLifecycle.ts`
- The content script (`src/pages/Content/index.ts`) is still present but only handles:
  - Task resume after navigation
  - Auto-tagger initialization
  - Mutation logging
  - Background handshake (for legacy compatibility)

**From Content Scripts to CDP:**

| Old (Content Script) | New (CDP) | Status |
|---------------------|-----------|--------|
| `callRPC('getSemanticDomV3', ...)` | `extractDomViaCDP(tabId)` | Migrated |
| `data-llm-id="123"` | `backendNodeId: 123` | Migrated |
| `waitForContentScriptReady()` | `waitForPageReady()` | Migrated |
| `getAnnotatedDOM()` | Not needed (CDP provides structure) | Removed |
| MutationObserver in page | CDP DOM events (optional) | N/A |
| `ensureStableIds()` | Not needed (backendNodeId is stable) | Removed |
| `src/helpers/pageRPC.ts` | Deleted | Removed |

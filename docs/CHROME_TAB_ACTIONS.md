# Chrome Tab Actions Reference

**Document Version:** 1.0  
**Date:** January 27, 2026  
**Status:** Reference Documentation  
**Purpose:** Complete reference of all browser automation actions available for Chrome tabs

---

## Overview

This document provides a comprehensive reference for all browser automation actions that can be performed on Chrome tabs. Actions are organized by category and include both currently implemented actions and potential actions that can be implemented.

**Source:** Based on Browser-Use action library, Chrome Extension Debugger API, Chrome DevTools Protocol, Puppeteer, and Playwright capabilities.

**Note:** This document includes actions from multiple sources:
- **Browser-Use Library:** Original 21 actions from browser-use library
- **Chrome DevTools Protocol:** All CDP domain capabilities
- **Puppeteer:** High-level API methods from Puppeteer
- **Playwright:** Locator actions and API methods from Playwright
- **Chrome Extension APIs:** Native Chrome extension capabilities

---

## Table of Contents

1. [Navigation & Browser Control](#1-navigation--browser-control)
2. [Page Interaction](#2-page-interaction)
3. [Mouse & Touch Actions](#3-mouse--touch-actions)
4. [Keyboard Actions](#4-keyboard-actions)
5. [JavaScript Execution](#5-javascript-execution)
6. [Tab Management](#6-tab-management)
7. [Content Extraction](#7-content-extraction)
8. [Visual Analysis](#8-visual-analysis)
9. [Form Controls](#9-form-controls)
10. [Element Queries](#10-element-queries)
11. [Dialog Handling](#11-dialog-handling)
12. [Network Control](#12-network-control)
13. [Page Configuration](#13-page-configuration)
14. [Storage & Cookies](#14-storage--cookies)
15. [Performance & Tracing](#15-performance--tracing)
16. [File Operations](#16-file-operations)
17. [Task Completion](#17-task-completion)

---

## 1. Navigation & Browser Control

### 1.1 `search`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Search queries on search engines (DuckDuckGo, Google, Bing).

**Parameters:**
- `query` (string, required): Search query text
- `engine` (string, optional, default: `'duckduckgo'`): Search engine to use
  - Options: `'duckduckgo'`, `'google'`, `'bing'`

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeSearch()`
- Navigate to search engine URL with query parameters
- Format: `https://duckduckgo.com/?q={query}` or equivalent
- Uses `executeNavigate()` internally

**Example:**
```typescript
search({ query: "React hooks", engine: "google" })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeSearch()`
- `src/helpers/availableActions.ts` - Action definition

---

### 1.2 `navigate`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Navigate to a specific URL.

**Parameters:**
- `url` (string, required): Target URL to navigate to
- `newTab` (boolean, optional, default: `false`): Open in new tab if true

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeNavigate()`
- Use `chrome.tabs.update()` for current tab navigation
- Use `chrome.tabs.create()` for new tab
- Waits 2 seconds after navigation for page to load

**Example:**
```typescript
navigate({ url: "https://example.com", newTab: false })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeNavigate()`
- `src/helpers/availableActions.ts` - Action definition

---

### 1.3 `go_back` / `goBack`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Navigate back in browser history.

**Parameters:** None

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeGoBack()`
- Uses Chrome Debugger API `Page.goBack`
- Automatically enables Page domain if needed
- Waits 2 seconds after navigation

**Example:**
```typescript
goBack()
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeGoBack()`
- `src/helpers/availableActions.ts` - Action definition

---

### 1.4 `wait`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Wait for specified duration (useful for page loading, animations).

**Parameters:**
- `seconds` (number, optional, default: `3`): Number of seconds to wait
  - Maximum: 30 seconds (safety limit enforced)

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeWait()`
- Uses `sleep()` utility function
- Enforces maximum wait time of 30 seconds to prevent infinite waits
- Automatically caps wait time at maximum

**Example:**
```typescript
wait({ seconds: 5 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeWait()`
- `src/helpers/availableActions.ts` - Action definition

---

## 2. Page Interaction

### 2.1 `click`

**Status:** ✅ Currently Implemented  
**Description:** Click elements by index or coordinates.

**Parameters:**
- `index` (integer, optional): Element index in simplified DOM
- `coordinate_x` (integer, optional): X coordinate for coordinate-based clicking
- `coordinate_y` (integer, optional): Y coordinate for coordinate-based clicking

**Implementation Notes:**
- **Current Implementation:** Uses element index from simplified DOM
- **Coordinate Clicking:** Enabled for certain models (claude-sonnet-4-5, claude-opus-4-5, gemini-3-pro, browser-use/*)
- Use Chrome Debugger API `Runtime.evaluate` to execute click events
- Handle both mouse events and accessibility tree interactions

**Example:**
```typescript
click({ index: 68 })  // Click element #68
click({ coordinate_x: 100, coordinate_y: 200 })  // Click at coordinates
```

**Current Implementation Location:**
- `src/helpers/chromeDebugger.ts` - `executeClick()`
- `src/helpers/availableActions.ts` - Action definition

---

### 2.2 `input` / `setValue`

**Status:** ✅ Currently Implemented  
**Description:** Input text into form fields (inputs, textareas).

**Parameters:**
- `index` (integer, required): Element index in simplified DOM
- `text` (string, required): Text to input
- `clear` (boolean, optional, default: `true`): Clear existing value before input

**Implementation Notes:**
- **Current Implementation:** Uses `setValue` action name
- Clear field value first if `clear` is true
- Set value via Chrome Debugger API `Runtime.evaluate`
- Handle both `value` property and `textContent` for different input types

**Example:**
```typescript
setValue({ index: 42, text: "Hello World", clear: true })
```

**Current Implementation Location:**
- `src/helpers/chromeDebugger.ts` - `executeSetValue()`
- `src/helpers/availableActions.ts` - Action definition

---

### 2.3 `upload_file`

**Status:** ⚠️ Partially Implementable  
**Description:** Upload files to file input elements.

**Parameters:**
- `index` (integer, required): File input element index
- `path` (string, required): File path to upload

**Implementation Notes:**
- **Chrome Extension Limitation:** Direct file uploads from extension context are restricted
- **Workaround Options:**
  1. Use Chrome Debugger API to set file input value (limited by browser security)
  2. Use `chrome.tabs.executeScript` to trigger file picker (requires user interaction)
  3. Convert file to base64 and inject via JavaScript (for small files)
- **Recommendation:** May require user interaction or server-side file handling

**Example:**
```typescript
upload_file({ index: 10, path: "/path/to/file.pdf" })
```

---

### 2.4 `scroll`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Scroll the page up/down by pages.

**Parameters:**
- `down` (boolean, optional, default: `true`): Scroll direction (true = down, false = up)
- `pages` (number, optional, default: `1.0`): Number of pages to scroll
- `index` (number, optional): Element index for scrollable containers

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeScroll()`
- Uses `window.scrollBy()` or `element.scrollBy()` via Chrome Debugger API
- Calculates scroll amount: `window.innerHeight * pages` or `element.clientHeight * pages`
- Supports both window scrolling and element-specific scrolling
- Waits 500ms after scrolling for page to settle

**Example:**
```typescript
scroll({ down: true, pages: 2.0 })  // Scroll down 2 pages
scroll({ down: false, pages: 0.5, index: 15 })  // Scroll up 0.5 pages in element #15
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeScroll()`
- `src/helpers/availableActions.ts` - Action definition

---

### 2.5 `findText` / `find_text`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Scroll to specific text on the page.

**Parameters:**
- `text` (string, required): Text to find and scroll to

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeFindText()`
- Uses `TreeWalker` API to search text nodes
- Scrolls element into view using `scrollIntoView()` with smooth behavior
- Handles case-sensitive matching
- Waits 500ms after scrolling

**Example:**
```typescript
findText({ text: "Submit" })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeFindText()`
- `src/helpers/availableActions.ts` - Action definition

---

### 2.6 `send_keys`

**Status:** ✅ Implementable  
**Description:** Send special keys or keyboard shortcuts.

**Parameters:**
- `keys` (string, required): Key combination to send
  - Examples: `"Enter"`, `"Escape"`, `"PageDown"`, `"Control+o"`, `"Tab"`

**Implementation Notes:**
- Use Chrome Debugger API to dispatch keyboard events
- Support special keys: Enter, Escape, Tab, Arrow keys, PageUp, PageDown, etc.
- Support key combinations: Control+key, Alt+key, Shift+key, Meta+key
- Map string keys to `KeyboardEvent` key codes

**Example:**
```typescript
send_keys({ keys: "Enter" })
send_keys({ keys: "Control+s" })  // Save shortcut
send_keys({ keys: "Escape" })
```

---

## 3. Mouse & Touch Actions

### 3.1 `hover`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Hover mouse over an element (triggers hover states, tooltips, dropdowns).

**Parameters:**
- `index` (number, required): Element index to hover over

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeHover()`
- Uses Chrome Debugger API `Input.dispatchMouseEvent` with `mouseMoved` event
- Scrolls element into view before hovering
- Calculates center coordinates of element
- Waits 300ms after hover for UI to update

**Example:**
```typescript
hover({ index: 42 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeHover()`
- `src/helpers/availableActions.ts` - Action definition

---

### 3.2 `doubleClick` / `dblclick`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Double-click an element.

**Parameters:**
- `index` (number, required): Element index to double-click

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeDoubleClick()`
- Uses Chrome Debugger API `Input.dispatchMouseEvent` with `mousePressed` and `mouseReleased` events (twice)
- Scrolls element into view before clicking
- Calculates center coordinates
- Sets `clickCount: 1` for first click, `clickCount: 2` for second click
- Waits 500ms after double-click

**Example:**
```typescript
doubleClick({ index: 15 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeDoubleClick()`
- `src/helpers/availableActions.ts` - Action definition

---

### 3.3 `rightClick` / `contextMenu`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Right-click an element (opens context menu).

**Parameters:**
- `index` (number, required): Element index to right-click

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeRightClick()`
- Uses Chrome Debugger API `Input.dispatchMouseEvent` with `button: 'right'`
- Scrolls element into view before clicking
- Calculates center coordinates
- Waits 500ms after right-click

**Example:**
```typescript
rightClick({ index: 20 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeRightClick()`
- `src/helpers/availableActions.ts` - Action definition

---

### 3.4 `dragAndDrop`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Drag an element and drop it on another element.

**Parameters:**
- `sourceIndex` (number, required): Source element index
- `targetIndex` (number, required): Target element index

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeDragAndDrop()`
- Uses Chrome Debugger API `Input.dispatchMouseEvent` sequence:
  1. `mousePressed` on source
  2. `mouseMoved` to target (with 100ms delay)
  3. `mouseReleased` on target
- Scrolls source element into view first
- Calculates center coordinates for both elements
- Waits between events for proper drag sequence
- Waits 500ms after drop

**Example:**
```typescript
dragAndDrop({ sourceIndex: 10, targetIndex: 25 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeDragAndDrop()`
- `src/helpers/availableActions.ts` - Action definition

---

### 3.5 `tap` (Touch)

**Status:** ✅ Implementable  
**Description:** Tap an element (touch/mobile interaction).

**Parameters:**
- `index` (integer, required): Element index to tap
- `x` (integer, optional): X coordinate offset
- `y` (integer, optional): Y coordinate offset

**Implementation Notes:**
- Use Chrome Debugger API `Input.dispatchTouchEvent` with `touchStart` and `touchEnd`
- Useful for mobile web testing or touch-enabled interfaces

**Example:**
```typescript
tap({ index: 30 })
tap({ index: 30, x: 10, y: 20 })  // Tap at offset
```

**Puppeteer/Playwright Equivalent:**
- Puppeteer: `page.touchscreen.tap(x, y)`
- Playwright: `page.locator(selector).tap()`

---

### 3.6 `swipe` (Touch)

**Status:** ✅ Implementable  
**Description:** Swipe gesture (touch/mobile).

**Parameters:**
- `start_x` (integer, required): Start X coordinate
- `start_y` (integer, required): Start Y coordinate
- `end_x` (integer, required): End X coordinate
- `end_y` (integer, required): End Y coordinate
- `duration` (integer, optional, default: 300): Swipe duration in milliseconds

**Implementation Notes:**
- Use Chrome Debugger API `Input.dispatchTouchEvent` with multiple touch points
- Simulate touch move events between start and end coordinates
- Useful for mobile gestures, carousels, pull-to-refresh

**Example:**
```typescript
swipe({ start_x: 100, start_y: 200, end_x: 300, end_y: 200, duration: 500 })
```

---

## 4. Keyboard Actions

### 4.1 `press` / `pressKey`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Press a single key or key combination.

**Parameters:**
- `key` (string, required): Key to press (e.g., "Enter", "Escape", "Tab", "ArrowDown")
- `modifiers` (string[], optional): Modifier keys: `["Control"]`, `["Shift"]`, `["Alt"]`, `["Meta"]`

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executePress()`
- Uses Chrome Debugger API `Input.dispatchKeyEvent` with `keyDown` and `keyUp` events
- Supports standard key names: Enter, Escape, Tab, ArrowUp/Down/Left/Right, Home, End, PageUp, PageDown, Delete, Backspace
- Supports key combinations: `["Control", "s"]` for Ctrl+S
- Presses modifier keys first, then main key, then releases in reverse order
- Waits 200ms after key press

**Example:**
```typescript
press({ key: "Enter" })
press({ key: "s", modifiers: ["Control"] })  // Ctrl+S
press({ key: "ArrowDown" })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executePress()`
- `src/helpers/availableActions.ts` - Action definition

---

### 4.2 `type` / `typeText`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Type text character by character (simulates real typing).

**Parameters:**
- `text` (string, required): Text to type
- `delay` (number, optional, default: 0): Delay between keystrokes in milliseconds

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeType()`
- Uses Chrome Debugger API `Input.dispatchKeyEvent` for each character
- Simulates real user typing with optional delays
- Sends both `keyDown` and `keyUp` events for each character
- Useful for testing autocomplete, input validation, or typing animations
- Different from `setValue` which sets value directly

**Example:**
```typescript
type({ text: "Hello World", delay: 50 })  // Types with 50ms delay between characters
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeType()`
- `src/helpers/availableActions.ts` - Action definition

---

### 4.3 `focus`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Focus an element (brings it into focus, activates it).

**Parameters:**
- `index` (number, required): Element index to focus

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeFocus()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` to call `element.focus()`
- Scrolls element into view before focusing
- Triggers focus events and activates input fields
- Waits 200ms after focus
- Useful before typing or interacting with form elements

**Example:**
```typescript
focus({ index: 42 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeFocus()`
- `src/helpers/availableActions.ts` - Action definition

---

### 4.4 `blur`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Remove focus from an element.

**Parameters:**
- `index` (number, required): Element index to blur

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeBlur()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` to call `element.blur()`
- Triggers blur events and validation
- Waits 200ms after blur
- Useful for testing form validation on blur

**Example:**
```typescript
blur({ index: 42 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeBlur()`
- `src/helpers/availableActions.ts` - Action definition

---

## 5. JavaScript Execution

### 3.1 `evaluate`

**Status:** ✅ Implementable  
**Description:** Execute custom JavaScript code on the page.

**Parameters:**
- `code` (string, required): JavaScript code to execute

**Implementation Notes:**
- Use Chrome Debugger API `Runtime.evaluate` to execute code
- Code runs in page context (not isolated world)
- Return value can be captured and used
- **Use Cases:**
  - Shadow DOM access
  - Custom selectors
  - Data extraction
  - Hover effects
  - Drag and drop
  - Zoom controls
  - Complex DOM manipulation

**Example:**
```typescript
evaluate({ code: "document.querySelector('.custom-class').click()" })
evaluate({ code: "window.scrollTo(0, document.body.scrollHeight)" })
evaluate({ code: "document.querySelector('input[type=file]').click()" })
```

**Security Considerations:**
- Validate code before execution
- Sanitize user-provided code
- Consider code injection risks

---

## 6. Tab Management

### 6.1 `createTab`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Create a new browser tab.

**Parameters:**
- `url` (string, optional): URL to navigate to in the new tab (default: "about:blank")
- `active` (boolean, optional, default: `true`): Make the new tab active

**Returns:** Tab ID (number)

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeCreateTab()`
- Uses `chrome.tabs.create()` to create a new tab
- Returns the new tab ID for subsequent operations
- If `url` is provided, navigates to that URL; otherwise creates blank tab
- Useful for:
  - Opening multiple pages simultaneously
  - Creating new tabs for navigation
  - Multi-tab workflows

**Example:**
```typescript
const tabId = createTab({ url: "https://example.com" })
createTab({ url: "https://google.com", active: false })  // Create in background
createTab()  // Create blank tab
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeCreateTab()`
- `src/helpers/availableActions.ts` - Action definition

---

### 6.2 `switch` / `switchTab`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Switch between browser tabs (activate a specific tab).

**Parameters:**
- `tabId` (string, required): Tab identifier (string format, converted to Chrome tab ID)

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeSwitchTab()`
- Uses `chrome.tabs.query()` to find tab by index (if string is numeric)
- Uses `chrome.tabs.update()` to activate tab
- Handles both string identifiers and numeric indices
- Tab becomes the active tab in its window
- Waits 500ms after switching
- Handles tab not found errors gracefully

**Example:**
```typescript
switch({ tabId: "0001" })  // Using string identifier (converted to tab index)
switchTab({ tabId: "1" })  // Using numeric string
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeSwitchTab()`
- `src/helpers/availableActions.ts` - Action definition

---

### 6.3 `close` / `closeTab`

**Status:** ✅ **IMPLEMENTED** (with Safety Check)  
**Description:** Close browser tabs.

**Parameters:**
- `tabId` (string, required): Tab identifier (string format, converted to Chrome tab ID)

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeCloseTab()`
- Uses `chrome.tabs.remove()` to close tab
- **Safety Check:** Prevents closing the last remaining tab (throws error)
- Double-checks tab count before closing
- Handles tab not found errors gracefully
- Converts string identifier to Chrome tab ID

**Example:**
```typescript
close({ tabId: "0001" })  // Using string identifier
closeTab({ tabId: "1" })  // Using numeric string
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeCloseTab()` (with safety check)
- `src/helpers/availableActions.ts` - Action definition

**Special Handling:**
- ✅ Safety check prevents closing last tab
- Validates tab exists before closing
- Throws clear error messages

---

### 6.4 `getTabs` / `listTabs`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Get list of all open tabs.

**Parameters:**
- `windowId` (number, optional): Get tabs for specific window (default: all windows)
- `activeOnly` (boolean, optional, default: `false`): Return only active tabs

**Returns:** Array of tab objects with properties:
- `id` (number): Chrome tab ID
- `url` (string): Tab URL
- `title` (string): Tab title
- `active` (boolean): Whether tab is active
- `windowId` (number): Window ID containing the tab

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeGetTabs()`
- Uses `chrome.tabs.query()` to get all tabs
- Filters by window if `windowId` provided
- Filters by active state if `activeOnly` is true
- Returns formatted tab objects
- Useful for:
  - Tab management workflows
  - Finding specific tabs
  - Multi-tab automation

**Example:**
```typescript
const tabs = getTabs()  // Get all tabs
const activeTab = getTabs({ activeOnly: true })  // Get active tab
const windowTabs = getTabs({ windowId: 123 })  // Get tabs in specific window
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeGetTabs()`
- `src/helpers/availableActions.ts` - Action definition

---

## 7. Content Extraction

### 5.1 `extract`

**Status:** ⚠️ Requires LLM Integration  
**Description:** Extract structured data from page markdown using LLM.

**Parameters:**
- `query` (string, required): Natural language query for data extraction
- `extract_links` (boolean, optional, default: `false`): Include links in extraction
- `start_from_char` (integer, optional, default: `0`): Start extraction from character position

**Implementation Notes:**
- Convert page DOM to markdown format
- Send markdown + query to LLM for structured extraction
- Return extracted data in structured format (JSON)
- **Requires:** LLM API integration (OpenAI, Claude, etc.)

**Example:**
```typescript
extract({ query: "Extract all product names and prices" })
extract({ query: "Get all email addresses", extract_links: true })
```

**Current Implementation:**
- Page markdown conversion: `src/helpers/simplifyDom.ts`
- LLM integration: `src/helpers/determineNextAction.ts`
- Could be extended for structured extraction

---

## 8. Visual Analysis

### 8.1 `screenshot`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Capture a screenshot of the page or element.

**Parameters:**
- `fullPage` (boolean, optional, default: `false`): Capture full page if true, viewport if false
- `elementIndex` (number, optional): Capture specific element if provided
- `format` (string, optional, default: `"png"`): Image format: `"png"` or `"jpeg"`
- `quality` (number, optional, default: 90): JPEG quality (1-100, only for JPEG)

**Returns:** Base64-encoded image data string

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeScreenshot()`
- Automatically enables Page domain if needed
- For viewport: Uses `chrome.tabs.captureVisibleTab()` API
- For full page: Uses Chrome Debugger API `Page.captureScreenshot` with `captureBeyondViewport: true`
- For element: Uses `Page.captureScreenshot` with clip coordinates from `getBoundingBox()`
- Returns base64-encoded image data
- Can be used for visual verification, debugging, or documentation

**Example:**
```typescript
screenshot()  // Viewport screenshot
screenshot({ fullPage: true })  // Full page screenshot
screenshot({ elementIndex: 42 })  // Element screenshot
screenshot({ format: "jpeg", quality: 80 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeScreenshot()`
- `src/helpers/availableActions.ts` - Action definition

**Use Cases:**
- Visual verification of page state
- Debugging UI issues
- Documenting task progress
- Visual regression testing
- Element-specific screenshots for verification

---

### 8.2 `generatePdf`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Generate PDF from the current page.

**Parameters:**
- `format` (string, optional, default: `"A4"`): Paper format: `"Letter"`, `"Legal"`, `"A4"`, `"A3"`
- `landscape` (boolean, optional, default: `false`): Landscape orientation
- `margin` (string, optional): JSON string with page margins `{ top, right, bottom, left }` (e.g., `"1cm"`)
- `printBackground` (boolean, optional, default: `false`): Include background graphics

**Returns:** Base64-encoded PDF data string

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeGeneratePdf()`
- Automatically enables Page domain
- Uses Chrome Debugger API `Page.printToPDF`
- Margin parameter is a JSON string that gets parsed
- Supports Letter, Legal, A4, A3 formats
- Returns base64-encoded PDF data (can be saved via downloads API)
- Useful for:
  - Generating reports
  - Creating documentation
  - Archiving web pages
  - Testing print styles

**Example:**
```typescript
generatePdf({ format: "A4" })
generatePdf({ 
  format: "Letter", 
  landscape: true,
  margin: JSON.stringify({ top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" })
})
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeGeneratePdf()`
- `src/helpers/availableActions.ts` - Action definition

**Note:** PDF data is returned as base64 string. To save to file, use `chrome.downloads` API or send to server.

---

## 9. Form Controls

### 9.1 `check`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Check a checkbox or radio button.

**Parameters:**
- `index` (number, required): Checkbox/radio element index

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeCheck()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` to set `element.checked = true`
- Scrolls element into view before checking
- Triggers `change` event for React/Vue components
- Waits 200ms after check

**Example:**
```typescript
check({ index: 15 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeCheck()`
- `src/helpers/availableActions.ts` - Action definition

---

### 9.2 `uncheck`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Uncheck a checkbox or radio button.

**Parameters:**
- `index` (number, required): Checkbox/radio element index

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeUncheck()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` to set `element.checked = false`
- Scrolls element into view before unchecking
- Triggers `change` event for React/Vue components
- Waits 200ms after uncheck

**Example:**
```typescript
uncheck({ index: 15 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeUncheck()`
- `src/helpers/availableActions.ts` - Action definition

---

### 9.3 `dropdownOptions`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Get all options from a native dropdown or ARIA menu.

**Parameters:**
- `index` (number, required): Dropdown element index

**Returns:** Array of option objects with `value` and `text` properties

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeDropdownOptions()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` to query options
- For `<select>` elements: queries `<option>` children
- For ARIA menus: queries `[role="option"]` elements
- Returns array of option objects with `value` and `text`
- Useful for dynamic dropdowns where options aren't in initial DOM

**Example:**
```typescript
const options = dropdownOptions({ index: 25 })
// Returns: [{ value: "us", text: "United States" }, { value: "uk", text: "United Kingdom" }]
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeDropdownOptions()`
- `src/helpers/availableActions.ts` - Action definition

---

### 9.4 `selectDropdown` / `selectOption`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Select dropdown option by value or text.

**Parameters:**
- `index` (number, required): Dropdown element index
- `value` (string, optional): Option value to select
- `text` (string, optional): Option text to select (if value not provided)
- `multiple` (boolean, optional, default: `false`): Allow multiple selections

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeSelectDropdown()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` to select option
- Finds option by value (preferred) or text content (case-insensitive matching)
- Sets `selectedIndex` or `value` property
- Scrolls element into view before selecting
- Triggers `change` event for React/Vue components
- Handles both native `<select>` and ARIA-compliant menus
- Waits 200ms after selection

**Example:**
```typescript
selectDropdown({ index: 25, text: "United States" })
selectDropdown({ index: 25, value: "us" })
selectOption({ index: 25, value: "us" })  // Alias
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeSelectDropdown()`
- `src/helpers/availableActions.ts` - Action definition

---

## 10. Element Queries

### 10.1 `getText`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Get text content from an element.

**Parameters:**
- `index` (number, required): Element index

**Returns:** Text content as string

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeGetText()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` to get `element.textContent` or `element.innerText`
- Returns text content as string
- Useful for verification, data extraction, or conditional logic

**Example:**
```typescript
const text = getText({ index: 42 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeGetText()`
- `src/helpers/availableActions.ts` - Action definition

---

### 10.2 `getAttribute`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Get attribute value from an element.

**Parameters:**
- `index` (number, required): Element index
- `attribute` (string, required): Attribute name (e.g., "href", "src", "data-id")

**Returns:** Attribute value as string or null

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeGetAttribute()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` to call `element.getAttribute(name)`
- Returns attribute value or null if not found
- Useful for extracting links, image sources, data attributes

**Example:**
```typescript
const href = getAttribute({ index: 10, attribute: "href" })
const dataId = getAttribute({ index: 10, attribute: "data-id" })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeGetAttribute()`
- `src/helpers/availableActions.ts` - Action definition

---

### 10.3 `getBoundingBox`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Get element's position and size (bounding box).

**Parameters:**
- `index` (number, required): Element index

**Returns:** Object with `x`, `y`, `width`, `height` properties

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeGetBoundingBox()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` with `element.getBoundingClientRect()`
- Returns object with position and size: `{ x, y, width, height }`
- May return null for hidden or detached elements
- Useful for visual verification, screenshot positioning, or coordinate-based actions

**Example:**
```typescript
const box = getBoundingBox({ index: 42 })
// Returns: { x: 100, y: 200, width: 300, height: 50 }
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeGetBoundingBox()`
- `src/helpers/availableActions.ts` - Action definition

---

### 10.4 `isVisible`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Check if element is visible on the page.

**Parameters:**
- `index` (number, required): Element index

**Returns:** Boolean indicating visibility

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeIsVisible()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` to check:
  - `element.offsetParent !== null` (not hidden by default)
  - `getComputedStyle(element).display !== 'none'`
  - `getComputedStyle(element).visibility !== 'hidden'`
  - `getComputedStyle(element).opacity !== '0'`
  - Element has positive width and height
- Complex visibility calculation handles edge cases
- Useful for conditional logic or verification

**Example:**
```typescript
const visible = isVisible({ index: 42 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeIsVisible()`
- `src/helpers/availableActions.ts` - Action definition

---

### 10.5 `isEnabled`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Check if element is enabled (not disabled).

**Parameters:**
- `index` (number, required): Element index

**Returns:** Boolean indicating enabled state

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeIsEnabled()`
- Uses Chrome Debugger API `Runtime.callFunctionOn` to check:
  - `!element.disabled` (for form elements)
  - `!element.hasAttribute('disabled')`
- Handles different element types appropriately
- Useful for form validation or conditional actions

**Example:**
```typescript
const enabled = isEnabled({ index: 42 })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeIsEnabled()`
- `src/helpers/availableActions.ts` - Action definition

---

## 11. Dialog Handling

### 11.1 `acceptDialog` / `accept_dialog`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Accept or dismiss browser dialogs (alert, confirm, prompt).

**Parameters:**
- `text` (string, optional): Text to enter for prompt dialogs

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeAcceptDialog()`
- Uses Chrome Debugger API `Page.handleJavaScriptDialog` with `accept: true`
- Sets up event listener for `Page.javascriptDialogOpening` event
- Handles dialogs that appear after action execution
- For prompts, provides `promptText` parameter
- Useful for handling authentication dialogs, confirmations, alerts

**Example:**
```typescript
acceptDialog()  // Accept alert/confirm
acceptDialog({ text: "username" })  // Accept prompt with text
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeAcceptDialog()`
- `src/helpers/availableActions.ts` - Action definition

**Special Handling:**
- Event listener is set up before dialog appears
- Handles both immediate and delayed dialogs
- Automatically cleans up handlers after use

---

### 11.2 `dismissDialog` / `dismiss_dialog`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Dismiss browser dialogs.

**Parameters:** None

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeDismissDialog()`
- Uses Chrome Debugger API `Page.handleJavaScriptDialog` with `accept: false`
- Sets up event listener for dialog events
- Handles dialogs that appear after action execution

**Example:**
```typescript
dismissDialog()  // Dismiss alert/confirm
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeDismissDialog()`
- `src/helpers/availableActions.ts` - Action definition

---

### 11.3 `waitForDialog` / `wait_for_dialog`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Wait for a dialog to appear and optionally handle it.

**Parameters:**
- `timeout` (number, optional, default: 30000): Timeout in milliseconds
- `autoAccept` (boolean, optional, default: false): Automatically accept if true

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeWaitForDialog()`
- Listens for `Page.javascriptDialogOpening` event via Chrome Debugger API
- Returns promise that resolves when dialog appears
- Automatically accepts dialog if `autoAccept` is true
- Throws error if timeout is reached

**Example:**
```typescript
waitForDialog({ timeout: 5000, autoAccept: true })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeWaitForDialog()`
- `src/helpers/availableActions.ts` - Action definition

---

## 12. Network Control

### 12.1 `interceptRequest` / `intercept_request`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Intercept and modify network requests.

**Parameters:**
- `urlPattern` (string, required): URL pattern to match (supports * wildcard)
- `action` (string, required): Action to take: `"block"`, `"modify"`, `"continue"`
- `modifications` (string, optional): JSON string with request modifications (headers, method, postData)

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeInterceptRequest()`
- Automatically enables Fetch domain via Chrome Debugger API
- Sets up event listener for `Fetch.requestPaused` events
- Supports wildcard patterns (converts * to .* regex)
- Useful for:
  - Blocking ads or tracking scripts
  - Modifying request headers (authentication, user-agent)
  - Testing offline scenarios

**Example:**
```typescript
interceptRequest({ 
  urlPattern: "*://ads.example.com/*", 
  action: "block" 
})
interceptRequest({ 
  urlPattern: "*://api.example.com/*", 
  action: "modify",
  modifications: JSON.stringify({ headers: { "Authorization": "Bearer token" } })
})
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeInterceptRequest()`
- `src/helpers/availableActions.ts` - Action definition

**Special Handling:**
- Must be set up before requests are made
- Event listener persists for the tab session
- Modifications parameter is a JSON string that gets parsed

---

### 12.2 `mockResponse` / `mock_response`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Mock network responses for specific URLs.

**Parameters:**
- `urlPattern` (string, required): URL pattern to match (supports * wildcard)
- `response` (string, required): JSON string with mock response data
  - `status` (number): HTTP status code
  - `headers` (object): Response headers
  - `body` (string): Response body

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeMockResponse()`
- Automatically enables Fetch domain via Chrome Debugger API
- Sets up event listener for `Fetch.requestPaused` events
- Uses `Fetch.fulfillRequest` to return mocked response
- Response body is base64 encoded automatically
- Useful for:
  - Testing without backend
  - Simulating error responses
  - Testing offline scenarios
  - Speeding up tests by mocking slow APIs

**Example:**
```typescript
mockResponse({
  urlPattern: "*://api.example.com/users",
  response: JSON.stringify({
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ users: [] })
  })
})
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeMockResponse()`
- `src/helpers/availableActions.ts` - Action definition

**Special Handling:**
- Must be set up before requests are made
- Response parameter is a JSON string that gets parsed
- Headers are converted to CDP format automatically

---

## 13. Page Configuration

### 13.1 `set_viewport`

**Status:** ✅ Implementable  
**Description:** Set viewport size (window dimensions).

**Parameters:**
- `width` (integer, required): Viewport width in pixels
- `height` (integer, required): Viewport height in pixels
- `device_scale_factor` (float, optional, default: 1.0): Device pixel ratio

**Implementation Notes:**
- Use Chrome Debugger API `Emulation.setDeviceMetricsOverride`
- Useful for responsive design testing, mobile emulation
- Can simulate different device sizes

**Example:**
```typescript
set_viewport({ width: 1920, height: 1080 })
set_viewport({ width: 375, height: 667, device_scale_factor: 2.0 })  // iPhone
```

**Puppeteer/Playwright Equivalent:**
- Puppeteer: `page.setViewport({ width, height })`
- Playwright: `page.setViewportSize({ width, height })`

---

### 13.2 `set_geolocation`

**Status:** ✅ Implementable  
**Description:** Set geolocation for the page.

**Parameters:**
- `latitude` (float, required): Latitude coordinate
- `longitude` (float, required): Longitude coordinate
- `accuracy` (float, optional, default: 100): Accuracy in meters

**Implementation Notes:**
- Use Chrome Debugger API `Emulation.setGeolocationOverride`
- Requires geolocation permission
- Useful for testing location-based features

**Example:**
```typescript
set_geolocation({ latitude: 37.7749, longitude: -122.4194 })  // San Francisco
```

**Puppeteer/Playwright Equivalent:**
- Puppeteer: `page.setGeolocation({ latitude, longitude })`
- Playwright: `context.setGeolocation({ latitude, longitude })`

---

### 13.3 `set_permissions`

**Status:** ✅ Implementable  
**Description:** Grant or deny permissions (camera, microphone, notifications, etc.).

**Parameters:**
- `permissions` (array of strings, required): Permission names
- `state` (string, required): `"granted"` or `"denied"`

**Implementation Notes:**
- Use Chrome Debugger API `Browser.grantPermissions` or `Browser.resetPermissions`
- Permission names: `"camera"`, `"microphone"`, `"notifications"`, `"geolocation"`, etc.
- Useful for testing permission-dependent features

**Example:**
```typescript
set_permissions({ permissions: ["camera", "microphone"], state: "granted" })
```

**Puppeteer/Playwright Equivalent:**
- Puppeteer: `context.grantPermissions(['camera', 'microphone'])`
- Playwright: `context.grantPermissions(['camera', 'microphone'])`

---

### 13.4 `set_user_agent`

**Status:** ✅ Implementable  
**Description:** Set user agent string for the page.

**Parameters:**
- `user_agent` (string, required): User agent string

**Implementation Notes:**
- Use Chrome Debugger API `Network.setUserAgentOverride`
- Useful for:
  - Testing mobile vs desktop experiences
  - Bypassing bot detection (not recommended for production)
  - Testing different browser compatibility

**Example:**
```typescript
set_user_agent({ user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)" })
```

**Puppeteer/Playwright Equivalent:**
- Puppeteer: `page.setUserAgent('user-agent-string')`
- Playwright: `context.setUserAgent('user-agent-string')`

---

### 13.5 `set_timezone`

**Status:** ✅ Implementable  
**Description:** Set timezone for the page.

**Parameters:**
- `timezone_id` (string, required): IANA timezone ID (e.g., "America/New_York", "Europe/London")

**Implementation Notes:**
- Use Chrome Debugger API `Emulation.setTimezoneOverride`
- Useful for testing timezone-dependent features, date/time displays

**Example:**
```typescript
set_timezone({ timezone_id: "America/Los_Angeles" })
```

**Puppeteer/Playwright Equivalent:**
- Puppeteer: `page.emulateTimezone('America/Los_Angeles')`
- Playwright: `context.setTimezoneId('America/Los_Angeles')`

---

## 14. Storage & Cookies

### 14.1 `getCookies` / `get_cookies`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Get cookies for the page or domain.

**Parameters:**
- `url` (string, optional): URL to get cookies for (default: current page)

**Returns:** Array of cookie objects with properties (name, value, domain, path, secure, httpOnly, sameSite, expirationDate)

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeGetCookies()`
- Uses `chrome.cookies.getAll()` API (Chrome Extension API)
- Automatically uses current tab URL if not provided
- Returns formatted cookie objects
- Useful for:
  - Authentication state management
  - Testing cookie-dependent features
  - Session management

**Example:**
```typescript
const cookies = getCookies({ url: "https://example.com" })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeGetCookies()`
- `src/helpers/availableActions.ts` - Action definition

---

### 14.2 `setCookie` / `set_cookie`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Set a cookie for the page.

**Parameters:**
- `name` (string, required): Cookie name
- `value` (string, required): Cookie value
- `domain` (string, optional): Cookie domain
- `path` (string, optional): Cookie path (default: "/")
- `expires` (number, optional): Expiration timestamp
- `httpOnly` (boolean, optional): HTTP-only flag
- `secure` (boolean, optional): Secure flag
- `sameSite` (string, optional): SameSite policy: `"Strict"`, `"Lax"`, `"None"`

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeSetCookie()`
- Uses `chrome.cookies.set()` API (Chrome Extension API)
- Automatically uses current tab URL for cookie domain
- Supports all standard cookie attributes
- Useful for authentication state management

**Example:**
```typescript
setCookie({ 
  name: "session", 
  value: "abc123", 
  domain: ".example.com",
  secure: true 
})
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeSetCookie()`
- `src/helpers/availableActions.ts` - Action definition

---

### 14.3 `clearCookies` / `clear_cookies`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Clear all cookies for the page or domain.

**Parameters:**
- `url` (string, optional): URL to clear cookies for (default: current page)

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeClearCookies()`
- Uses `chrome.cookies.getAll()` and `chrome.cookies.remove()` for each cookie
- Automatically uses current tab URL if not provided
- Removes all cookies for the specified domain
- Useful for testing clean state, logout scenarios

**Example:**
```typescript
clearCookies({ url: "https://example.com" })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeClearCookies()`
- `src/helpers/availableActions.ts` - Action definition

---

### 14.4 `getLocalStorage` / `get_local_storage`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Get localStorage values.

**Parameters:**
- `key` (string, optional): Key to get (if omitted, returns all keys as object)

**Returns:** String value if key provided, or object with all key-value pairs

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeGetLocalStorage()`
- Uses Chrome Debugger API `Runtime.evaluate` to access `window.localStorage`
- If key provided, returns single value; otherwise returns all keys as JSON object
- Useful for:
  - Testing localStorage-dependent features
  - Managing application state
  - Testing offline scenarios

**Example:**
```typescript
const value = getLocalStorage({ key: "user_preferences" })
const all = getLocalStorage()  // Returns all keys
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeGetLocalStorage()`
- `src/helpers/availableActions.ts` - Action definition

---

### 14.5 `setLocalStorage` / `set_local_storage`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Set localStorage value.

**Parameters:**
- `key` (string, required): Storage key
- `value` (string, required): Storage value

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeSetLocalStorage()`
- Uses Chrome Debugger API `Runtime.evaluate` to set `localStorage.setItem()`
- Values are automatically JSON-stringified if needed
- Useful for managing application state

**Example:**
```typescript
setLocalStorage({ key: "theme", value: "dark" })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeSetLocalStorage()`
- `src/helpers/availableActions.ts` - Action definition

---

### 14.6 `clearStorage` / `clear_storage`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Clear localStorage, sessionStorage, or IndexedDB.

**Parameters:**
- `storageType` (string, required): `"localStorage"`, `"sessionStorage"`, or `"indexedDB"`

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeClearStorage()`
- Uses Chrome Debugger API `Runtime.evaluate` to clear storage
- For IndexedDB, deletes all databases
- Useful for testing clean state

**Example:**
```typescript
clearStorage({ storageType: "localStorage" })
clearStorage({ storageType: "sessionStorage" })
clearStorage({ storageType: "indexedDB" })
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeClearStorage()`
- `src/helpers/availableActions.ts` - Action definition

---

## 15. Performance & Tracing

### 15.1 `startTracing` / `start_tracing`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Start performance tracing.

**Parameters:**
- `categories` (string, optional): JSON array string of trace categories (default: all)
- `options` (string, optional): JSON object string with tracing options

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeStartTracing()`
- Uses Chrome Debugger API `Tracing.start`
- Categories and options are provided as JSON strings that get parsed
- Stores tracing state for the tab
- Categories: `"devtools.timeline"`, `"disabled-by-default-devtools.timeline"`, etc.
- Useful for performance analysis, debugging slow pages

**Example:**
```typescript
startTracing({ 
  categories: JSON.stringify(["devtools.timeline"]),
  options: JSON.stringify({ transferMode: "ReturnAsStream" })
})
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeStartTracing()`
- `src/helpers/availableActions.ts` - Action definition

**Special Handling:**
- High performance overhead - use sparingly
- Tracing state is stored per tab
- Must call `stopTracing()` to get trace data

---

### 15.2 `stopTracing` / `stop_tracing`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Stop tracing and get trace data.

**Parameters:** None

**Returns:** Trace data string (stream identifier or base64 data)

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeStopTracing()`
- Uses Chrome Debugger API `Tracing.end`
- Waits for `Tracing.tracingComplete` event
- Returns trace data that can be analyzed in Chrome DevTools
- Cleans up tracing state after completion
- Useful for performance profiling

**Example:**
```typescript
const traceData = stopTracing()
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeStopTracing()`
- `src/helpers/availableActions.ts` - Action definition

**Special Handling:**
- Returns promise that resolves when tracing completes
- Automatically cleans up event listeners
- Always stops tracing even if errors occur

---

### 15.3 `getMetrics` / `get_metrics`

**Status:** ✅ **IMPLEMENTED**  
**Description:** Get performance metrics (load time, paint metrics, etc.).

**Parameters:** None

**Returns:** Object with performance metrics including:
- `loadTime` - Total page load time
- `domContentLoaded` - DOM content loaded time
- `firstPaint` - First paint time
- `firstContentfulPaint` - First contentful paint time
- Additional CDP performance metrics

**Implementation Notes:**
- ✅ Implemented in `src/helpers/actionExecutors.ts` - `executeGetMetrics()`
- Uses Chrome Debugger API `Performance.getMetrics` and `Runtime.evaluate`
- Automatically enables Performance domain
- Combines CDP metrics with `performance.timing` API
- Metrics include: load time, first paint, first contentful paint, DOM content loaded, etc.
- Useful for performance monitoring and optimization

**Example:**
```typescript
const metrics = getMetrics()
// Returns: { loadTime: 1234, firstPaint: 567, domContentLoaded: 890, ... }
```

**Implementation Location:**
- `src/helpers/actionExecutors.ts` - `executeGetMetrics()`
- `src/helpers/availableActions.ts` - Action definition

---

## 16. File Operations

### 8.1 `write_file`

**Status:** ⚠️ Extension Context Limitation  
**Description:** Write content to files (creates new or overwrites).

**Parameters:**
- `file_name` (string, required): Target file name
- `content` (string, required): Content to write
- `append` (boolean, optional, default: `false`): Append to file if true
- `trailing_newline` (boolean, optional, default: `true`): Add newline at end
- `leading_newline` (boolean, optional, default: `false`): Add newline at start

**Supported File Types:**
- Text: `.txt`, `.md`, `.json`, `.jsonl`, `.csv`
- Documents: `.pdf` (requires PDF library)

**Implementation Notes:**
- **Chrome Extension Limitation:** Extensions cannot directly write to filesystem
- **Workaround Options:**
  1. Use `chrome.downloads` API to trigger file download
  2. Store in `chrome.storage.local` for temporary files
  3. Send to server for file storage
  4. Use File System Access API (requires user permission)

**Example:**
```typescript
write_file({ file_name: "output.txt", content: "Hello World" })
write_file({ file_name: "data.json", content: JSON.stringify(data), append: false })
```

---

### 8.2 `read_file`

**Status:** ⚠️ Extension Context Limitation  
**Description:** Read file contents.

**Parameters:**
- `file_name` (string, required): File name to read

**Supported File Types:**
- Text files: `.txt`, `.md`, `.json`, `.csv`, `.jsonl`
- Documents: `.pdf`, `.docx` (requires parsing library)
- Images: `.jpg`, `.png` (returns base64 or metadata)

**Implementation Notes:**
- **Chrome Extension Limitation:** Extensions cannot directly read from filesystem
- **Workaround Options:**
  1. Use File System Access API (requires user permission)
  2. Read from `chrome.storage.local` if previously stored
  3. Request file via `input[type=file]` element
  4. Fetch from server if file is hosted

**Example:**
```typescript
read_file({ file_name: "config.json" })
```

---

### 8.3 `replace_file`

**Status:** ⚠️ Extension Context Limitation  
**Description:** Replace specific text within a file.

**Parameters:**
- `file_name` (string, required): File name to modify
- `old_str` (string, required): Text to replace
- `new_str` (string, required): Replacement text

**Implementation Notes:**
- Read file, perform string replacement, write back
- Same limitations as `read_file` and `write_file`
- Use `String.replace()` or `String.replaceAll()` for replacement

**Example:**
```typescript
replace_file({ file_name: "config.json", old_str: "localhost", new_str: "production.com" })
```

---

## 17. Task Completion

### 9.1 `done` / `finish`

**Status:** ✅ Currently Implemented  
**Description:** Complete the task and return result.

**Parameters:**
- `text` (string, required): Completion message or summary
- `success` (boolean, optional, default: `true`): Task success status
- `files_to_display` (array of strings, optional): List of file names to display

**Implementation Notes:**
- **Current Implementation:** Uses `finish` action name
- Stops action execution loop
- Updates task status to "completed" or "failed"
- Can return structured output if `output_model_schema` is provided

**Example:**
```typescript
finish({ text: "Task completed successfully", success: true })
finish({ text: "Task failed: Element not found", success: false })
finish({ text: "Report generated", files_to_display: ["report.pdf"] })
```

**Current Implementation Location:**
- `src/helpers/parseResponse.ts` - Parses `finish()` action
- `src/state/currentTask.ts` - Updates task status

---

## Implementation Status Summary

### ✅ Currently Implemented (60+ Actions)

**Navigation & Browser Control:**
- ✅ `navigate` - URL navigation
- ✅ `goBack` / `goForward` - Browser history navigation
- ✅ `wait` - Delay execution (with 30s max limit)
- ✅ `search` - Search engine queries

**Page Interaction:**
- ✅ `click` - Element clicking by index (legacy implementation)
- ✅ `setValue` - Text input into form fields (legacy implementation)
- ✅ `scroll` - Page scrolling (window or element)
- ✅ `findText` - Text search and scroll

**Mouse & Touch Actions:**
- ✅ `hover` - Mouse hover
- ✅ `doubleClick` / `dblclick` - Double-click
- ✅ `rightClick` / `contextMenu` - Right-click
- ✅ `dragAndDrop` - Drag and drop

**Keyboard Actions:**
- ✅ `press` / `pressKey` - Single key press with modifiers
- ✅ `type` / `typeText` - Character-by-character typing
- ✅ `focus` - Focus element
- ✅ `blur` - Remove focus

**JavaScript Execution:**
- ✅ `evaluate` - Execute JavaScript (with security validation)

**Tab Management:**
- ✅ `createTab` - Create new tab
- ✅ `switch` / `switchTab` - Switch between tabs
- ✅ `close` / `closeTab` - Close tabs (with safety check)
- ✅ `getTabs` / `listTabs` - List all tabs

**Form Controls:**
- ✅ `check` / `uncheck` - Checkbox/radio buttons
- ✅ `dropdownOptions` - Get dropdown options
- ✅ `selectDropdown` / `selectOption` - Select dropdown option

**Element Queries:**
- ✅ `getText` - Get element text
- ✅ `getAttribute` - Get element attribute
- ✅ `getBoundingBox` - Get element position/size
- ✅ `isVisible` - Check visibility
- ✅ `isEnabled` - Check enabled state

**Visual Actions:**
- ✅ `screenshot` - Capture screenshots (viewport, full page, element)
- ✅ `generatePdf` - Generate PDF from page

**Dialog Handling:**
- ✅ `acceptDialog` / `accept_dialog` - Accept browser dialogs
- ✅ `dismissDialog` / `dismiss_dialog` - Dismiss browser dialogs
- ✅ `waitForDialog` / `wait_for_dialog` - Wait for dialog with timeout

**Network Control:**
- ✅ `interceptRequest` / `intercept_request` - Intercept/modify requests
- ✅ `mockResponse` / `mock_response` - Mock API responses

**Storage & Cookies:**
- ✅ `getCookies` / `get_cookies` - Get cookies
- ✅ `setCookie` / `set_cookie` - Set cookie
- ✅ `clearCookies` / `clear_cookies` - Clear cookies
- ✅ `getLocalStorage` / `get_local_storage` - Get localStorage
- ✅ `setLocalStorage` / `set_local_storage` - Set localStorage
- ✅ `clearStorage` / `clear_storage` - Clear storage

**Performance & Tracing:**
- ✅ `startTracing` / `start_tracing` - Start performance tracing
- ✅ `stopTracing` / `stop_tracing` - Stop tracing and get data
- ✅ `getMetrics` / `get_metrics` - Get performance metrics

**Task Completion:**
- ✅ `finish` / `done` - Task completion
- ✅ `fail` - Task failure

### ⚠️ Not Implemented (Extension Limitations or Special Requirements)
**Navigation & Control:**
- `navigate` - URL navigation
- `go_back` - Browser history back
- `go_forward` - Browser history forward
- `wait` - Delay execution
- `search` - Search engine queries

**Page Interaction:**
- `scroll` - Page scrolling
- `find_text` - Text search and scroll
- `hover` - Mouse hover
- `focus` / `blur` - Element focus management

**Keyboard:**
- `press` / `press_key` - Single key press
- `type` / `type_text` - Character-by-character typing
- `send_keys` - Keyboard shortcuts

**Form Controls:**
- `check` / `uncheck` - Checkbox/radio buttons
- `dropdown_options` - Get dropdown options
- `select_dropdown` / `select_option` - Select dropdown option

**Element Queries:**
- `get_text` - Get element text
- `get_attribute` - Get element attribute
- `is_visible` - Check visibility
- `is_enabled` - Check enabled state

**Visual:**
- `screenshot` - Capture screenshots (viewport, full page, element)
- `generate_pdf` - Generate PDF from page

**Dialog Handling:**
- `accept_dialog` / `dismiss_dialog` - Handle browser dialogs

**Touch Actions (Not Implemented - Desktop Focus):**
- ❌ `tap` - Touch tap (designed for mobile, not implemented)
- ❌ `swipe` - Touch swipe (designed for mobile, not implemented)

**Page Configuration (Not Implemented - Side Effects):**
- ❌ `set_viewport` - Affects all tabs, not implemented
- ❌ `set_geolocation` - Requires permission handling, not implemented
- ❌ `set_permissions` - Requires permission handling, not implemented
- ❌ `set_user_agent` - May break websites, not implemented
- ❌ `set_timezone` - System-wide effect, not implemented

### ⚠️ Requires Special Handling

**File Operations (Extension Limitations):**
- `upload_file` - File uploads (browser security restrictions, requires user interaction)
- `write_file` - File writing (extension filesystem limitations, use downloads API)
- `read_file` - File reading (extension filesystem limitations, use File System Access API)
- `replace_file` - File modification (extension filesystem limitations)

**LLM Integration:**
- `extract` - LLM-based extraction (requires LLM API integration)

**Network Operations (Timing & Setup):**
- `intercept_request` - Must enable Fetch domain before navigation, requires careful setup
- `mock_response` - Must be configured before requests are made, affects all matching requests

**Dialog Handling (Timing Critical):**
- `accept_dialog` / `dismiss_dialog` - Must set up handler BEFORE dialog appears (use Page.javascriptDialogOpening event)
- `wait_for_dialog` - Requires event listener setup before action that triggers dialog

**Permissions & User Consent:**
- `set_permissions` - Requires user consent for sensitive permissions (camera, microphone, notifications)
- `set_geolocation` - Requires geolocation permission, may prompt user

**Cross-Origin Restrictions:**
- `get_cookies` / `set_cookie` - Cross-domain cookies require host permissions in manifest
- `get_local_storage` / `set_local_storage` - Cross-origin storage access restrictions apply
- `clear_storage` - Cross-origin restrictions apply

**Security & Validation:**
- `evaluate` - **CRITICAL:** Must validate and sanitize user-provided JavaScript code to prevent XSS/injection attacks
- `type` / `type_text` - May trigger security warnings if typing into sensitive fields (password, credit card)

**Browser Compatibility:**
- `tap` / `swipe` - Touch events may not work on desktop browsers (designed for mobile/tablet)
- `set_user_agent` - May break some websites that detect user agent changes

**Performance Impact:**
- `start_tracing` / `stop_tracing` - High performance overhead, should be used sparingly
- `screenshot` (full page) - Memory intensive for large pages
- `generate_pdf` - CPU intensive, may take time for large pages

**Tab Management Safety:**
- `close` / `close_tab` - **MUST** prevent closing the last remaining tab (safety check required)

**Viewport & Emulation:**
- `set_viewport` - Affects all tabs in the browser context, may interfere with other extensions
- `set_timezone` - System-wide effect, may affect other browser tabs

**Element Queries (Edge Cases):**
- `get_bounding_box` - May return null for hidden or detached elements
- `is_visible` - Complex calculation (must check display, visibility, opacity, viewport bounds)
- `is_enabled` - Different logic for different element types (input, button, etc.)

**Drag and Drop (Complex Event Sequence):**
- `drag_and_drop` - Requires precise event sequence (mousedown → mousemove → mouseup), may fail on complex UIs

### 📊 Total Action Count
- **Currently Implemented:** ~60 actions
- **Not Implemented:** ~11 actions (extension limitations or special requirements)
- **Requires Special Handling:** 5 actions (file operations, LLM integration)
- **Grand Total:** ~71+ possible actions

### 📝 Implementation Details

**Implementation Files:**
- `src/helpers/availableActions.ts` - All action definitions with types (50+ actions)
- `src/helpers/actionExecutors.ts` - Execution implementations for all actions
- `src/helpers/parseAction.ts` - Enhanced parser supporting boolean, optional, and array parameters
- `src/helpers/domActions.ts` - Legacy actions (click, setValue) for backward compatibility
- `src/state/currentTask.ts` - Action execution orchestration

**Key Features:**
- ✅ Type-safe action definitions
- ✅ Support for optional parameters
- ✅ Support for boolean and array parameters
- ✅ Security validation for `evaluate` action
- ✅ Safety checks for `closeTab` (prevents closing last tab)
- ✅ Error handling and validation
- ✅ Dialog handling with event listeners
- ✅ Network interception with Fetch domain
- ✅ Storage and cookie management
- ✅ Performance tracing support

**Special Handling Implemented:**
- ✅ `evaluate` - Code validation blocks dangerous patterns (eval, Function, etc.)
- ✅ `closeTab` - Safety check prevents closing last remaining tab
- ✅ `interceptRequest` / `mockResponse` - Automatic Fetch domain setup
- ✅ `acceptDialog` / `dismissDialog` - Event listener setup for dialog handling
- ✅ All actions include error handling and validation

## Complete Implementation Status by Category

### Navigation & Browser Control
- ✅ `navigate` - Implemented in `actionExecutors.ts`
- ✅ `goBack` / `goForward` - Implemented in `actionExecutors.ts`
- ✅ `wait` - Implemented in `actionExecutors.ts`
- ✅ `search` - Implemented in `actionExecutors.ts`

### Page Interaction
- ✅ `click` - Implemented in `domActions.ts` (legacy)
- ✅ `setValue` - Implemented in `domActions.ts` (legacy)
- ✅ `scroll` - Implemented in `actionExecutors.ts`
- ✅ `findText` - Implemented in `actionExecutors.ts`

### Mouse & Touch Actions
- ✅ `hover` - Implemented in `actionExecutors.ts`
- ✅ `doubleClick` / `dblclick` - Implemented in `actionExecutors.ts`
- ✅ `rightClick` / `contextMenu` - Implemented in `actionExecutors.ts`
- ✅ `dragAndDrop` - Implemented in `actionExecutors.ts`
- ❌ `tap` - Not implemented (touch events - desktop focus)
- ❌ `swipe` - Not implemented (touch events - desktop focus)

### Keyboard Actions
- ✅ `press` / `pressKey` - Implemented in `actionExecutors.ts`
- ✅ `type` / `typeText` - Implemented in `actionExecutors.ts`
- ✅ `focus` - Implemented in `actionExecutors.ts`
- ✅ `blur` - Implemented in `actionExecutors.ts`

### JavaScript Execution
- ✅ `evaluate` - Implemented in `actionExecutors.ts` (with security validation)

### Tab Management
- ✅ `createTab` - Implemented in `actionExecutors.ts`
- ✅ `switch` / `switchTab` - Implemented in `actionExecutors.ts`
- ✅ `close` / `closeTab` - Implemented in `actionExecutors.ts` (with safety check)
- ✅ `getTabs` / `listTabs` - Implemented in `actionExecutors.ts`

### Form Controls
- ✅ `check` - Implemented in `actionExecutors.ts`
- ✅ `uncheck` - Implemented in `actionExecutors.ts`
- ✅ `dropdownOptions` - Implemented in `actionExecutors.ts`
- ✅ `selectDropdown` / `selectOption` - Implemented in `actionExecutors.ts`

### Element Queries
- ✅ `getText` - Implemented in `actionExecutors.ts`
- ✅ `getAttribute` - Implemented in `actionExecutors.ts`
- ✅ `getBoundingBox` - Implemented in `actionExecutors.ts`
- ✅ `isVisible` - Implemented in `actionExecutors.ts`
- ✅ `isEnabled` - Implemented in `actionExecutors.ts`

### Visual Actions
- ✅ `screenshot` - Implemented in `actionExecutors.ts`
- ✅ `generatePdf` - Implemented in `actionExecutors.ts`

### Dialog Handling
- ✅ `acceptDialog` / `accept_dialog` - Implemented in `actionExecutors.ts`
- ✅ `dismissDialog` / `dismiss_dialog` - Implemented in `actionExecutors.ts`
- ✅ `waitForDialog` / `wait_for_dialog` - Implemented in `actionExecutors.ts`

### Network Control
- ✅ `interceptRequest` / `intercept_request` - Implemented in `actionExecutors.ts`
- ✅ `mockResponse` / `mock_response` - Implemented in `actionExecutors.ts`

### Storage & Cookies
- ✅ `getCookies` / `get_cookies` - Implemented in `actionExecutors.ts`
- ✅ `setCookie` / `set_cookie` - Implemented in `actionExecutors.ts`
- ✅ `clearCookies` / `clear_cookies` - Implemented in `actionExecutors.ts`
- ✅ `getLocalStorage` / `get_local_storage` - Implemented in `actionExecutors.ts`
- ✅ `setLocalStorage` / `set_local_storage` - Implemented in `actionExecutors.ts`
- ✅ `clearStorage` / `clear_storage` - Implemented in `actionExecutors.ts`

### Performance & Tracing
- ✅ `startTracing` / `start_tracing` - Implemented in `actionExecutors.ts`
- ✅ `stopTracing` / `stop_tracing` - Implemented in `actionExecutors.ts`
- ✅ `getMetrics` / `get_metrics` - Implemented in `actionExecutors.ts`

### Task Completion
- ✅ `finish` - Implemented (legacy)
- ✅ `fail` - Implemented (legacy)

### Not Implemented (Extension Limitations)
- ⚠️ `upload_file` - Requires user interaction (browser security)
- ⚠️ `extract` - Requires LLM integration (server-side)
- ⚠️ `write_file` - Extension filesystem limitations
- ⚠️ `read_file` - Extension filesystem limitations
- ⚠️ `replace_file` - Extension filesystem limitations
- ⚠️ `set_viewport` - Not implemented (affects all tabs)
- ⚠️ `set_geolocation` - Not implemented (requires permission handling)
- ⚠️ `set_permissions` - Not implemented (requires permission handling)
- ⚠️ `set_user_agent` - Not implemented (may break websites)
- ⚠️ `set_timezone` - Not implemented (system-wide effect)

### Implementation Summary
- **Total Actions:** ~71+
- **Implemented:** ~60
- **Not Implemented:** ~11 (mostly due to extension limitations or special requirements)

---

## Action Definition Format

All actions should be defined in `src/helpers/availableActions.ts` following this format:

```typescript
{
  name: 'actionName',
  description: 'Human-readable description of what the action does',
  args: [
    { name: 'paramName', type: 'string' | 'number' | 'boolean', required: true },
    // ... more parameters
  ],
}
```

**Example:**
```typescript
{
  name: 'scroll',
  description: 'Scrolls the page up or down by a specified number of pages',
  args: [
    { name: 'down', type: 'boolean' },
    { name: 'pages', type: 'number' },
    { name: 'index', type: 'number' },
  ],
}
```

---

## Chrome Debugger API Reference

Most actions use the Chrome Debugger API (`chrome.debugger`). Key methods:

- **`chrome.debugger.attach({ tabId }, '1.2')`** - Attach debugger to tab
- **`chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression })`** - Execute JavaScript
- **`chrome.debugger.sendCommand({ tabId }, 'DOM.enable')`** - Enable DOM domain
- **`chrome.debugger.sendCommand({ tabId }, 'Runtime.enable')`** - Enable Runtime domain
- **`chrome.debugger.detach({ tabId })`** - Detach debugger

**Current Implementation:**
- `src/helpers/chromeDebugger.ts` - Chrome Debugger API wrapper

### Chrome DevTools Protocol Domains

The Chrome DevTools Protocol is organized into **domains**, each providing specific capabilities:

**Core Domains (Most Used):**
- **DOM** - DOM tree access, querying, modification
- **Runtime** - JavaScript execution, evaluation
- **Page** - Navigation, lifecycle, dialogs, screenshots, PDF
- **Network** - Request/response interception, cookies, headers
- **Input** - Mouse, keyboard, touch events
- **Accessibility** - Accessibility tree access
- **Emulation** - Device emulation, geolocation, timezone, viewport
- **Fetch** - Request interception and modification
- **Performance** - Performance metrics and timing
- **Tracing** - Performance tracing

**Additional Domains (Advanced):**
- **CSS** - CSS styles, computed styles, animations
- **Debugger** - JavaScript debugging, breakpoints
- **HeapProfiler** - Memory profiling
- **Profiler** - CPU profiling
- **Security** - Security state, certificate validation
- **Storage** - IndexedDB, Cache Storage, Local Storage
- **Target** - Target management, context creation
- **Overlay** - Visual debugging overlays
- **Animation** - CSS animation control
- **ApplicationCache** - Application cache management
- **CacheStorage** - Cache storage API
- **Database** - Database access
- **DOMDebugger** - DOM breakpoints
- **DOMStorage** - DOM storage events
- **IndexedDB** - IndexedDB access
- **IO** - File I/O operations
- **LayerTree** - Layer tree access
- **Log** - Console log access
- **Memory** - Memory information
- **Schema** - Protocol schema introspection
- **ServiceWorker** - Service worker management
- **SystemInfo** - System information
- **Tethering** - Network tethering

**Reference:**
- [Chrome DevTools Protocol Viewer](https://chromedevtools.github.io/debugger-protocol-viewer/tot/)
- [Chrome DevTools Protocol Documentation](https://chromedevtools.github.io/devtools-protocol/)

---

## Security Considerations

1. **Code Injection:** Validate and sanitize all user-provided code in `evaluate` action
2. **File Access:** File operations require user permissions or server-side handling
3. **Tab Management:** Prevent closing the last remaining tab
4. **Navigation:** Validate URLs before navigation to prevent malicious redirects
5. **Wait Limits:** Enforce maximum wait times to prevent infinite loops
6. **Action Limits:** Current implementation limits to 50 actions per task (safety measure)
7. **Network Interception:** Be careful with request interception - can break websites if not handled correctly
8. **User Agent Spoofing:** Changing user agent may break websites or trigger bot detection
9. **Permission Requests:** Sensitive permissions (camera, microphone) require user consent
10. **Cross-Origin Access:** Storage and cookie operations require proper host permissions

## Special Handling Requirements by Category

### 🔴 Critical (Security/Safety)

**`evaluate` - JavaScript Execution**
- **Risk:** Code injection, XSS attacks
- **Handling:**
  - Validate code syntax before execution
  - Sanitize user-provided code
  - Consider sandboxing or whitelisting allowed operations
  - Log all executed code for audit purposes
  - Consider using `Function` constructor with restrictions

**`close` / `close_tab` - Tab Closing**
- **Risk:** Closing last tab crashes browser experience
- **Handling:**
  - Always check: `if (totalTabs === 1) { throw new Error("Cannot close last tab") }`
  - Use `chrome.tabs.query()` to count tabs before closing

**`intercept_request` / `mock_response` - Network Control**
- **Risk:** Breaking websites, security vulnerabilities
- **Handling:**
  - Enable Fetch domain before page navigation
  - Handle errors gracefully (fallback to original request)
  - Clear interceptors after use to avoid affecting other pages
  - Test thoroughly with target websites

### 🟡 Important (User Experience/Compatibility)

**Dialog Handling (`accept_dialog`, `dismiss_dialog`, `wait_for_dialog`)**
- **Issue:** Timing - dialogs appear asynchronously
- **Handling:**
  - Set up `Page.javascriptDialogOpening` event listener BEFORE triggering action
  - Use promise-based approach to wait for dialog
  - Handle timeout if dialog doesn't appear
  - Example:
    ```typescript
    // Set up handler FIRST
    chrome.debugger.sendCommand({ tabId }, 'Page.enable');
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (method === 'Page.javascriptDialogOpening') {
        chrome.debugger.sendCommand({ tabId }, 'Page.handleJavaScriptDialog', {
          accept: true,
          promptText: 'value'
        });
      }
    });
    // THEN trigger action that causes dialog
    ```

**Touch Actions (`tap`, `swipe`)**
- **Issue:** May not work on desktop browsers
- **Handling:**
  - Detect device type before using touch events
  - Fallback to mouse events on desktop
  - Use `Input.dispatchTouchEvent` only on mobile/tablet contexts

**File Operations (`upload_file`, `read_file`, `write_file`)**
- **Issue:** Browser security restrictions
- **Handling:**
  - `upload_file`: Use `input[type=file].click()` to trigger file picker (requires user interaction)
  - `read_file`: Use File System Access API (requires user permission) or `chrome.downloads` API
  - `write_file`: Use `chrome.downloads.download()` to trigger file download
  - Consider server-side file handling for complex operations

**Permissions (`set_permissions`, `set_geolocation`)**
- **Issue:** Requires user consent
- **Handling:**
  - Check if permission already granted before requesting
  - Handle permission denial gracefully
  - Provide clear error messages if permission denied
  - Use `chrome.permissions` API to check/request permissions

### 🟢 Moderate (Performance/Edge Cases)

**Performance Actions (`start_tracing`, `stop_tracing`)**
- **Issue:** High performance overhead
- **Handling:**
  - Use only when necessary (debugging, profiling)
  - Set reasonable time limits for tracing
  - Stop tracing even if errors occur
  - Consider impact on browser performance

**Viewport/Emulation (`set_viewport`, `set_timezone`, `set_user_agent`)**
- **Issue:** May affect other tabs or break websites
- **Handling:**
  - Reset viewport/timezone after task completion
  - Test user agent changes with target websites
  - Document which sites may break with user agent changes
  - Consider per-tab emulation if possible

**Element Queries (`get_bounding_box`, `is_visible`, `is_enabled`)**
- **Issue:** Edge cases with hidden/detached elements
- **Handling:**
  - Check if element exists before querying
  - Handle null/undefined returns gracefully
  - For `is_visible`: Check multiple conditions (display, visibility, opacity, viewport)
  - For `is_enabled`: Different logic for different element types

**Drag and Drop (`drag_and_drop`)**
- **Issue:** Complex event sequence, may fail on dynamic UIs
- **Handling:**
  - Use precise event timing (mousedown → mousemove → mouseup)
  - Wait for element to be ready before dragging
  - Handle drag events that may be intercepted by page JavaScript
  - Consider using HTML5 Drag and Drop API if available

**Cross-Origin Storage (`get_cookies`, `set_cookie`, `get_local_storage`)**
- **Issue:** Cross-origin restrictions
- **Handling:**
  - Ensure `host_permissions` in manifest includes target domains
  - Use `chrome.cookies` API for cookies (works across origins with permissions)
  - For localStorage: Only works for same-origin, use content script injection for cross-origin

### 📋 Implementation Checklist for Special Actions

When implementing actions that require special handling:

- [ ] **Security:** Validate all user inputs, sanitize code
- [ ] **Error Handling:** Graceful fallbacks, clear error messages
- [ ] **Timing:** Set up event listeners before triggering actions
- [ ] **Permissions:** Check and request permissions as needed
- [ ] **Cleanup:** Reset state after action completion
- [ ] **Testing:** Test with various websites and edge cases
- [ ] **Documentation:** Document limitations and workarounds
- [ ] **User Feedback:** Provide clear error messages for failures

---

## Testing Recommendations

For each new action implementation:

1. **Unit Tests:** Test action parsing and validation
2. **Integration Tests:** Test action execution via Chrome Debugger API
3. **Error Handling:** Test error cases (element not found, invalid parameters)
4. **Edge Cases:** Test with various page types (SPA, traditional, iframe)
5. **Performance:** Measure execution time and optimize if needed

---

## Quick Reference: Special Handling Requirements

| Action | Category | Priority | Key Requirement |
|--------|----------|----------|-----------------|
| `evaluate` | Security | 🔴 Critical | Validate & sanitize user code |
| `close` / `close_tab` | Safety | 🔴 Critical | Prevent closing last tab |
| `intercept_request` | Network | 🔴 Critical | Enable Fetch domain before navigation |
| `mock_response` | Network | 🔴 Critical | Configure before requests |
| `accept_dialog` | Timing | 🟡 Important | Set up handler BEFORE dialog appears |
| `dismiss_dialog` | Timing | 🟡 Important | Set up handler BEFORE dialog appears |
| `wait_for_dialog` | Timing | 🟡 Important | Event listener setup required |
| `upload_file` | Security | 🟡 Important | Requires user interaction |
| `set_permissions` | Permissions | 🟡 Important | User consent required |
| `set_geolocation` | Permissions | 🟡 Important | Geolocation permission required |
| `tap` / `swipe` | Compatibility | 🟡 Important | May not work on desktop |
| `get_cookies` / `set_cookie` | Cross-Origin | 🟡 Important | Host permissions required |
| `get_local_storage` | Cross-Origin | 🟡 Important | Same-origin only |
| `start_tracing` | Performance | 🟢 Moderate | High overhead, use sparingly |
| `stop_tracing` | Performance | 🟢 Moderate | Always stop even on errors |
| `set_viewport` | Side Effects | 🟢 Moderate | Affects all tabs, reset after use |
| `set_user_agent` | Compatibility | 🟢 Moderate | May break some websites |
| `drag_and_drop` | Complexity | 🟢 Moderate | Complex event sequence |
| `get_bounding_box` | Edge Cases | 🟢 Moderate | May return null for hidden elements |
| `is_visible` | Edge Cases | 🟢 Moderate | Complex visibility calculation |
| `write_file` | Extension Limits | ⚠️ Special | Use downloads API |
| `read_file` | Extension Limits | ⚠️ Special | Use File System Access API |
| `replace_file` | Extension Limits | ⚠️ Special | Extension filesystem limitations |
| `extract` | LLM Integration | ⚠️ Special | Requires LLM API integration |

**Legend:**
- 🔴 **Critical:** Must handle correctly or security/safety risk
- 🟡 **Important:** Affects user experience or functionality
- 🟢 **Moderate:** Performance or edge case considerations
- ⚠️ **Special:** Extension-specific limitations or external dependencies

---

## References

- **Chrome Extension Debugger API:** https://developer.chrome.com/docs/extensions/reference/debugger/
- **Chrome DevTools Protocol:** https://chromedevtools.github.io/devtools-protocol/
- **Chrome Extension Permissions:** https://developer.chrome.com/docs/extensions/mv3/declare_permissions/
- **Browser-Use Actions:** https://github.com/browser-use/browser-use
- **Puppeteer API:** https://pptr.dev/api
- **Playwright API:** https://playwright.dev/docs/api/class-locator
- **Current Implementation:** `src/helpers/availableActions.ts`, `src/helpers/chromeDebugger.ts`
- **Action Parsing:** `src/helpers/parseResponse.ts`
- **State Management:** `src/state/currentTask.ts`

---

## Implementation Summary

### ✅ Fully Implemented Actions (60+)

All actions listed in the "Currently Implemented" section above are fully functional and ready to use. Each action includes:
- Complete implementation in `src/helpers/actionExecutors.ts`
- Action definition in `src/helpers/availableActions.ts`
- Enhanced parser support in `src/helpers/parseAction.ts`
- Integration in `src/state/currentTask.ts`

### Implementation Files

- **`src/helpers/availableActions.ts`** - All action definitions with types (50+ actions)
- **`src/helpers/actionExecutors.ts`** - Execution implementations for all actions
- **`src/helpers/parseAction.ts`** - Enhanced parser supporting boolean, optional, and array parameters
- **`src/helpers/domActions.ts`** - Legacy actions (click, setValue) for backward compatibility
- **`src/state/currentTask.ts`** - Action execution orchestration

### Key Implementation Features

1. **Type Safety:** All actions are fully typed with TypeScript
2. **Parameter Support:** Boolean, optional, and array parameters fully supported
3. **Security:** `evaluate` action includes code validation
4. **Safety:** `closeTab` includes safety check to prevent closing last tab
5. **Error Handling:** All actions include comprehensive error handling
6. **Special Handling:** Dialog handling, network interception, and tracing include proper event listener setup

### Testing Recommendations

When testing new actions:
1. Test with various websites (SPA, traditional, iframe)
2. Test edge cases (hidden elements, detached elements, etc.)
3. Verify error handling for invalid inputs
4. Test special handling requirements (dialogs, network, etc.)
5. Verify accessibility mapping integration where applicable

---

**Document Maintained By:** Spadeworks Copilot AI Development Team  
**Last Updated:** January 27, 2026  
**Implementation Status:** ✅ 60+ actions fully implemented and documented

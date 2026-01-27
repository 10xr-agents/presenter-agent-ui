/**
 * Action Configuration
 *
 * CRITICAL: This is the single source of truth for all available actions.
 * ALL LLM engines MUST only generate actions from this configuration.
 * Any action not in this configuration will be rejected.
 *
 * Based on: docs/CHROME_TAB_ACTIONS.md - All implemented Chrome extension actions
 */

/**
 * Action definition with validation rules
 */
export interface ActionDefinition {
  /** Action name (e.g., "click", "setValue") */
  name: string
  /** Human-readable description */
  description: string
  /** Parameter schema for validation */
  parameters: {
    /** Parameter name */
    name: string
    /** Parameter type */
    type: "string" | "number" | "boolean" | "optional"
    /** Whether parameter is required */
    required: boolean
  }[]
  /** Regex pattern to validate action format */
  pattern: RegExp
  /** Example of valid action string */
  example: string
}

/**
 * All available actions that can be executed by the Chrome extension.
 * This is the ONLY source of truth for valid actions.
 * Based on docs/CHROME_TAB_ACTIONS.md - All ✅ IMPLEMENTED actions
 */
export const AVAILABLE_ACTIONS: readonly ActionDefinition[] = [
  // Navigation & Browser Control
  {
    name: "search",
    description: "Search queries on search engines (DuckDuckGo, Google, Bing)",
    parameters: [
      { name: "query", type: "string", required: true },
      { name: "engine", type: "string", required: false },
    ],
    pattern: /^search\([^)]+\)$/,
    example: 'search("React hooks")',
  },
  {
    name: "navigate",
    description: "Navigate to a specific URL",
    parameters: [
      { name: "url", type: "string", required: true },
      { name: "newTab", type: "boolean", required: false },
    ],
    pattern: /^navigate\([^)]+\)$/,
    example: 'navigate("https://example.com")',
  },
  {
    name: "goBack",
    description: "Navigate back in browser history",
    parameters: [],
    pattern: /^goBack\(\)$/,
    example: "goBack()",
  },
  {
    name: "wait",
    description: "Wait for specified duration (useful for page loading, animations)",
    parameters: [
      { name: "seconds", type: "number", required: false },
    ],
    pattern: /^wait\([^)]*\)$/,
    example: "wait(5)",
  },

  // Page Interaction
  {
    name: "click",
    description: "Click an element by its index or coordinates",
    parameters: [
      { name: "index", type: "number", required: false },
      { name: "coordinate_x", type: "number", required: false },
      { name: "coordinate_y", type: "number", required: false },
    ],
    pattern: /^click\([^)]+\)$/,
    example: "click(68)",
  },
  {
    name: "setValue",
    description: "Input text into form fields (inputs, textareas)",
    parameters: [
      { name: "index", type: "number", required: true },
      { name: "text", type: "string", required: true },
      { name: "clear", type: "boolean", required: false },
    ],
    pattern: /^setValue\([^,]+,\s*"[^"]+"(,\s*(true|false))?\)$/,
    example: 'setValue(42, "Hello World")',
  },
  {
    name: "scroll",
    description: "Scroll the page up/down by pages",
    parameters: [
      { name: "down", type: "boolean", required: false },
      { name: "pages", type: "number", required: false },
      { name: "index", type: "number", required: false },
    ],
    pattern: /^scroll\([^)]*\)$/,
    example: "scroll(true, 2.0)",
  },
  {
    name: "findText",
    description: "Scroll to specific text on the page",
    parameters: [
      { name: "text", type: "string", required: true },
    ],
    pattern: /^findText\([^)]+\)$/,
    example: 'findText("Submit")',
  },

  // Mouse & Touch Actions
  {
    name: "hover",
    description: "Hover mouse over an element (triggers hover states, tooltips, dropdowns)",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^hover\([^)]+\)$/,
    example: "hover(42)",
  },
  {
    name: "doubleClick",
    description: "Double-click an element",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^doubleClick\([^)]+\)$/,
    example: "doubleClick(15)",
  },
  {
    name: "rightClick",
    description: "Right-click an element (opens context menu)",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^rightClick\([^)]+\)$/,
    example: "rightClick(20)",
  },
  {
    name: "dragAndDrop",
    description: "Drag an element and drop it on another element",
    parameters: [
      { name: "sourceIndex", type: "number", required: true },
      { name: "targetIndex", type: "number", required: true },
    ],
    pattern: /^dragAndDrop\([^,]+,\s*[^)]+\)$/,
    example: "dragAndDrop(10, 25)",
  },

  // Keyboard Actions
  {
    name: "press",
    description: "Press a single key or key combination",
    parameters: [
      { name: "key", type: "string", required: true },
      { name: "modifiers", type: "string", required: false },
    ],
    pattern: /^press\([^)]+\)$/,
    example: 'press("Enter")',
  },
  {
    name: "type",
    description: "Type text character by character (simulates real typing)",
    parameters: [
      { name: "text", type: "string", required: true },
      { name: "delay", type: "number", required: false },
    ],
    pattern: /^type\([^)]+\)$/,
    example: 'type("Hello World")',
  },
  {
    name: "focus",
    description: "Focus an element (brings it into focus, activates it)",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^focus\([^)]+\)$/,
    example: "focus(42)",
  },
  {
    name: "blur",
    description: "Remove focus from an element",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^blur\([^)]+\)$/,
    example: "blur(42)",
  },

  // JavaScript Execution
  {
    name: "evaluate",
    description: "Execute custom JavaScript code on the page",
    parameters: [
      { name: "code", type: "string", required: true },
    ],
    pattern: /^evaluate\([^)]+\)$/,
    example: 'evaluate("document.querySelector(\'.button\').click()")',
  },

  // Tab Management
  {
    name: "createTab",
    description: "Create a new browser tab",
    parameters: [
      { name: "url", type: "string", required: false },
      { name: "active", type: "boolean", required: false },
    ],
    pattern: /^createTab\([^)]*\)$/,
    example: 'createTab("https://example.com")',
  },
  {
    name: "switch",
    description: "Switch between browser tabs (activate a specific tab)",
    parameters: [
      { name: "tabId", type: "string", required: true },
    ],
    pattern: /^switch\([^)]+\)$/,
    example: 'switch("0001")',
  },
  {
    name: "close",
    description: "Close browser tabs",
    parameters: [
      { name: "tabId", type: "string", required: true },
    ],
    pattern: /^close\([^)]+\)$/,
    example: 'close("0001")',
  },
  {
    name: "getTabs",
    description: "Get list of all open tabs",
    parameters: [
      { name: "windowId", type: "number", required: false },
      { name: "activeOnly", type: "boolean", required: false },
    ],
    pattern: /^getTabs\([^)]*\)$/,
    example: "getTabs()",
  },

  // Form Controls
  {
    name: "check",
    description: "Check a checkbox or radio button",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^check\([^)]+\)$/,
    example: "check(15)",
  },
  {
    name: "uncheck",
    description: "Uncheck a checkbox or radio button",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^uncheck\([^)]+\)$/,
    example: "uncheck(15)",
  },
  {
    name: "dropdownOptions",
    description: "Get all options from a native dropdown or ARIA menu",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^dropdownOptions\([^)]+\)$/,
    example: "dropdownOptions(25)",
  },
  {
    name: "selectDropdown",
    description: "Select dropdown option by value or text",
    parameters: [
      { name: "index", type: "number", required: true },
      { name: "value", type: "string", required: false },
      { name: "text", type: "string", required: false },
      { name: "multiple", type: "boolean", required: false },
    ],
    pattern: /^selectDropdown\([^)]+\)$/,
    example: 'selectDropdown(25, "us")',
  },

  // Element Queries
  {
    name: "getText",
    description: "Get text content from an element",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^getText\([^)]+\)$/,
    example: "getText(42)",
  },
  {
    name: "getAttribute",
    description: "Get attribute value from an element",
    parameters: [
      { name: "index", type: "number", required: true },
      { name: "attribute", type: "string", required: true },
    ],
    pattern: /^getAttribute\([^,]+,\s*"[^"]+"\)$/,
    example: 'getAttribute(10, "href")',
  },
  {
    name: "getBoundingBox",
    description: "Get element's position and size (bounding box)",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^getBoundingBox\([^)]+\)$/,
    example: "getBoundingBox(42)",
  },
  {
    name: "isVisible",
    description: "Check if element is visible on the page",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^isVisible\([^)]+\)$/,
    example: "isVisible(42)",
  },
  {
    name: "isEnabled",
    description: "Check if element is enabled (not disabled)",
    parameters: [
      { name: "index", type: "number", required: true },
    ],
    pattern: /^isEnabled\([^)]+\)$/,
    example: "isEnabled(42)",
  },

  // Visual Actions
  {
    name: "screenshot",
    description: "Capture a screenshot of the page or element",
    parameters: [
      { name: "fullPage", type: "boolean", required: false },
      { name: "elementIndex", type: "number", required: false },
      { name: "format", type: "string", required: false },
      { name: "quality", type: "number", required: false },
    ],
    pattern: /^screenshot\([^)]*\)$/,
    example: "screenshot(true)",
  },
  {
    name: "generatePdf",
    description: "Generate PDF from the current page",
    parameters: [
      { name: "format", type: "string", required: false },
      { name: "landscape", type: "boolean", required: false },
      { name: "margin", type: "string", required: false },
      { name: "printBackground", type: "boolean", required: false },
    ],
    pattern: /^generatePdf\([^)]*\)$/,
    example: 'generatePdf("A4")',
  },

  // Dialog Handling
  {
    name: "acceptDialog",
    description: "Accept or dismiss browser dialogs (alert, confirm, prompt)",
    parameters: [
      { name: "text", type: "string", required: false },
    ],
    pattern: /^acceptDialog\([^)]*\)$/,
    example: 'acceptDialog("username")',
  },
  {
    name: "dismissDialog",
    description: "Dismiss browser dialogs",
    parameters: [],
    pattern: /^dismissDialog\(\)$/,
    example: "dismissDialog()",
  },
  {
    name: "waitForDialog",
    description: "Wait for a dialog to appear and optionally handle it",
    parameters: [
      { name: "timeout", type: "number", required: false },
      { name: "autoAccept", type: "boolean", required: false },
    ],
    pattern: /^waitForDialog\([^)]*\)$/,
    example: "waitForDialog(5000, true)",
  },

  // Network Control
  {
    name: "interceptRequest",
    description: "Intercept and modify network requests",
    parameters: [
      { name: "urlPattern", type: "string", required: true },
      { name: "action", type: "string", required: true },
      { name: "modifications", type: "string", required: false },
    ],
    pattern: /^interceptRequest\([^,]+,\s*"[^"]+"\)$/,
    example: 'interceptRequest("*://ads.example.com/*", "block")',
  },
  {
    name: "mockResponse",
    description: "Mock network responses for specific URLs",
    parameters: [
      { name: "urlPattern", type: "string", required: true },
      { name: "response", type: "string", required: true },
    ],
    pattern: /^mockResponse\([^,]+,\s*"[^"]+"\)$/,
    example: 'mockResponse("*://api.example.com/*", "{\\"status\\":200}")',
  },

  // Storage & Cookies
  {
    name: "getCookies",
    description: "Get cookies for the page or domain",
    parameters: [
      { name: "url", type: "string", required: false },
    ],
    pattern: /^getCookies\([^)]*\)$/,
    example: 'getCookies("https://example.com")',
  },
  {
    name: "setCookie",
    description: "Set a cookie for the page",
    parameters: [
      { name: "name", type: "string", required: true },
      { name: "value", type: "string", required: true },
      { name: "domain", type: "string", required: false },
      { name: "path", type: "string", required: false },
      { name: "expires", type: "number", required: false },
      { name: "httpOnly", type: "boolean", required: false },
      { name: "secure", type: "boolean", required: false },
      { name: "sameSite", type: "string", required: false },
    ],
    pattern: /^setCookie\([^,]+,\s*"[^"]+"\)$/,
    example: 'setCookie("session", "abc123")',
  },
  {
    name: "clearCookies",
    description: "Clear all cookies for the page or domain",
    parameters: [
      { name: "url", type: "string", required: false },
    ],
    pattern: /^clearCookies\([^)]*\)$/,
    example: 'clearCookies("https://example.com")',
  },
  {
    name: "getLocalStorage",
    description: "Get localStorage values",
    parameters: [
      { name: "key", type: "string", required: false },
    ],
    pattern: /^getLocalStorage\([^)]*\)$/,
    example: 'getLocalStorage("user_preferences")',
  },
  {
    name: "setLocalStorage",
    description: "Set localStorage value",
    parameters: [
      { name: "key", type: "string", required: true },
      { name: "value", type: "string", required: true },
    ],
    pattern: /^setLocalStorage\([^,]+,\s*"[^"]+"\)$/,
    example: 'setLocalStorage("theme", "dark")',
  },
  {
    name: "clearStorage",
    description: "Clear localStorage, sessionStorage, or IndexedDB",
    parameters: [
      { name: "storageType", type: "string", required: true },
    ],
    pattern: /^clearStorage\("[^"]+"\)$/,
    example: 'clearStorage("localStorage")',
  },

  // Performance & Tracing
  {
    name: "startTracing",
    description: "Start performance tracing",
    parameters: [
      { name: "categories", type: "string", required: false },
      { name: "options", type: "string", required: false },
    ],
    pattern: /^startTracing\([^)]*\)$/,
    example: "startTracing()",
  },
  {
    name: "stopTracing",
    description: "Stop tracing and get trace data",
    parameters: [],
    pattern: /^stopTracing\(\)$/,
    example: "stopTracing()",
  },
  {
    name: "getMetrics",
    description: "Get performance metrics (load time, paint metrics, etc.)",
    parameters: [],
    pattern: /^getMetrics\(\)$/,
    example: "getMetrics()",
  },

  // Task Completion
  {
    name: "finish",
    description: "Task completed successfully",
    parameters: [
      { name: "text", type: "string", required: false },
      { name: "success", type: "boolean", required: false },
    ],
    pattern: /^finish\([^)]*\)$/,
    example: 'finish("Task completed")',
  },
  {
    name: "fail",
    description: "Task failed with reason",
    parameters: [
      { name: "reason", type: "string", required: false },
    ],
    pattern: /^fail\([^)]*\)$/,
    example: 'fail("Element not found")',
  },
  // Improvement 1: Dynamic web search tool (SERVER tool)
  {
    name: "googleSearch",
    description: "Search the web for information to help complete the task. Use this when you need more context or encounter an error. This is a SERVER tool that performs backend web search.",
    parameters: [
      { name: "query", type: "string", required: true },
    ],
    pattern: /^googleSearch\([^)]+\)$/,
    example: 'googleSearch("How to find settings button in Salesforce Lightning")',
  },
  // Improvement 4: Explicit verification action
  {
    name: "verifySuccess",
    description: "Verify that the task has been completed successfully. Use this before calling finish() if there were recent failures. Describe what visual element or page state confirms success.",
    parameters: [
      { name: "description", type: "string", required: true },
    ],
    pattern: /^verifySuccess\([^)]+\)$/,
    example: 'verifySuccess("I see the Order Confirmed banner on the page")',
  },
] as const

/**
 * Get action definition by name
 */
export function getActionDefinition(actionName: string): ActionDefinition | undefined {
  return AVAILABLE_ACTIONS.find((action) => action.name === actionName)
}

/**
 * Check if an action name is valid
 */
export function isValidActionName(actionName: string): boolean {
  return AVAILABLE_ACTIONS.some((action) => action.name === actionName)
}

/**
 * Validate action format against configuration
 * This is the STRICT validation that must pass for any generated action
 */
export function validateActionFormat(action: string): boolean {
  const trimmed = action.trim()
  if (!trimmed) {
    return false
  }

  // Check against all action patterns
  return AVAILABLE_ACTIONS.some((actionDef) => actionDef.pattern.test(trimmed))
}

/**
 * Validate action name matches configuration
 */
export function validateActionName(action: string): { valid: boolean; actionName?: string; error?: string } {
  const trimmed = action.trim()

  // Extract action name (everything before the first parenthesis)
  const nameMatch = trimmed.match(/^([a-zA-Z]+)\(/)
  if (!nameMatch || !nameMatch[1]) {
    return {
      valid: false,
      error: "Action must be in format: actionName(params)",
    }
  }

  const actionName = nameMatch[1]

  // Check if action name exists in configuration
  if (!isValidActionName(actionName)) {
    return {
      valid: false,
      actionName,
      error: `Invalid action name: "${actionName}". Valid actions are: ${AVAILABLE_ACTIONS.map((a) => a.name).join(", ")}`,
    }
  }

  // Check if format matches pattern
  const actionDef = getActionDefinition(actionName)
  if (!actionDef) {
    return {
      valid: false,
      actionName,
      error: `Action definition not found for: "${actionName}"`,
    }
  }

  if (!actionDef.pattern.test(trimmed)) {
    return {
      valid: false,
      actionName,
      error: `Action format does not match expected pattern. Expected format: ${actionDef.example}`,
    }
  }

  return {
    valid: true,
    actionName,
  }
}

/**
 * Generate prompt text listing all available actions
 * Used in all LLM prompts to ensure consistency
 */
export function getAvailableActionsPrompt(): string {
  // Group actions by category for better readability
  const categories: Record<string, ActionDefinition[]> = {
    "Navigation & Browser Control": [],
    "Page Interaction": [],
    "Mouse & Touch Actions": [],
    "Keyboard Actions": [],
    "JavaScript Execution": [],
    "Tab Management": [],
    "Form Controls": [],
    "Element Queries": [],
    "Visual Actions": [],
    "Dialog Handling": [],
    "Network Control": [],
    "Storage & Cookies": [],
    "Performance & Tracing": [],
    "Task Completion": [],
  }

  // Categorize actions
  AVAILABLE_ACTIONS.forEach((action) => {
    if (["search", "navigate", "goBack", "wait"].includes(action.name)) {
      categories["Navigation & Browser Control"]!.push(action)
    } else if (["click", "setValue", "scroll", "findText"].includes(action.name)) {
      categories["Page Interaction"]!.push(action)
    } else if (["hover", "doubleClick", "rightClick", "dragAndDrop"].includes(action.name)) {
      categories["Mouse & Touch Actions"]!.push(action)
    } else if (["press", "type", "focus", "blur"].includes(action.name)) {
      categories["Keyboard Actions"]!.push(action)
    } else if (["evaluate"].includes(action.name)) {
      categories["JavaScript Execution"]!.push(action)
    } else if (["createTab", "switch", "close", "getTabs"].includes(action.name)) {
      categories["Tab Management"]!.push(action)
    } else if (["check", "uncheck", "dropdownOptions", "selectDropdown"].includes(action.name)) {
      categories["Form Controls"]!.push(action)
    } else if (["getText", "getAttribute", "getBoundingBox", "isVisible", "isEnabled"].includes(action.name)) {
      categories["Element Queries"]!.push(action)
    } else if (["screenshot", "generatePdf"].includes(action.name)) {
      categories["Visual Actions"]!.push(action)
    } else if (["acceptDialog", "dismissDialog", "waitForDialog"].includes(action.name)) {
      categories["Dialog Handling"]!.push(action)
    } else if (["interceptRequest", "mockResponse"].includes(action.name)) {
      categories["Network Control"]!.push(action)
    } else if (["getCookies", "setCookie", "clearCookies", "getLocalStorage", "setLocalStorage", "clearStorage"].includes(action.name)) {
      categories["Storage & Cookies"]!.push(action)
    } else if (["startTracing", "stopTracing", "getMetrics"].includes(action.name)) {
      categories["Performance & Tracing"]!.push(action)
    } else if (["finish", "fail"].includes(action.name)) {
      categories["Task Completion"]!.push(action)
    }
  })

  // Build formatted action list by category
  const actionListParts: string[] = []
  Object.entries(categories).forEach(([category, actions]) => {
    if (actions.length > 0) {
      actionListParts.push(`\n${category}:`)
      actions.forEach((action) => {
        const params = action.parameters
          .map((param) => {
            if (param.required) {
              return `${param.name} (${param.type})`
            }
            return `${param.name} (${param.type}, optional)`
          })
          .join(", ")

        const paramsText = params ? `(${params})` : "()"
        actionListParts.push(`  - ${action.name}${paramsText} - ${action.description}`)
      })
    }
  })

  const actionList = actionListParts.join("\n")

  return `Available Actions (YOU MUST ONLY USE THESE ACTIONS - NO OTHER ACTIONS ARE ALLOWED):
${actionList}

CRITICAL RULES:
1. You MUST only generate actions from the list above
2. Action format must exactly match the examples
3. For click(): Use element index (number) from the DOM, NOT CSS selectors
4. For setValue(): index must be a number, text must be a quoted string
5. For actions with optional parameters: You can omit optional parameters
6. Do NOT invent new action names or formats
7. Do NOT use CSS selectors - only use element indices (numbers) from the DOM
8. String parameters must be quoted with double quotes
9. Boolean parameters: use true or false (no quotes)
10. Number parameters: use numeric values (no quotes)

Examples:
${AVAILABLE_ACTIONS.slice(0, 10).map((action) => `- ${action.example}`).join("\n")}
... and ${AVAILABLE_ACTIONS.length - 10} more actions (see full list above)

Total Actions Available: ${AVAILABLE_ACTIONS.length}`
}

/**
 * Extract element ID from click action
 */
export function extractElementIdFromClick(action: string): string | null {
  const match = action.match(/^click\(([^)]+)\)$/)
  return match && match[1] ? match[1] : null
}

/**
 * Extract element ID and text from setValue action
 */
export function extractSetValueParams(action: string): { elementId: string; text: string } | null {
  const match = action.match(/^setValue\(([^,]+),\s*"([^"]+)"\)$/)
  if (!match || !match[1] || !match[2]) {
    return null
  }
  return {
    elementId: match[1].trim(),
    text: match[2],
  }
}

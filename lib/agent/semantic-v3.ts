import type { SemanticNodeV3 } from "@/lib/agent/schemas"

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function roleToTagAndRole(r: string): { tag: string; role?: string } {
  // `r` is minified in V3 but may also be full role strings in some fallbacks.
  switch (r) {
    case "btn":
    case "button":
      return { tag: "button" }
    case "inp":
    case "textbox":
    case "searchbox":
    case "input":
      return { tag: "input", role: r === "searchbox" ? "searchbox" : r === "textbox" ? "textbox" : undefined }
    case "textarea":
      return { tag: "textarea", role: "textbox" }
    case "link":
      return { tag: "a", role: "link" }
    case "chk":
    case "checkbox":
      return { tag: "input", role: "checkbox" }
    case "radio":
      return { tag: "input", role: "radio" }
    case "sel":
    case "select":
      return { tag: "select", role: "combobox" }
    case "opt":
    case "option":
      return { tag: "option", role: "option" }
    case "switch":
      return { tag: "button", role: "switch" }
    case "tab":
      return { tag: "button", role: "tab" }
    case "menu":
    case "menuitem":
      return { tag: "button", role: "menuitem" }
    default:
      // Conservative default: include as role-bearing element so downstream parsers can still see it.
      return { tag: "div", role: r }
  }
}

/**
 * Render a compact HTML snapshot from V3 semantic nodes.
 *
 * This is NOT intended to be a full-fidelity DOM; it exists to keep legacy
 * verification and diff machinery functional when the client sends semantic-only.
 */
export function renderInteractiveTreeAsHtml(
  interactiveTree: SemanticNodeV3[] | undefined,
  recentEvents?: string[]
): string {
  const nodes = Array.isArray(interactiveTree) ? interactiveTree : []

  const alerts =
    recentEvents && recentEvents.length > 0
      ? recentEvents
          .slice(0, 20)
          .map((e, idx) => `<div role="alert" id="event-${idx}">${escapeText(e)}</div>`)
          .join("\n")
      : ""

  const body = nodes
    .map((n) => {
      const { tag, role } = roleToTagAndRole(n.r)
      const idAttr = ` id="${escapeAttr(n.i)}"`
      const roleAttr = role ? ` role="${escapeAttr(role)}"` : ""
      const aria = n.n ? ` aria-label="${escapeAttr(n.n)}"` : ""

      if (tag === "a") {
        return `<a${idAttr}${roleAttr}${aria}>${escapeText(n.n ?? "")}</a>`
      }
      if (tag === "button") {
        return `<button${idAttr}${roleAttr}${aria}>${escapeText(n.n ?? "")}</button>`
      }
      if (tag === "input") {
        const valueAttr = n.v != null ? ` value="${escapeAttr(n.v)}"` : ""
        return `<input${idAttr}${roleAttr}${aria}${valueAttr} />`
      }
      if (tag === "textarea") {
        const valueText = n.v != null ? escapeText(n.v) : ""
        return `<textarea${idAttr}${roleAttr}${aria}>${valueText}</textarea>`
      }
      if (tag === "select") {
        return `<select${idAttr}${roleAttr}${aria}></select>`
      }
      return `<div${idAttr}${roleAttr}${aria}>${escapeText(n.n ?? "")}</div>`
    })
    .join("\n")

  return `<html><body>\n${alerts}\n${body}\n</body></html>`
}


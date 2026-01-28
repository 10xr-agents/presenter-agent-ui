/**
 * DOM-based checks for verification (prediction-based path).
 * Uses dom-helpers for robust regex matching.
 * @see docs/VERIFICATION_PROCESS.md
 */

import type { ActionType } from "@/lib/agent/action-type"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import {
  checkAriaExpanded,
  checkElementExists,
  checkElementHasText,
  checkElementNotExists,
  checkRolesExist,
  hasSignificantUrlChange,
} from "@/lib/utils/dom-helpers"
import type { ActualState, DOMCheckResults } from "./types"

/**
 * Extract actual state from DOM
 */
export function extractActualState(dom: string, url: string): ActualState {
  const textMatch = dom.match(/<[^>]*>([^<]+)<\/[^>]*>/g)
  const extractedText = textMatch
    ? textMatch
        .slice(0, 10)
        .map((match) => match.replace(/<[^>]*>/g, ""))
        .join(" ")
        .substring(0, 500)
    : undefined

  return {
    domSnapshot: dom,
    url,
    extractedText,
  }
}

/**
 * Detect if expected outcome describes a dropdown/popup open (not navigation).
 */
export function isPopupExpectation(
  domChanges: NonNullable<ExpectedOutcome["domChanges"]>
): boolean {
  const urlSame = domChanges.urlShouldChange === false
  const hasExpanded = domChanges.attributeChanges?.some(
    (c) => c.attribute === "aria-expanded" && c.expectedValue === "true"
  )
  const hasMenuHint = (domChanges.elementsToAppear?.length ?? 0) > 0 || hasExpanded
  return Boolean(urlSame && hasMenuHint)
}

/**
 * Perform DOM-based checks using robust regex matching.
 */
export function performDOMChecks(
  expectedOutcome: ExpectedOutcome,
  actualState: ActualState,
  previousUrl?: string,
  actionType?: ActionType
): DOMCheckResults {
  const results: DOMCheckResults = {}
  const dom = actualState.domSnapshot
  const domChanges = expectedOutcome.domChanges
  if (!domChanges) return results

  const isPopupFromOutcome = isPopupExpectation(domChanges)
  const isPopup = isPopupFromOutcome || actionType === "dropdown"

  if (!isPopup && domChanges.elementShouldExist) {
    results.elementExists = checkElementExists(dom, domChanges.elementShouldExist)
  }

  if (domChanges.elementShouldNotExist && !isPopup) {
    results.elementNotExists = checkElementNotExists(dom, domChanges.elementShouldNotExist)
  }

  if (domChanges.elementShouldHaveText && !isPopup) {
    const { selector, text } = domChanges.elementShouldHaveText
    results.elementTextMatches = checkElementHasText(dom, selector, text)
  }

  if (domChanges.urlShouldChange !== undefined && previousUrl !== undefined) {
    const urlChanged = hasSignificantUrlChange(previousUrl, actualState.url)
    results.urlChanged = domChanges.urlShouldChange ? urlChanged : !urlChanged
  }

  if (domChanges.attributeChanges && domChanges.attributeChanges.length > 0) {
    const expandedChange = domChanges.attributeChanges.find(
      (change) => change.attribute === "aria-expanded" && change.expectedValue === "true"
    )
    if (expandedChange) {
      results.attributeChanged = checkAriaExpanded(dom, "true")
    }
  }

  if (domChanges.elementsToAppear && domChanges.elementsToAppear.length > 0) {
    const rolesToCheck: string[] = []
    const selectorsToCheck: string[] = []
    for (const expected of domChanges.elementsToAppear) {
      if (expected.role) rolesToCheck.push(expected.role)
      if (expected.selector) selectorsToCheck.push(expected.selector)
    }
    const hasRoles = rolesToCheck.length > 0 && checkRolesExist(dom, rolesToCheck)
    const hasSelectors = selectorsToCheck.some((sel) => checkElementExists(dom, sel))
    results.elementsAppeared = hasRoles || hasSelectors
  }

  return results
}

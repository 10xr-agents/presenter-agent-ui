/**
 * Observation builder unit tests (Task 3: state drift — skeleton-primary, meaningfulContentChange).
 *
 * @see docs/VERIFICATION_PROCESS.md
 */

import { describe, expect, it } from "vitest"
import { extractSemanticSkeleton } from "@/lib/agent/observation/diff-engine"
import { buildObservationList } from "../observation-builder"
import type { BeforeState } from "../types"

const minimalHtmlWithButton = `<html><body><button id="btn">Save</button></body></html>`
const minimalHtmlWithButtonDifferent = `<html><body><button id="btn">Saved</button></body></html>`

describe("buildObservationList (Task 3: state drift)", () => {
  it("returns meaningfulContentChange true when skeleton diff has items", () => {
    const beforeState: BeforeState = {
      url: "https://example.com",
      domHash: "h1",
      semanticSkeleton: extractSemanticSkeleton(minimalHtmlWithButton),
    }
    const result = buildObservationList(
      beforeState,
      "https://example.com",
      "h2",
      undefined,
      undefined,
      minimalHtmlWithButtonDifferent
    )
    expect(result.observations.length).toBeGreaterThan(0)
    expect(result.meaningfulContentChange).toBe(true)
  })

  it("returns meaningfulContentChange false when skeleton diff empty but domHash changed (ticker-like)", () => {
    const beforeState: BeforeState = {
      url: "https://example.com",
      domHash: "hashBefore",
      semanticSkeleton: extractSemanticSkeleton(minimalHtmlWithButton),
    }
    const result = buildObservationList(
      beforeState,
      "https://example.com",
      "hashAfter",
      undefined,
      undefined,
      minimalHtmlWithButton
    )
    expect(result.observations.some((o) => o.includes("no interactive element changes"))).toBe(true)
    expect(result.meaningfulContentChange).toBe(false)
  })

  it("returns meaningfulContentChange true when no skeleton and domHash changed", () => {
    const beforeState: BeforeState = {
      url: "https://example.com",
      domHash: "h1",
    }
    const result = buildObservationList(
      beforeState,
      "https://example.com",
      "h2",
      undefined,
      undefined,
      undefined
    )
    expect(result.observations.some((o) => o.includes("Page content updated"))).toBe(true)
    expect(result.meaningfulContentChange).toBe(true)
  })

  it("returns meaningfulContentChange false when no skeleton and domHash same", () => {
    const beforeState: BeforeState = {
      url: "https://example.com",
      domHash: "h1",
    }
    const result = buildObservationList(
      beforeState,
      "https://example.com",
      "h1",
      undefined,
      undefined,
      undefined
    )
    expect(result.meaningfulContentChange).toBe(false)
  })

  it("includes client witness (didDomMutate, didUrlChange) in observations", () => {
    const beforeState: BeforeState = { url: "https://a.com", domHash: "h1" }
    const result = buildObservationList(
      beforeState,
      "https://a.com",
      "h1",
      undefined,
      { didDomMutate: true, didUrlChange: true },
      undefined
    )
    expect(result.observations.some((o) => o.includes("DOM was mutated"))).toBe(true)
    expect(result.observations.some((o) => o.includes("Extension reported URL changed"))).toBe(true)
  })
})

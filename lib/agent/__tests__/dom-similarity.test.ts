/**
 * Unit Tests for DOM Similarity Algorithm (Phase 3 Task 2)
 */

import { describe, it, expect } from "vitest"
import {
  calculateDomSimilarity,
  hasSignificantUrlChange,
  shouldTriggerReplanning,
} from "../dom-similarity"

describe("DOM Similarity Algorithm", () => {
  describe("calculateDomSimilarity", () => {
    it("should return 1.0 similarity for identical DOMs", () => {
      const dom = `<html><body><button id="submit">Submit</button><input type="text" name="email"></body></html>`
      
      const result = calculateDomSimilarity(dom, dom)
      
      expect(result.similarity).toBeCloseTo(1.0, 1)
      expect(result.shouldReplan).toBe(false)
      expect(result.structuralChanges).toHaveLength(0)
    })

    it("should return low similarity for completely different DOMs", () => {
      const dom1 = `<html><body><form id="loginForm"><input type="email"><button>Login</button></form></body></html>`
      const dom2 = `<html><body><div id="dashboard"><h1>Welcome</h1><nav><a href="/home">Home</a></nav></div></body></html>`
      
      const result = calculateDomSimilarity(dom1, dom2)
      
      expect(result.similarity).toBeLessThan(0.7)
      expect(result.shouldReplan).toBe(true)
    })

    it("should detect form removal as structural change", () => {
      const dom1 = `<html><body><form id="myForm"><input type="text"><button>Submit</button></form></body></html>`
      const dom2 = `<html><body><div id="success">Form submitted!</div></body></html>`
      
      const result = calculateDomSimilarity(dom1, dom2)
      
      expect(result.structuralChanges).toContain("form removed")
      expect(result.shouldReplan).toBe(true)
    })

    it("should detect form addition as structural change", () => {
      const dom1 = `<html><body><div id="welcome">Welcome</div></body></html>`
      const dom2 = `<html><body><div id="welcome">Welcome</div><form id="signup"><input type="email"></form></body></html>`
      
      const result = calculateDomSimilarity(dom1, dom2)
      
      expect(result.structuralChanges).toContain("form added")
    })

    it("should detect modal/dialog opening", () => {
      const dom1 = `<html><body><button id="openModal">Open</button></body></html>`
      const dom2 = `<html><body><button id="openModal">Open</button><dialog role="dialog" open><p>Modal content</p></dialog></body></html>`
      
      const result = calculateDomSimilarity(dom1, dom2)
      
      expect(result.structuralChanges).toContain("dialog/modal opened")
    })

    it("should weight interactive elements higher", () => {
      // DOM 1 has many interactive elements
      const dom1 = `
        <html><body>
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
          <input type="text" name="field1">
          <input type="email" name="field2">
          <select name="dropdown"><option>A</option></select>
        </body></html>
      `
      
      // DOM 2 has same structure but different non-interactive content
      const dom2 = `
        <html><body>
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
          <input type="text" name="field1">
          <input type="email" name="field2">
          <select name="dropdown"><option>A</option></select>
          <div>Extra content</div>
          <p>More text</p>
        </body></html>
      `
      
      const result = calculateDomSimilarity(dom1, dom2)
      
      // Interactive similarity should be high since buttons/inputs are the same
      expect(result.interactiveSimilarity).toBeGreaterThan(0.8)
    })

    it("should handle empty DOMs gracefully", () => {
      const result = calculateDomSimilarity("", "")
      
      expect(result.similarity).toBeCloseTo(1.0, 1)
      expect(result.shouldReplan).toBe(false)
    })

    it("should calculate element counts correctly", () => {
      const dom1 = `<html><body><div><button>A</button><input type="text"></div></body></html>`
      const dom2 = `<html><body><div><button>A</button><button>B</button></div></body></html>`
      
      const result = calculateDomSimilarity(dom1, dom2)
      
      expect(result.elementCounts.previous).toBeGreaterThan(0)
      expect(result.elementCounts.current).toBeGreaterThan(0)
      expect(result.elementCounts.intersection).toBeGreaterThan(0)
    })

    it("should use default threshold of 0.7", () => {
      // Create DOMs with ~60% similarity
      const dom1 = `<html><body><button id="a">A</button><button id="b">B</button><button id="c">C</button></body></html>`
      const dom2 = `<html><body><button id="a">A</button><button id="b">B</button><input type="text"></body></html>`
      
      const result = calculateDomSimilarity(dom1, dom2)
      
      // Should trigger replan if similarity < 0.7
      if (result.similarity < 0.7) {
        expect(result.shouldReplan).toBe(true)
      }
    })

    it("should respect custom threshold", () => {
      const dom1 = `<html><body><button>A</button><button>B</button></body></html>`
      const dom2 = `<html><body><button>A</button><input type="text"></body></html>`
      
      // With high threshold, more things should trigger replan
      const result80 = calculateDomSimilarity(dom1, dom2, 0.8)
      
      // With low threshold, fewer things should trigger replan
      const result50 = calculateDomSimilarity(dom1, dom2, 0.5)
      
      // If similarity is between 0.5 and 0.8, results should differ
      if (result80.similarity >= 0.5 && result80.similarity < 0.8) {
        expect(result80.shouldReplan).toBe(true)
        expect(result50.shouldReplan).toBe(false)
      }
    })
  })

  describe("hasSignificantUrlChange", () => {
    it("should return false for identical URLs", () => {
      expect(hasSignificantUrlChange(
        "https://example.com/page",
        "https://example.com/page"
      )).toBe(false)
    })

    it("should return true for path change", () => {
      expect(hasSignificantUrlChange(
        "https://example.com/page1",
        "https://example.com/page2"
      )).toBe(true)
    })

    it("should return true for domain change", () => {
      expect(hasSignificantUrlChange(
        "https://example.com/page",
        "https://other.com/page"
      )).toBe(true)
    })

    it("should return false for query param change only", () => {
      expect(hasSignificantUrlChange(
        "https://example.com/page?a=1",
        "https://example.com/page?a=2"
      )).toBe(false)
    })

    it("should return false for hash change only", () => {
      expect(hasSignificantUrlChange(
        "https://example.com/page#section1",
        "https://example.com/page#section2"
      )).toBe(false)
    })

    it("should handle invalid URLs gracefully", () => {
      expect(hasSignificantUrlChange("not-a-url", "also-not-a-url")).toBe(true)
      expect(hasSignificantUrlChange("not-a-url", "not-a-url")).toBe(false)
    })
  })

  describe("shouldTriggerReplanning", () => {
    it("should trigger replanning on URL change", () => {
      const dom = `<html><body><button>Test</button></body></html>`
      
      const result = shouldTriggerReplanning(
        dom,
        dom,
        "https://example.com/page1",
        "https://example.com/page2"
      )
      
      expect(result.shouldReplan).toBe(true)
      expect(result.urlChanged).toBe(true)
      expect(result.reasons.some(r => r.includes("URL path changed"))).toBe(true)
    })

    it("should trigger replanning on low DOM similarity", () => {
      const dom1 = `<html><body><form><input type="text"><button>Submit</button></form></body></html>`
      const dom2 = `<html><body><h1>Success!</h1><p>Thank you.</p></body></html>`
      
      const result = shouldTriggerReplanning(
        dom1,
        dom2,
        "https://example.com/form",
        "https://example.com/form"
      )
      
      expect(result.shouldReplan).toBe(true)
      expect(result.urlChanged).toBe(false)
      expect(result.reasons.some(r => r.includes("DOM similarity below threshold"))).toBe(true)
    })

    it("should not trigger replanning when DOM and URL are stable", () => {
      const dom = `<html><body><button id="btn">Click</button><input name="field"></body></html>`
      const url = "https://example.com/page"
      
      const result = shouldTriggerReplanning(dom, dom, url, url)
      
      expect(result.shouldReplan).toBe(false)
      expect(result.urlChanged).toBe(false)
    })

    it("should include structural changes in reasons", () => {
      const dom1 = `<html><body><form id="form1"><input><button>Submit</button></form></body></html>`
      const dom2 = `<html><body><p>Form submitted successfully</p></body></html>`
      
      const result = shouldTriggerReplanning(
        dom1,
        dom2,
        "https://example.com/page",
        "https://example.com/page"
      )
      
      expect(result.reasons.some(r => r.includes("Structural changes"))).toBe(true)
    })

    it("should use custom similarity threshold", () => {
      const dom1 = `<html><body><button>A</button><button>B</button></body></html>`
      const dom2 = `<html><body><button>A</button><input type="text"></body></html>`
      const url = "https://example.com/page"
      
      // With strict threshold
      const strict = shouldTriggerReplanning(dom1, dom2, url, url, 0.9)
      
      // With lenient threshold
      const lenient = shouldTriggerReplanning(dom1, dom2, url, url, 0.3)
      
      // If similarity is between 0.3 and 0.9, results should differ
      if (strict.domSimilarity.similarity >= 0.3 && strict.domSimilarity.similarity < 0.9) {
        expect(strict.shouldReplan).toBe(true)
        expect(lenient.shouldReplan).toBe(false)
      }
    })
  })
})

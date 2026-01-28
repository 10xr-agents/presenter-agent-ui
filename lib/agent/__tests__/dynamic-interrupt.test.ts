/**
 * Dynamic Interrupt Unit Tests (Phase 4 Task 5)
 *
 * Tests for mid-flight MISSING_INFO detection and processing.
 *
 * Note: These tests only test the pure functions that don't require
 * database connections or external services.
 */

import { describe, expect, it, vi } from "vitest"

// Mock environment to avoid database connection
vi.mock("@/lib/db/mongoose", () => ({
  connectMongoose: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/cost", () => ({
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

import { detectMissingInfo, hasMissingInfo } from "../dynamic-interrupt"

describe("Dynamic Interrupt", () => {
  describe("detectMissingInfo", () => {
    it("detects MISSING_INFO: format", () => {
      const output = "I need to fill the form but MISSING_INFO: insurance_code is required."
      const result = detectMissingInfo(output)
      
      expect(result).toHaveLength(1)
      expect(result[0]?.parameter).toBe("insurance_code")
      expect(result[0]?.type).toBe("EXTERNAL_KNOWLEDGE")
    })

    it("detects MISSING_INFO: [parameter] format", () => {
      const output = "MISSING_INFO: [patient_diagnosis_code]"
      const result = detectMissingInfo(output)
      
      expect(result).toHaveLength(1)
      expect(result[0]?.parameter).toBe("patient_diagnosis_code")
    })

    it("detects <MISSING_INFO> XML format", () => {
      const output = "I need <MISSING_INFO>ICD-10 code for diabetes</MISSING_INFO> to proceed."
      const result = detectMissingInfo(output)
      
      expect(result).toHaveLength(1)
      expect(result[0]?.parameter).toBe("ICD-10 code for diabetes")
    })

    it("detects multiple missing info items", () => {
      const output = `
        MISSING_INFO: zip_code
        MISSING_INFO: insurance_provider
      `
      const result = detectMissingInfo(output)
      
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.parameter)).toContain("zip_code")
      expect(result.map((r) => r.parameter)).toContain("insurance_provider")
    })

    it("deduplicates same parameter", () => {
      const output = `
        MISSING_INFO: patient_id
        MISSING_INFO: patient_id
      `
      const result = detectMissingInfo(output)
      
      expect(result).toHaveLength(1)
    })

    it("classifies private data correctly", () => {
      const privateOutputs = [
        "MISSING_INFO: password",
        "MISSING_INFO: [social security number]", // Use bracket format for phrases
        "MISSING_INFO: [patient phone number]",
        "MISSING_INFO: [date of birth]",
        "MISSING_INFO: [personal email address]",
      ]

      for (const output of privateOutputs) {
        const result = detectMissingInfo(output)
        expect(result[0]?.type).toBe("PRIVATE_DATA")
      }
    })

    it("classifies external knowledge correctly", () => {
      const externalOutputs = [
        "MISSING_INFO: [ICD-10 code]",
        "MISSING_INFO: medication_dosage",
        "MISSING_INFO: procedure_code",
        "MISSING_INFO: [billing code format]",
      ]

      for (const output of externalOutputs) {
        const result = detectMissingInfo(output)
        expect(result[0]?.type).toBe("EXTERNAL_KNOWLEDGE")
      }
    })

    it("returns empty array when no MISSING_INFO", () => {
      const output = "I will click the submit button now."
      const result = detectMissingInfo(output)
      
      expect(result).toHaveLength(0)
    })
  })

  describe("hasMissingInfo", () => {
    it("returns true when MISSING_INFO is present", () => {
      expect(hasMissingInfo("MISSING_INFO: test")).toBe(true)
      expect(hasMissingInfo("<MISSING_INFO>test</MISSING_INFO>")).toBe(true)
    })

    it("returns false when no MISSING_INFO", () => {
      expect(hasMissingInfo("Regular LLM output")).toBe(false)
      expect(hasMissingInfo("")).toBe(false)
    })
  })
})

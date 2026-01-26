import { z } from "zod"

/**
 * Zod schema for preferences request body
 */
export const preferencesRequestSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  clientVersion: z.string().optional(),
})

/**
 * TypeScript type inferred from Zod schema
 */
export type PreferencesRequest = z.infer<typeof preferencesRequestSchema>

/**
 * Preferences response type
 */
export interface PreferencesResponse {
  preferences: {
    theme: "light" | "dark" | "system"
  }
  syncedAt?: string
}

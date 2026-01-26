import mongoose, { Schema } from "mongoose"

/**
 * Allowed Domain Model
 *
 * Domain **filter** per tenant for Thin Client (extension) access.
 * Used by GET /api/knowledge/resolve and POST /api/agent/interact
 * to decide **when** to query org-specific RAG (§1.6 THIN_CLIENT_ROADMAP_SERVER).
 *
 * - If Active Domain (from request URL) matches a pattern here AND we have
 *   org-specific chunks for that domain → use org-specific RAG.
 * - Otherwise → use **public knowledge only**. We **do not** 403 based on
 *   allowed_domains; we always help on all domains.
 *
 * Tenant ID: userId (normal mode) or organizationId (organization mode)
 */
export interface IAllowedDomain extends mongoose.Document {
  tenantId: string // userId or organizationId
  domainPattern: string // e.g. "*.example.com", "app.acme.com"
  createdAt: Date
}

const AllowedDomainSchema = new Schema<IAllowedDomain>(
  {
    tenantId: {
      type: String,
      required: true,
    },
    domainPattern: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

// Index for efficient tenant + domain lookups
AllowedDomainSchema.index({ tenantId: 1, domainPattern: 1 }, { unique: true })

export const AllowedDomain =
  mongoose.models.AllowedDomain ||
  mongoose.model<IAllowedDomain>("AllowedDomain", AllowedDomainSchema)

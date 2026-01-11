import mongoose, { Schema } from "mongoose"

export type TeamRole = "team_admin" | "team_member"

export interface ITeamMembership extends mongoose.Document {
  userId: string
  teamId: string
  teamRole: TeamRole
  addedByUserId: string
  createdAt: Date
}

const TeamMembershipSchema = new Schema<ITeamMembership>(
  {
    userId: { type: String, required: true },
    teamId: { type: String, required: true, index: true },
    teamRole: {
      type: String,
      enum: ["team_admin", "team_member"],
      default: "team_member",
      index: true,
    },
    addedByUserId: { type: String, required: true },
  },
  { timestamps: true }
)

// Indexes for efficient queries
TeamMembershipSchema.index({ userId: 1, teamId: 1 }, { unique: true })
TeamMembershipSchema.index({ teamId: 1, teamRole: 1 })
TeamMembershipSchema.index({ userId: 1 })

export const TeamMembership =
  mongoose.models.TeamMembership ||
  mongoose.model<ITeamMembership>("TeamMembership", TeamMembershipSchema)

import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { bearer, organization } from "better-auth/plugins"
import { Resend } from "resend"
import { logger } from "@/lib/utils/logger"

// Lazy import prisma to allow Better Auth CLI to read config without Prisma client
function getPrisma() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const prismaModule = require("@/lib/db/prisma")
    return prismaModule.prisma
  } catch {
    // Prisma not available yet - Better Auth CLI will handle this
    return null
  }
}

const prisma = getPrisma()

// Lazy Resend client
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  return new Resend(apiKey)
}

// Email sender configuration
const getEmailFrom = () =>
  process.env.EMAIL_FROM || "Screen Agent Platform <noreply@screenagent.ai>"

// Build auth config - conditionally include database adapter
const authConfig: Parameters<typeof betterAuth>[0] = {
  // Database adapter - Using Prisma with MongoDB
  // Only include if prisma is available (after client generation)
  ...(prisma ? {
    database: prismaAdapter(prisma, {
      provider: "mongodb",
    }),
  } : {}),

  // App configuration
  appName: "Screen Agent Platform",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || "development-secret-change-in-production-min-32-chars",

  // Trusted origins for Chrome extension
  trustedOrigins: process.env.NODE_ENV === "production"
    ? process.env.CHROME_EXTENSION_ID
      ? [`chrome-extension://${process.env.CHROME_EXTENSION_ID}`]
      : []
    : ["chrome-extension://*"], // Dev: allow all extensions (less secure)

  // Plugins
  plugins: [
    bearer(),
    organization({
      // Configuration options
      allowUserToCreateOrganization: true,
      organizationLimit: parseInt(process.env.ORGANIZATION_LIMIT || "5", 10),
      membershipLimit: parseInt(process.env.MEMBERSHIP_LIMIT || "100", 10),
      creatorRole: "owner",
      
      // Invitation email handler
      async sendInvitationEmail(data) {
        logger.info("Organization invitation email requested", {
          organizationId: data.organization.id,
          organizationName: data.organization.name,
          inviteeEmail: data.email,
          inviterId: data.inviter.user.id,
          inviterEmail: data.inviter.user.email,
        })

        const resend = getResendClient()
        if (!resend) {
          logger.warn("Resend not configured, skipping invitation email", {
            organizationId: data.organization.id,
            inviteeEmail: data.email,
            invitationId: data.id,
          })
          logger.debug("Invitation link (for manual sharing)", {
            invitationId: data.id,
            link: `${process.env.BETTER_AUTH_URL}/accept-invitation/${data.id}`,
          })
          return
        }

        const inviteLink = `${process.env.BETTER_AUTH_URL}/accept-invitation/${data.id}`
        
        try {
          logger.debug("Sending organization invitation email", {
            inviteeEmail: data.email,
            organizationId: data.organization.id,
            invitationId: data.id,
          })

          const result = await resend.emails.send({
            from: getEmailFrom(),
            to: data.email,
            subject: `Invitation to join ${data.organization.name}`,
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Organization Invitation</title>
                </head>
                <body style="font-family: 'Poppins', Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
                    <tr>
                      <td align="center">
                        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                          <tr>
                            <td style="background: linear-gradient(135deg, #559EFF 0%, #0065BA 100%); padding: 32px; border-radius: 8px 8px 0 0; text-align: center;">
                              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Organization Invitation</h1>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 40px 32px;">
                              <h2 style="color: #001320; margin: 0 0 16px 0; font-size: 20px; font-weight: 600;">You've been invited!</h2>
                              <p style="color: #52525b; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">
                                ${data.inviter.user.name || data.inviter.user.email} invited you to join <strong>${data.organization.name}</strong>.
                              </p>
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" style="padding: 16px 0;">
                                    <a href="${inviteLink}" style="display: inline-block; background-color: #568AFF; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                                      Accept Invitation
                                    </a>
                                  </td>
                                </tr>
                              </table>
                              <p style="color: #71717a; margin: 24px 0 0 0; font-size: 14px; line-height: 1.6;">
                                This invitation will expire in 48 hours.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
              </html>
          `,
          })
          
          if (result.error) {
            logger.error("Resend API error when sending invitation email", result.error, {
              organizationId: data.organization.id,
              inviteeEmail: data.email,
              invitationId: data.id,
            })
            throw new Error(`Failed to send invitation email: ${JSON.stringify(result.error)}`)
          }
          
          logger.info("Organization invitation email sent successfully", {
            organizationId: data.organization.id,
            inviteeEmail: data.email,
            invitationId: data.id,
            emailId: result.data?.id,
          })
        } catch (error: unknown) {
          logger.error("Failed to send organization invitation email", error, {
            organizationId: data.organization.id,
            inviteeEmail: data.email,
            invitationId: data.id,
          })
          throw error
        }
      },
    }),
  ],

  // Email & Password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  // Email verification
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      logger.info("Email verification requested", {
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
      })

      const resend = getResendClient()
      if (!resend) {
        logger.warn("Resend not configured, skipping verification email", {
          userId: user.id,
          userEmail: user.email,
        })
        logger.debug("Verification URL (for manual sharing)", {
          userId: user.id,
          userEmail: user.email,
          url,
        })
        return
      }

      try {
        const emailFrom = getEmailFrom()
        logger.debug("Sending email verification", {
          userId: user.id,
          userEmail: user.email,
          emailFrom,
        })
        
        const result = await resend.emails.send({
          from: emailFrom,
          to: user.email,
          subject: "Verify your Screen Agent Platform account",
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Verify your email</title>
              </head>
              <body style="font-family: 'Poppins', Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
                  <tr>
                    <td align="center">
                      <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                          <td style="background: linear-gradient(135deg, #559EFF 0%, #0065BA 100%); padding: 32px; border-radius: 8px 8px 0 0; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Screen Agent Platform</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Interactive AI-powered presentations</p>
                          </td>
                        </tr>
                        <!-- Content -->
                        <tr>
                          <td style="padding: 40px 32px;">
                            <h2 style="color: #001320; margin: 0 0 16px 0; font-size: 20px; font-weight: 600;">Verify your email address</h2>
                            <p style="color: #52525b; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">
                              Hi ${user.name || "there"},
                            </p>
                            <p style="color: #52525b; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">
                              Thanks for signing up for Screen Agent Platform! Please verify your email address by clicking the button below.
                            </p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td align="center" style="padding: 16px 0;">
                                  <a href="${url}" style="display: inline-block; background-color: #568AFF; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                                    Verify Email Address
                                  </a>
                                </td>
                              </tr>
                            </table>
                            <p style="color: #71717a; margin: 24px 0 0 0; font-size: 14px; line-height: 1.6;">
                              If you didn't create an account, you can safely ignore this email.
                            </p>
                            <p style="color: #71717a; margin: 16px 0 0 0; font-size: 14px; line-height: 1.6;">
                              This link will expire in 24 hours.
                            </p>
                          </td>
                        </tr>
                        <!-- Footer -->
                        <tr>
                          <td style="padding: 24px 32px; border-top: 1px solid #e4e4e7; text-align: center;">
                            <p style="color: #a1a1aa; margin: 0; font-size: 12px;">
                              &copy; ${new Date().getFullYear()} Screen Agent Platform. All rights reserved.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
          `,
        })
        
        if (result.error) {
          logger.error("Resend API error when sending verification email", result.error, {
            userId: user.id,
            userEmail: user.email,
            emailFrom,
            resendError: result.error,
          })
          throw new Error(`Failed to send verification email: ${JSON.stringify(result.error)}`)
        }
        
        logger.info("Email verification sent successfully", {
          userId: user.id,
          userEmail: user.email,
          emailId: result.data?.id,
        })
      } catch (error: unknown) {
        logger.error("Failed to send email verification", error, {
          userId: user.id,
          userEmail: user.email,
        })
        // Don't throw - Better Auth will handle gracefully
        // This prevents signup from failing if email sending fails
      }
    },
  },

  // Social providers
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  // User configuration
  user: {
    additionalFields: {
      tier: {
        type: "string",
        defaultValue: "free",
      },
    },
  },

  // Account configuration
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  // Rate limiting
  rateLimit: {
    window: 60, // 60 seconds
    max: 10, // 10 requests per window
  },
}

export const auth = betterAuth(authConfig)

// Export types
export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user

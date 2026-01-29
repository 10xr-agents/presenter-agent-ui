import swaggerJsdoc from "swagger-jsdoc"

const swaggerDefinition = {
  openapi: "3.1.0",
  info: {
    title: "Presenter Agent API",
    version: "1.0.0",
    description: `
## Overview

The Presenter Agent API provides programmatic access to create and manage AI-powered screen agents, 
presentation sessions, knowledge bases, and analytics.

## Authentication

Most endpoints require authentication via session cookies (for web app) or API keys (for programmatic access).

### Session Authentication
Used automatically when accessing the API from the web application.

### API Key Authentication
For programmatic access, include your API key in the \`x-api-key\` header:

\`\`\`
x-api-key: your-api-key-here
\`\`\`

## Rate Limiting

API requests are rate-limited. When you exceed the limit, you'll receive a \`429 Too Many Requests\` response 
with a \`retryAfter\` field indicating when you can retry.

## Response Format

All API responses follow a consistent format:

### Success Response
\`\`\`json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
\`\`\`

### Error Response
\`\`\`json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "error": "Error message",
  "details": { ... }
}
\`\`\`
`,
    contact: {
      name: "API Support",
      email: "support@presenteragent.com",
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  servers: [
    {
      url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      description: "Current environment",
    },
  ],
  tags: [
    {
      name: "Health",
      description: "Health check endpoints",
    },
    {
      name: "Screen Agents",
      description: "Create and manage AI screen agents",
    },
    {
      name: "Presentations",
      description: "Presentation session management",
    },
    {
      name: "Knowledge",
      description: "Knowledge base and document management",
    },
    {
      name: "Analytics",
      description: "Analytics and insights endpoints",
    },
    {
      name: "API Keys",
      description: "API key management",
    },
    {
      name: "Billing",
      description: "Billing and payment management",
    },
    {
      name: "Usage",
      description: "Usage tracking and limits",
    },
    {
      name: "Teams",
      description: "Team management (Enterprise)",
    },
    {
      name: "Organizations",
      description: "Organization management",
    },
    {
      name: "User",
      description: "User profile and preferences",
    },
    {
      name: "Notifications",
      description: "Notification management",
    },
    {
      name: "Sessions",
      description: "Agent session management",
    },
    {
      name: "Realtime",
      description: "Pusher/Sockudo channel auth for real-time subscriptions",
    },
    {
      name: "Admin",
      description: "Admin-only endpoints",
    },
  ],
  components: {
    securitySchemes: {
      sessionAuth: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description: "Session-based authentication (web app)",
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "API key authentication for programmatic access",
      },
    },
    schemas: {
      // Common response schemas
      ApiResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "Indicates if the request was successful",
          },
          data: {
            type: "object",
            description: "Response payload",
          },
          message: {
            type: "string",
            description: "Optional message",
          },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            example: false,
          },
          code: {
            type: "string",
            description: "Error code",
            example: "VALIDATION_ERROR",
          },
          message: {
            type: "string",
            description: "Human-readable error message",
          },
          error: {
            type: "string",
            description: "Error message (legacy)",
          },
          details: {
            type: "object",
            description: "Additional error details",
          },
        },
      },
      // Screen Agent schemas
      ScreenAgent: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique identifier" },
          name: { type: "string", description: "Agent name" },
          description: { type: "string", description: "Agent description" },
          ownerId: { type: "string", description: "Owner user ID" },
          organizationId: { type: "string", description: "Organization ID" },
          teamId: { type: "string", nullable: true, description: "Team ID" },
          visibility: {
            type: "string",
            enum: ["private", "team", "organization", "public"],
            description: "Visibility level",
          },
          status: {
            type: "string",
            enum: ["draft", "active", "paused", "archived"],
            description: "Agent status",
          },
          targetWebsiteUrl: { type: "string", description: "Target website URL" },
          voiceConfig: { $ref: "#/components/schemas/VoiceConfig" },
          shareableToken: { type: "string", description: "Shareable token for public access" },
          totalPresentationCount: { type: "integer", description: "Total presentations" },
          totalViewerCount: { type: "integer", description: "Total unique viewers" },
          totalMinutesConsumed: { type: "number", description: "Total minutes used" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateScreenAgentRequest: {
        type: "object",
        required: ["name", "description", "organizationId", "targetWebsiteUrl"],
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            description: "Agent name",
          },
          description: {
            type: "string",
            minLength: 20,
            maxLength: 500,
            description: "Agent description",
          },
          organizationId: { type: "string", description: "Organization ID" },
          teamId: { type: "string", description: "Team ID (optional)" },
          targetWebsiteUrl: {
            type: "string",
            format: "uri",
            description: "Target website URL",
          },
          websiteCredentials: {
            type: "object",
            properties: {
              username: { type: "string" },
              password: { type: "string" },
            },
          },
          loginNotes: { type: "string", maxLength: 1000 },
          voiceConfig: { $ref: "#/components/schemas/VoiceConfig" },
          conversationConfig: { $ref: "#/components/schemas/ConversationConfig" },
          knowledgeDocumentIds: {
            type: "array",
            items: { type: "string" },
          },
          domainRestrictions: {
            type: "array",
            items: { type: "string" },
          },
          sessionTimeoutMinutes: { type: "integer", minimum: 1, maximum: 480 },
          maxSessionDurationMinutes: { type: "integer", minimum: 1, maximum: 480 },
        },
      },
      VoiceConfig: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            enum: ["elevenlabs", "openai", "cartesia"],
          },
          voiceId: { type: "string" },
          language: { type: "string" },
          speechRate: { type: "number", minimum: 0.5, maximum: 2.0 },
          pitch: { type: "number", minimum: -1.0, maximum: 1.0 },
        },
      },
      ConversationConfig: {
        type: "object",
        properties: {
          personalityPrompt: { type: "string" },
          welcomeMessage: { type: "string" },
          fallbackResponse: { type: "string" },
          guardrails: { type: "array", items: { type: "string" } },
        },
      },
      // API Key schemas
      ApiKey: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          keyPrefix: { type: "string", description: "First characters of the key" },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          scopes: { type: "array", items: { type: "string" } },
          enabled: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateApiKeyRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          organizationId: { type: "string" },
          scopes: { type: "array", items: { type: "string" } },
          expiresAt: { type: "string", format: "date-time" },
          rateLimit: {
            type: "object",
            properties: {
              requests: { type: "integer", minimum: 1 },
              windowMs: { type: "integer", minimum: 1000 },
            },
          },
        },
      },
      // Health check schemas
      HealthStatus: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["healthy", "degraded", "unhealthy"],
          },
          timestamp: { type: "string", format: "date-time" },
          duration: { type: "integer", description: "Check duration in ms" },
          services: {
            type: "object",
            properties: {
              database: { $ref: "#/components/schemas/ServiceStatus" },
              auth: { $ref: "#/components/schemas/ServiceStatus" },
              redis: { $ref: "#/components/schemas/ServiceStatus" },
            },
          },
        },
      },
      ServiceStatus: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["connected", "disconnected"] },
          latency: { type: "integer", description: "Latency in ms" },
          error: { type: "string", nullable: true },
        },
      },
      // Pagination
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1 },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          total: { type: "integer" },
          totalPages: { type: "integer" },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: "Authentication required",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            example: {
              success: false,
              code: "UNAUTHORIZED",
              message: "Unauthorized",
              error: "Unauthorized",
            },
          },
        },
      },
      Forbidden: {
        description: "Access forbidden",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            example: {
              success: false,
              code: "FORBIDDEN",
              message: "Forbidden",
              error: "Forbidden",
            },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            example: {
              success: false,
              code: "NOT_FOUND",
              message: "Resource not found",
              error: "Resource not found",
            },
          },
        },
      },
      ValidationError: {
        description: "Validation error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            example: {
              success: false,
              code: "VALIDATION_ERROR",
              message: "Validation failed",
              error: "Validation failed",
              details: {
                errors: [
                  {
                    path: ["name"],
                    message: "Name is required",
                  },
                ],
              },
            },
          },
        },
      },
      RateLimited: {
        description: "Rate limit exceeded",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            example: {
              success: false,
              code: "RATE_LIMIT",
              message: "Rate limit exceeded. Please try again later.",
              error: "Rate limit exceeded",
              retryAfter: 60,
            },
          },
        },
      },
      ServerError: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            example: {
              success: false,
              code: "INTERNAL_ERROR",
              message: "Internal server error",
              error: "Internal server error",
            },
          },
        },
      },
    },
  },
  security: [{ sessionAuth: [] }, { apiKeyAuth: [] }],
}

const options: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  // Path to the API docs - look for route.ts files in the api directory
  apis: [
    "./app/api/**/*.ts",
    "./lib/swagger/routes/*.ts", // Additional route documentation
  ],
}

export const swaggerSpec = swaggerJsdoc(options)

export default swaggerSpec

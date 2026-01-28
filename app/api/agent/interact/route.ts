import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import * as Sentry from "@sentry/nextjs"
import { connectDB } from "@/lib/db/mongoose"
import { Session, Message } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/session"
import { getRAGChunks } from "@/lib/knowledge-extraction/rag-helper"
import {
  interactRequestBodySchema,
  type NextActionResponse,
  needsUserInputResponseSchema,
  type NeedsUserInputResponse,
} from "@/lib/agent/schemas"
import { errorResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"
import { createDebugLog, extractHeaders } from "@/lib/utils/debug-logger"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"
import { applyRateLimit } from "@/lib/middleware/rate-limit"
import { extractDomain, generateSessionTitle } from "@/lib/utils/domain"
// LangGraph integration (Phase 1: Foundation) - Now the default execution path
import { runInteractGraph } from "@/lib/agent/graph/route-integration"

/**
 * POST /api/agent/interact
 *
 * LangGraph-based action loop endpoint.
 *
 * Uses the graph-based state machine with complexity routing:
 * - SIMPLE tasks: Fast path with direct action generation
 * - COMPLEX tasks: Full reasoning → planning → execution flow
 *
 * The LangGraph handles:
 * - Task complexity classification
 * - Context analysis and reasoning
 * - Planning and step refinement
 * - Action generation (direct or via LLM)
 * - Verification and self-correction
 * - Outcome prediction
 *
 * Schema: INTERACT_FLOW_WALKTHROUGH.md
 */

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  let requestBody: unknown = null
  let taskId: string | undefined = undefined

  Sentry.logger.info("Interact: request received")

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/agent/interact")
    if (rateLimitResponse) {
      Sentry.logger.warn("Interact: rate limit exceeded")
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/agent/interact",
      })
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      }, debugInfo)
      const duration = Date.now() - startTime
      await createDebugLog({
        tenantId: "unknown",
        logType: "error",
        endpoint: "/api/agent/interact",
        method: "POST",
        headers: extractHeaders(req),
        statusCode: 401,
        duration,
        error: {
          type: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
        },
      })
      return addCorsHeaders(req, err)
    }

    const { userId, tenantId } = session
    Sentry.logger.info("Interact: auth ok")

    // Parse and validate body
    requestBody = (await req.json()) as unknown
    const requestSummary = requestBody as Record<string, unknown>
    Sentry.logger.info("Interact: parsing and validating body", {
      hasTaskId: !!requestSummary.taskId,
      hasSessionId: !!requestSummary.sessionId,
    })

    const validationResult = interactRequestBodySchema.safeParse(requestBody)

    if (!validationResult.success) {
      // Format validation errors for better readability
      const formattedErrors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "root",
        message: issue.message,
        code: issue.code,
        ...(issue.path.length > 0 && { path: issue.path }),
      }))

      Sentry.logger.info("Interact: body validation failed", {
        errorFields: formattedErrors.map((e) => e.field),
      })

      const debugInfo = buildErrorDebugInfo(new Error("Request validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/agent/interact",
        requestData: {
          ...(requestBody as Record<string, unknown>),
          // Truncate large fields for logging
          dom: typeof (requestBody as any)?.dom === "string"
            ? `${(requestBody as any).dom.substring(0, 100)}... (${(requestBody as any).dom.length} chars)`
            : (requestBody as any)?.dom,
        },
        validationErrors: validationResult.error.issues,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: `Validation failed: ${formattedErrors.map((e) => `${e.field}: ${e.message}`).join(", ")}`,
        errors: formattedErrors,
        validationErrors: validationResult.error.issues,
      }, debugInfo)
      const duration = Date.now() - startTime
      await createDebugLog({
        tenantId,
        logType: "error",
        endpoint: "/api/agent/interact",
        method: "POST",
        requestData: requestBody,
        headers: extractHeaders(req),
        statusCode: 400,
        duration,
        error: {
          type: "VALIDATION_ERROR",
          message: "Request validation failed",
        },
        metadata: {
          validationErrors: validationResult.error.issues,
        },
      })
      Sentry.logger.info("Interact: returning 400 validation error")
      return addCorsHeaders(req, err)
    }

    Sentry.logger.info("Interact: body validation passed")

    const {
      url,
      query,
      dom,
      taskId: requestTaskId,
      sessionId: requestSessionId,
      lastActionStatus,
      lastActionError,
      lastActionResult,
      previousUrl: requestPreviousUrl,
      // Action Chaining (Phase 2 Task 1)
      lastExecutedActionIndex,
      chainPartialState,
      chainActionError,
      // Domain-Aware Sessions
      domain: requestDomain,
      title: requestTitle,
    } = validationResult.data
    taskId = requestTaskId

    await connectDB()

    // Session Resolution - Create or load session
    let currentSessionId: string | undefined = undefined

    Sentry.logger.info("Interact: resolving session", { hasSessionId: !!requestSessionId })

    if (requestSessionId) {
      // Load existing session (exclude archived sessions)
      const currentSession = await (Session as any)
        .findOne({
          sessionId: requestSessionId,
          tenantId,
          status: { $ne: "archived" },
        })
        .lean()
        .exec()

      if (!currentSession) {
        Sentry.logger.info("Interact: creating new session for provided sessionId")
        // First message for this sessionId (e.g. extension created session locally) – create session and proceed
        const sessionDomain = requestDomain || extractDomain(url) || undefined
        const sessionTitle =
          requestTitle ||
          (sessionDomain ? generateSessionTitle(sessionDomain, query) : query.substring(0, 200))

        await (Session as any).create({
          sessionId: requestSessionId,
          userId,
          tenantId,
          url,
          domain: sessionDomain,
          title: sessionTitle,
          isRenamed: false,
          status: "active",
          metadata: { initialQuery: query },
        })

        currentSessionId = requestSessionId

        await (Message as any).create({
          messageId: randomUUID(),
          sessionId: requestSessionId,
          userId,
          tenantId,
          role: "user",
          content: query,
          sequenceNumber: 0,
          timestamp: new Date(),
        })
      } else {
        Sentry.logger.info("Interact: loaded existing session")
        // Security check: ensure user owns session
        if (currentSession.userId !== userId) {
          const debugInfo = buildErrorDebugInfo(new Error("Unauthorized session access"), {
            code: "UNAUTHORIZED",
            statusCode: 403,
            endpoint: "/api/agent/interact",
            sessionId: requestSessionId,
          })
          const err = errorResponse("UNAUTHORIZED", 403, {
            code: "UNAUTHORIZED",
            message: "Unauthorized session access",
          }, debugInfo)
          return addCorsHeaders(req, err)
        }

        currentSessionId = requestSessionId

        // Update last message status if provided
        if (lastActionStatus) {
          const lastMessage = await (Message as any)
            .findOne({ sessionId: requestSessionId, tenantId })
            .sort({ sequenceNumber: -1 })
            .lean()
            .exec()

          if (lastMessage) {
            const updateData: Record<string, unknown> = {
              status: lastActionStatus,
            }

            // Add error details if action failed
            if (lastActionStatus === "failure" && (lastActionError || lastActionResult)) {
              updateData.error = lastActionError
                ? {
                    message: lastActionError.message,
                    code: lastActionError.code,
                    action: lastActionError.action,
                    elementId: lastActionError.elementId,
                  }
                : {
                    message: lastActionResult?.actualState || "Action failed",
                    code: "ACTION_FAILED",
                    action: "unknown",
                  }
            }

            await (Message as any)
              .findOneAndUpdate(
                { messageId: lastMessage.messageId, tenantId },
                {
                  $set: updateData,
                }
              )
              .exec()
          }
        }
      }
    } else {
      Sentry.logger.info("Interact: creating new session (no sessionId provided)")
      // Create new session with domain-aware fields
      const newSessionId = randomUUID()
      
      // Extract domain from URL (use provided domain or extract from URL)
      const sessionDomain = requestDomain || extractDomain(url) || undefined
      
      // Generate title (use provided title or generate from domain and query)
      const sessionTitle = requestTitle || 
        (sessionDomain ? generateSessionTitle(sessionDomain, query) : query.substring(0, 200))
      
      await (Session as any).create({
        sessionId: newSessionId,
        userId,
        tenantId,
        url,
        domain: sessionDomain,
        title: sessionTitle,
        isRenamed: false, // New sessions are not renamed
        status: "active",
        metadata: {
          initialQuery: query,
        },
      })

      currentSessionId = newSessionId

      // Save user message for new session
      await (Message as any).create({
        messageId: randomUUID(),
        sessionId: newSessionId,
        userId,
        tenantId,
        role: "user",
        content: query,
        sequenceNumber: 0,
        timestamp: new Date(),
      })
    }

    // RAG: Fetch chunks early for use in graph execution
    const ragStartTime = Date.now()
    const { chunks, hasOrgKnowledge, ragDebug } = await getRAGChunks(url, query, tenantId)
    const ragDuration = Date.now() - ragStartTime

    // =========================================================================
    // LangGraph Execution Path (Phase 1: Foundation)
    // Uses the graph-based state machine with complexity routing (SIMPLE vs COMPLEX)
    // This is now the default and only execution path
    // =========================================================================
    Sentry.logger.info("Interact: RAG fetch completed, starting LangGraph run", {
      chunkCount: chunks.length,
      hasOrgKnowledge,
    })

    const graphResult = await runInteractGraph({
      tenantId,
      userId,
      url,
      query,
      dom,
      previousUrl: requestPreviousUrl,
      sessionId: currentSessionId,
      taskId: requestTaskId,
      ragChunks: chunks,
      hasOrgKnowledge,
    })

    Sentry.logger.info("Interact: LangGraph run completed", {
      status: graphResult.status,
      complexity: graphResult.complexity,
      graphDurationMs: graphResult.graphDuration,
      ragDurationMs: ragDuration,
    })

    // Handle needs_user_input response
    if (graphResult.needsUserInput) {
      Sentry.logger.info("Interact: returning needs_user_input response")
      const response: NeedsUserInputResponse = {
        success: true,
        data: {
          status: "needs_user_input",
          thought: graphResult.thought || "I need some additional information to complete this task.",
          userQuestion: graphResult.userQuestion || "Could you provide more details?",
          missingInformation: graphResult.missingInformation || [],
          context: {
            searchPerformed: graphResult.webSearchPerformed,
            searchSummary: graphResult.webSearchSummary,
            reasoning: graphResult.complexityReason,
          },
        },
      }
      const validatedResponse = needsUserInputResponseSchema.parse(response)
      const res = NextResponse.json(validatedResponse, { status: 200 })
      return addCorsHeaders(req, res)
    }

    // Handle error
    if (!graphResult.success || graphResult.status === "failed") {
      Sentry.logger.info("Interact: graph failed, returning error response", {
        status: graphResult.status,
      })
      const debugInfo = buildErrorDebugInfo(new Error(graphResult.error || "Graph execution failed"), {
        code: "GRAPH_ERROR",
        statusCode: 500,
        endpoint: "/api/agent/interact",
        taskId: graphResult.taskId,
        taskState: {
          status: graphResult.status,
          complexity: graphResult.complexity,
          error: graphResult.error,
        },
      })
      const err = errorResponse("INTERNAL_ERROR", 500, {
        code: "GRAPH_ERROR",
        message: graphResult.error || "Graph execution failed",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Build successful response
    const duration = Date.now() - startTime
    
    // Convert plan createdAt from Date to string for schema compatibility
    const responsePlan = graphResult.plan
      ? {
          ...graphResult.plan,
          createdAt: graphResult.plan.createdAt instanceof Date
            ? graphResult.plan.createdAt.toISOString()
            : graphResult.plan.createdAt,
        }
      : undefined

    if (lastExecutedActionIndex !== undefined || chainPartialState) {
      Sentry.logger.info("Interact: applying chain recovery", {
        hasLastExecutedActionIndex: lastExecutedActionIndex !== undefined,
        executedActionsCount: chainPartialState?.executedActions?.length ?? 0,
      })
    }

    const response: NextActionResponse = {
      thought: graphResult.thought || "",
      action: graphResult.action || "",
      usage: graphResult.llmUsage,
      taskId: graphResult.taskId || undefined,
      hasOrgKnowledge,
      ragDebug,
      metrics: {
        requestDuration: duration,
        ragDuration,
        llmDuration: graphResult.llmDuration,
        tokenUsage: graphResult.llmUsage,
        stepIndex: graphResult.currentStepIndex,
      },
      plan: responsePlan,
      currentStep: graphResult.currentStepIndex,
      totalSteps: graphResult.plan?.steps.length,
      status: graphResult.status as NextActionResponse["status"],
      verification: graphResult.verificationResult,
      correction: graphResult.correctionResult
        ? {
            strategy: graphResult.correctionResult.strategy as any,
            reason: graphResult.correctionResult.reason,
            retryAction: graphResult.correctionResult.retryAction,
          }
        : undefined,
      expectedOutcome: graphResult.expectedOutcome
        ? {
            description: graphResult.expectedOutcome.description,
            domChanges: graphResult.expectedOutcome.domChanges,
          }
        : undefined,
      webSearchPerformed: graphResult.webSearchPerformed,
      webSearchSummary: graphResult.webSearchSummary,
      sessionId: currentSessionId,
      // Action Chaining (Phase 2 Task 1)
      actions: graphResult.chainedActions?.map((a) => ({
        action: a.action,
        description: a.description,
        index: a.index,
        canFail: a.canFail,
        targetElementId: a.targetElementId,
      })),
      chainMetadata: graphResult.chainMetadata
        ? {
            totalActions: graphResult.chainMetadata.totalActions,
            estimatedDuration: graphResult.chainMetadata.estimatedDuration,
            safeToChain: graphResult.chainMetadata.safeToChain,
            chainReason: graphResult.chainMetadata.chainReason,
            containerSelector: graphResult.chainMetadata.containerSelector,
          }
        : undefined,
    }

    Sentry.logger.info("Interact: returning next action response", {
      hasAction: !!graphResult.action,
      complexity: graphResult.complexity,
      chainedActionsCount: graphResult.chainedActions?.length ?? 0,
      totalDurationMs: duration,
    })

    // Create debug log for successful request
    await createDebugLog({
      tenantId,
      logType: "execution_metric",
      endpoint: "/api/agent/interact",
      method: "POST",
      headers: extractHeaders(req),
      statusCode: 200,
      duration,
      metadata: {
        executionPath: "langgraph",
        complexity: graphResult.complexity,
        complexityReason: graphResult.complexityReason,
        graphDuration: graphResult.graphDuration,
        ragDuration,
        llmDuration: graphResult.llmDuration,
        taskId: graphResult.taskId,
        action: graphResult.action,
      },
    })

    const res = NextResponse.json({ success: true, data: response }, { status: 200 })
    return addCorsHeaders(req, res)

  } catch (e: unknown) {
    Sentry.logger.info("Interact: unhandled error, returning 500")
    Sentry.captureException(e)
    const duration = Date.now() - startTime
    const errorMessage = e instanceof Error ? e.message : "An unexpected error occurred"
    const errorStack = e instanceof Error ? e.stack : undefined

    // Log error
    await createDebugLog({
      tenantId: "unknown",
      taskId,
      logType: "error",
      endpoint: "/api/agent/interact",
      method: "POST",
      requestData: requestBody,
      headers: extractHeaders(req),
      statusCode: 500,
      duration,
      error: {
        type: "INTERNAL_ERROR",
        message: errorMessage,
        stack: errorStack,
      },
    })

    const debugInfo = buildErrorDebugInfo(e, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/agent/interact",
      taskId,
      requestData: requestBody,
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}

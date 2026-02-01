import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { runInteractGraph } from "@/lib/agent/graph/route-integration"
import {
  interactRequestBodySchema,
  type NeedsUserInputResponse,
  needsUserInputResponseSchema,
  type NextActionResponse,
} from "@/lib/agent/schemas"
import { getSessionFromRequest } from "@/lib/auth/session"
import { connectDB } from "@/lib/db/mongoose"
import { getRAGChunks } from "@/lib/knowledge-extraction/rag-helper"
import { applyRateLimit } from "@/lib/middleware/rate-limit"
import { Message, Session } from "@/lib/models"
import { triggerInteractResponse, triggerNewMessage } from "@/lib/pusher/server"
import { errorResponse } from "@/lib/utils/api-response"
import { addCorsHeaders, handleCorsPreflight } from "@/lib/utils/cors"
import { createDebugLog, extractHeaders } from "@/lib/utils/debug-logger"
import { extractDomain, generateSessionTitle } from "@/lib/utils/domain"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"
import { logger } from "@/lib/utils/logger"

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
      // Client-side verification (v2.1)
      clientVerification: requestClientVerification,
      // Observation-Based Verification (v3.0)
      clientObservations: requestClientObservations,
      // Action Chaining (Phase 2 Task 1)
      lastExecutedActionIndex,
      chainPartialState,
      chainActionError,
      // Domain-Aware Sessions
      domain: requestDomain,
      title: requestTitle,
      // Hybrid Vision + Skeleton (new)
      screenshot: requestScreenshot,
      domMode: requestDomMode,
      skeletonDom: requestSkeletonDom,
      screenshotHash: requestScreenshotHash,
    } = validationResult.data
    taskId = requestTaskId

    // High-signal client execution telemetry (helps diagnose "action not executed" vs "verification mismatch").
    // Keep this small; never log full DOM.
    Sentry.logger.info("Interact: client execution telemetry", {
      hasTaskId: !!requestTaskId,
      hasSessionId: !!requestSessionId,
      url,
      previousUrl: requestPreviousUrl,
      lastActionStatus: lastActionStatus ?? null,
      lastActionErrorCode: lastActionError?.code ?? null,
      lastActionErrorMessage: lastActionError?.message ? lastActionError.message.slice(0, 120) : null,
      lastActionResultSuccess: lastActionResult?.success ?? null,
      clientDidUrlChange: requestClientObservations?.didUrlChange ?? null,
      clientDidDomMutate: requestClientObservations?.didDomMutate ?? null,
      clientDidNetworkOccur: requestClientObservations?.didNetworkOccur ?? null,
      clientVerificationUrlChanged: requestClientVerification?.urlChanged ?? null,
      clientVerificationElementFound: requestClientVerification?.elementFound ?? null,
      domChars: typeof dom === "string" ? dom.length : null,
    })

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

        const userMessageId = randomUUID()
        await (Message as any).create({
          messageId: userMessageId,
          sessionId: requestSessionId,
          userId,
          tenantId,
          role: "user",
          content: query,
          sequenceNumber: 0,
          timestamp: new Date(),
        })
        const msgPayload = {
          messageId: userMessageId,
          role: "user" as const,
          content: query,
          sequenceNumber: 0,
          timestamp: new Date().toISOString(),
        }
        await triggerNewMessage(requestSessionId, msgPayload)
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
      const userMessageId = randomUUID()
      await (Message as any).create({
        messageId: userMessageId,
        sessionId: newSessionId,
        userId,
        tenantId,
        role: "user",
        content: query,
        sequenceNumber: 0,
        timestamp: new Date(),
      })
      const msgPayload = {
        messageId: userMessageId,
        role: "user" as const,
        content: query,
        sequenceNumber: 0,
        timestamp: new Date().toISOString(),
      }
      await triggerNewMessage(newSessionId, msgPayload)
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
      clientVerification: requestClientVerification,
      clientObservations: requestClientObservations,
      // Hybrid Vision + Skeleton
      screenshot: requestScreenshot,
      domMode: requestDomMode,
      skeletonDom: requestSkeletonDom,
      screenshotHash: requestScreenshotHash,
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

    // When graph ends in "failed", return 200 with a user-facing message so the UI can show it (no 500)
    if (graphResult.status === "failed") {
      Sentry.logger.info("Interact: graph ended with status failed, returning 200 with failure message", {
        status: graphResult.status,
      })
      // Fall through to build the same response shape with thought + status "failed" (below)
    } else if (!graphResult.success) {
      // Other unexpected failure (e.g. thrown before graph completed)
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

    // Build response (200 with thought + status; status may be "failed" with a user-visible message)
    const duration = Date.now() - startTime
    
    // Convert plan for Chat UI compatibility:
    // - createdAt: Date → string (ISO format)
    // - steps: add `id` field for PlanWidget (Chat UI contract expects id: string)
    const responsePlan = graphResult.plan
      ? {
          ...graphResult.plan,
          steps: graphResult.plan.steps.map((step) => ({
            ...step,
            id: `step_${step.index}`, // Chat UI contract: id: string for PlanWidget stepper
          })),
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

    const isTerminal = graphResult.status === "completed" || graphResult.status === "failed"
    const response: NextActionResponse = {
      thought: graphResult.thought || "",
      action: graphResult.action || (isTerminal ? "finish()" : ""),
      // Robust Element Selectors: Include structured action details with selectorPath
      actionDetails: graphResult.actionDetails,
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

    // Debug: log actionDetails (avoid logging full typed values)
    if (response.actionDetails) {
      const args = response.actionDetails.args
      const argsKeys = args ? Object.keys(args) : []
      const valueLen =
        typeof args?.value === "string" ? (args.value as string).length : undefined

      logger.info("Interact: actionDetails", {
        process: "RouteIntegration",
        sessionId: currentSessionId ?? undefined,
        taskId: graphResult.taskId ?? undefined,
        action: response.action,
        name: response.actionDetails.name,
        elementId: response.actionDetails.elementId,
        hasSelectorPath: !!response.actionDetails.selectorPath,
        selectorPath: response.actionDetails.selectorPath,
        argsKeys,
        valueLength: valueLen,
      })
    } else {
      logger.info("Interact: actionDetails missing", {
        process: "RouteIntegration",
        sessionId: currentSessionId ?? undefined,
        taskId: graphResult.taskId ?? undefined,
        action: response.action,
      })
    }

    Sentry.logger.info("Interact: returning next action response", {
      hasAction: !!graphResult.action,
      complexity: graphResult.complexity,
      chainedActionsCount: graphResult.chainedActions?.length ?? 0,
      totalDurationMs: duration,
    })

    const interactData = {
      taskId: graphResult.taskId,
      action: graphResult.action,
      thought: graphResult.thought,
      status: graphResult.status,
      currentStepIndex: graphResult.currentStepIndex,
      verification: graphResult.verificationResult,
      correction: graphResult.correctionResult
        ? {
            strategy: graphResult.correctionResult.strategy,
            reason: graphResult.correctionResult.reason,
            retryAction: graphResult.correctionResult.retryAction,
          }
        : undefined,
    }
    await triggerInteractResponse(currentSessionId!, interactData)

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

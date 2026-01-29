/**
 * Hierarchical Manager-Worker Planning (Phase 4 Task 8)
 *
 * Sub-task decomposition for complex, multi-phase workflows.
 * A "Manager" LLM splits large requests into bounded SubTasks,
 * each executed with isolated context to prevent context window pollution.
 *
 * Flow:
 * 1. Manager analyzes request complexity
 * 2. If >5 steps or distinct phases → decompose into SubTasks
 * 3. Execute SubTasks sequentially
 * 4. Pass outputs (e.g., Patient ID) as inputs to next SubTask
 * 5. Clear/trim context between SubTasks
 *
 * Benefits:
 * - Bounded context per SubTask (better reasoning)
 * - Isolated failure handling
 * - Progress tracking per phase
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 4 Task 8
 */

import * as Sentry from "@sentry/nextjs"
import { recordUsage } from "@/lib/cost"
import type { TaskPlan } from "@/lib/models/task"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"

/**
 * Internal Plan type that extends TaskPlan for consistency
 */
type Plan = TaskPlan

// =============================================================================
// Types
// =============================================================================

/**
 * A sub-task in the hierarchical plan
 */
export interface SubTask {
  /** Unique identifier */
  id: string
  /** Index in execution order */
  index: number
  /** Sub-task name/title */
  name: string
  /** What this sub-task accomplishes */
  objective: string
  /** Expected inputs from previous sub-task */
  inputs: SubTaskInput[]
  /** Expected outputs for next sub-task */
  outputs: SubTaskOutput[]
  /** Estimated step count */
  estimatedSteps: number
  /** Status */
  status: "pending" | "in_progress" | "completed" | "failed"
  /** Result data (populated after completion) */
  result?: SubTaskResult
}

/**
 * Input expected from previous sub-task
 */
export interface SubTaskInput {
  /** Parameter name */
  name: string
  /** Description of what this input is */
  description: string
  /** Whether this input is required */
  required: boolean
  /** Source sub-task ID (or "user" for initial input) */
  source: string
}

/**
 * Output produced for next sub-task
 */
export interface SubTaskOutput {
  /** Parameter name */
  name: string
  /** Description of what this output is */
  description: string
  /** How to extract this from the completion state */
  extractionHint: string
}

/**
 * Result of a completed sub-task
 */
export interface SubTaskResult {
  /** Whether the sub-task succeeded */
  success: boolean
  /** Output values produced */
  outputs: Record<string, unknown>
  /** Final state summary */
  summary: string
  /** Error message if failed */
  error?: string
}

/**
 * Hierarchical plan with sub-tasks
 */
export interface HierarchicalPlan {
  /** Original goal */
  goal: string
  /** Whether decomposition was applied */
  isDecomposed: boolean
  /** Sub-tasks (in execution order) */
  subTasks: SubTask[]
  /** Current sub-task index */
  currentSubTaskIndex: number
  /** Accumulated outputs from completed sub-tasks */
  accumulatedOutputs: Record<string, unknown>
}

/**
 * Context for hierarchical planning and Langfuse trace linkage
 */
export interface HierarchicalPlanningContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
  langfuseTraceId?: string
}

/**
 * Threshold for sub-task decomposition
 */
const DECOMPOSITION_THRESHOLD = {
  /** Minimum steps to trigger decomposition */
  minSteps: 5,
  /** Maximum steps per sub-task */
  maxStepsPerSubTask: 7,
}

// =============================================================================
// Decomposition
// =============================================================================

/**
 * Analyze a plan and decompose into sub-tasks if necessary
 *
 * @param plan - Original linear plan
 * @param goal - Original goal
 * @param context - Tracking context
 * @returns Hierarchical plan (may be single sub-task if not decomposed)
 */
export async function decomposePlan(
  plan: Plan,
  goal: string,
  context: HierarchicalPlanningContext
): Promise<HierarchicalPlan> {
  // Check if decomposition is needed
  const needsDecomposition =
    plan.steps.length > DECOMPOSITION_THRESHOLD.minSteps ||
    detectDistinctPhases(plan.steps)

  if (!needsDecomposition) {
    // Return single sub-task wrapping the entire plan
    return {
      goal,
      isDecomposed: false,
      subTasks: [
        {
          id: "subtask_0",
          index: 0,
          name: goal,
          objective: goal,
          inputs: [],
          outputs: [],
          estimatedSteps: plan.steps.length,
          status: "pending",
        },
      ],
      currentSubTaskIndex: 0,
      accumulatedOutputs: {},
    }
  }

  console.log(
    `[HierarchicalPlanning] Plan has ${plan.steps.length} steps, decomposing...`
  )

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return createSingleSubTaskPlan(goal, plan)
  }

  const startTime = Date.now()
  const model = DEFAULT_PLANNING_MODEL

  try {

    const systemPrompt = `You are a task decomposition expert. Your job is to break down complex web automation workflows into smaller, manageable sub-tasks.

Guidelines:
1. Each sub-task should be a logical phase (e.g., "Search for patient", "Fill demographics", "Submit form")
2. Sub-tasks should be 3-7 steps each
3. Identify data that flows between sub-tasks (e.g., Patient ID created in step 1 needed in step 2)
4. Each sub-task should have clear success criteria

Output JSON with sub-tasks that have:
- Clear objective
- Expected inputs (from previous sub-task or user)
- Expected outputs (for next sub-task or final result)
- Estimated step count`

    const userPrompt = `Goal: ${goal}

Current Linear Plan (${plan.steps.length} steps):
${plan.steps.map((s, i) => `${i + 1}. ${s.description}`).join("\n")}

Decompose this into logical sub-tasks. Each sub-task should:
- Be a complete, verifiable phase
- Have 3-7 steps
- Clearly define inputs needed and outputs produced

Respond with JSON:
{
  "subTasks": [
    {
      "name": "string",
      "objective": "string",
      "inputs": [
        { "name": "string", "description": "string", "required": boolean, "source": "user" | "subtask_N" }
      ],
      "outputs": [
        { "name": "string", "description": "string", "extractionHint": "how to get this value" }
      ],
      "estimatedSteps": number,
      "stepsIncluded": [1, 2, 3] // Which original steps this covers
    }
  ]
}`

    const result = await generateWithGemini(systemPrompt, userPrompt, {
      model,
      temperature: 0.4,
      maxOutputTokens: 2000,
      thinkingLevel: "high",
      generationName: "hierarchical_decomposition",
      sessionId: context.sessionId,
      userId: context.userId,
      tags: ["planning", "hierarchical"],
      metadata: { goal, stepCount: plan.steps.length },
    })

    const durationMs = Date.now() - startTime
    const content = result?.content

    if (result?.promptTokens != null) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        langfuseTraceId: context.langfuseTraceId,
        provider: "google",
        model,
        actionType: "HIERARCHICAL_PLANNING",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        durationMs,
        metadata: { goal, stepCount: plan.steps.length },
      }).catch(console.error)
    }

    if (!content) {
      return createSingleSubTaskPlan(goal, plan)
    }

    const parsed = JSON.parse(content) as { subTasks: Partial<SubTask>[] }
    const subTasks = validateSubTasks(parsed.subTasks || [])

    console.log(
      `[HierarchicalPlanning] Decomposed into ${subTasks.length} sub-tasks (${durationMs}ms)`
    )

    return {
      goal,
      isDecomposed: subTasks.length > 1,
      subTasks,
      currentSubTaskIndex: 0,
      accumulatedOutputs: {},
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "hierarchical-planning", operation: "decomposePlan" },
      extra: { goal, stepCount: plan.steps.length },
    })
    console.error("[HierarchicalPlanning] Error decomposing plan:", error)

    return createSingleSubTaskPlan(goal, plan)
  }
}

// =============================================================================
// Sub-Task Execution Management
// =============================================================================

/**
 * Get the current sub-task to execute
 *
 * @param hierarchicalPlan - The hierarchical plan
 * @returns Current sub-task or null if all completed
 */
export function getCurrentSubTask(
  hierarchicalPlan: HierarchicalPlan
): SubTask | null {
  const { subTasks, currentSubTaskIndex } = hierarchicalPlan

  if (currentSubTaskIndex >= subTasks.length) {
    return null // All sub-tasks completed
  }

  return subTasks[currentSubTaskIndex] || null
}

/**
 * Mark current sub-task as completed and advance to next
 *
 * @param hierarchicalPlan - The hierarchical plan
 * @param result - Result of the completed sub-task
 * @returns Updated plan
 */
export function completeSubTask(
  hierarchicalPlan: HierarchicalPlan,
  result: SubTaskResult
): HierarchicalPlan {
  const { subTasks, currentSubTaskIndex, accumulatedOutputs } = hierarchicalPlan

  const currentSubTask = subTasks[currentSubTaskIndex]
  if (!currentSubTask) {
    return hierarchicalPlan
  }

  // Update current sub-task
  currentSubTask.status = result.success ? "completed" : "failed"
  currentSubTask.result = result

  // Accumulate outputs
  const newAccumulatedOutputs = {
    ...accumulatedOutputs,
    ...result.outputs,
  }

  console.log(
    `[HierarchicalPlanning] Sub-task "${currentSubTask.name}" ${result.success ? "completed" : "failed"}. ` +
      `Outputs: ${Object.keys(result.outputs).join(", ")}`
  )

  return {
    ...hierarchicalPlan,
    currentSubTaskIndex: currentSubTaskIndex + 1,
    accumulatedOutputs: newAccumulatedOutputs,
  }
}

/**
 * Build context for current sub-task execution
 *
 * Injects accumulated outputs from previous sub-tasks as context.
 *
 * @param hierarchicalPlan - The hierarchical plan
 * @param baseContext - Base context string
 * @returns Enriched context for current sub-task
 */
export function buildSubTaskContext(
  hierarchicalPlan: HierarchicalPlan,
  baseContext: string
): string {
  const currentSubTask = getCurrentSubTask(hierarchicalPlan)
  if (!currentSubTask) {
    return baseContext
  }

  const parts = [baseContext]

  // Add sub-task specific context
  parts.push("")
  parts.push("--- CURRENT SUB-TASK ---")
  parts.push(`Sub-Task ${currentSubTask.index + 1}: ${currentSubTask.name}`)
  parts.push(`Objective: ${currentSubTask.objective}`)

  // Add accumulated outputs as available context
  if (Object.keys(hierarchicalPlan.accumulatedOutputs).length > 0) {
    parts.push("")
    parts.push("Available data from previous sub-tasks:")
    for (const [key, value] of Object.entries(hierarchicalPlan.accumulatedOutputs)) {
      parts.push(`- ${key}: ${JSON.stringify(value)}`)
    }
  }

  // Add expected inputs reminder
  if (currentSubTask.inputs.length > 0) {
    const requiredInputs = currentSubTask.inputs.filter((i) => i.required)
    if (requiredInputs.length > 0) {
      parts.push("")
      parts.push("Required inputs for this sub-task:")
      requiredInputs.forEach((input) => {
        const value = hierarchicalPlan.accumulatedOutputs[input.name]
        parts.push(`- ${input.name}: ${value !== undefined ? JSON.stringify(value) : "(pending)"}`)
      })
    }
  }

  parts.push("--- END SUB-TASK CONTEXT ---")
  parts.push("")

  return parts.join("\n")
}

/**
 * Extract outputs from sub-task completion state
 *
 * @param subTask - The sub-task
 * @param dom - Current DOM state
 * @param summary - Completion summary
 * @returns Extracted outputs
 */
export function extractSubTaskOutputs(
  subTask: SubTask,
  dom: string,
  summary: string
): Record<string, unknown> {
  const outputs: Record<string, unknown> = {}

  for (const output of subTask.outputs) {
    // Try to extract value based on hint
    const value = extractValueFromContext(output.extractionHint, dom, summary)
    if (value !== undefined) {
      outputs[output.name] = value
    }
  }

  return outputs
}

/**
 * Check if all sub-tasks are completed
 *
 * @param hierarchicalPlan - The hierarchical plan
 * @returns Whether all sub-tasks are done
 */
export function isHierarchicalPlanComplete(
  hierarchicalPlan: HierarchicalPlan
): boolean {
  return hierarchicalPlan.currentSubTaskIndex >= hierarchicalPlan.subTasks.length
}

/**
 * Get progress summary for hierarchical plan
 *
 * @param hierarchicalPlan - The hierarchical plan
 * @returns Progress summary
 */
export function getHierarchicalProgress(hierarchicalPlan: HierarchicalPlan): {
  totalSubTasks: number
  completedSubTasks: number
  currentSubTask: string | null
  percentComplete: number
} {
  const total = hierarchicalPlan.subTasks.length
  const completed = hierarchicalPlan.subTasks.filter(
    (s) => s.status === "completed"
  ).length
  const current = getCurrentSubTask(hierarchicalPlan)

  return {
    totalSubTasks: total,
    completedSubTasks: completed,
    currentSubTask: current?.name || null,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Detect if plan has distinct phases (suggests decomposition)
 */
function detectDistinctPhases(steps: Plan["steps"]): boolean {
  // Look for phase indicators in step descriptions
  const phaseKeywords = [
    "search",
    "find",
    "create",
    "add",
    "fill",
    "submit",
    "confirm",
    "verify",
    "schedule",
    "complete",
  ]

  const detectedPhases = new Set<string>()

  for (const step of steps) {
    const desc = step.description.toLowerCase()
    for (const keyword of phaseKeywords) {
      if (desc.includes(keyword)) {
        detectedPhases.add(keyword)
        break
      }
    }
  }

  // If we detect 3+ distinct phase keywords, suggest decomposition
  return detectedPhases.size >= 3
}

/**
 * Create a single sub-task plan (no decomposition)
 */
function createSingleSubTaskPlan(goal: string, plan: Plan): HierarchicalPlan {
  return {
    goal,
    isDecomposed: false,
    subTasks: [
      {
        id: "subtask_0",
        index: 0,
        name: goal,
        objective: goal,
        inputs: [],
        outputs: [],
        estimatedSteps: plan.steps.length,
        status: "pending",
      },
    ],
    currentSubTaskIndex: 0,
    accumulatedOutputs: {},
  }
}

/**
 * Validate and sanitize sub-tasks from LLM
 */
function validateSubTasks(subTasks: Partial<SubTask>[]): SubTask[] {
  if (!Array.isArray(subTasks)) return []

  return subTasks
    .filter((s): s is Partial<SubTask> & { name: string; objective: string } => {
      return (
        s !== null &&
        typeof s === "object" &&
        typeof s.name === "string" &&
        typeof s.objective === "string"
      )
    })
    .map((s, i) => ({
      id: `subtask_${i}`,
      index: i,
      name: s.name,
      objective: s.objective,
      inputs: Array.isArray(s.inputs)
        ? s.inputs.map((inp) => ({
            name: String(inp.name || ""),
            description: String(inp.description || ""),
            required: inp.required !== false,
            source: String(inp.source || "user"),
          }))
        : [],
      outputs: Array.isArray(s.outputs)
        ? s.outputs.map((out) => ({
            name: String(out.name || ""),
            description: String(out.description || ""),
            extractionHint: String(out.extractionHint || ""),
          }))
        : [],
      estimatedSteps: typeof s.estimatedSteps === "number" ? s.estimatedSteps : 5,
      status: "pending" as const,
    }))
}

/**
 * Extract value from context based on hint
 */
function extractValueFromContext(
  hint: string,
  dom: string,
  summary: string
): unknown {
  if (!hint) return undefined

  const normalizedHint = hint.toLowerCase()

  // Try to extract IDs
  if (normalizedHint.includes("id")) {
    // Look for ID patterns in summary
    const idMatch = summary.match(/(?:id|ID|Id)[:\s]*(\d+|[a-zA-Z0-9-]+)/i)
    if (idMatch?.[1]) return idMatch[1]

    // Look for ID in DOM
    const domIdMatch = dom.match(/data-(?:patient|user|record)-id="([^"]+)"/i)
    if (domIdMatch?.[1]) return domIdMatch[1]
  }

  // Try to extract URLs
  if (normalizedHint.includes("url")) {
    const urlMatch = summary.match(/https?:\/\/[^\s]+/)
    if (urlMatch?.[0]) return urlMatch[0]
  }

  // Try to extract success/confirmed state
  if (normalizedHint.includes("confirm") || normalizedHint.includes("success")) {
    return summary.toLowerCase().includes("success") || summary.toLowerCase().includes("confirmed")
  }

  return undefined
}

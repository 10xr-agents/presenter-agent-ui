import { type Job, Worker } from "bullmq"
import { checkAndTriggerAutoReload, getAccountsNeedingAutoReload } from "@/lib/billing/auto-reload"
import { createRedisConnection } from "../redis"
import { QUEUE_NAMES } from "../types"

export interface AutoReloadJobData {
  organizationId: string
}

export interface AutoReloadCheckJobData {
  checkAll?: boolean
}

// Process auto-reload job
export async function processAutoReloadJob(
  job: Job<AutoReloadJobData>
): Promise<{ success: boolean; message: string }> {
  const { organizationId } = job.data

  console.log(`Processing auto-reload job ${job.id} for organization ${organizationId}`)

  try {
    const result = await checkAndTriggerAutoReload(organizationId)

    if (result.success) {
      return {
        success: true,
        message: `Auto-reload completed successfully for organization ${organizationId}`,
      }
    } else if (result.triggered) {
      return {
        success: false,
        message: `Auto-reload failed for organization ${organizationId}: ${result.error || "Unknown error"}`,
      }
    } else {
      return {
        success: true,
        message: `Auto-reload not needed for organization ${organizationId}`,
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(`Auto-reload job ${job.id} failed:`, error)
    throw new Error(`Auto-reload failed: ${message}`)
  }
}

// Process auto-reload check job (checks all accounts)
export async function processAutoReloadCheckJob(
  job: Job<AutoReloadCheckJobData>
): Promise<{ success: boolean; checked: number; triggered: number }> {
  console.log(`Processing auto-reload check job ${job.id}`)

  try {
    const organizationIds = await getAccountsNeedingAutoReload()
    let triggeredCount = 0

    for (const organizationId of organizationIds) {
      const result = await checkAndTriggerAutoReload(organizationId)
      if (result.triggered && result.success) {
        triggeredCount++
      }
    }

    return {
      success: true,
      checked: organizationIds.length,
      triggered: triggeredCount,
    }
  } catch (error: unknown) {
    console.error(`Auto-reload check job ${job.id} failed:`, error)
    throw error
  }
}

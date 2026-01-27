import { connectDB } from "@/lib/db/mongoose"
import { Task, TaskAction, Session, Message, Snapshot } from "@/lib/models"
import { DebugLog } from "@/lib/models/debug-log"
import { VerificationRecord } from "@/lib/models/verification-record"
import { CorrectionRecord } from "@/lib/models/correction-record"
import { logger } from "@/lib/utils/logger"

/**
 * Cleanup Job Configuration
 * 
 * Defines retention policies and cleanup logic for each collection.
 */
export interface CleanupJob {
  collection: string
  retentionDays: number
  filter: (record: any) => boolean // Additional filtering logic
  batchSize: number // Records to process per batch
}

/**
 * Retention policies for all collections
 */
export const cleanupJobs: CleanupJob[] = [
  {
    collection: "tasks",
    retentionDays: 90,
    filter: (task) => task.status === "completed" || task.status === "failed",
    batchSize: 100,
  },
  {
    collection: "tasks",
    retentionDays: 30,
    filter: (task) => task.status === "interrupted",
    batchSize: 100,
  },
  {
    collection: "sessions",
    retentionDays: 90,
    filter: (session) => session.status === "completed" || session.status === "failed",
    batchSize: 100,
  },
  {
    collection: "sessions",
    retentionDays: 30,
    filter: (session) => session.status === "interrupted",
    batchSize: 100,
  },
  {
    collection: "snapshots",
    retentionDays: 30,
    filter: () => true, // All snapshots older than 30 days
    batchSize: 100,
  },
  {
    collection: "debug_logs",
    retentionDays: 7,
    filter: () => true, // All debug logs older than 7 days
    batchSize: 100,
  },
  {
    collection: "verification_records",
    retentionDays: 90,
    filter: () => true, // All verification records older than 90 days
    batchSize: 100,
  },
  {
    collection: "correction_records",
    retentionDays: 90,
    filter: () => true, // All correction records older than 90 days
    batchSize: 100,
  },
]

/**
 * Cleanup statistics
 */
export interface CleanupStats {
  collection: string
  recordsDeleted: number
  errors: number
  duration: number
}

/**
 * Run cleanup for a specific job
 */
export async function runCleanupJob(job: CleanupJob): Promise<CleanupStats> {
  const startTime = Date.now()
  let recordsDeleted = 0
  let errors = 0

  try {
    await connectDB()

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - job.retentionDays)

    logger.info(`Starting cleanup for ${job.collection}`, {
      retentionDays: job.retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      batchSize: job.batchSize,
    })

    // Get model based on collection name
    let Model: any
    switch (job.collection) {
      case "tasks":
        Model = Task
        break
      case "sessions":
        Model = Session
        break
      case "snapshots":
        Model = Snapshot
        break
      case "debug_logs":
        Model = DebugLog
        break
      case "verification_records":
        Model = VerificationRecord
        break
      case "correction_records":
        Model = CorrectionRecord
        break
      default:
        throw new Error(`Unknown collection: ${job.collection}`)
    }

    // Process in batches
    let hasMore = true
    while (hasMore) {
      // Find records to delete
      const query: Record<string, unknown> = {
        createdAt: { $lt: cutoffDate },
      }

      // Apply additional filter if needed
      const candidates = await (Model as any)
        .find(query)
        .limit(job.batchSize * 2) // Get more to filter
        .lean()
        .exec()

      const toDelete = candidates.filter(job.filter).slice(0, job.batchSize)

      if (toDelete.length === 0) {
        hasMore = false
        break
      }

      // Delete records
      const ids = toDelete.map((r: any) => r._id || r.taskId || r.sessionId || r.snapshotId || r.logId || r.recordId)
      
      if (ids.length > 0) {
        try {
          // For tasks, also delete related task_actions
          if (job.collection === "tasks") {
            const taskIds = toDelete.map((t: any) => t.taskId || t._id)
            await (TaskAction as any).deleteMany({ taskId: { $in: taskIds } }).exec()
          }

          // For sessions, also delete related messages
          if (job.collection === "sessions") {
            const sessionIds = toDelete.map((s: any) => s.sessionId || s._id)
            await (Message as any).deleteMany({ sessionId: { $in: sessionIds } }).exec()
          }

          // Delete main records
          await (Model as any).deleteMany({ _id: { $in: ids } }).exec()
          recordsDeleted += ids.length

          logger.info(`Deleted ${ids.length} records from ${job.collection}`, {
            batch: ids.length,
            total: recordsDeleted,
          })
        } catch (error: unknown) {
          errors++
          logger.error(`Error deleting batch from ${job.collection}`, error, {
            batchSize: ids.length,
          })
        }
      }

      // If we got fewer records than batch size, we're done
      if (toDelete.length < job.batchSize) {
        hasMore = false
      }
    }

    const duration = Date.now() - startTime

    logger.info(`Completed cleanup for ${job.collection}`, {
      recordsDeleted,
      errors,
      duration,
    })

    return {
      collection: job.collection,
      recordsDeleted,
      errors,
      duration,
    }
  } catch (error: unknown) {
    errors++
    const duration = Date.now() - startTime
    logger.error(`Failed to run cleanup for ${job.collection}`, error, {
      duration,
    })

    return {
      collection: job.collection,
      recordsDeleted,
      errors,
      duration,
    }
  }
}

/**
 * Run all cleanup jobs
 */
export async function runAllCleanupJobs(): Promise<CleanupStats[]> {
  logger.info("Starting all cleanup jobs")

  const results: CleanupStats[] = []

  for (const job of cleanupJobs) {
    const result = await runCleanupJob(job)
    results.push(result)
  }

  const totalDeleted = results.reduce((sum, r) => sum + r.recordsDeleted, 0)
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0)

  logger.info("Completed all cleanup jobs", {
    totalDeleted,
    totalErrors,
    jobsRun: results.length,
  })

  return results
}

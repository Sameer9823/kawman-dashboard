import 'server-only'
import { createWorker, QUEUE_NAMES } from '@/lib/queue'

/**
 * AI Report Worker
 * 
 * Processes AI report generation jobs from the queue.
 * Handles long-running AI operations asynchronously.
 */

export interface AIReportJobData {
  reportId: string
  organizationId: string
  userId: string
  reportType: string
  parameters: Record<string, unknown>
}

export function startAIReportWorker() {
  return createWorker<AIReportJobData>(
    QUEUE_NAMES.AI_REPORT,
    async ({ data }) => {
      const { reportId, organizationId, userId, reportType, parameters } = data

      console.log(
        `[AI_REPORT_WORKER] Generating report ${reportId} (type: ${reportType}) for user ${userId}`
      )

      // TODO: Implement actual AI report generation
      // This will integrate with the existing ai.service.ts
      // For now, this is a placeholder that will be implemented in Phase 5

      console.log(`[AI_REPORT_WORKER] Report ${reportId} generation completed`)
    },
    { concurrency: 2 } // Low concurrency for resource-intensive AI operations
  )
}

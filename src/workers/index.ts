import 'server-only'
import { startEmailWorker } from './email.worker'
import { startNotificationWorker } from './notification.worker'
import { startWebhookWorker } from './webhook.worker'
import { startAIReportWorker } from './ai-report.worker'
import { startFileProcessingWorker } from './file-processing.worker'
import { closeQueues } from '@/lib/queue'

/**
 * Worker Manager
 * 
 * Starts and manages all BullMQ workers.
 * This should be called once when the server starts.
 * 
 * Usage:
 * - In development: Workers start automatically with Next.js dev server
 * - In production: Run as a separate process (e.g., `node dist/workers/index.js`)
 */

let workersStarted = false

export function startAllWorkers() {
  if (workersStarted) {
    console.log('[WORKERS] Workers already started')
    return
  }

  console.log('[WORKERS] Starting all workers...')

  try {
    // Start all workers
    startEmailWorker()
    startNotificationWorker()
    startWebhookWorker()
    startAIReportWorker()
    startFileProcessingWorker()

    workersStarted = true
    console.log('[WORKERS] All workers started successfully')

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('[WORKERS] SIGTERM received, closing workers...')
      await closeQueues()
      process.exit(0)
    })

    process.on('SIGINT', async () => {
      console.log('[WORKERS] SIGINT received, closing workers...')
      await closeQueues()
      process.exit(0)
    })
  } catch (error) {
    console.error('[WORKERS] Failed to start workers:', error)
    throw error
  }
}

export function areWorkersStarted(): boolean {
  return workersStarted
}

// Auto-start workers in development
if (process.env.NODE_ENV === 'development' && process.env.AUTO_START_WORKERS !== 'false') {
  startAllWorkers()
}

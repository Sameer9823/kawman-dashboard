import 'server-only'
import { createWorker, QUEUE_NAMES } from '@/lib/queue'
import { sendEmail, SendEmailInput } from '@/lib/email'

/**
 * Email Worker
 * 
 * Processes email jobs from the queue.
 * Handles retries, failures, and logging.
 */

export interface EmailJobData {
  to: string
  subject: string
  html: string
  text?: string
  metadata?: {
    userId?: string
    organizationId?: string
    type?: string
    [key: string]: unknown
  }
}

export function startEmailWorker() {
  return createWorker<EmailJobData>(
    QUEUE_NAMES.EMAIL,
    async ({ data }) => {
      const { to, subject, html, text, metadata } = data

      console.log(`[EMAIL_WORKER] Sending email to ${to}: "${subject}"`)

      const result = await sendEmail({ to, subject, html, text })

      if (!result.delivered) {
        throw new Error(`Failed to deliver email to ${to}`)
      }

      console.log(`[EMAIL_WORKER] Successfully sent email to ${to}`)
    },
    { concurrency: 10 } // Process up to 10 emails concurrently
  )
}

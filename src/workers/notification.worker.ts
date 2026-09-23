import 'server-only'
import { createWorker, QUEUE_NAMES } from '@/lib/queue'
import { createNotification } from '@/services/notification.service'
import type { Prisma } from '@/generated/prisma'

/**
 * Notification Worker
 * 
 * Processes in-app notification jobs from the queue.
 * Creates notifications in the database for users.
 */

export interface NotificationJobData {
  organizationId: string
  userId: string
  type: Prisma.NotificationCreateInput['type']
  title: string
  message: string
  data?: Prisma.InputJsonValue
}

export function startNotificationWorker() {
  return createWorker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATION,
    async ({ data }) => {
      const { organizationId, userId, type, title, message, data: notificationData } = data

      console.log(`[NOTIFICATION_WORKER] Creating notification for user ${userId}: "${title}"`)

      await createNotification({
        organizationId,
        userId,
        type,
        title,
        message,
        data: notificationData,
      })

      console.log(`[NOTIFICATION_WORKER] Created notification for user ${userId}`)
    },
    { concurrency: 20 } // High concurrency for lightweight DB operations
  )
}

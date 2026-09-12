import 'server-only'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma'

export async function createNotification(args: {
  organizationId: string
  userId: string
  type: Prisma.NotificationCreateInput['type']
  title: string
  message: string
  data?: Prisma.InputJsonValue
}) {
  return prisma.notification.create({
    data: {
      organizationId: args.organizationId,
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      data: args.data ?? undefined,
    },
  })
}

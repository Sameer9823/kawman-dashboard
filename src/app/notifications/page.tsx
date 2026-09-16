import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { NotificationsClient } from './notifications-client'

export const metadata = { title: 'Notifications | Kawman ExAct' }

export default async function NotificationsPage() {
  const session = await requireSession()
  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id, organizationId: session.user.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const unread = notifications.filter((n) => !n.isRead).length

  return (
    <MainLayout>
      <div className="space-y-6 max-w-2xl">
        <PageHeader title="Notifications" subtitle={`${unread} unread · ${notifications.length} total`} />
        <NotificationsClient
          initial={notifications.map((n) => ({
            id: n.id,
            type: String(n.type),
            title: n.title,
            message: n.message,
            data: (n.data as { userId?: string; dailyReportId?: string } | null) ?? null,
            createdAt: n.createdAt.toISOString(),
            isRead: n.isRead,
          }))}
        />
      </div>
    </MainLayout>
  )
}

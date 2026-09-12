import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { formatRelativeTime } from '@/lib/utils'

export const metadata = { title: 'Notifications | Kawman ExAct' }

export default async function NotificationsPage() {
  const session = await requireSession()
  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id, organizationId: session.user.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return (
    <MainLayout>
      <div className="space-y-6 max-w-2xl">
        <PageHeader title="Notifications" subtitle={`${notifications.filter((n) => !n.isRead).length} unread`} />
        <div className="rounded-xl border border-white/[0.08] divide-y divide-white/[0.06] bg-white/[0.02]">
          {notifications.length === 0 && (
            <p className="text-sm text-white/40 p-6 text-center">You&apos;re all caught up — no notifications yet.</p>
          )}
          {notifications.map((n) => {
            const d = n.data as { userId?: string; dailyReportId?: string } | null
            const href = n.type === 'DAILY_REPORT_SUBMITTED' && d?.userId ? `/admin/my-team/${d.userId}` : null
            const inner = (
              <>
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${!n.isRead ? 'bg-purple-400' : 'bg-white/15'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{n.title}</p>
                  <p className="text-sm text-white/55">{n.message}</p>
                  <p className="text-xs text-white/35 mt-1">{formatRelativeTime(n.createdAt)}</p>
                  {href && <p className="text-xs text-indigo-300 mt-1.5">View employee →</p>}
                </div>
              </>
            )
            return href ? (
              <a key={n.id} href={href} className={`p-4 flex items-start gap-3 hover:bg-white/[0.04] transition-colors ${!n.isRead ? 'bg-purple-500/[0.03]' : ''}`}>
                {inner}
              </a>
            ) : (
              <div key={n.id} className={`p-4 flex items-start gap-3 ${!n.isRead ? 'bg-purple-500/[0.03]' : ''}`}>
                {inner}
              </div>
            )
          })}
        </div>
      </div>
    </MainLayout>
  )
}

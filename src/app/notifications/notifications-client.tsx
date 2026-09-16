'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRelativeTime } from '@/lib/utils'
import { X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Notif = {
  id: string
  type: string
  title: string
  message: string
  data: { userId?: string; dailyReportId?: string } | null
  createdAt: string
  isRead: boolean
}

function hrefFor(n: Notif): string | null {
  if (n.type === 'DAILY_REPORT_SUBMITTED' && n.data?.userId) return `/admin/my-team/${n.data.userId}`
  return null
}

export function NotificationsClient({ initial }: { initial: Notif[] }) {
  const router = useRouter()
  const [items, setItems] = useState<Notif[]>(initial)
  const [clearing, setClearing] = useState(false)

  async function remove(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id))
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch {}
    router.refresh()
  }

  async function clearAll() {
    if (items.length === 0 || clearing) return
    setClearing(true)
    setItems([])
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    } catch {}
    setClearing(false)
    router.refresh()
  }

  // After super admin / admin has seen and opened the notification, remove it — don't keep read pile-up
  async function openAndRemove(n: Notif) {
    const href = hrefFor(n)
    // Optimistically remove before navigation so badge clears immediately
    setItems((prev) => prev.filter((x) => x.id !== n.id))
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      })
    } catch {}
    if (href) router.push(href)
    router.refresh()
  }

  const unread = items.filter((n) => !n.isRead).length

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">
          {unread} unread · {items.length} total
        </p>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={clearing}
            className="h-7 text-xs gap-1.5 text-white/60 hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {clearing ? 'Clearing…' : 'Clear all'}
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.08] divide-y divide-white/[0.06] bg-white/[0.02] overflow-hidden">
        {items.length === 0 && <p className="text-sm text-white/40 p-6 text-center">You&apos;re all caught up — no notifications yet.</p>}
        {items.map((n) => {
          const href = hrefFor(n)
          return (
            <div
              key={n.id}
              className={`p-4 flex items-start gap-3 group ${!n.isRead ? 'bg-purple-500/[0.03]' : ''} hover:bg-white/[0.04] transition-colors`}
            >
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${!n.isRead ? 'bg-purple-400' : 'bg-white/15'}`} />
              <div className="min-w-0 flex-1">
                {href ? (
                  <button
                    onClick={() => openAndRemove(n)}
                    className="text-left w-full group-hover:opacity-100"
                  >
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    <p className="text-sm text-white/55">{n.message}</p>
                    <p className="text-xs text-white/35 mt-1">{formatRelativeTime(n.createdAt)}</p>
                    <p className="text-xs text-indigo-300 mt-1.5">View employee →</p>
                  </button>
                ) : (
                  <>
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    <p className="text-sm text-white/55">{n.message}</p>
                    <p className="text-xs text-white/35 mt-1">{formatRelativeTime(n.createdAt)}</p>
                  </>
                )}
              </div>
              <button
                onClick={() => remove(n.id)}
                aria-label="Dismiss notification"
                className="shrink-0 h-7 w-7 rounded-md inline-flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

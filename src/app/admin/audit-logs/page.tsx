import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/session'

export const metadata = { title: 'Audit Logs | Kawman ExAct Admin' }

const ACTION_VARIANT: Record<string, 'success' | 'neutral' | 'danger' | 'warning' | 'info'> = {
  LOGIN: 'success',
  LOGOUT: 'neutral',
  FAILED_LOGIN: 'danger',
  PASSWORD_CHANGE: 'warning',
  ROLE_CHANGE: 'info',
  PERMISSION_CHANGE: 'info',
  USER_DELETION: 'danger',
  FILE_DELETION: 'warning',
  FILE_SHARING: 'info',
  DATA_EXPORT: 'warning',
  ADMIN_CHANGES: 'info',
  SECURITY_CHANGES: 'danger',
}

const ACTIONS = Object.keys(ACTION_VARIANT)

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('audit_logs.view')

  const params = await searchParams
  const from = first(params.from)
  const to = first(params.to)
  const action = first(params.action)

  const logs = await prisma.auditLog.findMany({
    where: {
      organizationId: session.user.organizationId,
      ...(action ? { action: action as never } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
            },
          }
        : {}),
    },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const exportParams = new URLSearchParams()
  if (from) exportParams.set('from', from)
  if (to) exportParams.set('to', to)
  if (action) exportParams.set('action', action)
  const exportHref = `/api/admin/audit-logs/export${exportParams.toString() ? `?${exportParams}` : ''}`

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Audit Logs"
          subtitle={`Last ${logs.length} events${from || to || action ? ' (filtered)' : ''}`}
          action={
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <a href={exportHref} download>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </a>
            </Button>
          }
        />

        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-white/50">From</label>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-white/50">To</label>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-white/50">Action</label>
            <select
              name="action"
              defaultValue={action ?? ''}
              className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="">All actions</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" variant="ghost">
            Filter
          </Button>
          {(from || to || action) && (
            <a href="/admin/audit-logs" className="text-xs text-white/40 hover:text-white transition-colors">
              Clear filters
            </a>
          )}
        </form>

        <div className="rounded-xl border border-white/[0.08] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-white/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Resource</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Badge variant={ACTION_VARIANT[log.action] ?? 'neutral'}>{log.action.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {log.resource}
                    {log.resourceId && <span className="text-white/30 text-xs"> · {log.resourceId.slice(0, 8)}</span>}
                  </td>
                  <td className="px-4 py-3 text-white/60">{log.actor?.name ?? log.actor?.email ?? '—'}</td>
                  <td className="px-4 py-3 text-white/40">{log.createdAt.toLocaleString('en-IN')}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-white/40">
                    No audit events match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  )
}

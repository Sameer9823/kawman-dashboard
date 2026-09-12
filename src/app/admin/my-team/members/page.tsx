import Link from 'next/link'
import { MainLayout } from '@/components/layout'
import { requirePermission } from '@/lib/session'
import { PageHeader } from '@/components/crm/page-header'
import { Badge } from '@/components/ui/badge'
import { getTeamMembers } from '@/services/team.service'
import { getInitials } from '@/lib/utils'

export const metadata = { title: 'Team Members | Kawman ExAct' }

const STATUS_VARIANT: Record<string, 'success' | 'neutral' | 'danger' | 'warning'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
  INVITED: 'warning',
}

export default async function TeamMembersPage() {
  await requirePermission('team.view_all')

  const members = await getTeamMembers()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Team Members" subtitle={`${members.length} active members in your organization`} />

        {members.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] py-12 text-center">
            <p className="text-white/40">No team members found.</p>
            <p className="text-white/25 text-sm mt-1">Members appear here once they are invited and activated.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.08] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-white/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Department / Team</th>
                  <th className="px-4 py-3 font-medium">Designation</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {members.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/my-team/${u.id}`} className="flex items-center gap-3 group">
                        <div className="h-8 w-8 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-semibold shrink-0">
                          {getInitials(u.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white group-hover:text-purple-300 transition-colors">{u.name}</p>
                          <p className="text-white/40 text-xs truncate">{u.email}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {u.department ?? '—'}
                      {u.team && <span className="text-white/35"> / {u.team}</span>}
                    </td>
                    <td className="px-4 py-3 text-white/60">{u.designation ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[u.status] ?? 'neutral'}>{u.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-white/40">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

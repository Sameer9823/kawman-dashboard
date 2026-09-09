import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { DeleteRowButton } from '@/components/crm/delete-row-button'
import { Badge } from '@/components/ui/badge'
import { getTeams, getDepartments } from '@/services/org-structure.service'
import { getOrgUserOptions } from '@/services/user.service'
import { TeamForm } from './team-form'
import { deleteTeamAction } from './actions'

export const metadata = { title: 'Teams | Kawman ExAct Admin' }

export default async function AdminTeamsPage() {
  const [teams, departments, managers] = await Promise.all([getTeams(), getDepartments(), getOrgUserOptions()])

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Teams" subtitle={`${teams.length} teams`} />
        <TeamForm managers={managers} departments={departments} />

        <div className="rounded-xl border border-white/[0.08] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-white/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Manager</th>
                <th className="px-4 py-3 font-medium">Members</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {teams.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white">{t.name}</td>
                  <td className="px-4 py-3 text-white/60">{t.department ?? '—'}</td>
                  <td className="px-4 py-3 text-white/60">{t.manager ?? '—'}</td>
                  <td className="px-4 py-3 text-white/60">{t.userCount}</td>
                  <td className="px-4 py-3">
                    <Badge variant={t.status === 'ACTIVE' ? 'success' : 'neutral'}>{t.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <DeleteRowButton
                      action={deleteTeamAction.bind(null, t.id)}
                      confirmLabel={`Delete ${t.name}?`}
                    />
                  </td>
                </tr>
              ))}
              {teams.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-white/40">
                    No teams yet.
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

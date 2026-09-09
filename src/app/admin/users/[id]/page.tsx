import { notFound } from 'next/navigation'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserById } from '@/services/user.service'
import { getDepartments, getTeams } from '@/services/org-structure.service'
import { requireSession } from '@/lib/session'
import { UserDetailForm } from './user-detail-form'

export const metadata = { title: 'Edit User | Kawman ExAct Admin' }

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession()
  const [user, departments, teams] = await Promise.all([getOrgUserById(id), getDepartments(), getTeams()])
  if (!user) notFound()

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title={user.name} subtitle={user.email} />
        <UserDetailForm user={user} departments={departments} teams={teams} isSelf={session.user.id === id} />
      </div>
    </MainLayout>
  )
}

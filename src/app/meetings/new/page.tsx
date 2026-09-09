import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { getCompanyOptions } from '@/services/company.service'
import { getContactOptions } from '@/services/contact.service'
import { requireApiSession } from '@/lib/session'
import { NewMeetingForm } from './meeting-form'

export const metadata = { title: 'Schedule Meeting | Kawman ExAct' }

export default async function NewMeetingPage() {
  const session = await requireApiSession()
  const [users, companies, contacts] = await Promise.all([
    getOrgUserOptions(),
    getCompanyOptions(),
    getContactOptions(),
  ])

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Schedule Meeting" subtitle="Set up a meeting and invite participants" />
        <NewMeetingForm users={users} companies={companies} contacts={contacts} currentUserId={session.user.id} />
      </div>
    </MainLayout>
  )
}

import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { requireApiSession } from '@/lib/session'
import { NewMeetingForm } from './meeting-form'

export const metadata = { title: 'New Meeting (MOM) | Kawman ExAct' }

export default async function NewMeetingPage() {
  const session = await requireApiSession()
  const users = await getOrgUserOptions()

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Meeting" subtitle="Upload a recording to transcribe and generate MOM & insights" />
        <NewMeetingForm users={users} currentUserId={session.user.id} />
      </div>
    </MainLayout>
  )
}

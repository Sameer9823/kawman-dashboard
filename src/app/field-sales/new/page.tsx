import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { NewVisitForm } from './visit-form'

export const metadata = { title: 'Schedule Visit | Kawman ExAct' }

export default async function NewFieldVisitPage() {
  const owners = await getOrgUserOptions()

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Schedule Visit" subtitle="Plan a field visit for a rep" />
        <NewVisitForm owners={owners} />
      </div>
    </MainLayout>
  )
}

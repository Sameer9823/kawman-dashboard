import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { NewVisitForm } from './visit-form'
import { isOk } from '@/lib/result'

export const metadata = { title: 'Schedule Visit | Kawman ExAct' }

export default async function NewFieldVisitPage() {
  const ownersResult = await getOrgUserOptions()
  const owners = isOk(ownersResult) ? ownersResult.data : []

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Schedule Visit" subtitle="Plan a field visit for a rep" />
        <NewVisitForm owners={owners} />
      </div>
    </MainLayout>
  )
}

import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { LeadForm } from './lead-form'
import { isOk } from '@/lib/result'

export const metadata = { title: 'New Lead | Kawman ExAct' }

export default async function NewLeadPage() {
  const ownersResult = await getOrgUserOptions()
  const owners = isOk(ownersResult) ? ownersResult.data : []

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Lead" subtitle="Add a lead to your pipeline" />
        <LeadForm owners={owners} />
      </div>
    </MainLayout>
  )
}

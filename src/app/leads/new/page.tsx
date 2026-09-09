import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { getCompanyOptions } from '@/services/company.service'
import { LeadForm } from './lead-form'

export const metadata = { title: 'New Lead | Kawman ExAct' }

export default async function NewLeadPage() {
  const [owners, companies] = await Promise.all([getOrgUserOptions(), getCompanyOptions()])

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Lead" subtitle="Add a lead to your pipeline" />
        <LeadForm owners={owners} companies={companies} />
      </div>
    </MainLayout>
  )
}

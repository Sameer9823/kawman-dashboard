import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { CompanyForm } from './company-form'

export const metadata = { title: 'New Company | Kawman ExAct' }

export default async function NewCompanyPage() {
  const owners = await getOrgUserOptions()
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Company" subtitle="Add a company to your CRM" />
        <CompanyForm owners={owners} />
      </div>
    </MainLayout>
  )
}

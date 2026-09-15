import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { DealForm } from './deal-form'

export const metadata = { title: 'New Deal | Kawman ExAct' }

export default async function NewDealPage() {
  const owners = await getOrgUserOptions()
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Deal" subtitle="Add an opportunity to your pipeline" />
        <DealForm owners={owners} />
      </div>
    </MainLayout>
  )
}

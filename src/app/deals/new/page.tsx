import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { DealForm } from './deal-form'
import { isOk } from '@/lib/result'

export const metadata = { title: 'New Deal | Kawman ExAct' }

export default async function NewDealPage() {
  const ownersResult = await getOrgUserOptions()
  const owners = isOk(ownersResult) ? ownersResult.data : []
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Deal" subtitle="Add an opportunity to your pipeline" />
        <DealForm owners={owners} />
      </div>
    </MainLayout>
  )
}

import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getIntegrations, getIntegrationTypes } from '@/services/integration.service'
import { IntegrationsView } from './integrations-view'

export const metadata = { title: 'Integrations | Kawman ExAct' }

export default async function IntegrationsPage() {
  const [integrations, types] = await Promise.all([getIntegrations(), Promise.resolve(getIntegrationTypes())])

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Integrations" subtitle="Connect Kawman ExAct to external tools and services" />
        <IntegrationsView integrations={integrations} types={types} />
      </div>
    </MainLayout>
  )
}

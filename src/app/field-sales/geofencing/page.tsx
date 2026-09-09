import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { getGeoFences } from '@/services/field-visit.service'
import { getCompanyOptions } from '@/services/company.service'
import { GeoFenceForm } from './geofence-form'
import { GeoFenceList } from './geofence-list'

export const metadata = { title: 'Geo-Fencing | Kawman ExAct' }

export default async function GeoFencingPage() {
  const [fences, companies] = await Promise.all([getGeoFences(), getCompanyOptions()])

  return (
    <MainLayout>
      <div className="space-y-8">
        <PageHeader title="Geo-Fencing" subtitle={`${fences.length} fences configured`} />

        <div>
          <h2 className="text-sm font-semibold text-white/70 mb-3">Create a geofence</h2>
          <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6 max-w-3xl">
            <GeoFenceForm companies={companies} />
          </Card>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white/70 mb-3">All geofences</h2>
          <GeoFenceList fences={fences} />
        </div>
      </div>
    </MainLayout>
  )
}

import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { LiveMap } from '@/components/field-sales/live-map'
import { getLiveMapVisits, getActiveGeoFencesForMap } from '@/services/field-visit.service'

export const metadata = { title: 'Live Map | Kawman ExAct' }

export default async function LiveMapPage() {
  const [visits, geoFences] = await Promise.all([getLiveMapVisits(), getActiveGeoFencesForMap()])

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Live Map" subtitle={`${visits.length} field reps tracked today`} />
        <LiveMap initialVisits={visits} geoFences={geoFences} />
      </div>
    </MainLayout>
  )
}

import { MainLayout } from '@/components/layout'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { PipelineCard } from '@/components/dashboard/pipeline-card'
import { AIInsightCard } from '@/components/dashboard/ai-insight-card'
import { FieldActivityCard } from '@/components/dashboard/field-activity-card'
import { LiveMapCard } from '@/components/dashboard/live-map-card'
import { LeadSourceChart } from '@/components/dashboard/lead-source-chart'
import { FollowUpList } from '@/components/dashboard/follow-up-list'
import { RecentActivities } from '@/components/dashboard/recent-activities'
import { NewActionDropdown } from '@/components/dashboard/new-action-dropdown'
import { getDashboardMetrics } from '@/services/dashboard.service'

export const metadata = {
  title: 'Dashboard | Kawman ExAct',
}

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics()

  return (
    <MainLayout>
      <div className="space-y-6 animate-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              Welcome back, {metrics.userName}! <span aria-hidden="true">👋</span>
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Here&apos;s what&apos;s happening in your workspace today.
            </p>
          </div>
          <NewActionDropdown />
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {metrics.kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        {/* Pipeline / AI Insights / Field Activity */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <PipelineCard
            stages={metrics.pipeline}
            conversionRate={metrics.conversionRate}
            conversionTrend={metrics.conversionTrend}
          />
          <AIInsightCard summary={metrics.aiSummary} insights={metrics.aiInsights} />
          <div className="space-y-6">
            <FieldActivityCard metrics={metrics.fieldActivity} />
          </div>
        </div>

        {/* Live map */}
        <LiveMapCard markers={metrics.liveVisits} />

        {/* Leads by source / Upcoming follow-ups */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <LeadSourceChart sources={metrics.leadSources} total={metrics.totalLeads} />
          <FollowUpList items={metrics.upcomingFollowUps} />
        </div>

        {/* Recent activities */}
        <RecentActivities items={metrics.recentActivities} />
      </div>
    </MainLayout>
  )
}

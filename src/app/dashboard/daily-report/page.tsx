import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getTodayReportDraft } from '@/services/daily-report.service'
import { isAIConfigured } from '@/lib/ai'
import { DailyReportForm } from './daily-report-form'

export const metadata = { title: "Submit Daily Report | Kawman ExAct" }

export default async function DailyReportPage() {
  const [draft, aiConfigured] = await Promise.all([getTodayReportDraft(), Promise.resolve(isAIConfigured())])
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Submit Today's Report" subtitle="Pre-filled from your CRM activity today — edit before submitting" />
        <DailyReportForm draft={draft} aiConfigured={aiConfigured} />
      </div>
    </MainLayout>
  )
}

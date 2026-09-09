import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { LeadsTable } from '@/components/crm/leads-table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getLeadsPage, type LeadSortKey } from '@/services/lead.service'
import { getOrgUserOptions } from '@/services/user.service'
import type { LeadStatus } from '@/types/crm'
import { RecalculateAllScoresButton } from '@/components/crm/recalculate-all-scores-button'
import { ExportCsvButton } from '@/components/crm/export-csv-button'
import { ImportLeadsButton } from '@/components/crm/import-leads-button'

export const metadata = { title: 'Leads | Kawman ExAct' }

const SORT_KEYS: LeadSortKey[] = ['name', 'score', 'value', 'lastActivityAt', 'createdAt']
const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  const search = first(params.q)
  const statusParam = first(params.status)
  const status = statusParam && STATUSES.includes(statusParam as LeadStatus) ? (statusParam as LeadStatus) : undefined
  const sortParam = first(params.sort)
  const sortKey = SORT_KEYS.includes(sortParam as LeadSortKey) ? (sortParam as LeadSortKey) : undefined
  const dirParam = first(params.dir)
  const sortDir = dirParam === 'asc' ? 'asc' : dirParam === 'desc' ? 'desc' : undefined
  const pageParam = Number(first(params.page))
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined

  const result = await getLeadsPage({ search, status, sortKey, sortDir, page })
  const owners = await getOrgUserOptions()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Leads"
          subtitle={`${result.total} leads in your pipeline`}
          action={
            <div className="flex items-center gap-3">
              <RecalculateAllScoresButton />
              <ImportLeadsButton />
              <ExportCsvButton href="/api/leads/export" />
              <Button asChild className="gap-1.5">
                <Link href="/leads/new">
                  <Plus className="h-4 w-4" />
                  New Lead
                </Link>
              </Button>
            </div>
          }
        />
        <LeadsTable result={result} owners={owners} />
      </div>
    </MainLayout>
  )
}

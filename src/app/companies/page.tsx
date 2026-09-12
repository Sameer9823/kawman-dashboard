import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { CompaniesTable } from '@/components/crm/companies-table'
import { ExportCsvButton } from '@/components/crm/export-csv-button'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getCompaniesPage, type CompanySortKey } from '@/services/company.service'

export const metadata = { title: 'Companies | Kawman ExAct' }

const SORT_KEYS: CompanySortKey[] = ['name', 'employees', 'revenue', 'createdAt']

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  const search = first(params.q)
  const statusParam = first(params.status)
  const status = statusParam === 'ACTIVE' || statusParam === 'INACTIVE' ? statusParam : undefined
  const sortParam = first(params.sort)
  const sortKey = SORT_KEYS.includes(sortParam as CompanySortKey) ? (sortParam as CompanySortKey) : undefined
  const dirParam = first(params.dir)
  const sortDir = dirParam === 'asc' ? 'asc' : dirParam === 'desc' ? 'desc' : undefined
  const pageParam = Number(first(params.page))
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined

  const result = await getCompaniesPage({ search, status, sortKey, sortDir, page })

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Companies"
          subtitle={`${result.total} companies tracked`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ExportCsvButton href="/api/companies/export" />
              <Button asChild className="gap-1.5">
                <Link href="/companies/new">
                  <Plus className="h-4 w-4" />
                  New Company
                </Link>
              </Button>
            </div>
          }
        />
        <CompaniesTable result={result} />
      </div>
    </MainLayout>
  )
}

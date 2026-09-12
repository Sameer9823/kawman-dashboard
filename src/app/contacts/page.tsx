import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { ContactsTable } from '@/components/crm/contacts-table'
import { ExportCsvButton } from '@/components/crm/export-csv-button'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getContactsPage, type ContactSortKey } from '@/services/contact.service'

export const metadata = { title: 'Contacts | Kawman ExAct' }

const SORT_KEYS: ContactSortKey[] = ['name', 'lastActivityAt', 'createdAt']

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  const search = first(params.q)
  const sortParam = first(params.sort)
  const sortKey = SORT_KEYS.includes(sortParam as ContactSortKey) ? (sortParam as ContactSortKey) : undefined
  const dirParam = first(params.dir)
  const sortDir = dirParam === 'asc' ? 'asc' : dirParam === 'desc' ? 'desc' : undefined
  const pageParam = Number(first(params.page))
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined

  const result = await getContactsPage({ search, sortKey, sortDir, page })

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Contacts"
          subtitle={`${result.total} contacts across your companies`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ExportCsvButton href="/api/contacts/export" />
              <Button asChild className="gap-1.5">
                <Link href="/contacts/new">
                  <Plus className="h-4 w-4" />
                  New Contact
                </Link>
              </Button>
            </div>
          }
        />
        <ContactsTable result={result} />
      </div>
    </MainLayout>
  )
}

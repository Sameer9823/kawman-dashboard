import type { UniversalReportDefinition, ReportColumn } from '../types'
import type { Contact } from '@/types/crm'

const COLUMNS: ReportColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'company', header: 'Company' },
  { key: 'designation', header: 'Designation' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Phone' },
  { key: 'owner', header: 'Owner' },
  { key: 'status', header: 'Status' },
  { key: 'lastActivityAt', header: 'Last Activity', format: 'date' },
]

export function buildContactsReport(opts: {
  contacts: Contact[]
  generatedBy?: string
  organizationName?: string
  filters?: Record<string, string>
}): UniversalReportDefinition {
  return {
    name: 'Contacts',
    title: 'Contacts Report',
    subtitle: `${opts.contacts.length} contacts — scoped to your organization and permissions`,
    filters: opts.filters,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
      recordCount: opts.contacts.length,
    },
    columns: COLUMNS,
    rows: opts.contacts as unknown as Record<string, unknown>[],
  }
}

export { COLUMNS as CONTACTS_COLUMNS }

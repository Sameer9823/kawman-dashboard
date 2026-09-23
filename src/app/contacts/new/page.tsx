import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { ContactForm } from './contact-form'
import { isOk } from '@/lib/result'
import type { ContactInitialValues } from './contact-form'

export const metadata = { title: 'New Contact | Kawman ExAct' }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [ownersResult, params] = await Promise.all([
    getOrgUserOptions(),
    searchParams,
  ])
  const owners = isOk(ownersResult) ? ownersResult.data : []

  const initialValues: ContactInitialValues = {
    name: first(params.name),
    company: first(params.company),
    designation: first(params.designation),
    email: first(params.email),
    phone: first(params.phone),
    mobile: first(params.mobile),
  }

  const hasValues = Object.values(initialValues).some((v) => v !== undefined)

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Contact" subtitle="Add a contact to your CRM" />
        <ContactForm owners={owners} initialValues={hasValues ? initialValues : undefined} />
      </div>
    </MainLayout>
  )
}

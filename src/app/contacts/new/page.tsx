import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { ContactForm } from './contact-form'
import { isOk } from '@/lib/result'

export const metadata = { title: 'New Contact | Kawman ExAct' }

export default async function NewContactPage() {
  const ownersResult = await getOrgUserOptions()
  const owners = isOk(ownersResult) ? ownersResult.data : []
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Contact" subtitle="Add a contact to your CRM" />
        <ContactForm owners={owners} />
      </div>
    </MainLayout>
  )
}

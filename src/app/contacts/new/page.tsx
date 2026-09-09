import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { getCompanyOptions } from '@/services/company.service'
import { ContactForm } from './contact-form'

export const metadata = { title: 'New Contact | Kawman ExAct' }

export default async function NewContactPage() {
  const [owners, companies] = await Promise.all([getOrgUserOptions(), getCompanyOptions()])
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Contact" subtitle="Add a contact to your CRM" />
        <ContactForm owners={owners} companies={companies} />
      </div>
    </MainLayout>
  )
}

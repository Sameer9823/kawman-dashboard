import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { FileGrid } from '@/components/files/file-grid'
import { getRecentFiles } from '@/services/file.service'
import { getOrgUserOptions } from '@/services/user.service'

export const metadata = { title: 'Recent Files | Kawman ExAct' }

export default async function RecentFilesPage() {
  const [files, users] = await Promise.all([getRecentFiles(), getOrgUserOptions()])

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Recent" subtitle="Recently uploaded files across your organization" />
        <FileGrid files={files} users={users} emptyLabel="No files uploaded yet" />
      </div>
    </MainLayout>
  )
}

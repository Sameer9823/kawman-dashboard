import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { FileGrid } from '@/components/files/file-grid'
import { getStarredFiles } from '@/services/file.service'
import { getOrgUserOptions } from '@/services/user.service'

export const metadata = { title: 'Starred Files | Kawman ExAct' }

export default async function StarredFilesPage() {
  const [files, users] = await Promise.all([getStarredFiles(), getOrgUserOptions()])

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Starred" subtitle={`${files.length} starred files`} />
        <FileGrid files={files} users={users} emptyLabel="Star a file to find it here quickly" />
      </div>
    </MainLayout>
  )
}

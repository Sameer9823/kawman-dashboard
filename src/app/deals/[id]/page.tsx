import { notFound } from 'next/navigation'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getDealById } from '@/services/deal.service'
import { getOrgUserOptions } from '@/services/user.service'
import { getCompanyOptions } from '@/services/company.service'
import { getContactOptions } from '@/services/contact.service'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { formatCurrency } from '@/lib/utils'
import { DealDetailForm } from './deal-detail-form'

export const metadata = { title: 'Deal Detail | Kawman ExAct' }

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [deal, owners, companies, contacts] = await Promise.all([
    getDealById(id),
    getOrgUserOptions(),
    getCompanyOptions(),
    getContactOptions(),
  ])
  if (!deal) notFound()

  const session = await requireApiSession()
  const [activities, followUps] = await Promise.all([
    prisma.activity.findMany({
      where: { dealId: id, organizationId: session.user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { actor: { select: { name: true } } },
    }),
    prisma.followUp.findMany({
      where: { dealId: id, organizationId: session.user.organizationId },
      orderBy: { dueDate: 'asc' },
    }),
  ])

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader title={deal.name} subtitle={`${deal.company} · ${formatCurrency(deal.value)}`} />
        <DealDetailForm deal={deal} owners={owners} companies={companies} contacts={contacts} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h3 className="text-sm font-medium text-white mb-3">Follow-ups</h3>
            {followUps.length === 0 && <p className="text-sm text-white/40">No follow-ups scheduled.</p>}
            <ul className="space-y-2">
              {followUps.map((f) => (
                <li key={f.id} className="text-sm text-white/70 flex justify-between">
                  <span>{f.title}</span>
                  <span className="text-white/40">{f.dueDate.toLocaleDateString('en-IN')}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h3 className="text-sm font-medium text-white mb-3">Activity</h3>
            {activities.length === 0 && <p className="text-sm text-white/40">No activity yet.</p>}
            <ul className="space-y-2">
              {activities.map((a) => (
                <li key={a.id} className="text-sm text-white/70">
                  <span className="text-white/40">{a.createdAt.toLocaleString('en-IN')}</span> — {a.description}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

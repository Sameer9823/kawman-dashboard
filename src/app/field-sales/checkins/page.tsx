import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { UserCheck, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { getCheckIns } from '@/services/field-visit.service'

export const metadata = { title: 'Check-ins | Kawman ExAct' }

const VERIFICATION_VARIANT: Record<string, BadgeVariant> = {
  VERIFIED: 'success',
  OUT_OF_RANGE: 'warning',
  PENDING: 'neutral',
  REJECTED: 'danger',
}
const VERIFICATION_LABEL: Record<string, string> = {
  VERIFIED: 'Verified',
  OUT_OF_RANGE: 'Out of range',
  PENDING: 'Pending',
  REJECTED: 'Rejected',
}

export default async function CheckInsPage() {
  const checkIns = await getCheckIns()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Check-ins" subtitle={`${checkIns.length} check-ins recorded`} />

        <Card className="bg-[#0a111c]/80 border-white/[0.08]">
          {checkIns.length === 0 ? (
            <div className="py-14 text-center">
              <UserCheck className="h-6 w-6 text-white/30 mx-auto mb-2" />
              <p className="text-white/40 text-sm">No check-ins yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
                    <th className="px-4 py-3 font-medium">Visit</th>
                    <th className="px-4 py-3 font-medium">Rep</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Distance</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {checkIns.map((c) => (
                    <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{c.visitTitle}</p>
                        {c.companyName && <p className="text-white/40 text-xs mt-0.5">{c.companyName}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-semibold flex items-center justify-center">
                            {c.userInitials}
                          </span>
                          <span className="text-white/70">{c.user}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {c.distanceFromCustomer != null ? `${Math.round(c.distanceFromCustomer)}m` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={VERIFICATION_VARIANT[c.verificationStatus] ?? 'neutral'}>
                          {VERIFICATION_LABEL[c.verificationStatus] ?? c.verificationStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-white/50">{format(new Date(c.createdAt), 'd MMM, h:mm a')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
  )
}

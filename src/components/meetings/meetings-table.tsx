'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Video, FileText, Sparkles, Building2, Upload } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { format } from 'date-fns'
import type { MeetingListItem, MeetingStatus, MeetingType } from '@/types/meetings'

const STATUS_LABEL: Record<MeetingStatus, string> = {
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  PROCESSING: 'Processing',
  FAILED: 'Failed',
}
const STATUS_VARIANT: Record<MeetingStatus, BadgeVariant> = {
  SCHEDULED: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  PROCESSING: 'warning',
  FAILED: 'danger',
}
const TYPE_LABEL: Record<MeetingType, string> = {
  IN_PERSON: 'In person',
  VIDEO_CALL: 'Video call',
  PHONE: 'Phone',
}

export function MeetingsTable({
  meetings,
  emptyLabel = 'No meetings found',
}: {
  meetings: MeetingListItem[]
  emptyLabel?: string
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | MeetingStatus>('ALL')

  const filtered = useMemo(() => {
    let rows = meetings
    if (statusFilter !== 'ALL') rows = rows.filter((m) => m.status === statusFilter)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      rows = rows.filter((m) => m.title.toLowerCase().includes(q) || (m.companyName ?? '').toLowerCase().includes(q))
    }
    return rows
  }, [meetings, query, statusFilter])

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-white/[0.06]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings by title, company..."
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | MeetingStatus)}
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="ALL">All statuses</option>
          {(Object.keys(STATUS_LABEL) as MeetingStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="text-xs text-white/35 sm:ml-auto">
          {filtered.length} of {meetings.length} meetings
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
              <th className="px-4 py-3 font-medium">Meeting</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Uploaded</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Assets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {filtered.map((m) => (
              <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/meetings/${m.id}`} className="text-white font-medium hover:text-purple-300 transition-colors">
                    {m.title}
                  </Link>
                  <p className="text-white/40 text-xs mt-0.5">{m.participantCount} participants</p>
                </td>
                <td className="px-4 py-3 text-white/70">
                  {m.companyName ? (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-white/30" />
                      {m.companyName}
                    </span>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-white/60">
                  <span className="flex items-center gap-1.5">
                    <Upload className="h-3.5 w-3.5 text-white/30" />
                    {format(new Date(m.createdAt), 'd MMM, h:mm a')}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/60">{TYPE_LABEL[m.type]}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-white/30">
                    <Video className={m.hasRecording ? 'h-3.5 w-3.5 text-blue-400' : 'h-3.5 w-3.5'} />
                    <FileText className={m.hasTranscript ? 'h-3.5 w-3.5 text-emerald-400' : 'h-3.5 w-3.5'} />
                    <Sparkles className={m.hasSummary ? 'h-3.5 w-3.5 text-purple-400' : 'h-3.5 w-3.5'} />
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-white/35">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

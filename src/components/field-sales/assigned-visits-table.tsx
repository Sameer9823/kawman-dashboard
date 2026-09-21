'use client'

import { useMemo, useState } from 'react'
import { MapPin, Loader2, Building2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import type { FieldVisit, VisitStatus } from '@/types/field-sales'
import { checkInAction, deleteFieldVisitAction, updateVisitStatusAction } from '@/app/field-sales/actions'
import { DeleteRowButton } from '@/components/crm/delete-row-button'
import { VisitRow, STATUS_LABEL, STATUS_VARIANT } from './visit-row'

interface AssignedVisitsTableProps {
  visits: FieldVisit[]
}

export function AssignedVisitsTable({ visits }: AssignedVisitsTableProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return visits
    const s = search.toLowerCase()
    return visits.filter(
      (v) =>
        v.title.toLowerCase().includes(s) ||
        v.purpose.toLowerCase().includes(s) ||
        v.company?.toLowerCase().includes(s) ||
        v.address?.toLowerCase().includes(s)
    )
  }, [visits, search])

  

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="p-4 border-b border-white/[0.08]">
        <Input
          placeholder="Search visits..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs bg-white/[0.04] border-white/[0.08] text-white placeholder-white/40"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.05]">
              <th className="px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">Visit</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">Company</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">Scheduled</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">Status</th>
              {/*
              <th className="px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">Verification</th>
              */}
              <th className="px-4 py-3 text-right text-xs font-medium text-white/50 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {filtered.map((v) => (
              <VisitRow
                key={v.id}
                visit={v}
                showVerification={true}
                onStatusChange={(status) => updateVisitStatusAction(v.id, status)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-white/35">
                  No assigned visits match. {visits.length === 0 && 'When a leader assigns a visit to you it will appear here with a bell notification.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
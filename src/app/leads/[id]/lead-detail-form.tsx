'use client'

import { useActionState, useState, useTransition } from 'react'
import { RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { Lead, LeadStatus } from '@/types/crm'
import type { UserOption } from '@/services/user.service'
import {
  updateLeadAction,
  deleteLeadAction,
  convertLeadToDealAction,
  recalculateLeadScoreAction,
  type LeadFormState,
} from '../actions'

const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']
const initialState: LeadFormState = {}

export function LeadDetailForm({ lead, owners }: { lead: Lead; owners: UserOption[] }) {
  const boundUpdate = updateLeadAction.bind(null, lead.id)
  const [state, formAction, pending] = useActionState(boundUpdate, initialState)
  const [scorePending, startScoreTransition] = useTransition()
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [liveScore, setLiveScore] = useState(lead.score)

  function handleRecalculate() {
    setScoreError(null)
    startScoreTransition(async () => {
      const result = await recalculateLeadScoreAction(lead.id)
      if (result.error) setScoreError(result.error)
      else if (typeof result.score === 'number') setLiveScore(result.score)
    })
  }

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6 space-y-4">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Lead name *">
          <Input name="name" defaultValue={lead.name} required />
        </Field>
        <Field label="Company">
          <Input name="company" defaultValue={lead.company} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={lead.email} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={lead.phone} />
        </Field>
        <Field label="Status">
          <select
            name="status"
            defaultValue={lead.status}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner">
          <select
            name="ownerId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">{lead.owner} (current)</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Score (0-100)">
          <div className="flex items-center gap-2">
            <Input name="score" type="number" min={0} max={100} key={liveScore} defaultValue={liveScore} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRecalculate}
              disabled={scorePending}
              title="Recalculate automatically from activity, engagement, and deal signals"
              className="shrink-0 gap-1.5"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${scorePending ? 'animate-spin' : ''}`} />
              Recalculate
            </Button>
          </div>
          {scoreError && <p className="text-xs text-red-400 mt-1">{scoreError}</p>}
        </Field>
        <Field label="Estimated value (₹)">
          <Input name="value" type="number" min={0} defaultValue={lead.value} />
        </Field>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}
        {state.success && (
          <div className="sm:col-span-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Saved.
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm" loading={pending} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
        <span className="text-xs text-white/40">Current value: {formatCurrency(lead.value)}</span>
        <div className="flex gap-2">
          <form action={convertLeadToDealAction.bind(null, lead.id)}>
            <Button type="submit" variant="secondary" size="sm">
              Convert to deal
            </Button>
          </form>
          <form action={deleteLeadAction.bind(null, lead.id)}>
            <Button type="submit" variant="destructive" size="sm">
              Delete lead
            </Button>
          </form>
        </div>
      </div>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/70">{label}</label>
      {children}
    </div>
  )
}

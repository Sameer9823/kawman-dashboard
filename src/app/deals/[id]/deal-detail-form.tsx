'use client'

import { useActionState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { DealDetail } from '@/services/deal.service'
import type { DealStage } from '@/types/crm'
import type { UserOption } from '@/services/user.service'
import { updateDealAction, deleteDealAction, type DealFormState } from '../actions'

const STAGES: DealStage[] = ['NEW_LEAD', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']
const initialState: DealFormState = {}

export function DealDetailForm({
  deal,
  owners,
  companies,
  contacts,
}: {
  deal: DealDetail
  owners: UserOption[]
  companies: { id: string; name: string }[]
  contacts: { id: string; name: string; companyId: string | null }[]
}) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const boundUpdate = updateDealAction.bind(null, deal.id)
  const [state, formAction, pending] = useActionState(boundUpdate, initialState)

  function handleDelete() {
    if (!window.confirm(`Delete "${deal.name}"? This cannot be undone.`)) return
    startDelete(async () => {
      await deleteDealAction(deal.id)
      router.push('/deals')
    })
  }

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6 space-y-4">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Deal name *" error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={deal.name} required />
        </Field>
        <Field label="Company" error={state.fieldErrors?.company}>
          <Input name="company" defaultValue={deal.company === '—' ? '' : deal.company} list="company-suggestions-detail" />
          <datalist id="company-suggestions-detail">
            {companies.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Contact" error={state.fieldErrors?.contactId}>
          <select
            name="contactId"
            defaultValue={deal.contactId}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Value (₹) *" error={state.fieldErrors?.value}>
          <Input name="value" type="number" min={0} defaultValue={deal.value} required />
        </Field>
        <Field label="Stage">
          <select
            name="stage"
            defaultValue={deal.stage}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Probability (%)" error={state.fieldErrors?.probability}>
          <Input name="probability" type="number" min={0} max={100} defaultValue={deal.probability} />
        </Field>
        <Field label="Expected close">
          <Input name="expectedClose" type="date" defaultValue={deal.expectedClose} />
        </Field>
        <Field label="Priority">
          <select
            name="priority"
            defaultValue={deal.priority}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </Field>
        <Field label="Owner">
          <select
            name="ownerId"
            defaultValue={deal.ownerId}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea
            name="notes"
            defaultValue={deal.notes}
            rows={3}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </Field>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm" loading={pending} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
        <span className="text-xs text-white/40">Owned by {deal.owner}</span>
        <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete deal'}
        </Button>
      </div>
    </Card>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/70">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

'use client'

import { useActionState, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createDealAction, type DealFormState } from '../actions'
import type { UserOption } from '@/services/user.service'

const initialState: DealFormState = {}
const STAGES = ['NEW_LEAD', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']

export function DealForm({
  owners,
  companies,
  contacts,
}: {
  owners: UserOption[]
  companies: { id: string; name: string }[]
  contacts: { id: string; name: string; companyId: string }[]
}) {
  const [state, formAction, pending] = useActionState(createDealAction, initialState)
  const [companyId, setCompanyId] = useState('')
  const filteredContacts = useMemo(() => contacts.filter((c) => c.companyId === companyId), [contacts, companyId])

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Deal name *" error={state.fieldErrors?.name}>
          <Input name="name" placeholder="Acme — Bulk Supply Q3" required />
        </Field>
        <Field label="Company *" error={state.fieldErrors?.companyId}>
          <select
            name="companyId"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            required
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="" disabled>Select a company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Contact" error={state.fieldErrors?.contactId}>
          <select
            name="contactId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">None</option>
            {filteredContacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Deal value (₹) *" error={state.fieldErrors?.value}>
          <Input name="value" type="number" min={0} step="1000" placeholder="1200000" required />
        </Field>
        <Field label="Stage" error={state.fieldErrors?.stage}>
          <select
            name="stage"
            defaultValue="NEW_LEAD"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </Field>
        <Field label="Probability (%)" error={state.fieldErrors?.probability}>
          <Input name="probability" type="number" min={0} max={100} defaultValue={20} />
        </Field>
        <Field label="Expected close date" error={state.fieldErrors?.expectedClose}>
          <Input name="expectedClose" type="date" />
        </Field>
        <Field label="Priority" error={state.fieldErrors?.priority}>
          <select
            name="priority"
            defaultValue="MEDIUM"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </Field>
        <Field label="Owner" error={state.fieldErrors?.ownerId}>
          <select
            name="ownerId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">Assign to me</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={pending} disabled={pending}>
            {pending ? 'Creating…' : 'Create deal'}
          </Button>
        </div>
      </form>
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

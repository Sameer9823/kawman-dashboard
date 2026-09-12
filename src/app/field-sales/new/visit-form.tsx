'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createFieldVisitAction, type VisitFormState } from '../actions'
import type { UserOption } from '@/services/user.service'

const initialState: VisitFormState = {}

export function NewVisitForm({
  owners,
  companies,
  contacts,
}: {
  owners: UserOption[]
  companies: { id: string; name: string }[]
  contacts: { id: string; name: string; companyId: string | null }[]
}) {
  const [state, formAction, pending] = useActionState(createFieldVisitAction, initialState)

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Visit title *" error={state.fieldErrors?.title}>
          <Input name="title" placeholder="Quarterly review with Acme" required />
        </Field>
        <Field label="Purpose *" error={state.fieldErrors?.purpose}>
          <Input name="purpose" placeholder="Renewal discussion" required />
        </Field>
        <Field label="Scheduled date & time *" error={state.fieldErrors?.scheduledAt}>
          <Input name="scheduledAt" type="datetime-local" required />
        </Field>
        <Field label="Assign to" error={state.fieldErrors?.assigneeId}>
          <select
            name="assigneeId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">Assign to me</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Company" error={state.fieldErrors?.companyId}>
          <select
            name="companyId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">No company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contact" error={state.fieldErrors?.contactId}>
          <select
            name="contactId"
            defaultValue=""
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
        <Field label="Address" error={state.fieldErrors?.address}>
          <Input name="address" placeholder="Plot 14, MIDC, Andheri East, Mumbai" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude" error={state.fieldErrors?.latitude}>
            <Input name="latitude" type="number" step="0.000001" placeholder="19.119677" />
          </Field>
          <Field label="Longitude" error={state.fieldErrors?.longitude}>
            <Input name="longitude" type="number" step="0.000001" placeholder="72.846878" />
          </Field>
        </div>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={pending} disabled={pending}>
            {pending ? 'Scheduling…' : 'Schedule visit'}
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

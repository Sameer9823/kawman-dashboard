'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createContactAction, type ContactFormState } from '../actions'
import type { UserOption } from '@/services/user.service'

const initialState: ContactFormState = {}

export function ContactForm({
  owners,
  companies,
}: {
  owners: UserOption[]
  companies: { id: string; name: string }[]
}) {
  const [state, formAction, pending] = useActionState(createContactAction, initialState)

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name *" error={state.fieldErrors?.name}>
          <Input name="name" placeholder="Anjali Mehta" required />
        </Field>
        <Field label="Company" error={state.fieldErrors?.company}>
          <Input name="company" placeholder="Acme Nutraceuticals" list="company-suggestions" />
          <datalist id="company-suggestions">
            {companies.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Designation" error={state.fieldErrors?.designation}>
          <Input name="designation" placeholder="Procurement Head" />
        </Field>
        <Field label="Email" error={state.fieldErrors?.email}>
          <Input name="email" type="email" placeholder="anjali@acme.com" />
        </Field>
        <Field label="Phone" error={state.fieldErrors?.phone}>
          <Input name="phone" placeholder="+91 22 4000 1000" />
        </Field>
        <Field label="Mobile" error={state.fieldErrors?.mobile}>
          <Input name="mobile" placeholder="+91 98765 43210" />
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
            {pending ? 'Creating…' : 'Create contact'}
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

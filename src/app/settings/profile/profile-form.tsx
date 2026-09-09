'use client'

import { useActionState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { updateOwnProfileAction, type ProfileFormState } from './actions'

const initialState: ProfileFormState = {}

interface ProfileUser {
  name?: string | null
  email: string
  phone?: string | null
  designation?: string | null
  image?: string | null
}

export function ProfileForm({ user }: { user: ProfileUser }) {
  const [state, formAction, pending] = useActionState(updateOwnProfileAction, initialState)

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] flex items-center justify-center overflow-hidden">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- external, user-provided URL; not a local/optimized asset
              <img src={user.image} alt={user.name ?? 'Avatar'} className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-medium text-white/40">{(user.name ?? user.email)[0]?.toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-sm text-white/70">Avatar URL</label>
            <Input name="image" defaultValue={user.image ?? ''} placeholder="https://…" />
            {state.fieldErrors?.image && <p className="text-xs text-red-400">{state.fieldErrors.image}</p>}
          </div>
        </div>

        <Field label="Full name *" error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={user.name ?? ''} required />
        </Field>
        <Field label="Email">
          <Input value={user.email} disabled className="opacity-50" />
        </Field>
        <Field label="Phone" error={state.fieldErrors?.phone}>
          <Input name="phone" defaultValue={user.phone ?? ''} />
        </Field>
        <Field label="Designation" error={state.fieldErrors?.designation}>
          <Input name="designation" defaultValue={user.designation ?? ''} />
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
          <Button type="submit" loading={pending} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
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

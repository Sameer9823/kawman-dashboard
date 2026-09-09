'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { updateUserAction, deleteUserAction, type UserFormState } from '../actions'
import type { AdminUserRow } from '@/services/user.service'

const initialState: UserFormState = {}
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES_MANAGER', 'SALES_EXECUTIVE', 'MARKETING', 'HR', 'FINANCE', 'VIEWER']
const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'INVITED']

export function UserDetailForm({
  user,
  departments,
  teams,
  isSelf,
}: {
  user: AdminUserRow
  departments: { id: string; name: string }[]
  teams: { id: string; name: string }[]
  isSelf: boolean
}) {
  const boundUpdate = updateUserAction.bind(null, user.id)
  const [state, formAction, pending] = useActionState(boundUpdate, initialState)

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6 space-y-4">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name *" error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={user.name} required />
        </Field>
        <Field label="Email">
          <Input value={user.email} disabled />
        </Field>
        <Field label="Role *" error={state.fieldErrors?.role}>
          <select
            name="role"
            defaultValue={user.role ?? 'SALES_EXECUTIVE'}
            disabled={isSelf}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
            ))}
          </select>
          {isSelf && <p className="text-xs text-white/35">You can&apos;t change your own role.</p>}
        </Field>
        <Field label="Status" error={state.fieldErrors?.status}>
          <select
            name="status"
            defaultValue={user.status}
            disabled={isSelf}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Designation" error={state.fieldErrors?.designation}>
          <Input name="designation" defaultValue={user.designation ?? ''} />
        </Field>
        <Field label="Phone" error={state.fieldErrors?.phone}>
          <Input name="phone" defaultValue={user.phone ?? ''} />
        </Field>
        <Field label="Department" error={state.fieldErrors?.departmentId}>
          <select
            name="departmentId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">{user.department ?? 'None'} (current)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Team" error={state.fieldErrors?.teamId}>
          <select
            name="teamId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">{user.team ?? 'None'} (current)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
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

      {!isSelf && (
        <div className="flex justify-end pt-4 border-t border-white/[0.06]">
          <form action={deleteUserAction.bind(null, user.id)}>
            <Button type="submit" variant="destructive" size="sm">
              Remove user
            </Button>
          </form>
        </div>
      )}
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

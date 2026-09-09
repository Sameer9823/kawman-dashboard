'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createGeoFenceAction, type GeoFenceFormState } from '../actions'

const initialState: GeoFenceFormState = {}

export function GeoFenceForm({ companies }: { companies: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createGeoFenceAction, initialState)

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Fence name *" error={state.fieldErrors?.name}>
        <Input name="name" placeholder="Acme HQ perimeter" required />
      </Field>
      <Field label="Linked company" error={state.fieldErrors?.companyId}>
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
      <Field label="Latitude *" error={state.fieldErrors?.latitude}>
        <Input name="latitude" type="number" step="0.000001" placeholder="19.119677" required />
      </Field>
      <Field label="Longitude *" error={state.fieldErrors?.longitude}>
        <Input name="longitude" type="number" step="0.000001" placeholder="72.846878" required />
      </Field>
      <Field label="Radius (meters) *" error={state.fieldErrors?.radius}>
        <Input name="radius" type="number" min={10} step={10} placeholder="200" required />
      </Field>

      {state.error && (
        <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {state.error}
        </div>
      )}

      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" loading={pending} disabled={pending}>
          {pending ? 'Creating…' : 'Create geofence'}
        </Button>
      </div>
    </form>
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

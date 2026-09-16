'use client'

import { useActionState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createGeoFenceAction, type GeoFenceFormState } from '../actions'

const initialState: GeoFenceFormState = {}

export function GeoFenceForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(createGeoFenceAction, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success('Geofence created')
      formRef.current?.reset()
    }
    if (state.error) toast.error(state.error)
  }, [state.success, state.error])

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Fence name *" error={state.fieldErrors?.name}>
        <Input name="name" placeholder="Acme HQ perimeter" required />
      </Field>
      <Field label="Linked company" error={state.fieldErrors?.company}>
        <Input name="company" placeholder="Acme Nutraceuticals" />
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

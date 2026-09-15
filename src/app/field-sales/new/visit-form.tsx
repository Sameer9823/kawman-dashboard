'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { MapPin, Loader2, Camera, ImageIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { createFieldVisitAction, type VisitFormState } from '../actions'
import type { UserOption } from '@/services/user.service'

const initialState: VisitFormState = {}

export function NewVisitForm({ owners }: { owners: UserOption[] }) {
  const [state, formAction, pending] = useActionState(createFieldVisitAction, initialState)
  const [loc, setLoc] = useState<{ lat: number; lng: number; acc?: number } | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [latInput, setLatInput] = useState('')
  const [lngInput, setLngInput] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  function captureLocation() {
    setLocError(null)
    setLocLoading(true)
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported on this device.')
      setLocLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy })
        setLatInput(String(pos.coords.latitude))
        setLngInput(String(pos.coords.longitude))
        setLocLoading(false)
      },
      (err) => {
        setLocError(err.message || 'Enable location and try again.')
        setLocLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(f)
    previewUrlRef.current = url
    setPreview(url)
  }
  function clearPhoto() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])

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
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Company" error={state.fieldErrors?.company}>
          <Input name="company" placeholder="Acme Nutraceuticals" />
          <p className="text-[11px] text-white/25 mt-1">Created if it doesn&apos;t exist.</p>
        </Field>
        <Field label="Contact" error={state.fieldErrors?.contact}>
          <Input name="contact" placeholder="+91 98765 43210" />
        </Field>
        <Field label="Address" error={state.fieldErrors?.address}>
          <Input name="address" placeholder="Plot 14, MIDC, Andheri East, Mumbai" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude" error={state.fieldErrors?.latitude}>
            <Input name="latitude" type="number" step="0.000001" placeholder="19.119677" value={latInput} onChange={(e) => setLatInput(e.target.value)} />
          </Field>
          <Field label="Longitude" error={state.fieldErrors?.longitude}>
            <Input name="longitude" type="number" step="0.000001" placeholder="72.846878" value={lngInput} onChange={(e) => setLngInput(e.target.value)} />
          </Field>
        </div>

        {/* Live location — one tap fills lat/lng + writes to visit on create */}
        <div className="sm:col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-2">
          <p className="text-sm font-medium text-white/70">Live location</p>
          {loc ? (
            <p className="text-xs text-emerald-300 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}{loc.acc ? ` · ±${Math.round(loc.acc)}m` : ''}</p>
          ) : locLoading ? (
            <p className="text-xs text-white/40 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Capturing… allow the browser location prompt</p>
          ) : (
            <p className="text-xs text-white/30">{locError ?? 'Tap to capture your current location. It fills the lat/lng above and puts this visit on the Live Map.'}</p>
          )}
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-white/10 gap-1.5" onClick={captureLocation} disabled={locLoading}>
            {locLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />} Use my location
          </Button>
          {loc?.acc != null && <input type="hidden" name="accuracy" value={String(loc.acc)} />}
        </div>

        {/* Photo — camera or gallery via a single file input */}
        <div className="sm:col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
          <p className="text-sm font-medium text-white/70">Visit photo</p>
          {/* Single hidden file input — both buttons drive it; capture attr set per-open so we get camera vs gallery */}
          <input ref={fileRef} type="file" name="photo" accept="image/*" className="hidden" onChange={onFile} />
          {preview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview" className="w-full h-44 object-cover rounded-lg border border-white/10" />
              <button type="button" onClick={clearPhoto} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button" size="sm" variant="secondary" className="flex-1 gap-1.5 h-8 text-xs"
                onClick={() => {
                  if (!fileRef.current) return
                  fileRef.current.setAttribute('capture', 'environment')
                  fileRef.current.click()
                }}
              >
                <Camera className="h-3.5 w-3.5" /> Camera
              </Button>
              <Button
                type="button" size="sm" variant="outline" className="flex-1 gap-1.5 h-8 text-xs border-white/10"
                onClick={() => {
                  if (!fileRef.current) return
                  fileRef.current.removeAttribute('capture')
                  fileRef.current.click()
                }}
              >
                <ImageIcon className="h-3.5 w-3.5" /> Gallery
              </Button>
            </div>
          )}
          <p className="text-[11px] text-white/30">JPG/PNG/WEBP, 5MB. Saved with your visit — check-in photos are preferred but this primes the Live Map even before a rep checks in.</p>
        </div>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={pending} disabled={pending}>{pending ? 'Scheduling…' : 'Schedule visit'}</Button>
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

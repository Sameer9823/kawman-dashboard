'use client'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, MapPin, Navigation2, Loader2, Building2, ChevronLeft, ChevronRight, Camera, ImageIcon, X, VideoOff } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import type { FieldVisit, VisitStatus } from '@/types/field-sales'
import type { FieldVisitPageResult } from '@/services/field-visit.service'
import { checkInAction, updateVisitStatusAction } from '@/app/field-sales/actions'

const STATUS_LABEL: Record<VisitStatus, string> = {
  SCHEDULED: 'Scheduled',
  ON_THE_WAY: 'On the way',
  CHECKED_IN: 'Checked in',
  IN_MEETING: 'In meeting',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}
const STATUS_VARIANT: Record<VisitStatus, BadgeVariant> = {
  SCHEDULED: 'neutral',
  ON_THE_WAY: 'info',
  CHECKED_IN: 'success',
  IN_MEETING: 'default',
  COMPLETED: 'success',
  CANCELLED: 'danger',
}

function CheckInButton({ visitId }: { visitId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [open, setOpen] = useState(false)
  const [loc, setLoc] = useState<{ lat: number; lng: number; acc?: number } | null>(null)
  const [locError, setLocError] = useState<string | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraFallbackRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

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
        setLocLoading(false)
      },
      (err) => {
        setLocError(err.message || 'Could not get your location. Enable location and try again.')
        setLocLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  useEffect(() => {
    if (open && !loc && !locLoading) captureLocation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }

  useEffect(() => {
    if (!open) stopCamera()
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function openCamera() {
    if (preview) return
    setCameraError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      // Fallback to file picker with capture (mobile)
      cameraFallbackRef.current?.click()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      setCameraActive(true)
      // assign on next tick so video element exists
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('denied')) {
        setCameraError('Camera permission denied. Allow camera in browser settings, or use Gallery.')
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setCameraError('No camera found on this device. Use Gallery instead.')
      } else {
        setCameraError(msg || 'Could not open camera. Use Gallery or try again.')
      }
      // Still offer fallback picker
    }
  }

  function captureFromCamera() {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `checkin-${Date.now()}.jpg`, { type: 'image/jpeg' })
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        const url = URL.createObjectURL(file)
        previewUrlRef.current = url
        setPhoto(file)
        setPreview(url)
        stopCamera()
      },
      'image/jpeg',
      0.85
    )
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(f)
    previewUrlRef.current = url
    setPhoto(f)
    setPreview(url)
    stopCamera()
  }

  function clearPhoto() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPhoto(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
    if (cameraFallbackRef.current) cameraFallbackRef.current.value = ''
    setCameraError(null)
  }

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])

  function submit() {
    setError(null)
    if (!loc) {
      setError('Location not captured yet. Tap \"Use my location\" and allow the browser prompt.')
      return
    }
    startTransition(async () => {
      const res = await checkInAction(visitId, { latitude: loc.lat, longitude: loc.lng, accuracy: loc.acc, notes: notes || undefined }, photo)
      if (res.error) setError(res.error)
      else {
        setSuccess(true)
        setTimeout(() => setOpen(false), 800)
      }
    })
  }

  if (success) {
    return <span className="text-xs text-emerald-400 font-medium">Checked in ✓</span>
  }

  return (
    <>
      <Button size="sm" variant="secondary" className="gap-1.5 h-7 text-xs" onClick={() => setOpen(true)}>
        <Navigation2 className="h-3 w-3" /> Check in
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0d1622] p-5 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Check in</h3>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white p-1"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              {/* Location */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-xs font-medium text-white/70 mb-1.5">Location (required)</p>
                {loc ? (
                  <p className="text-xs text-emerald-300 flex items-center gap-1.5"><MapPin className="h-3 w-3" />{loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}{loc.acc ? ` · ±${Math.round(loc.acc)}m` : ''}</p>
                ) : locLoading ? (
                  <p className="text-xs text-white/40 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Capturing location… allow the browser prompt</p>
                ) : (
                  <p className="text-xs text-amber-300">{locError ?? 'Location not captured.'}</p>
                )}
                <Button size="sm" variant="outline" className="mt-2 h-7 text-xs border-white/10" onClick={captureLocation} disabled={locLoading}>
                  {locLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />} Use my location
                </Button>
                <p className="text-[11px] text-white/30 mt-1.5">Enable location in your browser/device. The visit record will be updated with this location.</p>
              </div>

              {/* Photo — live camera or gallery */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-xs font-medium text-white/70 mb-2">Photo (optional but recommended)</p>
                {/* Fallback file inputs (hidden) */}
                <input ref={cameraFallbackRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                {preview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Preview" className="w-full h-40 object-cover rounded-lg border border-white/10" />
                    <button onClick={clearPhoto} className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : cameraActive ? (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-48 object-cover" />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={captureFromCamera} className="flex-1 gap-1.5 h-8 bg-violet-600 hover:bg-violet-500 text-white">
                        <Camera className="h-3.5 w-3.5" /> Capture photo
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={stopCamera} className="h-8 border-white/10">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-white/30">Live camera — tap Capture. On desktop this opens your webcam; on mobile the rear camera.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="secondary" className="flex-1 gap-1.5 h-8 text-xs" onClick={openCamera}>
                        <Camera className="h-3.5 w-3.5" /> Camera
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="flex-1 gap-1.5 h-8 text-xs border-white/10" onClick={() => fileRef.current?.click()}>
                        <ImageIcon className="h-3.5 w-3.5" /> Gallery
                      </Button>
                    </div>
                    {cameraError && (
                      <div className="mt-2 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200">
                        <VideoOff className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="flex-1">{cameraError}</span>
                        <button onClick={() => fileRef.current?.click()} className="shrink-0 underline">Use Gallery</button>
                      </div>
                    )}
                    <p className="text-[11px] text-white/30 mt-1.5">Camera opens live preview (allow permission) — if blocked, use Gallery. JPG/PNG/WEBP, 5MB.</p>
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-white/60">Notes (optional)</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="On-site notes…" className="h-8 text-sm" />
              </div>

              {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
                <Button size="sm" onClick={submit} disabled={pending || !loc} className="gap-1.5">
                  {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation2 className="h-3 w-3" />} Confirm check-in
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StatusSelect({ visitId, status }: { visitId: string; status: VisitStatus }) {
  const [pending, startTransition] = useTransition()
  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => startTransition(() => updateVisitStatusAction(visitId, e.target.value as VisitStatus))}
      className="h-7 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
    >
      {(Object.keys(STATUS_LABEL) as VisitStatus[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  )
}

type FieldVisitsTableProps = { visits: FieldVisit[]; result?: undefined } | { result: FieldVisitPageResult; visits?: undefined }
/**
 * Two modes, sharing all row-rendering and interactive-action markup
 * (check-in button, status dropdown):
 *  - `visits` prop: original client-side-filtered behavior, kept for
 *    /field-sales/visits ("Today's Visits") — an inherently small,
 *    single-day dataset where pagination doesn't add value.
 *  - `result` prop: server-side paginated/searched/sorted data (see
 *    services/field-visit.service.ts#getFieldVisitsPage), used by the
 *    main /field-sales list page.
 */
export function FieldVisitsTable(props: FieldVisitsTableProps) {
  const isServerMode = Boolean(props.result)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // Client-mode state (used only when `visits` is provided).
  const [localQuery, setLocalQuery] = useState('')
  const [localStatusFilter, setLocalStatusFilter] = useState<'ALL' | VisitStatus>('ALL')

  // Server-mode state (used only when `result` is provided) — mirrors
  // leads-table.tsx's URL-driven pattern.
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusFilter = (searchParams.get('status') as VisitStatus | null) ?? 'ALL'

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      if (!('page' in updates)) next.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    if (!isServerMode) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (query !== (searchParams.get('q') ?? '')) {
        updateParams({ q: query || null })
      }
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isServerMode])

  const clientFiltered = useMemo(() => {
    if (isServerMode) return []
    let rows = props.visits ?? []
    if (localStatusFilter !== 'ALL') rows = rows.filter((v) => v.status === localStatusFilter)
    if (localQuery.trim()) {
      const q = localQuery.trim().toLowerCase()
      rows = rows.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          (v.company ?? '').toLowerCase().includes(q) ||
          v.assignee.toLowerCase().includes(q)
      )
    }
    return rows
  }, [isServerMode, props.visits, localQuery, localStatusFilter])

  const displayVisits = isServerMode ? props.result!.visits : clientFiltered
  const totalLabel = isServerMode
    ? (() => {
        const { total, page, pageSize } = props.result!
        if (total === 0) return '0 visits'
        const start = (page - 1) * pageSize + 1
        const end = Math.min(page * pageSize, total)
        return `${start}–${end} of ${total} visits`
      })()
    : `${clientFiltered.length} of ${(props.visits ?? []).length} visits`

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-white/[0.06]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
          <Input
            value={isServerMode ? query : localQuery}
            onChange={(e) => (isServerMode ? setQuery(e.target.value) : setLocalQuery(e.target.value))}
            placeholder="Search visits by title, company, rep..."
            className="pl-9"
          />
        </div>
        <select
          value={isServerMode ? statusFilter : localStatusFilter}
          onChange={(e) =>
            isServerMode
              ? updateParams({ status: e.target.value === 'ALL' ? null : e.target.value })
              : setLocalStatusFilter(e.target.value as 'ALL' | VisitStatus)
          }
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="ALL">All statuses</option>
          {(Object.keys(STATUS_LABEL) as VisitStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="text-xs text-white/35 sm:ml-auto">{totalLabel}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
              <th className="px-4 py-3 font-medium">Visit</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Rep</th>
              <th className="px-4 py-3 font-medium">Scheduled</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {displayVisits.map((v) => (
              <tr key={v.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <p className="text-white font-medium">{v.title}</p>
                  <p className="text-white/40 text-xs mt-0.5">{v.purpose}</p>
                  {v.address && (
                    <p className="text-white/30 text-xs mt-0.5 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {v.address}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-white/70">
                  {v.company ? (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-white/30" />
                      {v.company}
                    </span>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-semibold flex items-center justify-center">
                      {v.assigneeInitials}
                    </span>
                    <span className="text-white/70">{v.assignee}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-white/60">{format(new Date(v.scheduledAt), 'd MMM, h:mm a')}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <Badge variant={STATUS_VARIANT[v.status]}>{STATUS_LABEL[v.status]}</Badge>
                    <StatusSelect visitId={v.id} status={v.status} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {v.status !== 'COMPLETED' && v.status !== 'CANCELLED' && <CheckInButton visitId={v.id} />}
                    <Link href={`/field-sales/live-map`} className="text-xs text-purple-400 hover:text-purple-300">
                      Map
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {displayVisits.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-white/35">
                  No visits found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isServerMode && props.result!.pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 p-4 border-t border-white/[0.06]">
          <span className="text-xs text-white/40">
            Page {props.result!.page} of {props.result!.pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateParams({ page: String(props.result!.page - 1) })}
              disabled={props.result!.page <= 1}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              onClick={() => updateParams({ page: String(props.result!.page + 1) })}
              disabled={props.result!.page >= props.result!.pageCount}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

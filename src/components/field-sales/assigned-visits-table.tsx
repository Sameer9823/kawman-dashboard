'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Navigation2, Loader2, Building2, Camera, ImageIcon, X, VideoOff, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import type { FieldVisit, VisitStatus } from '@/types/field-sales'
import { checkInAction } from '@/app/field-sales/actions'

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

function FaceVerifyCheckIn({ visitId }: { visitId: string }) {
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
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
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
      cameraFallbackRef.current?.click()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream
      setCameraActive(true)
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
        setCameraError('No camera found. Use Gallery instead.')
      } else {
        setCameraError(msg || 'Could not open camera. Use Gallery or try again.')
      }
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
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `verify-${Date.now()}.jpg`, { type: 'image/jpeg' })
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(file)
      previewUrlRef.current = url
      setPhoto(file)
      setPreview(url)
      stopCamera()
    }, 'image/jpeg', 0.85)
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

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  function submit() {
    setError(null)
    if (!loc) {
      setError('Location not captured yet. Tap "Use my location" and allow the browser prompt.')
      return
    }
    if (!photo) {
      setError('Take or pick a face photo to verify you are on-site.')
      return
    }
    startTransition(async () => {
      const res = await checkInAction(visitId, { latitude: loc.lat, longitude: loc.lng, accuracy: loc.acc, notes: notes || undefined }, photo)
      if (res.error) setError(res.error)
      else {
        setSuccess(true)
        window.location.reload()
      }
    })
  }

  if (success) return <span className="text-xs text-emerald-400 font-medium">Verified ✓</span>

  return (
    <>
      <Button size="sm" className="gap-1.5 h-7 text-xs bg-violet-600 hover:bg-violet-500" onClick={() => setOpen(true)}>
        <ShieldCheck className="h-3.5 w-3.5" /> Verify on-site
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0d1622] p-5 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-violet-400" /> Verify face on-site</h3>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white p-1"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-white/40 mb-3">Your location + a face photo are recorded as proof that you were at this visit. Required for assigned visits.</p>
            <div className="space-y-3">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-xs font-medium text-white/70 mb-1.5">Location (required)</p>
                {loc ? (
                  <p className="text-xs text-emerald-300 flex items-center gap-1.5"><MapPin className="h-3 w-3" />{loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}{loc.acc != null ? ` · ±${Math.round(loc.acc)}m` : ''}</p>
                ) : locLoading ? (
                  <p className="text-xs text-white/40 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Capturing location… allow the browser prompt</p>
                ) : (
                  <p className="text-xs text-amber-300">{locError ?? 'Location not captured.'}</p>
                )}
                <Button size="sm" variant="outline" className="mt-2 h-7 text-xs border-white/10" onClick={captureLocation} disabled={locLoading}>
                  {locLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />} Use my location
                </Button>
              </div>

              <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
                <p className="text-xs font-medium text-violet-200 mb-2">Face photo (required for verification)</p>
                <input ref={cameraFallbackRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} />
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                {preview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Preview" className="w-full h-44 object-cover rounded-lg border border-white/10" />
                    <button onClick={clearPhoto} className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : cameraActive ? (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-48 object-cover scale-x-[-1]" />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={captureFromCamera} className="flex-1 gap-1.5 h-8 bg-violet-600 hover:bg-violet-500 text-white">
                        <Camera className="h-3.5 w-3.5" /> Capture
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={stopCamera} className="h-8 border-white/10"><X className="h-3.5 w-3.5" /></Button>
                    </div>
                    <p className="text-[11px] text-violet-200/60">Front camera — centre your face and capture.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="flex-1 gap-1.5 h-8 text-xs bg-violet-600 hover:bg-violet-500" onClick={openCamera}>
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
                <Button size="sm" onClick={submit} disabled={pending || !loc || !photo} className="gap-1.5 bg-violet-600 hover:bg-violet-500">
                  {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Confirm verify
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function AssignedVisitsTable({ visits }: { visits: FieldVisit[] }) {
  const [query, setQuery] = useState('')
  const filtered = visits.filter((v) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return v.title.toLowerCase().includes(q) || (v.company ?? '').toLowerCase().includes(q) || v.purpose.toLowerCase().includes(q)
  })

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-white/[0.06]">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your assigned visits…" className="max-w-sm" />
        <span className="text-xs text-white/35 sm:ml-auto">{filtered.length} of {visits.length}</span>
        <Link href="/field-sales/live-map" className="text-xs text-purple-400 hover:text-purple-300">Live Map →</Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
              <th className="px-4 py-3 font-medium">Visit</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Scheduled</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Verification</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {filtered.map((v) => {
              const verified = v.lastCheckIn?.verificationStatus === 'VERIFIED'
              const hasPhoto = Boolean(v.lastCheckIn?.photoUrl)
              return (
                <tr key={v.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{v.title}</p>
                    <p className="text-white/40 text-xs mt-0.5">{v.purpose}</p>
                    {v.address && <p className="text-white/30 text-xs mt-0.5 flex items-center gap-1"><MapPin className="h-3 w-3" />{v.address}</p>}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {v.company ? <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-white/30" />{v.company}</span> : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-4 py-3 text-white/60">{format(new Date(v.scheduledAt), 'd MMM, h:mm a')}</td>
                  <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[v.status]}>{STATUS_LABEL[v.status]}</Badge></td>
                  <td className="px-4 py-3">
                    {v.lastCheckIn ? (
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${verified ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {verified ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                          {v.lastCheckIn.verificationStatus}
                        </span>
                        {hasPhoto && v.lastCheckIn.photoUrl && (
                          <a href={v.lastCheckIn.photoUrl} target="_blank" rel="noreferrer" className="h-7 w-7 rounded overflow-hidden border border-white/10 inline-block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={v.lastCheckIn.photoUrl} alt="proof" className="h-full w-full object-cover" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-white/30">Not verified yet</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {v.status !== 'COMPLETED' && v.status !== 'CANCELLED' && !verified && <FaceVerifyCheckIn visitId={v.id} />}
                      {verified && <span className="text-xs text-emerald-400">Done ✓</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/35">No assigned visits match. {visits.length === 0 && 'When a leader assigns a visit to you it will appear here with a bell notification.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

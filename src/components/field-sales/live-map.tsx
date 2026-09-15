'use client'

import * as React from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { AlertTriangle, RefreshCw, Users, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LiveMapVisit, VisitStatus, ActiveUserPin } from '@/types/field-sales'

const STATUS_COLOR: Record<VisitStatus, string> = {
  SCHEDULED: '#6b7280',
  ON_THE_WAY: '#38bdf8',
  CHECKED_IN: '#34d399',
  IN_MEETING: '#a78bfa',
  COMPLETED: '#22c55e',
  CANCELLED: '#ef4444',
}
const STATUS_LABEL: Record<VisitStatus, string> = {
  SCHEDULED: 'Scheduled',
  ON_THE_WAY: 'On the way',
  CHECKED_IN: 'Checked in',
  IN_MEETING: 'In meeting',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const POLL_INTERVAL_MS = 15000

export function LiveMap({
  initialVisits,
  initialActiveUsers,
}: {
  initialVisits: LiveMapVisit[]
  initialActiveUsers: ActiveUserPin[]
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<mapboxgl.Map | null>(null)
  const visitMarkersRef = React.useRef<Record<string, mapboxgl.Marker>>({})
  const userMarkersRef = React.useRef<Record<string, mapboxgl.Marker>>({})
  const [visits, setVisits] = React.useState(initialVisits)
  const [activeUsers, setActiveUsers] = React.useState(initialActiveUsers)
  const [lastUpdated, setLastUpdated] = React.useState(new Date())
  const [showActive, setShowActive] = React.useState(true)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  // Init map
  React.useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return
    mapboxgl.accessToken = token

    const all = [...initialVisits, ...initialActiveUsers.map((u) => ({ latitude: u.latitude, longitude: u.longitude } as LiveMapVisit & { latitude: number; longitude: number }))]
    const center: [number, number] =
      all.length > 0
        ? [(all[0] as any).longitude ?? (all[0] as any).longitude, (all[0] as any).latitude]
        : [72.8777, 19.076]
    // Prefer first visit if exists, else first active user
    let c: [number, number] = [72.8777, 19.076]
    if (initialVisits.length > 0) c = [initialVisits[0].longitude, initialVisits[0].latitude]
    else if (initialActiveUsers.length > 0) c = [initialActiveUsers[0].longitude, initialActiveUsers[0].latitude]

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: c,
      zoom: all.length > 0 ? 11 : 4,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Visit markers
  React.useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const seen = new Set<string>()
    for (const v of visits) {
      seen.add(v.id)
      const existing = visitMarkersRef.current[v.id]
      if (existing) {
        existing.setLngLat([v.longitude, v.latitude])
        continue
      }
      const el = document.createElement('div')
      el.style.width = '14px'
      el.style.height = '14px'
      el.style.borderRadius = '50%'
      el.style.border = '2px solid white'
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.5)'
      el.style.backgroundColor = STATUS_COLOR[v.status]
      el.style.cursor = 'pointer'
      const popup = new mapboxgl.Popup({ offset: 14 }).setHTML(
        `<div style="font-family:inherit;font-size:12px;color:#111;line-height:1.4"><strong>${escapeHtml(v.title)}</strong><br/>${v.companyName ? escapeHtml(v.companyName) + '<br/>' : ''}${v.address ? escapeHtml(v.address) + '<br/>' : ''}${STATUS_LABEL[v.status]} · ${escapeHtml(v.assignee)}</div>`
      )
      visitMarkersRef.current[v.id] = new mapboxgl.Marker(el).setLngLat([v.longitude, v.latitude]).setPopup(popup).addTo(map)
    }
    for (const id of Object.keys(visitMarkersRef.current)) {
      if (!seen.has(id)) {
        visitMarkersRef.current[id].remove()
        delete visitMarkersRef.current[id]
      }
    }
  }, [visits])

  // Active-user markers (distinct style: ring + initials)
  React.useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!showActive) {
      for (const m of Object.values(userMarkersRef.current)) m.remove()
      userMarkersRef.current = {}
      return
    }
    const seen = new Set<string>()
    for (const u of activeUsers) {
      seen.add(u.id)
      const existing = userMarkersRef.current[u.id]
      if (existing) {
        existing.setLngLat([u.longitude, u.latitude])
        continue
      }
      const el = document.createElement('div')
      el.style.width = '28px'
      el.style.height = '28px'
      el.style.borderRadius = '50%'
      el.style.display = 'flex'
      el.style.alignItems = 'center'
      el.style.justifyContent = 'center'
      el.style.fontSize = '11px'
      el.style.fontWeight = '700'
      el.style.color = 'white'
      el.style.background = '#7c3aed'
      el.style.border = '2px solid white'
      el.style.boxShadow = '0 2px 10px rgba(124,58,237,0.5)'
      el.style.cursor = 'pointer'
      el.textContent = u.initials
      const when = u.lastCheckInAt ? new Date(u.lastCheckInAt).toLocaleTimeString() : new Date(u.lastSeenAt).toLocaleTimeString()
      const popup = new mapboxgl.Popup({ offset: 16 }).setHTML(
        `<div style="font-family:inherit;font-size:12px;color:#111;line-height:1.4"><strong>${escapeHtml(u.name)}</strong> <span style="color:#6b7280">· active</span><br/>${u.visitTitle ? escapeHtml(u.visitTitle) + '<br/>' : ''}${u.companyName ? escapeHtml(u.companyName) + '<br/>' : ''}Last seen ${escapeHtml(when)}</div>`
      )
      userMarkersRef.current[u.id] = new mapboxgl.Marker(el).setLngLat([u.longitude, u.latitude]).setPopup(popup).addTo(map)
    }
    for (const id of Object.keys(userMarkersRef.current)) {
      if (!seen.has(id)) {
        userMarkersRef.current[id].remove()
        delete userMarkersRef.current[id]
      }
    }
  }, [activeUsers, showActive])

  // Poll live-map endpoint (visits + activeUsers)
  React.useEffect(() => {
    if (!token) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/field-sales/live-map')
        if (!res.ok) return
        const data = await res.json()
        // Backwards compat: old shape was visits[] only
        if (Array.isArray(data)) {
          setVisits(data)
        } else {
          if (Array.isArray(data.visits)) setVisits(data.visits)
          if (Array.isArray(data.activeUsers)) setActiveUsers(data.activeUsers)
        }
        setLastUpdated(new Date())
      } catch {}
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [token])

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-24 rounded-xl border border-white/10 bg-white/5 gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-white font-medium">Live Map isn&apos;t configured yet</p>
        <p className="text-white/50 text-sm max-w-sm">
          Set <code className="text-purple-300">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment to enable the interactive map.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 text-white/40">
          <RefreshCw className="h-3 w-3" /> Auto-refreshes every 15s · last updated {lastUpdated.toLocaleTimeString()}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-white/70 cursor-pointer select-none">
            <input type="checkbox" checked={showActive} onChange={(e) => setShowActive(e.target.checked)} className="h-3.5 w-3.5 rounded border-white/20 bg-white/10 accent-purple-600" />
            <Users className="h-3.5 w-3.5" /> Active reps ({activeUsers.length})
          </label>
          <span className="h-4 w-px bg-white/10" />
          <span className="flex items-center gap-1.5 text-white/40">
            <MapPin className="h-3 w-3" /> Visits ({visits.length})
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/35">
        {(Object.keys(STATUS_LABEL) as VisitStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full')} style={{ backgroundColor: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 ml-2">
          <span className="h-2.5 w-2.5 rounded-full bg-purple-600 border border-white shadow-sm" /> Active rep
        </span>
      </div>

      <div ref={containerRef} className="h-[560px] w-full rounded-xl border border-white/10 overflow-hidden" />

      {activeUsers.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs font-semibold tracking-wide uppercase text-white/40 mb-2">Active now</p>
          <div className="flex flex-wrap gap-2">
            {activeUsers.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/70">
                <span className="h-5 w-5 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center">{u.initials}</span>
                {u.name}
                {u.companyName ? <span className="text-white/40">· {u.companyName}</span> : null}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

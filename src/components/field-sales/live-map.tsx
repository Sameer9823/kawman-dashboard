'use client'

import * as React from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import * as turf from '@turf/turf'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LiveMapVisit, VisitStatus, GeoFence } from '@/types/field-sales'

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

export function LiveMap({ initialVisits, geoFences }: { initialVisits: LiveMapVisit[]; geoFences: GeoFence[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<mapboxgl.Map | null>(null)
  const markersRef = React.useRef<Record<string, mapboxgl.Marker>>({})
  const [visits, setVisits] = React.useState(initialVisits)
  const [lastUpdated, setLastUpdated] = React.useState(new Date())
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  // Init map + geofences once
  React.useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return
    mapboxgl.accessToken = token

    const center: [number, number] =
      initialVisits.length > 0 ? [initialVisits[0].longitude, initialVisits[0].latitude] : [72.8777, 19.076]

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center,
      zoom: initialVisits.length > 0 ? 11 : 4,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      for (const fence of geoFences) {
        const circle = turf.circle([fence.longitude, fence.latitude], fence.radius / 1000, {
          steps: 64,
          units: 'kilometers',
        })
        map.addSource(`fence-${fence.id}`, { type: 'geojson', data: circle })
        map.addLayer({
          id: `fence-fill-${fence.id}`,
          type: 'fill',
          source: `fence-${fence.id}`,
          paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.08 },
        })
        map.addLayer({
          id: `fence-line-${fence.id}`,
          type: 'line',
          source: `fence-${fence.id}`,
          paint: { 'line-color': '#8b5cf6', 'line-width': 1.5, 'line-dasharray': [3, 3] },
        })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Sync markers whenever visits change
  React.useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const seen = new Set<string>()
    for (const v of visits) {
      seen.add(v.id)
      const existing = markersRef.current[v.id]
      if (existing) {
        existing.setLngLat([v.longitude, v.latitude])
        continue
      }
      const el = document.createElement('div')
      el.style.width = '16px'
      el.style.height = '16px'
      el.style.borderRadius = '50%'
      el.style.border = '2px solid white'
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.5)'
      el.style.backgroundColor = STATUS_COLOR[v.status]
      el.style.cursor = 'pointer'

      const popup = new mapboxgl.Popup({ offset: 14 }).setHTML(
        `<div style="font-family:inherit;font-size:12px;color:#111">
          <strong>${escapeHtml(v.title)}</strong><br/>
          ${v.companyName ? escapeHtml(v.companyName) + '<br/>' : ''}
          ${STATUS_LABEL[v.status]} · ${escapeHtml(v.assignee)}
        </div>`
      )

      markersRef.current[v.id] = new mapboxgl.Marker(el).setLngLat([v.longitude, v.latitude]).setPopup(popup).addTo(map)
    }

    for (const id of Object.keys(markersRef.current)) {
      if (!seen.has(id)) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    }
  }, [visits])

  // Poll for fresh positions
  React.useEffect(() => {
    if (!token) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/field-sales/live-map')
        if (!res.ok) return
        const data = await res.json()
        setVisits(data)
        setLastUpdated(new Date())
      } catch {
        // silently retry next interval
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [token])

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-24 rounded-xl border border-white/10 bg-white/5 gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-white font-medium">Live Map isn&apos;t configured yet</p>
        <p className="text-white/50 text-sm max-w-sm">
          Set <code className="text-purple-300">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment to enable the
          interactive map.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-white/40">
        <span className="flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3" />
          Auto-refreshes every 15s · last updated {lastUpdated.toLocaleTimeString()}
        </span>
        <div className="flex items-center gap-3">
          {(Object.keys(STATUS_LABEL) as VisitStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full')} style={{ backgroundColor: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="h-[560px] w-full rounded-xl border border-white/10 overflow-hidden" />
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

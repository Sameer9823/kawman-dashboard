'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LiveVisitMarker } from '@/types/dashboard'

const STATUS_COLOR: Record<LiveVisitMarker['status'], string> = {
  'In Meeting': 'bg-purple-400',
  'Checked-in': 'bg-emerald-400',
  'On the way': 'bg-blue-400',
  'Checked-out': 'bg-white/40',
}

/**
 * Lightweight dashboard-card preview of field activity. The real
 * interactive Mapbox map (see src/lib/maps.ts) renders on the full
 * /field-sales/live-map page, which requires NEXT_PUBLIC_MAPBOX_TOKEN.
 * This card intentionally stays token-free so the dashboard always renders.
 */
export function LiveMapCard({ markers }: { markers: LiveVisitMarker[] }) {
  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Live Visit Map</CardTitle>
        <Link href="/field-sales/live-map" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
          View full map
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr] gap-4">
          <div
            className="relative h-48 rounded-xl border border-white/[0.06] overflow-hidden"
            style={{
              backgroundColor: '#0d1622',
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            {markers.map((marker) => (
              <div
                key={marker.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                title={`${marker.name} — ${marker.status}`}
              >
                <span className="relative flex h-3 w-3">
                  <span
                    className={cn(
                      'absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping',
                      STATUS_COLOR[marker.status]
                    )}
                  />
                  <span
                    className={cn(
                      'relative inline-flex h-3 w-3 rounded-full ring-2 ring-[#0d1622]',
                      STATUS_COLOR[marker.status]
                    )}
                  />
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {markers.map((marker) => (
              <div key={marker.id} className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_COLOR[marker.status])} />
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{marker.name}</p>
                  <p className="text-xs text-white/45">{marker.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

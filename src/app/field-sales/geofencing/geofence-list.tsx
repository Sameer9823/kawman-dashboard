'use client'

import { useTransition } from 'react'
import { ShieldCheck, ShieldOff, Building2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DeleteRowButton } from '@/components/crm/delete-row-button'
import { toggleGeoFenceAction, deleteGeoFenceAction } from '../actions'
import type { GeoFence } from '@/types/field-sales'

export function GeoFenceList({ fences }: { fences: GeoFence[] }) {
  const [pending, startTransition] = useTransition()

  if (fences.length === 0) {
    return (
      <Card className="bg-[#0a111c]/80 border-white/[0.08] py-12 text-center">
        <ShieldCheck className="h-6 w-6 text-white/30 mx-auto mb-2" />
        <p className="text-white/40 text-sm">No geofences yet</p>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fences.map((f) => (
        <Card key={f.id} className="bg-[#0a111c]/80 border-white/[0.08] p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white font-medium truncate">{f.name}</p>
              {f.companyName && (
                <p className="text-white/40 text-xs mt-0.5 flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {f.companyName}
                </p>
              )}
            </div>
            <Badge variant={f.isActive ? 'success' : 'neutral'}>{f.isActive ? 'Active' : 'Inactive'}</Badge>
          </div>
          <div className="mt-3 text-xs text-white/50 space-y-1">
            <p>
              {f.latitude.toFixed(6)}, {f.longitude.toFixed(6)}
            </p>
            <p>Radius: {f.radius}m</p>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => toggleGeoFenceAction(f.id, !f.isActive))}
              className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors"
            >
              {f.isActive ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {f.isActive ? 'Deactivate' : 'Activate'}
            </button>
            <DeleteRowButton
              action={() => deleteGeoFenceAction(f.id)}
              confirmLabel={`Delete geofence "${f.name}"? This cannot be undone.`}
            />
          </div>
        </Card>
      ))}
    </div>
  )
}

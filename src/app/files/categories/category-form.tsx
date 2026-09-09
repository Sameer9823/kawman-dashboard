'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createCategoryAction, type CategoryFormState } from '../actions'

const initialState: CategoryFormState = {}
const SWATCHES = ['#a78bfa', '#38bdf8', '#34d399', '#f97316', '#f43f5e', '#facc15']

export function CategoryForm() {
  const [state, formAction, pending] = useActionState(createCategoryAction, initialState)

  return (
    <form action={formAction} className="flex flex-col sm:flex-row sm:items-end gap-3">
      <div className="space-y-1.5 flex-1">
        <label className="text-sm text-white/70">Category name *</label>
        <Input name="name" placeholder="Contracts" required />
        {state.fieldErrors?.name && <p className="text-xs text-red-400">{state.fieldErrors.name}</p>}
      </div>
      <div className="space-y-1.5 flex-1">
        <label className="text-sm text-white/70">Description</label>
        <Input name="description" placeholder="Signed contracts and NDAs" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm text-white/70">Color</label>
        <select
          name="color"
          defaultValue={SWATCHES[0]}
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          {SWATCHES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" loading={pending} disabled={pending}>
        Add category
      </Button>
    </form>
  )
}

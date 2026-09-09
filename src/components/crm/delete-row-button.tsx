'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DeleteRowButton({
  action,
  confirmLabel = 'Delete this? This cannot be undone.',
}: {
  action: () => Promise<void>
  confirmLabel?: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-white/30 hover:text-red-400"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!window.confirm(confirmLabel)) return
        startTransition(() => {
          action()
        })
      }}
      title="Delete"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}

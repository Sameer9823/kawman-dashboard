'use client'

import { Copy, Printer, Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function ReportActions() {
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-white/60 hover:text-white hover:bg-white/10"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href)
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
          } catch {}
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy link'}
      </Button>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-white/60 hover:text-white hover:bg-white/10" onClick={() => window.print()}>
        <Printer className="h-3.5 w-3.5" />
        Print
      </Button>
    </div>
  )
}

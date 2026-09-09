'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileBarChart, Sparkles, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'

interface ReportTypeMeta {
  type: string
  title: string
  description: string
}

interface ReportSummary {
  id: string
  type: string
  title: string
  createdAt: string
  generatedByName: string
}

export function ReportsPanel({
  reportTypes,
  initialReports,
  aiConfigured,
}: {
  reportTypes: ReportTypeMeta[]
  initialReports: ReportSummary[]
  aiConfigured: boolean
}) {
  const router = useRouter()
  const reports = initialReports
  const [generating, setGenerating] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function handleGenerate(type: string) {
    setGenerating(type)
    setError(null)
    try {
      const res = await fetch('/api/ai/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate report')
      router.push(`/ai/reports/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="space-y-8">
      {!aiConfigured && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          AI Reports isn&apos;t configured yet. Set <code className="text-amber-100">OPENAI_API_KEY</code> or{' '}
          <code className="text-amber-100">GOOGLE_GENERATIVE_AI_API_KEY</code> to enable generation.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-white/70 mb-3">Generate a new report</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {reportTypes.map((rt) => (
            <Card key={rt.type} className="flex flex-col">
              <CardHeader>
                <div className="h-9 w-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mb-2">
                  <Sparkles className="h-4 w-4 text-purple-300" />
                </div>
                <CardTitle className="text-base">{rt.title}</CardTitle>
                <CardDescription>{rt.description}</CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={!aiConfigured || generating !== null}
                  onClick={() => handleGenerate(rt.type)}
                >
                  {generating === rt.type ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>Generate</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white/70 mb-3">Recent reports</h2>
        {reports.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 py-12 text-center">
            <FileBarChart className="h-6 w-6 text-white/30 mx-auto mb-2" />
            <p className="text-white/40 text-sm">No reports generated yet</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10 overflow-hidden">
            {reports.map((r) => (
              <Link
                key={r.id}
                href={`/ai/reports/${r.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{r.title}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {r.generatedByName} · {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-white/30 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

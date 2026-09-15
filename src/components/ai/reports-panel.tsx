'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileBarChart, Sparkles, AlertTriangle, ArrowRight, Loader2, Trash2, Download, FileDown } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatDistanceToNow } from 'date-fns'
import { exportReportPdf } from '@/lib/report-pdf'

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
  const [reports, setReports] = React.useState(initialReports)
  const [generating, setGenerating] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ReportSummary | null>(null)
  const [deleting, startDeleting] = React.useTransition()
  const [exportingId, setExportingId] = React.useState<string | null>(null)

  // keep in sync if server re-renders with new initialReports
  React.useEffect(() => setReports(initialReports), [initialReports])

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

  function handleDelete() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    startDeleting(async () => {
      const res = await fetch(`/api/ai/reports/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to delete report')
        return
      }
      setReports((prev) => prev.filter((r) => r.id !== id))
      setDeleteTarget(null)
      router.refresh()
    })
  }

  async function handleExport(report: ReportSummary) {
    setExportingId(report.id)
    try {
      const res = await fetch(`/api/ai/reports/${report.id}`)
      if (!res.ok) throw new Error('Failed to load report')
      const full = await res.json()
      exportReportPdf({
        title: full.title,
        type: full.type,
        content: full.content,
        createdAt: full.createdAt,
        generatedByName: full.generatedByName,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExportingId(null)
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white/70">Recent reports</h2>
          <span className="text-xs text-white/30">{reports.length} total</span>
        </div>
        {reports.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 py-12 text-center">
            <FileBarChart className="h-6 w-6 text-white/30 mx-auto mb-2" />
            <p className="text-white/40 text-sm">No reports generated yet</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10 overflow-hidden">
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 px-3 sm:px-4 py-3 hover:bg-white/5 transition-colors group"
              >
                <Link href={`/ai/reports/${r.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{r.title}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {r.generatedByName} · {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-white/40 shrink-0 hidden sm:block" />
                </Link>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/30 hover:text-white hover:bg-white/10"
                    title="Export PDF"
                    disabled={exportingId === r.id}
                    onClick={() => handleExport(r)}
                  >
                    {exportingId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/30 hover:text-red-300 hover:bg-red-500/10"
                    title="Delete report"
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete report?"
        description={deleteTarget ? `“${deleteTarget.title}” will be permanently deleted.` : ''}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}

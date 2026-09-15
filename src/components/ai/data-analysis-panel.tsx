'use client'

import * as React from 'react'
import { Sparkles, AlertTriangle, Send, Trash2, Copy, Check, Download, FileDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Markdown } from './markdown'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const DATA_ANALYSIS_PROMPTS = [
  'Which deals are most at risk of slipping this month?',
  'What lead source is converting best right now?',
  'Where is the pipeline getting stuck?',
  'Summarize this week vs last week in one paragraph.',
] as const

interface QA {
  question: string
  answer: string
}

function stripMdInline(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
}

function exportAnalysisPdf(qa: QA): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentW = pageW - margin * 2
  let y = 0

  doc.setFillColor(109, 40, 217)
  doc.rect(0, 0, pageW, 4, 'F')
  y = 28
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(110, 110, 130)
  doc.text('KAWMAN EXACT  ·  DATA ANALYSIS  ·  GROUNDED IN LIVE CRM DATA', margin, y)

  y += 16
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(17, 17, 27)
  const qLines = doc.splitTextToSize(`Q: ${stripMdInline(qa.question)}`, contentW)
  doc.text(qLines, margin, y)
  y += qLines.length * 13 + 10

  doc.setDrawColor(228, 228, 231)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageW - margin, y)
  y += 12

  // Render answer: tables via autoTable, bullets via manual, blockquotes, paragraphs
  const lines = qa.answer.split('\n')
  let i = 0
  const isTableSep = (l: string) => /^\s*\|?[\s-|:]+\|[\s-|:]*$/.test(l)

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { y += 4; i++; continue }
    if (y > pageH - 40) { doc.addPage(); y = 36 }

    if (line.trimStart().startsWith('>')) {
      const text = stripMdInline(line.replace(/^\s*>\s?/, ''))
      const boxLines = doc.splitTextToSize(text, contentW - 20)
      const boxH = boxLines.length * 10 + 12
      if (y + boxH > pageH - 24) { doc.addPage(); y = 36 }
      doc.setFillColor(250, 245, 255)
      doc.setDrawColor(221, 214, 254)
      doc.rect(margin, y - 4, contentW, boxH, 'FD')
      doc.setDrawColor(139, 92, 246)
      doc.setLineWidth(2)
      doc.line(margin, y - 4, margin, y - 4 + boxH)
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8.5)
      doc.setTextColor(60, 30, 120)
      doc.text(boxLines, margin + 10, y + 6)
      y += boxH + 10
      i++
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = line.split('|').map((c) => stripMdInline(c)).filter(Boolean)
      const body: string[][] = []
      let j = i + 2
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        if (isTableSep(lines[j])) { j++; continue }
        const cells = lines[j].split('|').map((c) => stripMdInline(c)).filter(Boolean)
        while (cells.length < header.length) cells.push('')
        body.push(cells.slice(0, header.length))
        j++
      }
      autoTable(doc, {
        startY: y + 2,
        head: [header],
        body,
        margin: { left: margin, right: margin },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 7, cellPadding: { top: 4, right: 6, bottom: 4, left: 6 }, textColor: [39, 39, 47], lineColor: [228, 228, 231], lineWidth: 0.4 },
        headStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [249, 249, 251] },
      })
      // @ts-ignore
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
      i = j
      continue
    }

    const h = line.match(/^#{1,6}\s+(.*)$/)
    if (h) {
      const text = stripMdInline(h[1])
      if (y + 22 > pageH - 24) { doc.addPage(); y = 36 }
      doc.setFillColor(245, 243, 255)
      doc.setDrawColor(221, 214, 254)
      doc.rect(margin, y - 10, contentW, 18, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(76, 29, 149)
      doc.text(text.toUpperCase(), margin + 8, y + 1)
      y += 16
      i++
      continue
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/)
    if (bullet || ordered) {
      const text = stripMdInline((bullet?.[1] ?? ordered?.[1] ?? '').trim())
      const prefix = bullet ? '•  ' : `${line.trim().split('.')[0]}.  `
      const wrapped = doc.splitTextToSize(prefix + text, contentW - 10)
      if (y + wrapped.length * 10 > pageH - 24) { doc.addPage(); y = 36 }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(39, 39, 47)
      doc.text(wrapped, margin + 10, y)
      y += wrapped.length * 10 + 3
      i++
      continue
    }

    const para = stripMdInline(line)
    if (para) {
      const wrapped = doc.splitTextToSize(para, contentW)
      if (y + wrapped.length * 10 > pageH - 24) { doc.addPage(); y = 36 }
      doc.setFont('helvetica', /\*\*/.test(line) ? 'bold' : 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(39, 39, 47)
      doc.text(wrapped, margin, y)
      y += wrapped.length * 10 + 4
    }
    i++
  }

  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(150, 150, 165)
    doc.text('Kawman ExAct  ·  Data Analysis  ·  Verify critical figures before sharing externally', margin, pageH - 14)
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 14, { align: 'right' })
  }

  const safe = qa.question.replace(/[^a-z0-9\- ]/gi, '').slice(0, 40) || 'analysis'
  doc.save(`${safe}.pdf`)
}

export function DataAnalysisPanel({ aiConfigured }: { aiConfigured: boolean }) {
  const [question, setQuestion] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [history, setHistory] = React.useState<QA[]>([])
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null)
  const [clearConfirm, setClearConfirm] = React.useState(false)

  async function runAnalysis(q: string) {
    if (!q.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/data-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to analyze')
      setHistory((prev) => [{ question: q, answer: data.answer as string }, ...prev])
      setQuestion('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy(i: number, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(i)
      setTimeout(() => setCopiedIdx(null), 1600)
    }).catch(() => {})
  }

  return (
    <div className="space-y-6">
      {!aiConfigured && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Data Analysis isn&apos;t configured yet. Set <code className="text-amber-100">OPENAI_API_KEY</code> or{' '}
          <code className="text-amber-100">GOOGLE_GENERATIVE_AI_API_KEY</code> to enable it.
        </div>
      )}

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            runAnalysis(question)
          }}
          className="flex gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about your leads, deals, or pipeline..."
            disabled={!aiConfigured || loading}
            className="flex-1 h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
          />
          <Button type="submit" size="sm" disabled={!aiConfigured || loading || !question.trim()} className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            {loading ? 'Analyzing…' : 'Analyze'}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2 mt-3">
          {DATA_ANALYSIS_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!aiConfigured || loading}
              onClick={() => runAnalysis(p)}
              className="text-xs px-2.5 py-1 rounded-full border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {history.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/35">{history.length} {history.length === 1 ? 'result' : 'results'}</p>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-white/40 hover:text-red-300 hover:bg-red-500/10 text-xs" onClick={() => setClearConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Clear all
          </Button>
        </div>
      )}

      {history.length === 0 && !loading ? (
        <div className="rounded-xl border border-white/10 bg-white/5 py-12 text-center">
          <Sparkles className="h-6 w-6 text-white/30 mx-auto mb-2" />
          <p className="text-white/40 text-sm">Ask a question above to analyze your live CRM data.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {loading && (
            <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4 animate-pulse">
              <p className="text-sm text-white/40">Analyzing your data…</p>
            </Card>
          )}
          {history.map((qa, i) => (
            <Card key={i} className="bg-[#0a111c]/80 border-white/[0.08] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-white/80 flex-1">{qa.question}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-white/25 hover:text-red-300 hover:bg-red-500/10"
                  title="Remove"
                  onClick={() => setHistory((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="border-t border-white/[0.06] pt-3">
                <Markdown content={qa.answer} />
              </div>
              <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.04]">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-white/40 hover:text-white text-xs"
                  onClick={() => handleCopy(i, qa.answer)}
                >
                  {copiedIdx === i ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copiedIdx === i ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-white/40 hover:text-white text-xs"
                  onClick={() => exportAnalysisPdf(qa)}
                >
                  <FileDown className="h-3 w-3" />
                  Export PDF
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-red-300/50 hover:text-red-300 hover:bg-red-500/10 text-xs ml-auto"
                  onClick={() => setHistory((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={clearConfirm}
        onOpenChange={setClearConfirm}
        title="Clear all results?"
        description="All analysis results on this page will be removed. This cannot be undone."
        confirmLabel="Clear all"
        variant="destructive"
        onConfirm={() => { setHistory([]); setClearConfirm(false) }}
      />
    </div>
  )
}

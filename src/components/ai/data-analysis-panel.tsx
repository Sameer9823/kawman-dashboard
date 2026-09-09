'use client'

import * as React from 'react'
import { Sparkles, AlertTriangle, Send } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Markdown } from './markdown'

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

export function DataAnalysisPanel({ aiConfigured }: { aiConfigured: boolean }) {
  const [question, setQuestion] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [history, setHistory] = React.useState<QA[]>([])

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
              <p className="text-sm font-medium text-white/80">{qa.question}</p>
              <div className="border-t border-white/[0.06] pt-3">
                <Markdown content={qa.answer} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

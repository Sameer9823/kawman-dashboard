import { NextResponse } from 'next/server'
import { isAIConfigured } from '@/lib/ai'
import { analyzeQuestion } from '@/services/ai.service'
import { requireApiSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: 'No AI provider configured. Ask an admin to set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.' },
      { status: 503 }
    )
  }

  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const limit = await checkRateLimit(`ai-data-analysis:${session.user.id}`, 20, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { question } = body as { question?: string }

  if (!question || !question.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  try {
    const answer = await analyzeQuestion(question.trim())
    return NextResponse.json({ answer })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to analyze' },
      { status: 500 }
    )
  }
}

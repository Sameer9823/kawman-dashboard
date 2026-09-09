import { NextResponse } from 'next/server'
import { streamChatCompletion, isAIConfigured } from '@/lib/ai'
import { prepareChatTurn, saveAssistantReply } from '@/services/ai.service'
import { requireApiSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeAiMessage, MAX_MESSAGE_LENGTH } from '@/lib/sanitize'

export const runtime = 'nodejs'

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

  // AI calls are the most expensive request this app makes (external
  // provider cost + latency), so they get their own, tighter limit
  // separate from Better-Auth's auth-endpoint limiter.
  const limit = await checkRateLimit(`ai-chat:${session.user.id}`, 20, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { message, conversationId } = body as { message?: string; conversationId?: string }

  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  // Sanitize the message before sending to AI
  const { sanitized, warnings } = sanitizeAiMessage(message.trim())
  
  if (!sanitized) {
    return NextResponse.json({ error: 'Message is empty after sanitization' }, { status: 400 })
  }

  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` }, { status: 400 })
  }

  let turn
  try {
    turn = await prepareChatTurn(conversationId, sanitized)
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const encoder = new TextEncoder()
  let full = ''

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // First chunk tells the client which conversation this is (needed when
      // a brand new conversation was just created for this turn).
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'meta', conversationId: turn.conversationId, warnings }) + '\n'))
      try {
        for await (const delta of streamChatCompletion(turn.messages, turn.system)) {
          full += delta
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'delta', text: delta }) + '\n'))
        }
        await saveAssistantReply(turn.conversationId, full)
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'))
      } catch (err) {
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : 'AI request failed' }) + '\n')
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}

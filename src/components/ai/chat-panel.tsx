'use client'

import * as React from 'react'
import { Send, Plus, Trash2, Bot, User as UserIcon, Sparkles, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Markdown } from './markdown'
import { cn } from '@/lib/utils'

interface ConversationSummary {
  id: string
  title: string | null
  updatedAt: string
  lastMessagePreview: string | null
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

const SUGGESTIONS = [
  'Summarize my pipeline health right now',
  'Which leads should I follow up with today?',
  'What deals are at risk of going cold?',
]

export function ChatPanel({
  initialConversations,
  aiConfigured,
}: {
  initialConversations: ConversationSummary[]
  aiConfigured: boolean
}) {
  const [conversations, setConversations] = React.useState(initialConversations)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState('')
  const [streaming, setStreaming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const idCounter = React.useRef(0)

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function loadConversation(id: string) {
    setActiveId(id)
    setError(null)
    const res = await fetch(`/api/ai/conversations/${id}`)
    if (!res.ok) return
    const data = await res.json()
    setMessages(data.messages.map((m: { id: string; role: string; content: string }) => ({ id: m.id, role: m.role, content: m.content })))
  }

  function newChat() {
    setActiveId(null)
    setMessages([])
    setError(null)
  }

  async function removeConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' })
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeId === id) newChat()
  }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || streaming) return
    setInput('')
    setError(null)

    const localId = ++idCounter.current
    const userMsg: ChatMessage = { id: `local-${localId}-user`, role: 'user', content }
    const assistantMsg: ChatMessage = { id: `local-${localId}-assistant`, role: 'assistant', content: '' }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, conversationId: activeId ?? undefined }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'AI request failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let convId = activeId

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const evt = JSON.parse(line) as { type: string; text?: string; conversationId?: string; message?: string }
          if (evt.type === 'meta' && evt.conversationId) {
            convId = evt.conversationId
            setActiveId(evt.conversationId)
          } else if (evt.type === 'delta' && evt.text) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + evt.text } : m))
            )
          } else if (evt.type === 'error') {
            throw new Error(evt.message || 'AI request failed')
          }
        }
      }

      if (convId) {
        const res2 = await fetch('/api/ai/conversations')
        if (res2.ok) setConversations(await res2.json())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
    } finally {
      setStreaming(false)
    }
  }

  if (!aiConfigured) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-24 rounded-xl border border-white/10 bg-white/5 gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-white font-medium">AI Chat isn&apos;t configured yet</p>
        <p className="text-white/50 text-sm max-w-sm">
          Set <code className="text-purple-300">OPENAI_API_KEY</code> or{' '}
          <code className="text-purple-300">GOOGLE_GENERATIVE_AI_API_KEY</code> in your environment to enable it.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-9.5rem)]">
      {/* Conversation list */}
      <div className="hidden lg:flex flex-col rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="p-3 border-b border-white/10">
          <Button size="sm" variant="secondary" className="w-full gap-1.5" onClick={newChat}>
            <Plus className="h-3.5 w-3.5" />
            New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-white/40 text-xs px-2 py-4 text-center">No conversations yet</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm group flex items-start justify-between gap-2 transition-colors',
                activeId === c.id ? 'bg-purple-500/15 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              )}
            >
              <span className="truncate">
                <span className="block truncate font-medium">{c.title || 'Untitled chat'}</span>
                {c.lastMessagePreview && (
                  <span className="block truncate text-xs text-white/35">{c.lastMessagePreview}</span>
                )}
              </span>
              <Trash2
                className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 mt-0.5"
                onClick={(e) => removeConversation(c.id, e)}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-col rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-10">
              <div className="h-12 w-12 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-purple-300" />
              </div>
              <div>
                <p className="text-white font-medium">Ask about your pipeline, leads, or deals</p>
                <p className="text-white/40 text-sm mt-1">Answers are grounded in your live CRM data.</p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-sm text-left px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
              <div
                className={cn(
                  'h-8 w-8 shrink-0 rounded-full flex items-center justify-center border',
                  m.role === 'user' ? 'bg-white/10 border-white/10' : 'bg-purple-500/15 border-purple-500/30'
                )}
              >
                {m.role === 'user' ? (
                  <UserIcon className="h-4 w-4 text-white/70" />
                ) : (
                  <Bot className="h-4 w-4 text-purple-300" />
                )}
              </div>
              <div
                className={cn(
                  'rounded-xl px-4 py-2.5 max-w-[85%] text-sm text-white/85',
                  m.role === 'user' ? 'bg-purple-600/20 border border-purple-500/20' : 'bg-white/[0.04] border border-white/10'
                )}
              >
                {m.content ? (
                  <Markdown content={m.content} className="space-y-1" />
                ) : (
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/40 animate-bounce" />
                  </span>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="border-t border-white/10 p-3 flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about leads, deals, or your pipeline..."
            disabled={streaming}
          />
          <Button type="submit" size="icon" disabled={streaming || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}

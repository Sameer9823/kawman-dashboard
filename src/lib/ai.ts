import 'server-only'

export type AIRole = 'system' | 'user' | 'assistant'
export interface AIChatMessage {
  role: AIRole
  content: string
}

export type AIProviderName = 'openai' | 'google'

/**
 * Which provider is configured, if any. Code checks OPENAI_API_KEY first,
 * then falls back to GOOGLE_GENERATIVE_AI_API_KEY (matches .env.example).
 */
export function getConfiguredProvider(): AIProviderName | null {
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'google'
  return null
}

export function isAIConfigured(): boolean {
  return getConfiguredProvider() !== null
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const GOOGLE_MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL || 'gemini-2.0-flash'

/**
 * Streams a chat completion as an async generator of text deltas.
 * Provider-agnostic: works with whichever of OpenAI / Google is configured.
 * Throws if no provider is configured — callers should check
 * `isAIConfigured()` first and show a friendly empty state instead.
 */
export async function* streamChatCompletion(
  messages: AIChatMessage[],
  system?: string
): AsyncGenerator<string> {
  const provider = getConfiguredProvider()
  if (!provider) {
    throw new Error(
      'No AI provider configured. Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY in your environment.'
    )
  }

  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const stream = await client.chat.completions.create({
      model: OPENAI_MODEL,
      stream: true,
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
    return
  }

  // Google Gemini
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const client = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
  const model = client.getGenerativeModel({ model: GOOGLE_MODEL, systemInstruction: system })

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }))
  const last = messages[messages.length - 1]

  const chat = model.startChat({ history })
  const result = await chat.sendMessageStream(last?.content ?? '')
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield text
  }
}

/**
 * One-shot (non-streaming) completion — used for report generation where
 * we want the full text before persisting it.
 */
export async function generateCompletion(messages: AIChatMessage[], system?: string): Promise<string> {
  let full = ''
  for await (const delta of streamChatCompletion(messages, system)) {
    full += delta
  }
  return full
}

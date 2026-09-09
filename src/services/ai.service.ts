import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { generateCompletion, isAIConfigured, type AIChatMessage } from '@/lib/ai'

// ============================================================
// Org data grounding — pulls a real CRM snapshot so the model
// answers from actual pipeline data instead of guessing.
// ============================================================

async function buildOrgContext(organizationId: string): Promise<string> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [
    leadsByStatus,
    dealsByStage,
    wonThisMonth,
    followUpsOverdue,
    topOpenDeals,
    recentLeads,
    todaysVisits,
  ] = await Promise.all([
    prisma.lead.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
    prisma.deal.groupBy({
      by: ['stage'],
      where: { organizationId },
      _count: { _all: true },
      _sum: { value: true },
    }),
    prisma.deal.aggregate({
      where: { organizationId, stage: 'WON', closedAt: { gte: monthStart } },
      _sum: { value: true },
      _count: { _all: true },
    }),
    prisma.followUp.count({
      where: { organizationId, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: tomorrow } },
    }),
    prisma.deal.findMany({
      where: { organizationId, stage: { notIn: ['WON', 'LOST'] } },
      orderBy: { value: 'desc' },
      take: 8,
      select: { name: true, value: true, stage: true, probability: true, expectedClose: true },
    }),
    prisma.lead.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { name: true, company: true, status: true, source: true, createdAt: true },
    }),
    prisma.fieldVisit.count({ where: { organizationId, scheduledAt: { gte: today, lt: tomorrow } } }),
  ])

  const fmt = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`

  const lines: string[] = []
  lines.push('=== Live CRM Snapshot (Kawman ExAct) ===')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('Leads by status: ' + (leadsByStatus.map((r) => `${r.status}=${r._count._all}`).join(', ') || 'none'))
  lines.push(
    'Deal pipeline by stage: ' +
      (dealsByStage
        .map((r) => `${r.stage}=${r._count._all} deals worth ${fmt(Number(r._sum.value ?? 0))}`)
        .join('; ') || 'none')
  )
  lines.push(`Won this month: ${wonThisMonth._count._all} deals worth ${fmt(Number(wonThisMonth._sum.value ?? 0))}`)
  lines.push(`Follow-ups overdue or due today: ${followUpsOverdue}`)
  lines.push(`Field visits scheduled today: ${todaysVisits}`)
  lines.push('')
  lines.push('Top open deals by value:')
  for (const d of topOpenDeals) {
    lines.push(
      `- ${d.name}: ${fmt(Number(d.value))}, stage ${d.stage}, ${d.probability}% probability` +
        (d.expectedClose ? `, expected close ${d.expectedClose.toISOString().slice(0, 10)}` : '')
    )
  }
  if (topOpenDeals.length === 0) lines.push('- none')
  lines.push('')
  lines.push('Most recent leads:')
  for (const l of recentLeads) {
    lines.push(`- ${l.name} (${l.company ?? 'no company'}), status ${l.status}, source ${l.source ?? 'unknown'}`)
  }
  if (recentLeads.length === 0) lines.push('- none')

  return lines.join('\n')
}

function systemPrompt(orgContext: string): string {
  return [
    'You are the AI assistant embedded in Kawman ExAct, a CRM and field-sales platform.',
    'You have access to a live snapshot of the organization\'s CRM data below. Ground your',
    'answers in this data whenever the question relates to leads, deals, pipeline, or follow-ups.',
    'Be concise, use concrete numbers from the snapshot, and use markdown formatting',
    '(short headings, bullet points, bold for key figures) where it aids readability.',
    'If the question is unrelated to the CRM data, just answer normally.',
    '',
    orgContext,
  ].join('\n')
}

// ============================================================
// Conversations & messages
// ============================================================

export interface ConversationSummary {
  id: string
  title: string | null
  updatedAt: string
  lastMessagePreview: string | null
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const session = await requireApiSession()
  const rows = await prisma.aIConversation.findMany({
    where: { organizationId: session.user.organizationId, userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true } } },
  })
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
    lastMessagePreview: c.messages[0]?.content?.slice(0, 120) ?? null,
  }))
}

export async function getConversationMessages(conversationId: string) {
  const session = await requireApiSession()
  const conversation = await prisma.aIConversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId, userId: session.user.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!conversation) return null
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      role: m.role as AIChatMessage['role'],
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

export async function deleteConversation(conversationId: string) {
  const session = await requireApiSession()
  await prisma.aIConversation.deleteMany({
    where: { id: conversationId, organizationId: session.user.organizationId, userId: session.user.id },
  })
}

/**
 * Ensures a conversation exists (creating one titled from the first message
 * if `conversationId` is omitted), persists the user's message, and returns
 * everything the chat route needs to call the model: the message history,
 * the grounding system prompt, and the conversation id.
 */
export async function prepareChatTurn(conversationId: string | undefined, userMessage: string) {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId

  let conversation = conversationId
    ? await prisma.aIConversation.findFirst({
        where: { id: conversationId, organizationId, userId: session.user.id },
      })
    : null

  if (!conversation) {
    conversation = await prisma.aIConversation.create({
      data: {
        organizationId,
        userId: session.user.id,
        title: userMessage.slice(0, 60),
      },
    })
  }

  await prisma.aIMessage.create({
    data: { conversationId: conversation.id, role: 'user', content: userMessage },
  })

  const history = await prisma.aIMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 40,
  })

  const orgContext = await buildOrgContext(organizationId)

  return {
    conversationId: conversation.id,
    system: systemPrompt(orgContext),
    messages: history.map((m) => ({ role: m.role as AIChatMessage['role'], content: m.content })),
  }
}

export async function saveAssistantReply(conversationId: string, content: string) {
  await prisma.aIMessage.create({ data: { conversationId, role: 'assistant', content } })
  await prisma.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
}

// ============================================================
// Reports
// ============================================================

export const REPORT_TYPES = [
  {
    type: 'PIPELINE_HEALTH',
    title: 'Pipeline Health Report',
    description: 'Stage-by-stage pipeline analysis, stuck deals, and risk flags.',
  },
  {
    type: 'WEEKLY_SALES_SUMMARY',
    title: 'Weekly Sales Summary',
    description: 'Wins, new leads, and rep activity for the past week.',
  },
  {
    type: 'FOLLOW_UP_RISK',
    title: 'Follow-up Risk Report',
    description: 'Overdue follow-ups and leads going cold, ranked by urgency.',
  },
  {
    type: 'EXECUTIVE_SUMMARY',
    title: 'Executive Summary',
    description: 'A one-page, leadership-ready snapshot of leads, pipeline, and revenue.',
  },
] as const

export type ReportType = (typeof REPORT_TYPES)[number]['type']

const REPORT_PROMPTS: Record<ReportType, string> = {
  PIPELINE_HEALTH:
    'Write a Pipeline Health Report. Analyze the deal pipeline by stage, call out any stage that looks ' +
    'over-loaded or stalled, highlight the largest at-risk deals, and give 3 concrete recommendations.',
  WEEKLY_SALES_SUMMARY:
    'Write a Weekly Sales Summary. Summarize deals won, new leads added, and overall pipeline movement. ' +
    'Keep it crisp and suitable for a Monday-morning leadership read.',
  FOLLOW_UP_RISK:
    'Write a Follow-up Risk Report. Identify leads and deals that risk going cold due to overdue or ' +
    'upcoming follow-ups, rank them by urgency, and recommend which ones to prioritize this week.',
  EXECUTIVE_SUMMARY:
    'Write a one-page Executive Summary of the business right now: total leads, pipeline value, deals won ' +
    'this month, and the single biggest opportunity and single biggest risk. Keep it short, scannable, ' +
    'and written for a busy executive who has 60 seconds to read it.',
}

export interface ReportSummary {
  id: string
  type: string
  title: string
  createdAt: string
  generatedByName: string
}

export async function listReports(): Promise<ReportSummary[]> {
  const session = await requireApiSession()
  const rows = await prisma.aIReport.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { generatedBy: { select: { name: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    generatedByName: r.generatedBy.name ?? 'Unknown',
  }))
}

/** Same as listReports, filtered to a single report type — used by /ai/summary. */
export async function listReportsByType(type: ReportType): Promise<ReportSummary[]> {
  const session = await requireApiSession()
  const rows = await prisma.aIReport.findMany({
    where: { organizationId: session.user.organizationId, type },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { generatedBy: { select: { name: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    generatedByName: r.generatedBy.name ?? 'Unknown',
  }))
}

export async function getReport(id: string) {
  const session = await requireApiSession()
  const row = await prisma.aIReport.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: { generatedBy: { select: { name: true } } },
  })
  if (!row) return null
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    generatedByName: row.generatedBy.name ?? 'Unknown',
  }
}

export async function generateReport(type: ReportType) {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId
  const meta = REPORT_TYPES.find((r) => r.type === type)
  if (!meta) throw new Error('Unknown report type')

  const orgContext = await buildOrgContext(organizationId)
  const content = await generateCompletion(
    [{ role: 'user', content: REPORT_PROMPTS[type] }],
    systemPrompt(orgContext)
  )

  const row = await prisma.aIReport.create({
    data: {
      type,
      title: `${meta.title} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      content,
      organizationId,
      generatedById: session.user.id,
    },
  })

  return { id: row.id }
}

export { isAIConfigured }

// ============================================================
// Ad-hoc data analysis — a single grounded Q&A over the live CRM
// snapshot, for /ai/data-analysis. Unlike AI Chat this isn't a saved,
// multi-turn conversation; unlike AI Reports it isn't persisted — it's a
// quick "ask a question about the data" tool.
// ============================================================

export async function analyzeQuestion(question: string): Promise<string> {
  const session = await requireApiSession()
  const orgContext = await buildOrgContext(session.user.organizationId)
  const system = [
    'You are a data analyst embedded in Kawman ExAct, a CRM and field-sales platform.',
    'Answer the question below using ONLY the live CRM snapshot provided. Be specific and quote the',
    'actual numbers from the snapshot. If the snapshot doesn\'t contain enough detail to fully answer,',
    'say so plainly rather than guessing. Use short markdown (headings, bullets, bold numbers).',
    '',
    orgContext,
  ].join('\n')

  return generateCompletion([{ role: 'user', content: question }], system)
}

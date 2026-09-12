import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { generateCompletion, isAIConfigured, type AIChatMessage } from '@/lib/ai'
import { getRecordScope } from '@/lib/record-scope'
import type { Session } from '@/lib/auth'
import type { Prisma } from '@/generated/prisma'

// ============================================================
// Org data grounding — pulls a real CRM snapshot so the model
// answers from actual pipeline data instead of guessing.
// Scoped to caller visibility (ALL / DEPARTMENT / OWN) so a
// non-admin never sees org-wide aggregates via the AI.
// ============================================================

function scopeFilterForAI(user: Session['user']): { ownerFilter: Prisma.LeadWhereInput; dealOwnerFilter: Prisma.DealWhereInput; followUpOwnerFilter: Prisma.FollowUpWhereInput; visitAssigneeFilter: Prisma.FieldVisitWhereInput } {
  const scope = getRecordScope(user)
  if (scope === 'ALL') return { ownerFilter: {}, dealOwnerFilter: {}, followUpOwnerFilter: {}, visitAssigneeFilter: {} }
  if (scope === 'DEPARTMENT' && user.department?.id) {
    const deptLead = { owner: { departmentId: user.department.id } } as unknown as Prisma.LeadWhereInput
    const deptAssignee = { assignee: { departmentId: user.department.id } } as unknown as Prisma.FieldVisitWhereInput
    return { ownerFilter: deptLead, dealOwnerFilter: deptLead as unknown as Prisma.DealWhereInput, followUpOwnerFilter: { owner: { departmentId: user.department.id } } as unknown as Prisma.FollowUpWhereInput, visitAssigneeFilter: deptAssignee }
  }
  return { ownerFilter: { ownerId: user.id } as Prisma.LeadWhereInput, dealOwnerFilter: { ownerId: user.id } as Prisma.DealWhereInput, followUpOwnerFilter: { ownerId: user.id } as Prisma.FollowUpWhereInput, visitAssigneeFilter: { assigneeId: user.id } as Prisma.FieldVisitWhereInput }
}

async function buildOrgContext(organizationId: string, user?: Session['user']): Promise<string> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const s = user ? scopeFilterForAI(user) : null
  const leadWhere: Prisma.LeadWhereInput = { organizationId, ...(s?.ownerFilter ?? {}) }
  const dealWhere: Prisma.DealWhereInput = { organizationId, ...(s?.dealOwnerFilter ?? {}) }
  const followUpWhere: Prisma.FollowUpWhereInput = { organizationId, ...(s?.followUpOwnerFilter ?? {}) }
  const visitWhere: Prisma.FieldVisitWhereInput = { organizationId, ...(s?.visitAssigneeFilter ?? {}) }

  const [
    leadsByStatus,
    dealsByStage,
    wonThisMonth,
    followUpsOverdue,
    topOpenDeals,
    recentLeads,
    todaysVisits,
  ] = await Promise.all([
    prisma.lead.groupBy({ by: ['status'], where: leadWhere, _count: { _all: true } }),
    prisma.deal.groupBy({
      by: ['stage'],
      where: dealWhere,
      _count: { _all: true },
      _sum: { value: true },
    }),
    prisma.deal.aggregate({
      where: { ...dealWhere, stage: 'WON', closedAt: { gte: monthStart } },
      _sum: { value: true },
      _count: { _all: true },
    }),
    prisma.followUp.count({
      where: { ...followUpWhere, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: tomorrow } },
    }),
    prisma.deal.findMany({
      where: { ...dealWhere, stage: { notIn: ['WON', 'LOST'] } },
      orderBy: { value: 'desc' },
      take: 8,
      select: { name: true, value: true, stage: true, probability: true, expectedClose: true },
    }),
    prisma.lead.findMany({
      where: leadWhere,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { name: true, company: true, status: true, source: true, createdAt: true },
    }),
    prisma.fieldVisit.count({ where: { ...visitWhere, scheduledAt: { gte: today, lt: tomorrow } } }),
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
    'Formatting standards for reports: use ## headings for each section, markdown tables (| col |) for any',
    'comparison or ranking, > blockquote for TL;DR, **bold** for every monetary figure / count / percentage,',
    'and keep paragraphs to max 3 lines. Prefer bullets and tables over prose. Never invent data not in the snapshot.',
    'If the question is unrelated to the CRM data, answer normally without the report template.',
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

  const orgContext = await buildOrgContext(organizationId, session.user)

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
  PIPELINE_HEALTH: [
    'Write a **Pipeline Health Report** as a professional business document.',
    '',
    'Required structure (use exactly these ## headings in order):',
    '## 1. Executive Summary — 2–3 sentences, top-line health and one number that matters most.',
    '## 2. Pipeline by Stage — a markdown table with columns | Stage | Deals | Total Value | Avg Probability | Notes |, then 2–3 bullets interpreting the table (where is it overloaded or stalled).',
    '## 3. At-Risk & Stalled Deals — table | Deal | Stage | Value | Probability | Risk Reason | ranked by risk (largest + lowest probability first).',
    '## 4. Bottleneck Analysis — what stages are blocking flow and why (use snapshot numbers).',
    '## 5. Recommendations — exactly 3 numbered, actionable recommendations (owner + next step + expected impact).',
    '',
    'Formatting rules: Use **bold** for every monetary figure, count, and percentage. Use tables where specified. Keep tone executive, concise, and data-grounded. Do not invent data not in the snapshot.',
  ].join('\n'),
  WEEKLY_SALES_SUMMARY: [
    'Write a **Weekly Sales Summary** as a Monday-morning leadership briefing.',
    '',
    'Required structure (use exactly these ## headings in order):',
    '## 1. At a Glance — a markdown table | Metric | This Week | Notes | covering: new leads, deals won, pipeline movement, overdue follow-ups, field visits today.',
    '## 2. Wins of the Week — bullets for each deal won (name, value, stage movement). If none, say so plainly.',
    '## 3. New Leads & Sources — bullets grouped by source/status with counts.',
    '## 4. Pipeline Movement — what moved forward, what stalled, with 2–3 insight bullets.',
    '## 5. Focus for Next Week — 3 prioritized actions (what, who, by when).',
    '',
    'Formatting rules: Start with a 1-sentence TL;DR in > blockquote. Use **bold** for all numbers. Use tables where specified. Keep scannable; no paragraph longer than 3 lines.',
  ].join('\n'),
  FOLLOW_UP_RISK: [
    'Write a **Follow-up Risk Report** as an urgency-ranked operational brief.',
    '',
    'Required structure (use exactly these ## headings in order):',
    '## 1. Summary — one paragraph: how many follow-ups are overdue/due today and the revenue at risk.',
    '## 2. Overdue & Due Today — markdown table | Lead / Deal | Owner | Due Date | Days Overdue | Urgency | Next Step | sorted by Urgency (High → Medium → Low). Urgency = High if overdue >3 days or high-value deal.',
    '## 3. Going Cold — leads/deals with no touch in the snapshot window that risk going cold (bullets).',
    '## 4. Priority Queue — numbered 1–5, the exact 5 items to act on this week in order.',
    '## 5. Recommendations — 3 bullets to prevent future slippage (process, not just effort).',
    '',
    'Formatting rules: Use **bold** for dates, counts, and values. Use tables where specified. Be direct; no filler.',
  ].join('\n'),
  EXECUTIVE_SUMMARY: [
    'Write a **one-page Executive Summary** for a busy executive (60-second read).',
    '',
    'Required structure (use exactly these ## headings in order):',
    '## 1. TL;DR — a > blockquote with 2 sentences: the single most important win and the single biggest risk right now.',
    '## 2. Key Metrics — markdown table | Metric | Value | Trend / Note | covering: total leads, pipeline value, deals won this month (count + value), overdue follow-ups, field visits today.',
    '## 3. Pipeline Snapshot — 3 bullets interpreting the pipeline by stage.',
    '## 4. Biggest Opportunity — one deal/segment with value, stage, probability, and why it matters (use snapshot).',
    '## 5. Biggest Risk — one risk with impact and mitigation in one sentence.',
    '## 6. What Needs Attention This Week — 3 numbered, owner-ready actions.',
    '',
    'Formatting rules: Entire report must fit one printed page. Use **bold** for every KPI. Prefer tables and bullets over paragraphs. No fluff, no invented data.',
  ].join('\n'),
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

  const orgContext = await buildOrgContext(organizationId, session.user)
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


export async function generateEmployeeDailySummary(dailyReportId: string): Promise<{ id: string }> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('team.view') && !(session.user.permissions as string[]).includes('team.view_all')) throw new Error('Forbidden: missing team.view')
  const report = await prisma.dailyReport.findFirst({
    where: { id: dailyReportId, organizationId: session.user.organizationId },
    include: { user: { select: { name: true, email: true } } },
  })
  if (!report) throw new Error('Daily report not found')
  if (report.userId !== session.user.id && !(session.user.permissions as string[]).includes('team.view_all')) throw new Error('Forbidden: missing team.view_all')
  const orgContext = await buildOrgContext(session.user.organizationId, session.user)
  const prompt = [
    'Write an **Employee Daily Summary** as a professional status report.',
    'Required structure (use exactly these ## headings):',
    '## 1. Summary — 2 sentences: what was accomplished and overall productivity signal.',
    '## 2. Completed Today — bullets from the completedWork field; include counts inline.',
    '## 3. Pending & Carry-Forward — bullets from pendingWork.',
    '## 4. Blockers & Risks — bullets; if none, write "No blockers reported."',
    '## 5. Plan for Tomorrow — bullets from tomorrowPlan.',
    '## 6. Activity Snapshot — markdown table | Metric | Count | with rows: Tasks Completed, CRM Records Updated, Leads Worked On, Files Uploaded, Active Time (minutes).',
    'Formatting: Use **bold** for all counts. Keep bullets short. Do not invent work not listed.',
    '',
    'Employee: ' + (report.user.name ?? report.user.email),
    'Date: ' + report.date.toISOString().slice(0, 10),
    'Status: ' + report.status,
    'Work description: ' + (report.workDescription ?? '-'),
    'Completed: ' + (report.completedWork ?? '-'),
    'Pending: ' + (report.pendingWork ?? '-'),
    'Blockers: ' + (report.blockers ?? '-'),
    'Tomorrow: ' + (report.tomorrowPlan ?? '-'),
    'Stats: tasksCompleted=' + report.tasksCompletedCount + ', crmUpdated=' + report.crmRecordsUpdatedCount + ', leadsWorkedOn=' + report.leadsWorkedOnCount + ', filesUploaded=' + report.filesUploadedCount + ', activeMinutes=' + report.activeWorkingTimeMinutes,
  ].join('\n')
  const content = await generateCompletion([{ role: 'user', content: prompt }], systemPrompt(orgContext))
  const row = await prisma.aIReport.create({
    data: {
      type: 'employee_daily_summary',
      title: 'Daily Summary — ' + (report.user.name ?? report.user.email) + ' — ' + report.date.toISOString().slice(0, 10),
      content,
      organizationId: session.user.organizationId,
      generatedById: session.user.id,
      dailyReportId: report.id,
    },
  })
  return { id: row.id }
}

export async function generateTeamManagementSummary(dateRange?: { from: Date; to: Date }): Promise<{ id: string }> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('team.view_all')) throw new Error('Forbidden: missing team.view_all')
  const organizationId = session.user.organizationId
  const from = dateRange?.from ?? new Date(Date.now() - 6 * 86400000)
  const to = dateRange?.to ?? new Date()
  const reports = await prisma.dailyReport.findMany({
    where: { organizationId, date: { gte: from, lte: to }, status: 'SUBMITTED' },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { date: 'desc' },
    take: 100,
  })
  const total = await prisma.user.count({ where: { organizationId, status: 'ACTIVE' } })
  const todayKey = new Date().toISOString().slice(0, 10)
  const submittedTodayCount = reports.filter((r) => r.date.toISOString().slice(0, 10) === todayKey).length
  const orgContext = await buildOrgContext(organizationId, session.user)
  const reportLines = reports.slice(0, 30).map((r) => '- ' + (r.user.name ?? r.user.email) + ' (' + r.date.toISOString().slice(0, 10) + '): ' + (r.workDescription ?? r.completedWork ?? '-') + ' | blockers: ' + (r.blockers ?? 'none')).join('\n') || '- No submitted reports in range.'
  const prompt = [
    'Write a **Team Management Summary** for leadership as a professional briefing.',
    'Required structure (use exactly these ## headings):',
    '## 1. Executive Summary — 3 sentences: team productivity, submission rate, headline blocker.',
    '## 2. Submission Overview — markdown table | Date | Submitted | Team Size | Rate | then one sentence interpreting the trend.',
    '## 3. Productivity Highlights — bullets: top contributors + average activity per person.',
    '## 4. Common Blockers — bullets grouped by theme with how many reports mentioned each.',
    '## 5. CRM Context — 2–3 bullets linking daily activity to pipeline/lead movement from the snapshot.',
    '## 6. Recommendations — exactly 3 numbered, leadership-ready actions (what, owner type, by when).',
    'Formatting: Use **bold** for every count/rate. Use tables where specified. Keep scannable; no paragraph >3 lines.',
    '',
    'Date range: ' + from.toISOString().slice(0, 10) + ' to ' + to.toISOString().slice(0, 10),
    'Team size (active): ' + total + ', submitted in range: ' + reports.length + ', submitted today: ' + submittedTodayCount,
    '',
    'Daily reports (sample):',
    reportLines,
  ].join('\n')
  const content = await generateCompletion([{ role: 'user', content: prompt }], systemPrompt(orgContext))
  const row = await prisma.aIReport.create({
    data: {
      type: 'team_management_summary',
      title: 'Team Management Summary — ' + from.toISOString().slice(0, 10) + ' to ' + to.toISOString().slice(0, 10),
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
  const orgContext = await buildOrgContext(session.user.organizationId, session.user)
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

import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { generateCompletion } from '@/lib/ai'
import { ok, err, Result } from '@/lib/result'
import { buildOrgContext, systemPrompt } from './ai-context.service'

// ============================================================
// Report Types & Prompts
// ============================================================

export type ReportType =
  | 'pipeline_health'
  | 'lead_conversion'
  | 'deal_velocity'
  | 'activity_summary'
  | 'team_performance'
  | 'employee_daily_summary'
  | 'team_management_summary'
  | 'field_sales_daily_summary'

const REPORT_TYPES = [
  { type: 'pipeline_health', title: 'Pipeline Health Report' },
  { type: 'lead_conversion', title: 'Lead Conversion Report' },
  { type: 'deal_velocity', title: 'Deal Velocity Report' },
  { type: 'activity_summary', title: 'Activity Summary Report' },
  { type: 'team_performance', title: 'Team Performance Report' },
] as const

const REPORT_PROMPTS: Record<ReportType, string> = {
  pipeline_health: [
    'Write a **Pipeline Health Report** for leadership.',
    'Required structure (use exactly these ## headings):',
    '## 1. Executive Summary — 3 sentences: pipeline value, conversion trend, top risk.',
    '## 2. Pipeline by Stage — markdown table | Stage | Count | Value | Avg Age (days) |.',
    '## 3. Lead Flow — markdown table | Status | Count | % of Total |.',
    '## 4. Top 5 Deals at Risk — bullets with deal name, stage, value, days stale, why at risk.',
    '## 5. Recommendations — exactly 3 numbered actions.',
    'Formatting: Use **bold** for every count and monetary value. Keep scannable.',
  ].join('\n'),
  lead_conversion: [
    'Write a **Lead Conversion Report** analyzing lead-to-deal funnel.',
    'Required structure:',
    '## 1. Executive Summary — 2 sentences: conversion rate, trend vs last month.',
    '## 2. Funnel — markdown table | Stage | Leads | Conversion % | Avg Days |.',
    '## 3. Top Sources — bullets: source, leads, converted, rate.',
    '## 4. Stalled Leads — bullets: lead name, company, days in stage, suggested action.',
    '## 5. Recommendations — exactly 3 numbered actions.',
    'Formatting: Use **bold** for all rates and counts.',
  ].join('\n'),
  deal_velocity: [
    'Write a **Deal Velocity Report** measuring speed through pipeline.',
    'Required structure:',
    '## 1. Executive Summary — 2 sentences: avg days to close, trend.',
    '## 2. Velocity by Stage — markdown table | Stage | Avg Days | Median Days | Deals |.',
    '## 3. Fastest/Slowest — bullets: deal name, days, stage.',
    '## 4. Bottlenecks — bullets: stage, avg days, # deals stuck, why.',
    '## 5. Recommendations — exactly 3 numbered actions.',
    'Formatting: Use **bold** for all day counts.',
  ].join('\n'),
  activity_summary: [
    'Write an **Activity Summary Report** for the organization.',
    'Required structure:',
    '## 1. Executive Summary — 2 sentences: total activity, trend.',
    '## 2. Activity by Type — markdown table | Type | Count | Completed | Overdue |.',
    '## 3. Top Contributors — bullets: user, activities, completion rate.',
    '## 4. Overdue Breakdown — bullets: type, count, oldest.',
    '## 5. Recommendations — exactly 3 numbered actions.',
    'Formatting: Use **bold** for all counts.',
  ].join('\n'),
  team_performance: [
    'Write a **Team Performance Report** comparing team members.',
    'Required structure:',
    '## 1. Executive Summary — 2 sentences: team productivity, top performer.',
    '## 2. Performance Table — markdown table | Member | Leads | Deals | Activities | Revenue |.',
    '## 3. Highlights — bullets: top 3 performers with specifics.',
    '## 4. Coaching Opportunities — bullets: member, area, suggested focus.',
    '## 5. Recommendations — exactly 3 numbered actions.',
    'Formatting: Use **bold** for all counts and monetary values.',
  ].join('\n'),
  employee_daily_summary: '',
  team_management_summary: '',
  field_sales_daily_summary: '',
}

// ============================================================
// Standard Report Generation
// ============================================================

export async function listReports(): Promise<
  { id: string; type: string; title: string; createdAt: string; generatedByName: string }[]
> {
  const session = await requireApiSession()
  const rows = await prisma.aIReport.findMany({
    where: { organizationId: session.user.organizationId },
    include: { generatedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
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

export async function generateReport(type: ReportType): Promise<Result<{ id: string }>> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId
  const meta = REPORT_TYPES.find((r) => r.type === type)
  if (!meta) return err('Unknown report type')

  try {
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

    return ok({ id: row.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate report'
    return err(msg)
  }
}

// ============================================================
// Employee Daily Summary
// ============================================================

export async function generateEmployeeDailySummary(dailyReportId: string): Promise<Result<{ id: string }>> {
  const session = await requireApiSession()
  const perms = session.user.permissions as string[]
  if (!perms.includes('team.view') && !perms.includes('team.view_all') && !perms.includes('reports.view') && !perms.includes('reports.view_all') && !perms.includes('reports.submit')) return err('Forbidden: missing team.view')
  const report = await prisma.dailyReport.findFirst({
    where: { id: dailyReportId, organizationId: session.user.organizationId },
    include: { user: { select: { name: true, email: true } } },
  })
  if (!report) return err('Daily report not found')
  if (report.userId !== session.user.id && !perms.includes('team.view_all')) return err('Forbidden: missing team.view_all')
  try {
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
      'Tomorrow Plan: ' + (report.tomorrowPlan ?? '-'),
      'Tasks Completed: ' + report.tasksCompletedCount,
      'CRM Records Updated: ' + report.crmRecordsUpdatedCount,
      'Leads Worked On: ' + report.leadsWorkedOnCount,
      'Files Uploaded: ' + report.filesUploadedCount,
      'Active Minutes: ' + report.activeWorkingTimeMinutes,
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
    return ok({ id: row.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate summary'
    return err(msg)
  }
}
// ============================================================
// Team Management Summary
// ============================================================

export async function generateTeamManagementSummary(dateRange?: { from: Date; to: Date }): Promise<Result<{ id: string }>> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('team.view_all')) return err('Forbidden: missing team.view_all')
  const organizationId = session.user.organizationId
  const from = dateRange?.from ?? new Date(Date.now() - 6 * 86400000)
  const to = dateRange?.to ?? new Date()
  try {
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
    return ok({ id: row.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate summary'
    return err(msg)
  }
}

// ============================================================
// Field Sales Daily Summary
// ============================================================

export async function generateFieldSalesDailySummary(opts?: { date?: Date }): Promise<Result<{ id: string }>> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId
  const day = opts?.date ?? new Date()
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const dateLabel = start.toISOString().slice(0, 10)

  try {
    const [visitReports, dailyReport, checkIns, visitsToday, openDeals] = await Promise.all([
      prisma.visitReport.findMany({
        where: { createdById: session.user.id, createdAt: { gte: start, lt: end }, visit: { organizationId } },
        include: { visit: { select: { title: true, company: { select: { name: true } } } } },
        orderBy: { createdAt: 'asc' },
        take: 30,
      }),
      prisma.dailyReport.findFirst({
        where: { organizationId, userId: session.user.id, date: { gte: start, lt: end } },
      }),
      prisma.checkIn.findMany({
        where: { userId: session.user.id, createdAt: { gte: start, lt: end }, visit: { organizationId } },
        include: { visit: { select: { title: true } } },
        orderBy: { createdAt: 'asc' },
        take: 30,
      }),
      prisma.fieldVisit.count({ where: { organizationId, assigneeId: session.user.id, scheduledAt: { gte: start, lt: end } } }),
      prisma.deal.findMany({
        where: { organizationId, ownerId: session.user.id, stage: { notIn: ['WON', 'LOST'] } },
        orderBy: { value: 'desc' },
        take: 5,
        select: { name: true, stage: true, value: true },
      }),
    ])

    const orgContext = await buildOrgContext(organizationId, session.user)

    const visitReportLines =
      visitReports.length > 0
        ? visitReports
            .map(
              (r) =>
                `- Visit: ${r.visit.title}${r.visit.company?.name ? ` — ${r.visit.company.name}` : ''} | Purpose: ${r.purpose} | Discussion: ${(r.discussion ?? '-').slice(0, 500)} | Requirements: ${(r.requirements ?? '-').slice(0, 300)} | Next: ${(r.nextSteps ?? '-').slice(0, 300)}`
            )
            .join('\n')
        : '- No field visit reports filed today.'

    const checkInLines =
      checkIns.length > 0
        ? checkIns.map((c) => `- ${c.visit.title} at ${c.createdAt.toISOString().slice(11, 16)} — ${c.verificationStatus}${c.notes ? ` — ${c.notes.slice(0, 200)}` : ''}`).join('\n')
        : '- No check-ins today.'

    const dailyBlock = dailyReport
      ? [
          `DailyReport ${dateLabel} [${dailyReport.status}]:`,
          `workDescription: ${(dailyReport.workDescription ?? '-').slice(0, 1200)}`,
          `completedWork: ${(dailyReport.completedWork ?? '-').slice(0, 1000)}`,
          `pendingWork: ${(dailyReport.pendingWork ?? '-').slice(0, 800)}`,
          `blockers: ${(dailyReport.blockers ?? '-').slice(0, 600)}`,
          `tomorrowPlan: ${(dailyReport.tomorrowPlan ?? '-').slice(0, 600)}`,
        ].join('\n')
      : `No DailyReport submitted for ${dateLabel} — field reports will create a draft.`

    const prompt = [
      'Write a **Field Sales Daily Summary** — a concise, manager-ready briefing of today\'s field sales work.',
      'Required structure (use exactly these ## headings in order):',
      '## 1. TL;DR — 2 sentences: top win today and single biggest follow-up risk.',
      '## 2. Visits Today — markdown table | Visit | Company | Purpose | Key Discussion | Requirements | Next Step | (one row per field report; if none, write "No reports filed" and suggest filing).',
      '## 3. What Was Discussed — bullets per visit (customer need, objection, interest). Use the discussion text verbatim where possible.',
      '## 4. Check-ins — markdown table | Visit | Time | Status | Notes |.',
      '## 5. Daily Report Context — if a DailyReport exists, summarize completed/pending/blockers/tomorrow; if not, note it.',
      '## 6. Pipeline Context — Open Deals (top 5 by value) — use CRM snapshot numbers below.',
      'Formatting: Use **bold** for every count, company, and monetary value. Keep scannable; no paragraph >3 lines. Never invent visits or requirements not listed.',
      '',
      `Date: ${dateLabel}`,
      `Rep: ${session.user.name ?? session.user.email}`,
      `Visits scheduled today: ${visitsToday} | Visit reports filed: ${visitReports.length} | Check-ins today: ${checkIns.length}`,
      '',
      'Field visit reports (today, by this rep):',
      visitReportLines,
      '',
      'Check-ins today:',
      checkInLines,
      '',
      dailyBlock,
      '',
      'Top open deals (context):',
      openDeals.length ? openDeals.map((d) => `- ${d.name}: ${d.stage} worth ₹${Number(d.value).toLocaleString('en-IN')}`).join('\n') : '- none',
    ].join('\n')

    const content = await generateCompletion([{ role: 'user', content: prompt }], systemPrompt(orgContext))
    // field_sales_daily_summary is NOT linked via dailyReportId (that FK is @unique for employee_daily_summary) — keep it standalone.
    const row = await prisma.aIReport.create({
      data: {
        type: 'field_sales_daily_summary',
        title: `Field Sales Daily Summary — ${dateLabel} — ${session.user.name ?? session.user.email}`,
        content,
        organizationId,
        generatedById: session.user.id,
      },
    })
    return ok({ id: row.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate summary'
    return err(msg)
  }
}
export async function deleteReport(id: string): Promise<Result<void>> {
  try {
    const session = await requireApiSession()
    const existing = await prisma.aIReport.findFirst({
      where: { id, organizationId: session.user.organizationId },
      select: { id: true },
    })
    if (!existing) return err('Report not found')
    await prisma.aIReport.delete({ where: { id } })
    return ok(undefined)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete report'
    return err(msg)
  }
}



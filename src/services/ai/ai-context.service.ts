import 'server-only'
import { prisma } from '@/lib/db'
import type { Session } from '@/lib/auth'
import type { Prisma } from '@/generated/prisma'

// ============================================================
// Org data grounding — pulls a real CRM snapshot so the model
// answers from actual pipeline data instead of guessing.
// Scoped to caller visibility (ALL / DEPARTMENT / OWN) so a
// non-admin never sees org-wide aggregates via the AI.
// ============================================================

export function scopeFilterForAI(user: Session['user']): {
  ownerFilter: Prisma.LeadWhereInput
  dealOwnerFilter: Prisma.DealWhereInput
  followUpOwnerFilter: Prisma.FollowUpWhereInput
  visitAssigneeFilter: Prisma.FieldVisitWhereInput
  meetingOwnerFilter: Prisma.MeetingWhereInput
} {
  const scope = getRecordScope(user)
  if (scope === 'ALL') return { ownerFilter: {}, dealOwnerFilter: {}, followUpOwnerFilter: {}, visitAssigneeFilter: {}, meetingOwnerFilter: {} }
  if (scope === 'DEPARTMENT' && user.department?.id) {
    const deptLead = { owner: { departmentId: user.department.id } } as unknown as Prisma.LeadWhereInput
    const deptAssignee = { assignee: { departmentId: user.department.id } } as unknown as Prisma.FieldVisitWhereInput
    const deptMeeting = { createdBy: { departmentId: user.department.id } } as unknown as Prisma.MeetingWhereInput
    return { ownerFilter: deptLead, dealOwnerFilter: deptLead as unknown as Prisma.DealWhereInput, followUpOwnerFilter: { owner: { departmentId: user.department.id } } as unknown as Prisma.FollowUpWhereInput, visitAssigneeFilter: deptAssignee, meetingOwnerFilter: deptMeeting }
  }
  return { ownerFilter: { ownerId: user.id } as Prisma.LeadWhereInput, dealOwnerFilter: { ownerId: user.id } as Prisma.DealWhereInput, followUpOwnerFilter: { ownerId: user.id } as Prisma.FollowUpWhereInput, visitAssigneeFilter: { assigneeId: user.id } as Prisma.FieldVisitWhereInput, meetingOwnerFilter: { createdById: user.id } as Prisma.MeetingWhereInput }
}

function getRecordScope(user: Session['user']): 'ALL' | 'DEPARTMENT' | 'OWN' {
  const perms = (user.permissions as string[]) ?? []
  if (perms.includes('leads.view_all') || perms.includes('deals.view_all') || perms.includes('team.view_all')) return 'ALL'
  if (user.department?.id && (perms.includes('leads.view_department') || perms.includes('deals.view_department'))) return 'DEPARTMENT'
  return 'OWN'
}

export async function buildOrgContext(organizationId: string, user?: Session['user']): Promise<string> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const s = user ? scopeFilterForAI(user) : null
  const leadWhere: Prisma.LeadWhereInput = { organizationId, ...(s?.ownerFilter ?? {}) }
  const dealWhere: Prisma.DealWhereInput = { organizationId, ...(s?.dealOwnerFilter ?? {}) }
  const followUpWhere: Prisma.FollowUpWhereInput = { organizationId, ...(s?.followUpOwnerFilter ?? {}) }
  const visitWhere: Prisma.FieldVisitWhereInput = { organizationId, ...(s?.visitAssigneeFilter ?? {}) }
  const meetingWhere: Prisma.MeetingWhereInput = { organizationId, ...(s?.meetingOwnerFilter ?? {}) }

  const [
    leadsByStatus,
    dealsByStage,
    wonThisMonth,
    followUpsOverdue,
    topOpenDeals,
    recentLeads,
    todaysVisits,
    upcomingVisits,
    completedVisitsToday,
    visitsThisWeek,
    todaysCheckIns,
    todaysVisitReports,
    todaysMeetings,
    upcomingMeetings,
  ] = await Promise.all([
    prisma.lead.groupBy({ by: ['status'], where: leadWhere, _count: { status: true } }),
    prisma.deal.groupBy({ by: ['stage'], where: dealWhere, _count: { stage: true } }),
    prisma.deal.aggregate({ where: { ...dealWhere, stage: 'WON', closedAt: { gte: monthStart } }, _sum: { value: true }, _count: { id: true } }),
    prisma.followUp.count({ where: { ...followUpWhere, dueDate: { lt: new Date() }, status: { not: 'COMPLETED' } } }),
    prisma.deal.findMany({ where: { ...dealWhere, stage: { notIn: ['WON', 'LOST'] } }, orderBy: { value: 'desc' }, take: 5, select: { name: true, stage: true, value: true, owner: { select: { name: true } } } }),
    prisma.lead.findMany({ where: leadWhere, orderBy: { createdAt: 'desc' }, take: 5, select: { name: true, company: true, status: true, value: true } }),
    prisma.fieldVisit.findMany({ where: { ...visitWhere, scheduledAt: { gte: today, lt: tomorrow } }, orderBy: { scheduledAt: 'asc' }, select: { id: true, title: true, scheduledAt: true, status: true, company: { select: { name: true } } } }),
    prisma.fieldVisit.findMany({ where: { ...visitWhere, scheduledAt: { gte: tomorrow, lt: weekEnd } }, orderBy: { scheduledAt: 'asc' }, take: 10, select: { id: true, title: true, scheduledAt: true, company: { select: { name: true } } } }),
    prisma.fieldVisit.count({ where: { ...visitWhere, status: 'COMPLETED', completedAt: { gte: today, lt: tomorrow } } }),
    prisma.fieldVisit.count({ where: { ...visitWhere, scheduledAt: { gte: weekStart, lt: weekEnd } } }),
    prisma.checkIn.count({ where: { userId: user?.id ?? '', createdAt: { gte: today, lt: tomorrow } } }),
    prisma.visitReport.count({ where: { createdById: user?.id ?? '', createdAt: { gte: today, lt: tomorrow } } }),
    prisma.meeting.findMany({ where: { ...meetingWhere, scheduledAt: { gte: today, lt: tomorrow } }, orderBy: { scheduledAt: 'asc' }, select: { title: true, scheduledAt: true, endedAt: true } }),
    prisma.meeting.count({ where: { ...meetingWhere, scheduledAt: { gte: tomorrow, lt: weekEnd } } }),
  ])

  const leadsSummary = leadsByStatus.map((l) => l.status + ': ' + l._count.status).join(', ') || 'none'
  const dealsSummary = dealsByStage.map((d) => d.stage + ': ' + d._count.stage).join(', ') || 'none'
  const wonValue = wonThisMonth._sum.value ?? 0
  const wonCount = wonThisMonth._count.id ?? 0
  const topDeals = topOpenDeals.map((d) => '- ' + d.name + ' (' + d.stage + ') — ₹' + Number(d.value).toLocaleString('en-IN') + ' [Owner: ' + (d.owner?.name ?? 'Unknown') + ']').join('\n') || '- none'
  const recentLeadsList = recentLeads.map((l) => '- ' + l.name + ' (' + (l.company ?? 'No company') + ') — ' + l.status + ' — ₹' + Number(l.value ?? 0).toLocaleString('en-IN')).join('\n') || '- none'
  const todaysVisitsList = todaysVisits.map((v) => '- ' + v.title + ' @ ' + v.scheduledAt.toISOString().slice(11, 16) + ' — ' + (v.company?.name ?? 'No company') + ' — ' + v.status).join('\n') || '- none'
  const upcomingVisitsList = upcomingVisits.map((v) => '- ' + v.title + ' @ ' + v.scheduledAt.toISOString().slice(0, 16) + ' — ' + (v.company?.name ?? 'No company')).join('\n') || '- none'
  const todaysMeetingsList = todaysMeetings.map((m) => '- ' + m.title + ' @ ' + (m.scheduledAt?.toISOString().slice(11, 16) ?? '??:??') + '–' + (m.endedAt?.toISOString().slice(11, 16) ?? '??:??')).join('\n') || '- none'

  return [
    '=== CRM SNAPSHOT (scoped to your visibility) ===',
    'Organization ID: ' + organizationId,
    'Scope: ' + (user ? (user.permissions as string[]).includes('leads.view_all') ? 'ALL' : user.department?.id ? 'DEPARTMENT' : 'OWN' : 'N/A'),
    '',
    'LEADS:',
    '  By Status: ' + leadsSummary,
    '  Recent (5):\n' + recentLeadsList,
    '',
    'DEALS:',
    '  By Stage: ' + dealsSummary,
    '  Won This Month: ' + wonCount + ' deals, ₹' + Number(wonValue).toLocaleString('en-IN'),
    '  Top Open (5):\n' + topDeals,
    '',
    'FIELD VISITS:',
    '  Today: ' + todaysVisits.length + ' scheduled, ' + completedVisitsToday + ' completed',
    '  This Week: ' + visitsThisWeek + ' total',
    '  Today\'s Schedule:\n' + todaysVisitsList,
    '  Upcoming:\n' + upcomingVisitsList,
    '  Check-ins Today: ' + todaysCheckIns,
    '  Visit Reports Today: ' + todaysVisitReports,
    '',
    'MEETINGS:',
    '  Today: ' + todaysMeetings.length,
    '  This Week: ' + upcomingMeetings,
    '  Today\'s Schedule:\n' + todaysMeetingsList,
    '',
    'FOLLOW-UPS:',
    '  Overdue: ' + followUpsOverdue,
  ].join('\n')
}

export function systemPrompt(orgContext: string): string {
  return [
    'You are Kawman ExAct AI — an expert CRM and field-sales analyst.',
    'You answer using ONLY the live CRM snapshot provided below.',
    'Never invent data. If the snapshot lacks detail, say so.',
    'Be concise. Use markdown (headings, bullets, bold numbers, tables).',
    '',
    orgContext,
  ].join('\n')
}
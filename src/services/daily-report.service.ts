import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Prisma } from '@/generated/prisma'

export interface DailyReportDraft {
  tasksCompletedCount: number
  crmRecordsUpdatedCount: number
  leadsWorkedOnCount: number
  filesUploadedCount: number
  activeWorkingTimeMinutes: number
  existingReport: DailyReportWithRelations | null
}

export interface DailyReportInput {
  date: Date
  workDescription?: string
  completedWork?: string
  pendingWork?: string
  blockers?: string
  tomorrowPlan?: string
  tasksCompletedCount?: number
  crmRecordsUpdatedCount?: number
  leadsWorkedOnCount?: number
  filesUploadedCount?: number
  activeWorkingTimeMinutes?: number
}

export interface DailyReportWithRelations {
  id: string
  userId: string
  organizationId: string
  date: Date
  workDescription: string | null
  completedWork: string | null
  pendingWork: string | null
  blockers: string | null
  tomorrowPlan: string | null
  tasksCompletedCount: number
  crmRecordsUpdatedCount: number
  leadsWorkedOnCount: number
  filesUploadedCount: number
  activeWorkingTimeMinutes: number
  status: string
  createdAt: Date
  updatedAt: Date
  user: { id: string; name: string | null; email: string }
  aiReport: { id: string; content: string } | null
}

export interface EmployeeProfileData {
  user: {
    id: string
    name: string | null
    email: string
    designation: string | null
    phone: string | null
    status: string
    department: string | null
    team: string | null
    lastLoginAt: Date | null
    createdAt: Date
  }
  overview: {
    totalReports: number
    submittedReports: number
    missedReports: number
    avgTasksCompleted: number
    avgCrmRecordsUpdated: number
    avgLeadsWorkedOn: number
    avgFilesUploaded: number
    avgActiveMinutes: number
  }
  recentReports: DailyReportWithRelations[]
  activityTimeline: { id: string; type: string; description: string; createdAt: Date }[]
  loginHistory: { id: string; createdAt: Date; endedAt: Date | null; ipAddress: string | null; userAgent: string | null }[]
  performanceAnalytics: { date: string; tasksCompleted: number; crmRecordsUpdated: number; leadsWorkedOn: number; filesUploaded: number; activeMinutes: number }[]
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function daysAgo(n: number): Date {
  const d = startOfDay()
  d.setDate(d.getDate() - n)
  return d
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function canViewAllFor(session: Awaited<ReturnType<typeof requireApiSession>>): boolean {
  return (session.user.permissions as string[]).includes('team.view_all') || (session.user.permissions as string[]).includes('reports.view_all')
}

function resolveTargetUserId(session: Awaited<ReturnType<typeof requireApiSession>>, requestedUserId?: string): string {
  const target = requestedUserId ?? session.user.id
  if (target !== session.user.id && !canViewAllFor(session)) throw new Error('Forbidden: missing team.view_all')
  return target
}

function requireTeamView(session: Awaited<ReturnType<typeof requireApiSession>>) {
  if (!(session.user.permissions as string[]).includes('team.view') && !(session.user.permissions as string[]).includes('team.view_all')) {
    throw new Error('Forbidden: missing team.view')
  }
}

export async function getTodayReportDraft(targetUserId?: string): Promise<DailyReportDraft> {
  const session = await requireApiSession()
  requireTeamView(session)
  // reports.submit is also sufficient for own draft
  const organizationId = session.user.organizationId
  const userId = resolveTargetUserId(session, targetUserId)

  const today = startOfDay()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const existingReport = await prisma.dailyReport.findFirst({
    where: { organizationId, userId, date: { gte: today, lt: tomorrow } },
    include: { user: { select: { id: true, name: true, email: true } }, aiReport: { select: { id: true, content: true } } },
  })

  const [followUpsCompleted, activityCount, distinctLeadIds, filesUploaded, activeSessions] = await Promise.all([
    prisma.followUp.count({ where: { organizationId, ownerId: userId, status: 'COMPLETED', completedAt: { gte: today, lt: tomorrow } } }),
    prisma.activity.count({ where: { organizationId, actorId: userId, createdAt: { gte: today, lt: tomorrow } } }),
    prisma.activity.findMany({
      where: { organizationId, actorId: userId, createdAt: { gte: today, lt: tomorrow }, leadId: { not: null } },
      select: { leadId: true },
    }),
    prisma.file.count({ where: { organizationId, uploadedById: userId, createdAt: { gte: today, lt: tomorrow } } }),
    prisma.session.findMany({ where: { userId, createdAt: { gte: today } }, select: { createdAt: true, lastSeenAt: true, updatedAt: true } }),
  ])

  const leadsWorkedOnCount = new Set(distinctLeadIds.map((r) => r.leadId).filter(Boolean)).size
  const heuristicMinutes = Math.min(480, activityCount * 8)
  let sessionMinutes = 0
  if (activeSessions.length) {
    const earliest = Math.min(...activeSessions.map((s) => s.createdAt.getTime()))
    const latest = Math.max(...activeSessions.map((s) => (s.lastSeenAt ?? s.updatedAt).getTime()))
    sessionMinutes = Math.min(480, Math.max(0, Math.round((latest - earliest) / 60000)))
  }
  const activeWorkingTimeMinutes = Math.max(heuristicMinutes, sessionMinutes)

  const base: DailyReportWithRelations | null = existingReport
    ? {
        id: existingReport.id,
        userId: existingReport.userId,
        organizationId: existingReport.organizationId,
        date: existingReport.date,
        workDescription: existingReport.workDescription,
        completedWork: existingReport.completedWork,
        pendingWork: existingReport.pendingWork,
        blockers: existingReport.blockers,
        tomorrowPlan: existingReport.tomorrowPlan,
        tasksCompletedCount: existingReport.tasksCompletedCount,
        crmRecordsUpdatedCount: existingReport.crmRecordsUpdatedCount,
        leadsWorkedOnCount: existingReport.leadsWorkedOnCount,
        filesUploadedCount: existingReport.filesUploadedCount,
        activeWorkingTimeMinutes: existingReport.activeWorkingTimeMinutes,
        status: existingReport.status,
        createdAt: existingReport.createdAt,
        updatedAt: existingReport.updatedAt,
        user: existingReport.user,
        aiReport: existingReport.aiReport,
      }
    : null

  return {
    tasksCompletedCount: followUpsCompleted,
    crmRecordsUpdatedCount: activityCount,
    leadsWorkedOnCount,
    filesUploadedCount: filesUploaded,
    activeWorkingTimeMinutes,
    existingReport: base,
  }
}

export async function submitDailyReport(input: DailyReportInput & { targetUserId?: string }): Promise<DailyReportWithRelations> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('reports.submit')) throw new Error('Forbidden: missing reports.submit')
  const organizationId = session.user.organizationId
  const userId = resolveTargetUserId(session, input.targetUserId)

  const day = startOfDay(input.date)
  const nextDay = new Date(day)
  nextDay.setDate(nextDay.getDate() + 1)

  const draft = await getTodayReportDraft(userId)

  const data = {
    workDescription: input.workDescription ?? null,
    completedWork: input.completedWork ?? null,
    pendingWork: input.pendingWork ?? null,
    blockers: input.blockers ?? null,
    tomorrowPlan: input.tomorrowPlan ?? null,
    tasksCompletedCount: input.tasksCompletedCount ?? draft.tasksCompletedCount,
    crmRecordsUpdatedCount: input.crmRecordsUpdatedCount ?? draft.crmRecordsUpdatedCount,
    leadsWorkedOnCount: input.leadsWorkedOnCount ?? draft.leadsWorkedOnCount,
    filesUploadedCount: input.filesUploadedCount ?? draft.filesUploadedCount,
    activeWorkingTimeMinutes: input.activeWorkingTimeMinutes ?? draft.activeWorkingTimeMinutes,
    status: 'SUBMITTED' as const,
  }

  const existing = await prisma.dailyReport.findFirst({ where: { organizationId, userId, date: { gte: day, lt: nextDay } } })

  const row = existing
    ? await prisma.dailyReport.update({
        where: { id: existing.id },
        data,
        include: { user: { select: { id: true, name: true, email: true } }, aiReport: { select: { id: true, content: true } } },
      })
    : await prisma.dailyReport.create({
        data: { organizationId, userId, date: day, ...data },
        include: { user: { select: { id: true, name: true, email: true } }, aiReport: { select: { id: true, content: true } } },
      })

  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    date: row.date,
    workDescription: row.workDescription,
    completedWork: row.completedWork,
    pendingWork: row.pendingWork,
    blockers: row.blockers,
    tomorrowPlan: row.tomorrowPlan,
    tasksCompletedCount: row.tasksCompletedCount,
    crmRecordsUpdatedCount: row.crmRecordsUpdatedCount,
    leadsWorkedOnCount: row.leadsWorkedOnCount,
    filesUploadedCount: row.filesUploadedCount,
    activeWorkingTimeMinutes: row.activeWorkingTimeMinutes,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user: row.user,
    aiReport: row.aiReport,
  }
}

export async function listDailyReports(filters?: { from?: Date; to?: Date; status?: string; targetUserId?: string }): Promise<DailyReportWithRelations[]> {
  const session = await requireApiSession()
  requireTeamView(session)
  const organizationId = session.user.organizationId
  const where: Prisma.DailyReportWhereInput = { organizationId }
  if (filters?.targetUserId) {
    where.userId = resolveTargetUserId(session, filters.targetUserId)
  } else if (!canViewAllFor(session)) {
    where.userId = session.user.id
  }
  if (filters?.from || filters?.to) {
    where.date = {}
    if (filters.from) (where.date as Prisma.DateTimeFilter).gte = startOfDay(filters.from)
    if (filters.to) (where.date as Prisma.DateTimeFilter).lte = endOfDay(filters.to)
  }
  if (filters?.status) where.status = filters.status as never

  const rows = await prisma.dailyReport.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } }, aiReport: { select: { id: true, content: true } } },
    orderBy: { date: 'desc' },
    take: 100,
  })
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    organizationId: r.organizationId,
    date: r.date,
    workDescription: r.workDescription,
    completedWork: r.completedWork,
    pendingWork: r.pendingWork,
    blockers: r.blockers,
    tomorrowPlan: r.tomorrowPlan,
    tasksCompletedCount: r.tasksCompletedCount,
    crmRecordsUpdatedCount: r.crmRecordsUpdatedCount,
    leadsWorkedOnCount: r.leadsWorkedOnCount,
    filesUploadedCount: r.filesUploadedCount,
    activeWorkingTimeMinutes: r.activeWorkingTimeMinutes,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    user: { id: r.user.id, name: r.user.name ?? null, email: r.user.email } as unknown as { id: string; name: string | null; email: string },
    aiReport: r.aiReport,
  } as DailyReportWithRelations))
}

export async function getEmployeeProfile(userId: string, dateRange?: { from: Date; to: Date }): Promise<EmployeeProfileData> {
  const session = await requireApiSession()
  requireTeamView(session)
  const organizationId = session.user.organizationId
  if (userId !== session.user.id && !canViewAllFor(session)) throw new Error('Forbidden: missing team.view_all')

  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      designation: true,
      phone: true,
      status: true,
      department: { select: { name: true } },
      team: { select: { name: true } },
      lastLoginAt: true,
      createdAt: true,
    },
  })
  if (!target) throw new Error('User not found')

  const from = dateRange?.from ?? daysAgo(29)
  const to = dateRange?.to ?? endOfDay()

  const [allReports, recentReports, activities, sessions] = await Promise.all([
    prisma.dailyReport.findMany({ where: { organizationId, userId, date: { gte: from, lte: to } } }),
    prisma.dailyReport.findMany({
      where: { organizationId, userId },
      include: { user: { select: { id: true, name: true, email: true } }, aiReport: { select: { id: true, content: true } } },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    prisma.activity.findMany({ where: { organizationId, actorId: userId, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.session.findMany({ where: { userId, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ])

  const totalReports = allReports.length
  const submittedReports = allReports.filter((r) => r.status === 'SUBMITTED').length
  const missedReports = allReports.filter((r) => r.status === 'MISSED').length
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)

  const overview = {
    totalReports,
    submittedReports,
    missedReports,
    avgTasksCompleted: Math.round(avg(allReports.map((r) => r.tasksCompletedCount)) * 10) / 10,
    avgCrmRecordsUpdated: Math.round(avg(allReports.map((r) => r.crmRecordsUpdatedCount)) * 10) / 10,
    avgLeadsWorkedOn: Math.round(avg(allReports.map((r) => r.leadsWorkedOnCount)) * 10) / 10,
    avgFilesUploaded: Math.round(avg(allReports.map((r) => r.filesUploadedCount)) * 10) / 10,
    avgActiveMinutes: Math.round(avg(allReports.map((r) => r.activeWorkingTimeMinutes)) * 10) / 10,
  }

  const perfMap = new Map<string, { tasksCompleted: number; crmRecordsUpdated: number; leadsWorkedOn: number; filesUploaded: number; activeMinutes: number }>()
  const daysDiff = Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1
  for (let i = 0; i < daysDiff; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    perfMap.set(formatDateKey(d), { tasksCompleted: 0, crmRecordsUpdated: 0, leadsWorkedOn: 0, filesUploaded: 0, activeMinutes: 0 })
  }
  for (const r of allReports) {
    const k = formatDateKey(r.date)
    const cur = perfMap.get(k)
    if (!cur) continue
    cur.tasksCompleted += r.tasksCompletedCount
    cur.crmRecordsUpdated += r.crmRecordsUpdatedCount
    cur.leadsWorkedOn += r.leadsWorkedOnCount
    cur.filesUploaded += r.filesUploadedCount
    cur.activeMinutes += r.activeWorkingTimeMinutes
  }
  const performanceAnalytics = Array.from(perfMap.entries()).map(([date, v]) => ({ date, ...v }))

  return {
    user: {
      id: target.id,
      name: target.name,
      email: target.email,
      designation: target.designation,
      phone: target.phone,
      status: target.status,
      department: target.department?.name ?? null,
      team: target.team?.name ?? null,
      lastLoginAt: target.lastLoginAt,
      createdAt: target.createdAt,
    },
    overview,
    recentReports: recentReports.map(
      (r) =>
        ({
          id: r.id,
          userId: r.userId,
          organizationId: r.organizationId,
          date: r.date,
          workDescription: r.workDescription,
          completedWork: r.completedWork,
          pendingWork: r.pendingWork,
          blockers: r.blockers,
          tomorrowPlan: r.tomorrowPlan,
          tasksCompletedCount: r.tasksCompletedCount,
          crmRecordsUpdatedCount: r.crmRecordsUpdatedCount,
          leadsWorkedOnCount: r.leadsWorkedOnCount,
          filesUploadedCount: r.filesUploadedCount,
          activeWorkingTimeMinutes: r.activeWorkingTimeMinutes,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          user: { id: (r.user as { id: string; name: string | null; email: string }).id, name: r.user.name ?? null, email: r.user.email },
          aiReport: r.aiReport,
        }) as unknown as DailyReportWithRelations,
    ),
    activityTimeline: activities.map((a) => ({ id: a.id, type: a.type, description: a.description, createdAt: a.createdAt })),
    loginHistory: sessions.map((s) => ({ id: s.id, createdAt: s.createdAt, endedAt: s.endedAt, ipAddress: s.ipAddress, userAgent: s.userAgent })),
    performanceAnalytics,
  }
}

export interface TeamDailyReportsParams {
  from?: string
  to?: string
  userId?: string
  status?: string
  search?: string
  page: number
  pageSize: number
}

export interface TeamDailyReportsResult {
  reports: Array<{
    id: string
    userId: string
    date: string
    workDescription: string | null
    completedWork: string | null
    pendingWork: string | null
    blockers: string | null
    tomorrowPlan: string | null
    tasksCompletedCount: number
    crmRecordsUpdatedCount: number
    leadsWorkedOnCount: number
    filesUploadedCount: number
    activeWorkingTimeMinutes: number
    status: string
    userName: string
    userEmail: string
    aiSummary: string | null
  }>
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function getTeamDailyReports(params: TeamDailyReportsParams): Promise<TeamDailyReportsResult> {
  const session = await requireApiSession()
  requireTeamView(session)
  const organizationId = session.user.organizationId
  const { from, to, userId, status, search, page, pageSize } = params

  const baseWhere: Prisma.DailyReportWhereInput = { organizationId }
  if (userId) {
    baseWhere.userId = resolveTargetUserId(session, userId)
  } else if (!canViewAllFor(session)) {
    baseWhere.userId = session.user.id
  }

  const where: Prisma.DailyReportWhereInput = { ...baseWhere }

  if (from || to) {
    where.date = {}
    if (from) (where.date as Prisma.DateTimeFilter).gte = new Date(from)
    if (to) (where.date as Prisma.DateTimeFilter).lte = new Date(to)
  }
  if (status) where.status = status as never

  if (search) {
    const textWhere: Prisma.DailyReportWhereInput = {
      OR: [
        { workDescription: { contains: search, mode: 'insensitive' } },
        { completedWork: { contains: search, mode: 'insensitive' } },
        { pendingWork: { contains: search, mode: 'insensitive' } },
        { blockers: { contains: search, mode: 'insensitive' } },
        { tomorrowPlan: { contains: search, mode: 'insensitive' } },
      ],
    }
    const combined: Prisma.DailyReportWhereInput = { AND: [where, textWhere] }
    const [total, reports] = await Promise.all([
      prisma.dailyReport.count({ where: combined }),
      prisma.dailyReport.findMany({
        where: combined,
        include: { user: { select: { name: true, email: true } }, aiReport: { select: { content: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: Math.min(pageSize, 100),
      }),
    ])
    const formatted = reports.map((r) => ({
      id: r.id,
      userId: r.userId,
      date: r.date.toISOString().split('T')[0],
      workDescription: r.workDescription,
      completedWork: r.completedWork,
      pendingWork: r.pendingWork,
      blockers: r.blockers,
      tomorrowPlan: r.tomorrowPlan,
      tasksCompletedCount: r.tasksCompletedCount,
      crmRecordsUpdatedCount: r.crmRecordsUpdatedCount,
      leadsWorkedOnCount: r.leadsWorkedOnCount,
      filesUploadedCount: r.filesUploadedCount,
      activeWorkingTimeMinutes: r.activeWorkingTimeMinutes,
      status: r.status,
      userName: r.user.name ?? 'Unknown',
      userEmail: r.user.email,
      aiSummary: r.aiReport?.content ?? null,
    }))
    return { reports: formatted, total, page, pageSize, totalPages: Math.ceil(total / Math.max(1, pageSize)) }
  }

  const [total, reports] = await Promise.all([
    prisma.dailyReport.count({ where }),
    prisma.dailyReport.findMany({
      where,
      include: { user: { select: { name: true, email: true } }, aiReport: { select: { content: true } } },
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
    }),
  ])

  const formatted = reports.map((r) => ({
    id: r.id,
    userId: r.userId,
    date: r.date.toISOString().split('T')[0],
    workDescription: r.workDescription,
    completedWork: r.completedWork,
    pendingWork: r.pendingWork,
    blockers: r.blockers,
    tomorrowPlan: r.tomorrowPlan,
    tasksCompletedCount: r.tasksCompletedCount,
    crmRecordsUpdatedCount: r.crmRecordsUpdatedCount,
    leadsWorkedOnCount: r.leadsWorkedOnCount,
    filesUploadedCount: r.filesUploadedCount,
    activeWorkingTimeMinutes: r.activeWorkingTimeMinutes,
    status: r.status,
    userName: r.user.name ?? 'Unknown',
    userEmail: r.user.email,
    aiSummary: r.aiReport?.content ?? null,
  }))

  return { reports: formatted, total, page, pageSize, totalPages: Math.ceil(total / Math.max(1, pageSize)) }
}

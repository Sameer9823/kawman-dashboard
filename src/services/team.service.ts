import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Prisma } from '@/generated/prisma'

export interface TeamDashboardMetrics {
  totalEmployees: number
  onlineEmployees: number
  offlineEmployees: number
  submittedToday: number
  pendingToday: number
  recentActivity: ActivityItem[]
  productivity: ProductivityData[]
}

export interface ActivityItem {
  id: string
  type: string
  description: string
  actorName: string
  actorEmail: string
  createdAt: string
}

export interface ProductivityData {
  date: string
  reportsSubmitted: number
  tasksCompleted: number
  crmRecordsUpdated: number
  leadsWorkedOn: number
  filesUploaded: number
  activeMinutes: number
}

export interface DateRange {
  from: Date
  to: Date
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

export async function getTeamDashboardMetrics(dateRange?: DateRange): Promise<TeamDashboardMetrics> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('team.view') && !(session.user.permissions as string[]).includes('team.view_all')) {
    throw new Error('Forbidden: missing team.view')
  }
  const organizationId = session.user.organizationId

  const canViewAll = (session.user.permissions as string[]).includes('team.view_all')
  const targetUserId = canViewAll ? undefined : session.user.id

  const from = dateRange?.from ?? daysAgo(6)
  const to = dateRange?.to ?? endOfDay()

  const userWhere: Prisma.UserWhereInput = { organizationId, status: 'ACTIVE', ...(targetUserId ? { id: targetUserId } : {}) }
  const users = await prisma.user.findMany({
    where: userWhere,
    select: { id: true, name: true, email: true, lastLoginAt: true },
  })

  const userIds = users.map((u) => u.id)

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  const sessions = userIds.length
    ? await prisma.session.findMany({
        where: { userId: { in: userIds }, lastSeenAt: { gte: fiveMinutesAgo } },
        select: { userId: true },
      })
    : []
  const onlineUserIds = new Set(sessions.map((s) => s.userId))

  const today = startOfDay()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayReports = userIds.length
    ? await prisma.dailyReport.findMany({
        where: { organizationId, userId: { in: userIds }, date: { gte: today, lt: tomorrow } },
        select: { userId: true, status: true },
      })
    : []

  const submittedToday = todayReports.filter((r) => r.status === 'SUBMITTED').length
  const pendingToday = userIds.length - submittedToday

  const recentActivities = userIds.length
    ? await prisma.activity.findMany({
        where: { organizationId, actorId: { in: userIds }, createdAt: { gte: from, lte: to } },
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : []

  const dailyReports = userIds.length
    ? await prisma.dailyReport.findMany({
        where: { organizationId, userId: { in: userIds }, date: { gte: from, lte: to } },
        select: {
          date: true,
          tasksCompletedCount: true,
          crmRecordsUpdatedCount: true,
          leadsWorkedOnCount: true,
          filesUploadedCount: true,
          activeWorkingTimeMinutes: true,
          status: true,
        },
      })
    : []

  const productivityMap = new Map<string, ProductivityData>()
  const daysDiff = Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1
  for (let i = 0; i < daysDiff; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    const key = formatDateKey(d)
    productivityMap.set(key, {
      date: key,
      reportsSubmitted: 0,
      tasksCompleted: 0,
      crmRecordsUpdated: 0,
      leadsWorkedOn: 0,
      filesUploaded: 0,
      activeMinutes: 0,
    })
  }

  for (const report of dailyReports) {
    const key = formatDateKey(report.date)
    const existing = productivityMap.get(key)
    if (existing) {
      existing.reportsSubmitted += report.status === 'SUBMITTED' ? 1 : 0
      existing.tasksCompleted += report.tasksCompletedCount
      existing.crmRecordsUpdated += report.crmRecordsUpdatedCount
      existing.leadsWorkedOn += report.leadsWorkedOnCount
      existing.filesUploaded += report.filesUploadedCount
      existing.activeMinutes += report.activeWorkingTimeMinutes
    }
  }

  const productivity = Array.from(productivityMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalEmployees: users.length,
    onlineEmployees: onlineUserIds.size,
    offlineEmployees: users.length - onlineUserIds.size,
    submittedToday,
    pendingToday,
    recentActivity: recentActivities.map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      actorName: a.actor?.name ?? 'Unknown',
      actorEmail: a.actor?.email ?? '',
      createdAt: a.createdAt.toISOString(),
    })),
    productivity,
  }
}

export type ActivityLevel = 'high' | 'medium' | 'low' | 'none'

export interface TeamMemberRow {
  id: string
  name: string
  email: string
  designation: string | null
  team: string | null
  department: string | null
  status: string
  lastLoginAt: string | null
  isOnline: boolean
  activeTimeToday: string
  hasSubmittedTodayReport: boolean
  activityLevel: ActivityLevel
}

function formatActiveTime(minutes: number): string {
  if (!minutes || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * Activity level thresholds — easy to tune in one place.
 * Derived from today's DailyReport: combined actions = tasksCompletedCount + crmRecordsUpdatedCount + leadsWorkedOnCount
 *   none   -> no DailyReport row for today (no submission yet)
 *   low    -> 0-3 combined actions
 *   medium -> 4-9 combined actions
 *   high   -> >= 10 combined actions
 */
function deriveActivityLevel(report: { tasksCompletedCount: number; crmRecordsUpdatedCount: number; leadsWorkedOnCount: number } | null): ActivityLevel {
  if (!report) return 'none'
  const combined = report.tasksCompletedCount + report.crmRecordsUpdatedCount + report.leadsWorkedOnCount
  if (combined >= 10) return 'high'
  if (combined >= 4) return 'medium'
  return 'low'
}

export async function getTeamMembers(): Promise<TeamMemberRow[]> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('team.view_all')) throw new Error('Forbidden: missing team.view_all')

  const organizationId = session.user.organizationId

  const users = await prisma.user.findMany({
    where: { organizationId, status: 'ACTIVE' },
    include: { team: { select: { name: true } }, department: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })

  if (users.length === 0) return []

  const userIds = users.map((u) => u.id)

  // Online/offline: reuse the same 5-minute threshold as getTeamDashboardMetrics / heartbeat (Session.lastSeenAt)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  const sessions = await prisma.session.findMany({
    where: { userId: { in: userIds }, lastSeenAt: { gte: fiveMinutesAgo } },
    select: { userId: true },
  })
  const onlineUserIds = new Set(sessions.map((s) => s.userId))

  // Today's DailyReports for this org — one query for all members (covers isOnline companion data:
  // active time + submitted flag + activity level without N+1).
  const today = startOfDay()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const todayReports = await prisma.dailyReport.findMany({
    where: { organizationId, userId: { in: userIds }, date: { gte: today, lt: tomorrow } },
    select: { userId: true, activeWorkingTimeMinutes: true, status: true, tasksCompletedCount: true, crmRecordsUpdatedCount: true, leadsWorkedOnCount: true },
  })
  const reportByUserId = new Map(todayReports.map((r) => [r.userId, r]))

  return users.map((u) => {
    const report = reportByUserId.get(u.id) ?? null
    const hasSubmittedTodayReport = report?.status === 'SUBMITTED'
    // Active time comes from today's DailyReport (computed via getTodayReportDraft-style session/activity logic at submit time).
    // If the user hasn't submitted today there is no persisted active time yet, so show placeholder.
    const activeTimeToday = report ? formatActiveTime(report.activeWorkingTimeMinutes) : '—'
    return {
      id: u.id,
      name: u.name ?? 'Unnamed',
      email: u.email,
      designation: u.designation,
      team: u.team?.name ?? null,
      department: u.department?.name ?? null,
      status: u.status,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      isOnline: onlineUserIds.has(u.id),
      activeTimeToday,
      hasSubmittedTodayReport: !!hasSubmittedTodayReport,
      activityLevel: deriveActivityLevel(report ? { tasksCompletedCount: report.tasksCompletedCount, crmRecordsUpdatedCount: report.crmRecordsUpdatedCount, leadsWorkedOnCount: report.leadsWorkedOnCount } : null),
    }
  })
}

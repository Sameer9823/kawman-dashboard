import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { FieldVisit, CheckIn, GeoFence, VisitReport, LiveMapVisit, VisitStatus } from '@/types/field-sales'

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function toNum(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v)
}

/** Haversine distance in meters between two lat/lng points. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// ============================================================
// Field Visits
// ============================================================

type VisitRow = Awaited<ReturnType<typeof fetchVisits>>[number]

async function fetchVisits(organizationId: string, where: Record<string, unknown> = {}) {
  return prisma.fieldVisit.findMany({
    where: { organizationId, ...where },
    include: {
      assignee: { select: { name: true } },
      company: { select: { id: true, name: true } },
      contact: { select: { name: true } },
      deal: { select: { name: true } },
      checkIns: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { scheduledAt: 'desc' },
  })
}

function mapVisit(row: VisitRow): FieldVisit {
  const lastCheckIn = row.checkIns[0]
  return {
    id: row.id,
    title: row.title,
    purpose: row.purpose,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status as VisitStatus,
    latitude: toNum(row.latitude),
    longitude: toNum(row.longitude),
    address: row.address,
    assignee: row.assignee.name ?? 'Unassigned',
    assigneeInitials: initials(row.assignee.name ?? 'U'),
    assigneeId: row.assigneeId,
    company: row.company?.name ?? null,
    companyId: row.companyId,
    contact: row.contact?.name ?? null,
    deal: row.deal?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastCheckIn: lastCheckIn
      ? {
          verificationStatus: lastCheckIn.verificationStatus,
          distanceFromCustomer: toNum(lastCheckIn.distanceFromCustomer),
          createdAt: lastCheckIn.createdAt.toISOString(),
        }
      : null,
  }
}

export async function getFieldVisits(): Promise<FieldVisit[]> {
  const session = await requireApiSession()
  const rows = await fetchVisits(session.user.organizationId)
  return rows.map(mapVisit)
}

export type FieldVisitSortKey = 'scheduledAt' | 'title' | 'createdAt'

export interface FieldVisitQuery {
  search?: string
  status?: VisitStatus
  sortKey?: FieldVisitSortKey
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface FieldVisitPageResult {
  visits: FieldVisit[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const VISIT_SORT_FIELD: Record<FieldVisitSortKey, string> = {
  scheduledAt: 'scheduledAt',
  title: 'title',
  createdAt: 'createdAt',
}

/**
 * Server-side paginated + searched + sorted field-visit listing for the
 * main /field-sales list page — mirrors services/lead.service.ts#getLeadsPage.
 *
 * Kept separate from getFieldVisits()/getTodaysVisits(): the latter backs
 * /field-sales/visits ("Today's Visits"), which is inherently a small,
 * bounded set (one day's schedule) where pagination isn't meaningful —
 * changing its shape would be scope creep for no benefit there.
 */
export async function getFieldVisitsPage(query: FieldVisitQuery = {}): Promise<FieldVisitPageResult> {
  const session = await requireApiSession()
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25))
  const sortKey = query.sortKey ?? 'scheduledAt'
  const sortDir = query.sortDir ?? 'desc'
  const search = query.search?.trim()

  const where = {
    organizationId: session.user.organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { company: { name: { contains: search, mode: 'insensitive' as const } } },
            { assignee: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.fieldVisit.count({ where }),
    prisma.fieldVisit.findMany({
      where,
      include: {
        assignee: { select: { name: true } },
        company: { select: { id: true, name: true } },
        contact: { select: { name: true } },
        deal: { select: { name: true } },
        checkIns: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { [VISIT_SORT_FIELD[sortKey]]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    visits: rows.map(mapVisit),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getTodaysVisits(): Promise<FieldVisit[]> {
  const session = await requireApiSession()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const rows = await fetchVisits(session.user.organizationId, { scheduledAt: { gte: today, lt: tomorrow } })
  return rows.map(mapVisit)
}

export async function getFieldVisitById(id: string): Promise<FieldVisit | null> {
  const session = await requireApiSession()
  const rows = await fetchVisits(session.user.organizationId, { id })
  const row = rows[0]
  return row ? mapVisit(row) : null
}

// ============================================================
// Live map
// ============================================================

/** Visits with coordinates scheduled today or currently in progress — what the live map plots. */
export async function getLiveMapVisits(): Promise<LiveMapVisit[]> {
  const session = await requireApiSession()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const rows = await prisma.fieldVisit.findMany({
    where: {
      organizationId: session.user.organizationId,
      latitude: { not: null },
      longitude: { not: null },
      OR: [{ scheduledAt: { gte: today, lt: tomorrow } }, { status: { in: ['ON_THE_WAY', 'CHECKED_IN', 'IN_MEETING'] } }],
    },
    include: { assignee: { select: { name: true } }, company: { select: { name: true } } },
    orderBy: { scheduledAt: 'asc' },
  })

  return rows
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status as VisitStatus,
      assignee: r.assignee.name ?? 'Unassigned',
      assigneeInitials: initials(r.assignee.name ?? 'U'),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      companyName: r.company?.name ?? null,
      address: r.address,
    }))
}

export async function getActiveGeoFencesForMap(): Promise<GeoFence[]> {
  const session = await requireApiSession()
  const rows = await prisma.geoFence.findMany({
    where: { organizationId: session.user.organizationId, isActive: true },
    include: { company: { select: { name: true } } },
  })
  return rows.map(mapGeoFence)
}

// ============================================================
// Check-ins
// ============================================================

export async function getCheckIns(): Promise<CheckIn[]> {
  const session = await requireApiSession()
  const rows = await prisma.checkIn.findMany({
    where: { visit: { organizationId: session.user.organizationId } },
    include: {
      user: { select: { name: true } },
      visit: { select: { title: true, company: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return rows.map((r) => ({
    id: r.id,
    visitId: r.visitId,
    visitTitle: r.visit.title,
    companyName: r.visit.company?.name ?? null,
    user: r.user.name ?? 'Unknown',
    userInitials: initials(r.user.name ?? 'U'),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    accuracy: toNum(r.accuracy),
    distanceFromCustomer: toNum(r.distanceFromCustomer),
    verificationStatus: r.verificationStatus,
    photoUrl: r.photoUrl,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }))
}

/**
 * Records a check-in against a visit. If the visit's company has an active
 * geofence, computes distance-from-customer and auto-verifies when inside
 * the fence radius (mirrors what a real mobile geofencing flow would do).
 */
export async function createCheckIn(input: {
  visitId: string
  latitude: number
  longitude: number
  accuracy?: number
  notes?: string
}) {
  const session = await requireApiSession()
  const visit = await prisma.fieldVisit.findFirst({
    where: { id: input.visitId, organizationId: session.user.organizationId },
    select: { id: true, companyId: true },
  })
  if (!visit) throw new Error('Visit not found')

  let distanceFromCustomer: number | null = null
  let verificationStatus = 'PENDING'

  if (visit.companyId) {
    const fence = await prisma.geoFence.findFirst({
      where: { organizationId: session.user.organizationId, companyId: visit.companyId, isActive: true },
    })
    if (fence) {
      const d = distanceMeters(input.latitude, input.longitude, Number(fence.latitude), Number(fence.longitude))
      distanceFromCustomer = d
      verificationStatus = d <= fence.radius ? 'VERIFIED' : 'OUT_OF_RANGE'
    }
  }

  const checkIn = await prisma.checkIn.create({
    data: {
      visitId: input.visitId,
      userId: session.user.id,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy ?? null,
      distanceFromCustomer,
      verificationStatus,
      notes: input.notes || null,
    },
  })

  await prisma.fieldVisit.update({
    where: { id: input.visitId },
    data: { status: 'CHECKED_IN', latitude: input.latitude, longitude: input.longitude },
  })

  return { id: checkIn.id, verificationStatus, distanceFromCustomer }
}

// ============================================================
// GeoFences
// ============================================================

type GeoFenceRow = Awaited<ReturnType<typeof prisma.geoFence.findMany>>[number] & {
  company: { name: string } | null
}

function mapGeoFence(row: GeoFenceRow): GeoFence {
  return {
    id: row.id,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radius: row.radius,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function getGeoFences(): Promise<GeoFence[]> {
  const session = await requireApiSession()
  const rows = await prisma.geoFence.findMany({
    where: { organizationId: session.user.organizationId },
    include: { company: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(mapGeoFence)
}

// ============================================================
// Visit Reports
// ============================================================

export async function getVisitReports(): Promise<VisitReport[]> {
  const session = await requireApiSession()
  const rows = await prisma.visitReport.findMany({
    where: { visit: { organizationId: session.user.organizationId } },
    include: {
      visit: { select: { title: true, company: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return rows.map((r) => ({
    id: r.id,
    visitId: r.visitId,
    visitTitle: r.visit.title,
    companyName: r.visit.company?.name ?? null,
    createdBy: r.createdBy.name ?? 'Unknown',
    purpose: r.purpose,
    discussion: r.discussion,
    requirements: r.requirements,
    competitorInfo: r.competitorInfo,
    customerFeedback: r.customerFeedback,
    nextSteps: r.nextSteps,
    createdAt: r.createdAt.toISOString(),
  }))
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMobileSession, assertFieldVisitsPermission, mapVisitForMobile } from '../_utils'

const SCOPES = ['today', 'upcoming', 'all'] as const
type Scope = (typeof SCOPES)[number]

async function fetchVisits(organizationId: string, assigneeId: string, scope: Scope) {
  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  let where: Record<string, unknown> = {
    organizationId,
    assigneeId,
  }

  if (scope === 'today') {
    where.scheduledAt = { gte: today, lt: tomorrow }
  } else if (scope === 'upcoming') {
    where.scheduledAt = { gte: tomorrow }
  }

  return prisma.fieldVisit.findMany({
    where,
    include: {
      company: { select: { name: true } },
      contact: { select: { name: true } },
      checkIns: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { scheduledAt: 'desc' },
  })
}

export async function GET(request: NextRequest) {
  let session
  try {
    session = await requireMobileSession(request)
  } catch (e) {
    return e
  }

  await assertFieldVisitsPermission(session)

  const { searchParams } = new URL(request.url)
  const scope = (searchParams.get('scope') as Scope) ?? 'today'

  if (!SCOPES.includes(scope)) {
    return NextResponse.json({ error: 'Invalid scope. Use today, upcoming, or all.' }, { status: 400 })
  }

  const visits = await fetchVisits(session.user.organizationId, session.user.id, scope)
  const mapped = visits.map((v) => mapVisitForMobile(v as unknown as Record<string, unknown>))

  return NextResponse.json({ visits: mapped })
}

export async function POST(request: NextRequest) {
  let session
  try {
    session = await requireMobileSession(request)
  } catch (e) {
    return e
  }

  await assertFieldVisitsPermission(session)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    title,
    purpose,
    scheduledAt,
    company,
    contactName,
    contactMobile,
    address,
    latitude,
    longitude,
  } = body

  if (!title || typeof title !== 'string' || title.trim().length < 2) {
    return NextResponse.json({ error: 'Title is required (min 2 chars)' }, { status: 400 })
  }
  if (!purpose || typeof purpose !== 'string' || purpose.trim().length < 2) {
    return NextResponse.json({ error: 'Purpose is required (min 2 chars)' }, { status: 400 })
  }
  if (!scheduledAt || typeof scheduledAt !== 'string') {
    return NextResponse.json({ error: 'scheduledAt is required (ISO string)' }, { status: 400 })
  }

  const scheduled = new Date(scheduledAt)
  if (Number.isNaN(scheduled.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduledAt date' }, { status: 400 })
  }

  // Find or create company if provided
  let companyId: string | null = null
  if (company && typeof company === 'string' && company.trim()) {
    const existing = await prisma.company.findFirst({
      where: {
        organizationId: session.user.organizationId,
        name: { equals: company.trim(), mode: 'insensitive' },
      },
      select: { id: true },
    })
    if (existing) {
      companyId = existing.id
    } else {
      const created = await prisma.company.create({
        data: {
          name: company.trim(),
          organizationId: session.user.organizationId,
          ownerId: session.user.id,
        },
      })
      companyId = created.id
    }
  }

  // Find or create contact if provided
  let contactId: string | null = null
  if (contactName && typeof contactName === 'string' && contactName.trim()) {
    const existing = await prisma.contact.findFirst({
      where: {
        organizationId: session.user.organizationId,
        name: { equals: contactName.trim(), mode: 'insensitive' },
        ...(companyId ? { companyId } : {}),
      },
      select: { id: true, mobile: true },
    })
    if (existing) {
      contactId = existing.id
      const updates: Record<string, unknown> = {}
      if (contactMobile && typeof contactMobile === 'string' && contactMobile.trim() && !existing.mobile) {
        updates.mobile = contactMobile.trim()
      }
      if (Object.keys(updates).length > 0) {
        await prisma.contact.update({ where: { id: contactId }, data: updates })
      }
    } else {
      const created = await prisma.contact.create({
        data: {
          name: contactName.trim(),
          organizationId: session.user.organizationId,
          ownerId: session.user.id,
          companyId,
          mobile: contactMobile && typeof contactMobile === 'string' ? contactMobile.trim() : null,
        },
      })
      contactId = created.id
    }
  }

  const visit = await prisma.fieldVisit.create({
    data: {
      title: title.trim(),
      purpose: purpose.trim(),
      scheduledAt: scheduled,
      status: 'SCHEDULED',
      address: address && typeof address === 'string' ? address.trim() : null,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      organizationId: session.user.organizationId,
      assigneeId: session.user.id,
      companyId,
      contactId,
    },
  })

  return NextResponse.json({ id: visit.id })
}
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'
import { findOrCreateCompanyByName } from '@/services/company.service'
import { findOrCreateContactByName } from '@/services/contact.service'

/** My visits (assigned to me), newest schedule first. ?scope=today|upcoming|all */
export async function GET(request: Request) {
  const g = await mobileGuard('field_visits.view')
  if ('error' in g) return g.error
  const { session } = g
  const scope = new URL(request.url).searchParams.get('scope') ?? 'all'

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const when =
    scope === 'today' ? { scheduledAt: { gte: start, lt: end } } :
    scope === 'upcoming' ? { scheduledAt: { gte: start } } : {}

  const rows = await prisma.fieldVisit.findMany({
    where: { organizationId: session.user.organizationId, assigneeId: session.user.id, ...when },
    include: {
      company: { select: { name: true } },
      contact: { select: { name: true } },
      checkIns: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, photoUrl: true } },
    },
    orderBy: { scheduledAt: scope === 'upcoming' ? 'asc' : 'desc' },
    take: 100,
  })

  return NextResponse.json({
    visits: rows.map((r) => ({
      id: r.id,
      title: r.title,
      purpose: r.purpose,
      status: r.status,
      scheduledAt: r.scheduledAt.toISOString(),
      address: r.address,
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
      company: r.company?.name ?? null,
      contact: r.contact?.name ?? null,
      lastCheckInAt: r.checkIns[0]?.createdAt.toISOString() ?? null,
    })),
  })
}

const createSchema = z.object({
  title: z.string().trim().min(2),
  purpose: z.string().trim().min(2),
  scheduledAt: z.string().trim().min(1),
  company: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal('')),
  contactMobile: z.string().trim().optional(),
  address: z.string().trim().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

export async function POST(request: Request) {
  const g = await mobileGuard('field_visits.create', { key: 'mobile-visit-create', max: 30, windowSec: 60 })
  if ('error' in g) return g.error
  const { session } = g

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message
    return badRequest('Invalid visit', fe)
  }
  const d = parsed.data
  const scheduledAt = new Date(d.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime())) return badRequest('Invalid date', { scheduledAt: 'Enter a valid date/time' })

  // The mobile app always creates visits for the signed-in rep.
  const assigneeId = session.user.id

  const company = d.company
    ? await findOrCreateCompanyByName({ name: d.company, organizationId: session.user.organizationId, ownerId: assigneeId })
    : null
  const contact = d.contactName
    ? await findOrCreateContactByName({
        name: d.contactName,
        email: d.contactEmail || null,
        mobile: d.contactMobile || null,
        organizationId: session.user.organizationId,
        ownerId: assigneeId,
        companyId: company?.id ?? null,
      })
    : null

  const visit = await prisma.fieldVisit.create({
    data: {
      title: d.title,
      purpose: d.purpose,
      scheduledAt,
      status: 'SCHEDULED',
      address: d.address || null,
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      organizationId: session.user.organizationId,
      assigneeId,
      companyId: company?.id ?? null,
      contactId: contact?.id ?? null,
    },
    select: { id: true },
  })
  return NextResponse.json({ id: visit.id }, { status: 201 })
}

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
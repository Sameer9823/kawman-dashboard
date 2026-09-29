import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMobileSession, assertFieldVisitsPermission } from '../../../_utils'

const VALID_STATUSES = ['SCHEDULED', 'ON_THE_WAY', 'CHECKED_IN', 'IN_MEETING', 'COMPLETED', 'CANCELLED'] as const
type VisitStatus = (typeof VALID_STATUSES)[number]

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session
  try {
    session = await requireMobileSession(request)
  } catch (e) {
    return e
  }

  await assertFieldVisitsPermission(session)

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status } = body

  if (!status || typeof status !== 'string' || !VALID_STATUSES.includes(status as VisitStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const existing = await prisma.fieldVisit.findUnique({
    where: { id },
    select: { id: true, organizationId: true, assigneeId: true },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  }

  if (existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (existing.assigneeId !== session.user.id) {
    return NextResponse.json({ error: 'You are not assigned to this visit' }, { status: 403 })
  }

  await prisma.fieldVisit.update({
    where: { id },
    data: { status: status as VisitStatus },
  })

  return NextResponse.json({ ok: true })
}
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'

const schema = z.object({
  status: z.enum(['SCHEDULED', 'ON_THE_WAY', 'CHECKED_IN', 'IN_MEETING', 'COMPLETED', 'CANCELLED']),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('field_visits.update')
  if ('error' in g) return g.error
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return badRequest('Invalid status')

  const existing = await prisma.fieldVisit.findFirst({
    where: { id, organizationId: g.session.user.organizationId, assigneeId: g.session.user.id },
  })
  if (!existing) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  await prisma.fieldVisit.update({
    where: { id },
    data: {
      status: parsed.data.status,
      completedAt: parsed.data.status === 'COMPLETED' ? new Date() : existing.completedAt,
    },
  })
  return NextResponse.json({ ok: true })
}

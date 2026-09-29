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
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMobileSession, assertFieldVisitsPermission } from '../../../_utils'

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

  const { latitude, longitude, accuracy, mocked, notes, photoUrl } = body

  if (mocked === true) {
    return NextResponse.json({ error: 'Mocked locations are not permitted' }, { status: 400 })
  }

  if (latitude == null) {
    return NextResponse.json({ error: 'latitude is required' }, { status: 400 })
  }
  if (longitude == null) {
    return NextResponse.json({ error: 'longitude is required' }, { status: 400 })
  }

  const lat = Number(latitude)
  const lng = Number(longitude)
  if (Number.isNaN(lat)) {
    return NextResponse.json({ error: 'latitude must be a number' }, { status: 400 })
  }
  if (Number.isNaN(lng)) {
    return NextResponse.json({ error: 'longitude must be a number' }, { status: 400 })
  }

  // Verify visit ownership
  const visit = await prisma.fieldVisit.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      assigneeId: true,
    },
  })

  if (!visit) {
    return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  }
  if (visit.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (visit.assigneeId !== session.user.id) {
    return NextResponse.json({ error: 'You are not assigned to this visit' }, { status: 403 })
  }

  const checkIn = await prisma.checkIn.create({
    data: {
      visitId: id,
      userId: session.user.id,
      latitude: lat,
      longitude: lng,
      accuracy: accuracy != null ? Number(accuracy) : null,
      distanceFromCustomer: null,
      verificationStatus: 'VERIFIED',
      photoUrl: typeof photoUrl === 'string' && photoUrl.trim() ? photoUrl.trim() : null,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    },
  })

  // Update visit status to CHECKED_IN (matching web app behavior)
  await prisma.fieldVisit.update({
    where: { id },
    data: { status: 'CHECKED_IN', latitude: lat, longitude: lng },
  })

  return NextResponse.json({ ok: true, checkInId: checkIn.id })
}
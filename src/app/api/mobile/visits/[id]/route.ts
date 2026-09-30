import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { mobileGuard } from '@/lib/mobile-api'
import { mapVisitRow } from '../route'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('field_visits.view')
  if ('error' in g) return g.error
  const { session } = g

  const row = await prisma.fieldVisit.findFirst({
    where: { id, organizationId: session.user.organizationId, assigneeId: session.user.id },
    include: {
      company: { select: { name: true } },
      contact: { select: { name: true } },
      checkIns: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, photoUrl: true } },
    },
  })
  if (!row) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  return NextResponse.json({ visit: mapVisitRow(row) })
}

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
      contact: { select: { name: true, mobile: true, phone: true } },
      checkIns: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, createdAt: true, verificationStatus: true, photoUrl: true, accuracy: true } },
      visitReports: { where: { createdById: session.user.id }, orderBy: { createdAt: 'desc' }, select: { id: true, purpose: true, createdAt: true } },
      _count: { select: { visitReports: { where: { createdById: session.user.id } } } },
    },
  })
  if (!row) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  return NextResponse.json({
    visit: {
      ...mapVisitRow(row),
      checkIns: row.checkIns.map((c) => ({
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        verificationStatus: c.verificationStatus,
        accuracy: c.accuracy != null ? Number(c.accuracy) : null,
        photoUrl: c.photoUrl ?? null,
      })),
      reports: row.visitReports.map((r) => ({
        id: r.id,
        purpose: r.purpose,
        createdAt: r.createdAt.toISOString(),
      })),
    },
  })
}

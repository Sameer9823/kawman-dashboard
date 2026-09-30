import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { mobileGuard } from '@/lib/mobile-api'

/**
 * All field reports written for a visit, newest first. Only the caller's own
 * reports are returned (each report is authored by whoever wrote it). Returns
 * 404 unless the visit is assigned to the caller's organization.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('field_visits.view')
  if ('error' in g) return g.error
  const { session } = g

  const visit = await prisma.fieldVisit.findFirst({
    where: { id, organizationId: session.user.organizationId, assigneeId: session.user.id },
    select: { id: true },
  })
  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  const reports = await prisma.visitReport.findMany({
    where: { visitId: id, createdById: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      purpose: true,
      discussion: true,
      requirements: true,
      competitorInfo: true,
      customerFeedback: true,
      nextSteps: true,
      createdAt: true,
    },
  })
  return NextResponse.json({
    reports: reports.map((r) => ({
      id: r.id,
      purpose: r.purpose,
      discussion: r.discussion,
      requirements: r.requirements,
      competitorInfo: r.competitorInfo,
      customerFeedback: r.customerFeedback,
      nextSteps: r.nextSteps,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMobileSession, assertFieldVisitsPermission } from '../../../_utils'

function startOfDayLocal(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

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

  const { purpose, discussion, nextSteps, requirements, competitorInfo, customerFeedback } = body

  if (!purpose || typeof purpose !== 'string' || purpose.trim().length < 2) {
    return NextResponse.json({ error: 'Purpose is required (min 2 chars)' }, { status: 400 })
  }
  if (!discussion || typeof discussion !== 'string' || discussion.trim().length < 10) {
    return NextResponse.json({ error: 'Discussion is required (min 10 chars)' }, { status: 400 })
  }
  if (!nextSteps || typeof nextSteps !== 'string' || nextSteps.trim().length < 3) {
    return NextResponse.json({ error: 'Next steps is required (min 3 chars)' }, { status: 400 })
  }

  // Verify visit ownership
  const visit = await prisma.fieldVisit.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      assigneeId: true,
      status: true,
      title: true,
      company: { select: { name: true } },
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

  const report = await prisma.$transaction(async (tx) => {
    // Create the visit report
    const visitReport = await tx.visitReport.create({
      data: {
        visitId: id,
        purpose: purpose.trim(),
        discussion: discussion.trim(),
        requirements: typeof requirements === 'string' && requirements.trim()
          ? requirements.trim()
          : null,
        competitorInfo: typeof competitorInfo === 'string' && competitorInfo.trim()
          ? competitorInfo.trim()
          : null,
        customerFeedback: typeof customerFeedback === 'string' && customerFeedback.trim()
          ? customerFeedback.trim()
          : null,
        nextSteps: nextSteps.trim(),
        createdById: session.user.id,
      },
    })

    // Link to today's DailyReport — create or append (matches web app behavior)
    const today = startOfDayLocal(new Date())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const fieldSnippet = [
      `Field Visit: ${visit.title}${visit.company?.name ? ` — ${visit.company.name}` : ''}`,
      `Purpose: ${purpose.trim()}`,
      `Discussion: ${discussion.trim()}`,
      typeof requirements === 'string' && requirements.trim()
        ? `Requirements: ${requirements.trim()}`
        : null,
      typeof competitorInfo === 'string' && competitorInfo.trim()
        ? `Competitor: ${competitorInfo.trim()}`
        : null,
      typeof customerFeedback === 'string' && customerFeedback.trim()
        ? `Feedback: ${customerFeedback.trim()}`
        : null,
      `Next: ${nextSteps.trim()}`,
    ]
      .filter(Boolean)
      .join('\n')

    const existingDaily = await tx.dailyReport.findFirst({
      where: {
        organizationId: session.user.organizationId,
        userId: session.user.id,
        date: { gte: today, lt: tomorrow },
      },
    })

    let dailyReportId = existingDaily?.id ?? null

    if (!existingDaily) {
      const created = await tx.dailyReport.create({
        data: {
          organizationId: session.user.organizationId,
          userId: session.user.id,
          date: today,
          status: 'DRAFT',
          workDescription: fieldSnippet,
          completedWork: `Field report — ${visit.title}: ${discussion.trim().slice(0, 600)}`,
          pendingWork: nextSteps.trim() || null,
        },
      })
      dailyReportId = created.id
    } else if (existingDaily.status === 'DRAFT') {
      const appendedWork = existingDaily.workDescription
        ? `${existingDaily.workDescription}\n\n---\n${fieldSnippet}`
        : fieldSnippet
      const appendedCompleted = existingDaily.completedWork
        ? `${existingDaily.completedWork}\n• ${visit.title}: ${discussion.trim().slice(0, 400)}`
        : `Field report — ${visit.title}: ${discussion.trim().slice(0, 600)}`
      const nextPending = existingDaily.pendingWork || nextSteps.trim() || null
      const updated = await tx.dailyReport.update({
        where: { id: existingDaily.id },
        data: {
          workDescription: appendedWork.slice(0, 8000),
          completedWork: appendedCompleted.slice(0, 8000),
          pendingWork: nextPending?.slice(0, 5000) ?? null,
        },
      })
      dailyReportId = updated.id
    }

    return { reportId: visitReport.id, dailyReportId: dailyReportId ?? undefined }
  })

  return NextResponse.json({
    success: true,
    reportId: report.reportId,
    dailyReportId: report.dailyReportId,
  })
}
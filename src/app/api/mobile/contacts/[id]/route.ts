import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { mobileGuard } from '@/lib/mobile-api'

/**
 * Contact detail for the mobile app. Only a contact the caller owns (in their
 * own organization) is returned; anything else is 404 (not 403) so we never
 * leak the existence of another rep's contacts.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('contacts.view')
  if ('error' in g) return g.error
  const { session } = g

  const contact = await prisma.contact.findFirst({
    where: { id, organizationId: session.user.organizationId, ownerId: session.user.id },
    include: {
      company: { select: { id: true, name: true } },
      visits: {
        where: { assigneeId: session.user.id, organizationId: session.user.organizationId },
        orderBy: { scheduledAt: 'desc' },
        take: 5,
        select: { id: true, title: true, scheduledAt: true, status: true },
      },
    },
  })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      designation: contact.designation,
      email: contact.email,
      phone: contact.phone,
      mobile: contact.mobile,
      address: contact.address,
      segment: contact.segment,
      status: contact.status,
      createdAt: contact.createdAt.toISOString(),
      company: contact.company ? { id: contact.company.id, name: contact.company.name } : null,
      recentVisits: contact.visits.map((v) => ({
        id: v.id,
        title: v.title,
        scheduledAt: v.scheduledAt.toISOString(),
        status: v.status,
      })),
    },
  })
}

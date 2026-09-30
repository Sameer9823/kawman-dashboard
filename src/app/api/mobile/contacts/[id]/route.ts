import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'
import { logAudit } from '@/lib/audit-log'
import { buildContactEmailKey, duplicateContactEmailMessage } from '@/lib/contact-dedupe'
import { findOrCreateCompanyByName } from '@/services/company.service'

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

// Same field rules + "-"-as-empty normalisation as the POST /contacts route.
const dash = (v: unknown) => (typeof v === 'string' && v.trim() === '-' ? '' : v)
const opt = z.preprocess(dash, z.string().trim().optional())
const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  company: opt, designation: opt, phone: opt, mobile: opt, address: opt,
  email: z.preprocess(dash, z.string().trim().email().optional().or(z.literal(''))),
})

/**
 * PATCH /contacts/[id] — the rep edited a scanned/owned contact. Owner-only:
 * a contact you don't own is 404 (never leaks another rep's data). Same "-"
 * normalisation as POST, duplicate-email guard (409, excluding self), and an
 * Activity + audit trail like the create route.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('contacts.update')
  if ('error' in g) return g.error
  const { session } = g

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message
    return badRequest('Invalid contact', fe)
  }
  const d = parsed.data
  const orgId = session.user.organizationId

  // Owner-only: a contact you don't own (or in another org) is 404.
  const existing = await prisma.contact.findFirst({
    where: { id, organizationId: orgId, ownerId: session.user.id },
    select: { id: true, emailKey: true },
  })
  if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const company = d.company
    ? await findOrCreateCompanyByName({ name: d.company, organizationId: orgId, ownerId: session.user.id })
    : null

  const email = d.email || null
  const emailKey = buildContactEmailKey(email)
  // Only collision-check when the email actually changed; re-saving the same
  // email must never 409 against itself.
  if (emailKey && emailKey !== existing.emailKey) {
    const dup = await prisma.contact.findFirst({
      where: { organizationId: orgId, emailKey, NOT: { id } },
      select: { name: true },
    })
    if (dup) return NextResponse.json({ error: duplicateContactEmailMessage(dup.name) }, { status: 409 })
  }

  const updated = await prisma.contact.update({
    where: { id },
    data: {
      name: d.name,
      designation: d.designation || null,
      email,
      phone: d.phone || null,
      mobile: d.mobile || null,
      address: d.address || null,
      companyId: company?.id ?? null,
      emailKey,
    },
    select: { id: true, name: true },
  })

  await prisma.activity.create({
    data: {
      type: 'CONTACT_UPDATED',
      description: `${session.user.name} updated contact "${updated.name}" via Kawman Field app`,
      organizationId: orgId,
      actorId: session.user.id,
      contactId: updated.id,
      companyId: company?.id ?? null,
    },
  })
  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'Contact',
    resourceId: updated.id,
    metadata: { name: updated.name, companyId: company?.id ?? null, source: 'mobile' },
  })

  return NextResponse.json({ id: updated.id })
}

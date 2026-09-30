import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { logAudit } from '@/lib/audit-log'
import { mobileGuard, badRequest } from '@/lib/mobile-api'
import { buildContactEmailKey, duplicateContactEmailMessage } from '@/lib/contact-dedupe'
import { findOrCreateCompanyByName } from '@/services/company.service'
import type { Prisma } from '@/generated/prisma'

/**
 * Saves a business-card contact AFTER the rep has reviewed/edited the OCR
 * result in the app. The scan itself uses the existing POST /api/contacts/scan.
 * Mirrors scanAndCreateContactAction in src/app/contacts/actions.ts.
 */
const dash = (v: unknown) => (typeof v === 'string' && v.trim() === '-' ? '' : v)
const opt = z.preprocess(dash, z.string().trim().optional())
const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  company: opt, designation: opt, phone: opt, mobile: opt, address: opt,
  email: z.preprocess(dash, z.string().trim().email().optional().or(z.literal(''))),
})

export async function POST(request: Request) {
  const g = await mobileGuard('contacts.create', { key: 'mobile-contact', max: 30, windowSec: 60 })
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

  const company = d.company
    ? await findOrCreateCompanyByName({ name: d.company, organizationId: orgId, ownerId: session.user.id })
    : null

  const email = d.email || null
  const emailKey = buildContactEmailKey(email)
  if (emailKey) {
    const dup = await prisma.contact.findFirst({
      where: { organizationId: orgId, emailKey },
      select: { name: true },
    })
    if (dup) return NextResponse.json({ error: duplicateContactEmailMessage(dup.name) }, { status: 409 })
  }

  const contact = await prisma.contact.create({
    data: {
      name: d.name,
      designation: d.designation || null,
      email,
      phone: d.phone || null,
      mobile: d.mobile || null,
      address: d.address || null,
      companyId: company?.id ?? null,
      organizationId: orgId,
      ownerId: session.user.id,
      lastActivityAt: new Date(),
      emailKey,
    },
    select: { id: true, name: true },
  })

  await prisma.activity.create({
    data: {
      type: 'CONTACT_CREATED',
      description: `${session.user.name} added contact "${contact.name}" via Kawman Field app (business card scan)`,
      organizationId: orgId,
      actorId: session.user.id,
      contactId: contact.id,
      companyId: company?.id ?? null,
    },
  })
  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Contact',
    resourceId: contact.id,
    metadata: { name: contact.name, companyId: company?.id ?? null, source: 'mobile_business_card_scan' },
  })

  return NextResponse.json({ id: contact.id }, { status: 201 })
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64')
}

function decodeCursor(token: string | null): { createdAt: string; id: string } | null {
  if (!token) return null
  try {
    const p = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    if (typeof p?.createdAt === 'string' && typeof p?.id === 'string') return p
  } catch {
    return null
  }
  return null
}

/**
 * GET /api/mobile/contacts — "My cards": contacts owned by the caller within
 * their organization. Search is case-insensitive and trims/truncates to 100
 * chars. Cursor pagination on (createdAt desc, id desc) so two rows sharing a
 * createdAt still order deterministically.
 */
export async function GET(request: Request) {
  const g = await mobileGuard('contacts.view')
  if ('error' in g) return g.error
  const { session } = g

  const url = new URL(request.url)
  const search = (url.searchParams.get('search') ?? '').trim().slice(0, 100)
  let limit = parseInt(url.searchParams.get('limit') ?? '20', 10)
  if (!Number.isFinite(limit) || limit < 1) limit = 20
  if (limit > 50) limit = 50

  const cursor = decodeCursor(url.searchParams.get('cursor'))

  const or: Prisma.ContactWhereInput[] = []
  if (search) {
    or.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { mobile: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { name: { contains: search, mode: 'insensitive' } } },
      ],
    })
  }
  if (cursor) {
    const curDate = new Date(cursor.createdAt)
    or.push({
      OR: [
        { createdAt: { lt: curDate } },
        { AND: [{ createdAt: { equals: curDate } }, { id: { lt: cursor.id } }] },
      ],
    })
  }

  const rows = await prisma.contact.findMany({
    where: {
      organizationId: session.user.organizationId,
      ownerId: session.user.id,
      OR: or.length ? or : undefined,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      name: true,
      designation: true,
      email: true,
      mobile: true,
      phone: true,
      company: { select: { name: true } },
      createdAt: true,
    },
  })

  const hasMore = rows.length > limit
  const contacts = rows.slice(0, limit)
  const nextCursor = hasMore
    ? encodeCursor(contacts[contacts.length - 1].createdAt, contacts[contacts.length - 1].id)
    : null

  return NextResponse.json({
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      designation: c.designation ?? null,
      company: c.company?.name ?? null,
      mobile: c.mobile,
      phone: c.phone,
      email: c.email,
      createdAt: c.createdAt.toISOString(),
    })),
    nextCursor,
  })
}

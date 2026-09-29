import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMobileSession, assertContactsPermission } from '../_utils'
import { buildContactEmailKey, duplicateContactEmailMessage } from '@/lib/contact-dedupe'

export async function POST(request: NextRequest) {
  let session
  try {
    session = await requireMobileSession(request)
  } catch (e) {
    return e
  }

  await assertContactsPermission(session)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, company, designation, email, phone, mobile, address } = body

  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const trimmedName = name.trim()
  const organizationId = session.user.organizationId
  const ownerId = session.user.id

  // Find or create company if provided
  let companyId: string | null = null
  if (company && typeof company === 'string' && company.trim()) {
    const companyName = company.trim()
    const existingCompany = await prisma.company.findFirst({
      where: {
        organizationId,
        name: { equals: companyName, mode: 'insensitive' },
      },
      select: { id: true },
    })

    if (existingCompany) {
      companyId = existingCompany.id
    } else {
      const createdCompany = await prisma.company.create({
        data: {
          name: companyName,
          organizationId,
          ownerId,
        },
      })
      companyId = createdCompany.id
    }
  }

  // Check for duplicate email
  const emailKey = email && typeof email === 'string' ? buildContactEmailKey(email.trim()) : null
  if (emailKey) {
    const duplicate = await prisma.contact.findFirst({
      where: {
        organizationId,
        emailKey,
      },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: duplicateContactEmailMessage(typeof email === 'string' ? email : '') },
        { status: 409 }
      )
    }
  }

  const contact = await prisma.contact.create({
    data: {
      name: trimmedName,
      companyId,
      designation: designation && typeof designation === 'string' ? designation.trim() : null,
      email: email && typeof email === 'string' ? email.trim() : null,
      emailKey,
      phone: phone && typeof phone === 'string' ? phone.trim() : null,
      mobile: mobile && typeof mobile === 'string' ? mobile.trim() : null,
      address: address && typeof address === 'string' ? address.trim() : null,
      organizationId,
      ownerId,
      segment: 'FIELD_SALES',
    },
  })

  return NextResponse.json({ id: contact.id })
}
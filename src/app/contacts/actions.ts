'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { logAudit } from '@/lib/audit-log'
import { findOrCreateCompanyByName } from '@/services/company.service'

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  company: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  mobile: z.string().trim().optional(),
  ownerId: z.string().trim().optional(),
})

// Helper to normalize phone numbers
function normalizePhone(num: string | null | undefined): string | null {
  return num?.replace(/[\s\-\(\)\+]/g, '') || null
}

// Helper to check for duplicate contact fields
async function checkDuplicateContact(
  organizationId: string,
  email: string | null,
  phone: string | null,
  mobile: string | null,
  excludeId?: string
) {
  const normPhone = normalizePhone(phone)
  const normMobile = normalizePhone(mobile)

  if (normPhone && normMobile && normPhone === normMobile) {
    return 'Phone and mobile numbers are identical.'
  }

  const existingContacts = await prisma.contact.findMany({
    where: {
      organizationId,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      OR: [
        ...(email ? [{ email }] : []),
        ...(normPhone ? [{ phone: normPhone }] : []),
        ...(normMobile ? [{ mobile: normMobile }] : []),
      ],
    },
    select: { id: true, name: true, email: true, phone: true, mobile: true },
  })

  if (existingContacts.length > 0) {
    const duplicateFields: string[] = []
    for (const existing of existingContacts) {
      if (email && existing.email === email) duplicateFields.push('email')
      if (normPhone && existing.phone === normPhone) duplicateFields.push('phone')
      if (normMobile && existing.mobile === normMobile) duplicateFields.push('mobile')
    }
    const uniqueDuplicates = [...new Set(duplicateFields)]
    return `Contact already exists with same ${uniqueDuplicates.join(', ')}: ${existingContacts.map(c => c.name).join(', ')}`
  }
  return null
}

export interface ContactFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
  createdId?: string
}

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

export async function createContactAction(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['contacts.create'].name)
  const parsed = contactSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const company = data.company?.trim()
    ? await findOrCreateCompanyByName({
        name: data.company.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || session.user.id,
      })
    : null
  const companyId = company?.id ?? null

  const email = data.email || null
  const phone = data.phone || null
  const mobile = data.mobile || null

  const duplicateError = await checkDuplicateContact(session.user.organizationId, email, phone, mobile)
  if (duplicateError) {
    return { error: duplicateError }
  }

  const normPhone = normalizePhone(phone)
  const normMobile = normalizePhone(mobile)

  const contact = await prisma.contact.create({
    data: {
      name: data.name,
      designation: data.designation || null,
      email,
      phone: normPhone,
      mobile: normMobile,
      companyId,
      organizationId: session.user.organizationId,
      ownerId: data.ownerId || session.user.id,
      lastActivityAt: new Date(),
    },
  })
  await prisma.activity.create({
    data: {
      type: 'CONTACT_CREATED',
      description: `${session.user.name} added contact "${contact.name}"`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      contactId: contact.id,
      companyId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Contact',
    resourceId: contact.id,
    metadata: { name: contact.name, companyId },
  })

  revalidatePath('/contacts')
  return { success: true, createdId: contact.id }
}

export async function updateContactAction(
  id: string,
  _prev: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['contacts.update'].name)
  const parsed = contactSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const existing = await prisma.contact.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Contact not found.' }

  const company = data.company?.trim()
    ? await findOrCreateCompanyByName({
        name: data.company.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || existing.ownerId,
      })
    : null
  // If the field was submitted empty, clear the link; if omitted, keep existing.
  const rawCompany = formData.get('company')
  const companyId = rawCompany !== null ? (company?.id ?? null) : existing.companyId

  const email = data.email || null
  const phone = data.phone || null
  const mobile = data.mobile || null

  const duplicateError = await checkDuplicateContact(session.user.organizationId, email, phone, mobile, id)
  if (duplicateError) {
    return { error: duplicateError }
  }

  const normPhone = normalizePhone(phone)
  const normMobile = normalizePhone(mobile)

  await prisma.contact.update({
    where: { id },
    data: {
      name: data.name,
      designation: data.designation || null,
      email,
      phone: normPhone,
      mobile: normMobile,
      companyId,
      ownerId: data.ownerId || existing.ownerId,
      lastActivityAt: new Date(),
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'Contact',
    resourceId: id,
    metadata: { name: data.name, changes: Object.keys(data) },
  })

  revalidatePath('/contacts')
  revalidatePath(`/contacts/${id}`)
  return { success: true }
}

export async function deleteContactAction(id: string): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['contacts.delete'].name)
  const existing = await prisma.contact.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Contact not found.' }
  await prisma.contact.delete({ where: { id } })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'DELETE',
    resource: 'Contact',
    resourceId: id,
    metadata: { name: existing.name },
  })

  revalidatePath('/contacts')
  return { success: true }
}

interface ScannedContactData {
  name: string
  company: string
  designation: string
  phone: string
  mobile: string
  email: string
  website: string
  address: string
}

export async function scanAndCreateContactAction(scanned: ScannedContactData): Promise<{ success?: boolean; error?: string; createdId?: string }> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(PERMISSIONS['contacts.create'].name)) {
    throw new Error('You do not have permission to do this.')
  }

  const name = scanned.name !== '-' ? scanned.name : ''
  if (name.length < 2) {
    return { error: 'Unable to detect a valid name from the business card.' }
  }

  const companyName = scanned.company !== '-' ? scanned.company : undefined
  const company = companyName
    ? await findOrCreateCompanyByName({
        name: companyName,
        organizationId: session.user.organizationId,
        ownerId: session.user.id,
      })
    : null
  const companyId = company?.id ?? null

  const email = scanned.email !== '-' ? scanned.email : null
  const phone = scanned.phone !== '-' ? scanned.phone : null
  const mobile = scanned.mobile !== '-' ? scanned.mobile : null

  // Normalize phone numbers for comparison (remove spaces, dashes, etc.)
  const normalizePhone = (num: string | null) => num?.replace(/[\s\-\(\)\+]/g, '') || null
  const normPhone = normalizePhone(phone)
  const normMobile = normalizePhone(mobile)

  // Check if phone and mobile are the same number
  if (normPhone && normMobile && normPhone === normMobile) {
    return { error: 'Phone and mobile numbers are identical. Cannot create duplicate contact.' }
  }

  // Check for existing contacts with same unique fields in this organization
  const existingContacts = await prisma.contact.findMany({
    where: {
      organizationId: session.user.organizationId,
      OR: [
        ...(email ? [{ email }] : []),
        ...(normPhone ? [{ phone: normPhone }] : []),
        ...(normMobile ? [{ mobile: normMobile }] : []),
      ],
    },
    select: { id: true, name: true, email: true, phone: true, mobile: true },
  })

  if (existingContacts.length > 0) {
    const duplicateFields: string[] = []
    for (const existing of existingContacts) {
      if (email && existing.email === email) duplicateFields.push('email')
      if (normPhone && existing.phone === normPhone) duplicateFields.push('phone')
      if (normMobile && existing.mobile === normMobile) duplicateFields.push('mobile')
    }
    const uniqueDuplicates = [...new Set(duplicateFields)]
    return { error: `Contact already exists with same ${uniqueDuplicates.join(', ')}: ${existingContacts.map(c => c.name).join(', ')}` }
  }

  const contact = await prisma.contact.create({
    data: {
      name,
      designation: scanned.designation !== '-' ? scanned.designation : null,
      email,
      phone: normPhone,
      mobile: normMobile,
      companyId,
      organizationId: session.user.organizationId,
      ownerId: session.user.id,
      lastActivityAt: new Date(),
    },
  })

  await prisma.activity.create({
    data: {
      type: 'CONTACT_CREATED',
      description: `${session.user.name} added contact "${contact.name}" via business card scan`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      contactId: contact.id,
      companyId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Contact',
    resourceId: contact.id,
    metadata: { name: contact.name, companyId, source: 'business_card_scan' },
  })

  revalidatePath('/contacts')
  return { success: true, createdId: contact.id }
}

export async function bulkDeleteContactsAction(ids: string[]): Promise<{ success?: boolean; error?: string; deleted?: number }> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(PERMISSIONS['contacts.delete'].name)) {
    throw new Error('You do not have permission to do this.')
  }

  if (!ids || ids.length === 0) {
    return { error: 'No contacts selected.' }
  }

  const result = await prisma.contact.deleteMany({
    where: {
      id: { in: ids },
      organizationId: session.user.organizationId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'DELETE',
    resource: 'Contact',
    metadata: { count: result.count, ids },
  })

  revalidatePath('/contacts')
  return { success: true, deleted: result.count }
}

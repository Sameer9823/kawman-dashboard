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

  const contact = await prisma.contact.create({
    data: {
      name: data.name,
      designation: data.designation || null,
      email: data.email || null,
      phone: data.phone || null,
      mobile: data.mobile || null,
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

  await prisma.contact.update({
    where: { id },
    data: {
      name: data.name,
      designation: data.designation || null,
      email: data.email || null,
      phone: data.phone || null,
      mobile: data.mobile || null,
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

  const contact = await prisma.contact.create({
    data: {
      name,
      designation: scanned.designation !== '-' ? scanned.designation : null,
      email: scanned.email !== '-' ? scanned.email : null,
      phone: scanned.phone !== '-' ? scanned.phone : null,
      mobile: scanned.mobile !== '-' ? scanned.mobile : null,
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

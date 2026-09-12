'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { logAudit } from '@/lib/audit-log'

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  companyId: z.string().trim().min(1, 'Company is required'),
  designation: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  mobile: z.string().trim().optional(),
  ownerId: z.string().trim().optional(),
})

export interface ContactFormState {
  error?: string
  fieldErrors?: Record<string, string>
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

  const company = await prisma.company.findFirst({
    where: { id: data.companyId, organizationId: session.user.organizationId },
  })
  if (!company) return { fieldErrors: { companyId: 'Select a valid company' } }

  const contact = await prisma.contact.create({
    data: {
      name: data.name,
      designation: data.designation || null,
      email: data.email || null,
      phone: data.phone || null,
      mobile: data.mobile || null,
      companyId: data.companyId,
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
      companyId: company.id,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Contact',
    resourceId: contact.id,
    metadata: { name: contact.name, companyId: contact.companyId },
  })

  revalidatePath('/contacts')
  redirect('/contacts')
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

  const company = await prisma.company.findFirst({
    where: { id: data.companyId, organizationId: session.user.organizationId },
  })
  if (!company) return { fieldErrors: { companyId: 'Select a valid company' } }

  await prisma.contact.update({
    where: { id },
    data: {
      name: data.name,
      designation: data.designation || null,
      email: data.email || null,
      phone: data.phone || null,
      mobile: data.mobile || null,
      companyId: data.companyId,
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
  return {}
}

export async function deleteContactAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['contacts.delete'].name)
  const existing = await prisma.contact.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return
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
}

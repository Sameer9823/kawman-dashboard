'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { createCheckIn as createCheckInRow } from '@/services/field-visit.service'

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

// ============================================================
// Field Visits
// ============================================================

const visitSchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  purpose: z.string().trim().min(2, 'Purpose is required'),
  scheduledAt: z.string().trim().min(1, 'Date/time is required'),
  companyId: z.string().trim().optional(),
  contactId: z.string().trim().optional(),
  assigneeId: z.string().trim().optional(),
  address: z.string().trim().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
})

export interface VisitFormState {
  error?: string
  fieldErrors?: Record<string, string>
}

export async function createFieldVisitAction(_prev: VisitFormState, formData: FormData): Promise<VisitFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.create'].name)
  const parsed = visitSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const scheduledAt = new Date(data.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime())) {
    return { fieldErrors: { scheduledAt: 'Enter a valid date/time' } }
  }

  await prisma.fieldVisit.create({
    data: {
      title: data.title,
      purpose: data.purpose,
      scheduledAt,
      status: 'SCHEDULED',
      address: data.address || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      organizationId: session.user.organizationId,
      assigneeId: data.assigneeId || session.user.id,
      companyId: data.companyId || null,
      contactId: data.contactId || null,
    },
  })

  revalidatePath('/field-sales')
  revalidatePath('/field-sales/visits')
  revalidatePath('/field-sales/live-map')
  redirect('/field-sales')
}

const VISIT_STATUSES = ['SCHEDULED', 'ON_THE_WAY', 'CHECKED_IN', 'IN_MEETING', 'COMPLETED', 'CANCELLED'] as const

export async function updateVisitStatusAction(visitId: string, status: (typeof VISIT_STATUSES)[number]): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.update'].name)
  if (!VISIT_STATUSES.includes(status)) throw new Error('Invalid status')
  const existing = await prisma.fieldVisit.findFirst({ where: { id: visitId, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.fieldVisit.update({
    where: { id: visitId },
    data: { status, completedAt: status === 'COMPLETED' ? new Date() : existing.completedAt },
  })
  revalidatePath('/field-sales')
  revalidatePath('/field-sales/visits')
  revalidatePath('/field-sales/live-map')
}

// ============================================================
// Check-ins
// ============================================================

export interface CheckInState {
  error?: string
  success?: boolean
  verificationStatus?: string
}

export async function checkInAction(
  visitId: string,
  coords: { latitude: number; longitude: number; accuracy?: number }
): Promise<CheckInState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['field_visits.update'].name)
    const result = await createCheckInRow({ visitId, ...coords })
    revalidatePath('/field-sales')
    revalidatePath('/field-sales/visits')
    revalidatePath('/field-sales/checkins')
    revalidatePath('/field-sales/live-map')
    return { success: true, verificationStatus: result.verificationStatus }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Check-in failed' }
  }
}

// ============================================================
// GeoFences
// ============================================================

const geoFenceSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(10, 'Radius must be at least 10m').max(50000),
  companyId: z.string().trim().optional(),
})

export interface GeoFenceFormState {
  error?: string
  fieldErrors?: Record<string, string>
}

export async function createGeoFenceAction(_prev: GeoFenceFormState, formData: FormData): Promise<GeoFenceFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.create'].name)
  const parsed = geoFenceSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data
  await prisma.geoFence.create({
    data: {
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      radius: data.radius,
      companyId: data.companyId || null,
      organizationId: session.user.organizationId,
    },
  })
  revalidatePath('/field-sales/geofencing')
  revalidatePath('/field-sales/live-map')
  return {}
}

export async function toggleGeoFenceAction(id: string, isActive: boolean): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.update'].name)
  const existing = await prisma.geoFence.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.geoFence.update({ where: { id }, data: { isActive } })
  revalidatePath('/field-sales/geofencing')
  revalidatePath('/field-sales/live-map')
}

export async function deleteGeoFenceAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.update'].name)
  const existing = await prisma.geoFence.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.geoFence.delete({ where: { id } })
  revalidatePath('/field-sales/geofencing')
  revalidatePath('/field-sales/live-map')
}

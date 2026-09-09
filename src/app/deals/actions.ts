'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { logAudit } from '@/lib/audit-log'

const STAGES = ['NEW_LEAD', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const

const dealSchema = z.object({
  name: z.string().trim().min(2, 'Deal name is required'),
  companyId: z.string().trim().min(1, 'Company is required'),
  contactId: z.string().trim().optional(),
  value: z.coerce.number().min(0, 'Value must be positive'),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  stage: z.enum(STAGES).optional(),
  expectedClose: z.string().trim().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  ownerId: z.string().trim().optional(),
})

export interface DealFormState {
  error?: string
  fieldErrors?: Record<string, string>
}

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!session.user.permissions.includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

export async function createDealAction(_prev: DealFormState, formData: FormData): Promise<DealFormState> {
  const session = await assertPermission(PERMISSIONS['deals.create'].name)
  const parsed = dealSchema.safeParse(Object.fromEntries(formData))
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

  const deal = await prisma.deal.create({
    data: {
      name: data.name,
      value: data.value,
      probability: data.probability ?? 20,
      stage: data.stage ?? 'NEW_LEAD',
      expectedClose: data.expectedClose ? new Date(data.expectedClose) : null,
      priority: data.priority ?? 'MEDIUM',
      companyId: data.companyId,
      contactId: data.contactId || null,
      organizationId: session.user.organizationId,
      ownerId: data.ownerId || session.user.id,
    },
  })
  await prisma.activity.create({
    data: {
      type: 'DEAL_CREATED',
      description: `${session.user.name} created deal "${deal.name}"`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      dealId: deal.id,
      companyId: company.id,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Deal',
    resourceId: deal.id,
    metadata: { name: deal.name, value: deal.value, stage: deal.stage },
  })

  revalidatePath('/deals')
  revalidatePath('/dashboard')
  redirect('/deals')
}

export async function updateDealAction(id: string, _prev: DealFormState, formData: FormData): Promise<DealFormState> {
  const session = await assertPermission(PERMISSIONS['deals.update'].name)
  const parsed = dealSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const existing = await prisma.deal.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Deal not found.' }

  const company = await prisma.company.findFirst({
    where: { id: data.companyId, organizationId: session.user.organizationId },
  })
  if (!company) return { fieldErrors: { companyId: 'Select a valid company' } }

  const notes = formData.get('notes')

  await prisma.deal.update({
    where: { id },
    data: {
      name: data.name,
      value: data.value,
      probability: data.probability ?? existing.probability,
      stage: data.stage ?? existing.stage,
      expectedClose: data.expectedClose ? new Date(data.expectedClose) : null,
      priority: data.priority ?? existing.priority,
      companyId: data.companyId,
      contactId: data.contactId || null,
      ownerId: data.ownerId || existing.ownerId,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : existing.notes,
      closedAt: data.stage === 'WON' || data.stage === 'LOST' ? (existing.closedAt ?? new Date()) : null,
    },
  })

  if (data.stage && data.stage !== existing.stage) {
    await prisma.activity.create({
      data: {
        type: 'DEAL_UPDATED',
        description: `${session.user.name} moved "${existing.name}" to ${data.stage.replace('_', ' ')}`,
        organizationId: session.user.organizationId,
        actorId: session.user.id,
        dealId: id,
      },
    })
  }

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'Deal',
    resourceId: id,
    metadata: { name: data.name, changes: Object.keys(data) },
  })

  revalidatePath('/deals')
  revalidatePath(`/deals/${id}`)
  revalidatePath('/dashboard')
  return {}
}

/** Called from the kanban board on drag-and-drop — updates just the stage. */
export async function updateDealStageAction(dealId: string, stage: (typeof STAGES)[number]): Promise<void> {
  const session = await assertPermission(PERMISSIONS['deals.update'].name)
  const deal = await prisma.deal.findFirst({ where: { id: dealId, organizationId: session.user.organizationId } })
  if (!deal || deal.stage === stage) return

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage,
      closedAt: stage === 'WON' || stage === 'LOST' ? new Date() : null,
    },
  })
  await prisma.activity.create({
    data: {
      type: 'DEAL_UPDATED',
      description: `${session.user.name} moved "${deal.name}" to ${stage.replace('_', ' ')}`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      dealId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'Deal',
    resourceId: dealId,
    metadata: { name: deal.name, stage, previousStage: deal.stage },
  })

  revalidatePath('/deals')
  revalidatePath('/dashboard')
}

export async function deleteDealAction(id: string): Promise<void> {
  const session = await assertPermission(PERMISSIONS['deals.delete'].name)
  const existing = await prisma.deal.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.deal.delete({ where: { id } })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'DELETE',
    resource: 'Deal',
    resourceId: id,
    metadata: { name: existing.name },
  })

  revalidatePath('/deals')
  revalidatePath('/dashboard')
}

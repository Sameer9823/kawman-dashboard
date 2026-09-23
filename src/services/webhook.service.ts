import 'server-only'
import { prisma } from '@/lib/db'
import { queueWebhook } from '@/services/queue.service'

/**
 * Webhook Service
 * 
 * Triggers webhook deliveries for various events.
 * Finds active webhook integrations and queues deliveries.
 */

export interface WebhookEventPayload {
  event: string
  data: Record<string, unknown>
  organizationId: string
}

/**
 * Trigger webhooks for a specific event
 */
export async function triggerWebhooks(payload: WebhookEventPayload): Promise<void> {
  const { event, data, organizationId } = payload

  // Find active webhook integrations for this organization
  const integrations = await prisma.integration.findMany({
    where: {
      organizationId,
      type: 'webhook',
      isActive: true,
    },
  })

  if (integrations.length === 0) {
    return // No active webhook integrations
  }

  // Queue webhook delivery for each integration
  for (const integration of integrations) {
    const config = integration.config as Record<string, unknown>
    const url = config.url as string
    const secret = config.secret as string | undefined

    if (!url) continue

    await queueWebhook({
      url,
      event,
      payload: data,
      secret,
      organizationId,
      integrationId: integration.id,
    })
  }
}

/**
 * Trigger webhooks for lead events
 */
export async function triggerLeadWebhooks(
  organizationId: string,
  event: 'lead.created' | 'lead.updated' | 'lead.deleted',
  leadData: Record<string, unknown>
): Promise<void> {
  await triggerWebhooks({
    event,
    data: leadData,
    organizationId,
  })
}

/**
 * Trigger webhooks for deal events
 */
export async function triggerDealWebhooks(
  organizationId: string,
  event: 'deal.created' | 'deal.updated' | 'deal.deleted' | 'deal.stage_changed',
  dealData: Record<string, unknown>
): Promise<void> {
  await triggerWebhooks({
    event,
    data: dealData,
    organizationId,
  })
}

/**
 * Trigger webhooks for meeting events
 */
export async function triggerMeetingWebhooks(
  organizationId: string,
  event: 'meeting.created' | 'meeting.updated' | 'meeting.deleted' | 'meeting.reminder',
  meetingData: Record<string, unknown>
): Promise<void> {
  await triggerWebhooks({
    event,
    data: meetingData,
    organizationId,
  })
}

/**
 * Trigger webhooks for contact events
 */
export async function triggerContactWebhooks(
  organizationId: string,
  event: 'contact.created' | 'contact.updated' | 'contact.deleted',
  contactData: Record<string, unknown>
): Promise<void> {
  await triggerWebhooks({
    event,
    data: contactData,
    organizationId,
  })
}

/**
 * Trigger webhooks for company events
 */
export async function triggerCompanyWebhooks(
  organizationId: string,
  event: 'company.created' | 'company.updated' | 'company.deleted',
  companyData: Record<string, unknown>
): Promise<void> {
  await triggerWebhooks({
    event,
    data: companyData,
    organizationId,
  })
}

/**
 * Trigger webhooks for field visit events
 */
export async function triggerFieldVisitWebhooks(
  organizationId: string,
  event: 'visit.created' | 'visit.updated' | 'visit.deleted' | 'visit.check_in' | 'visit.check_out',
  visitData: Record<string, unknown>
): Promise<void> {
  await triggerWebhooks({
    event,
    data: visitData,
    organizationId,
  })
}

/**
 * Trigger webhooks for file events
 */
export async function triggerFileWebhooks(
  organizationId: string,
  event: 'file.uploaded' | 'file.shared' | 'file.deleted',
  fileData: Record<string, unknown>
): Promise<void> {
  await triggerWebhooks({
    event,
    data: fileData,
    organizationId,
  })
}

/**
 * Trigger webhooks for AI report events
 */
export async function triggerAIReportWebhooks(
  organizationId: string,
  event: 'ai_report.generated' | 'ai_report.failed',
  reportData: Record<string, unknown>
): Promise<void> {
  await triggerWebhooks({
    event,
    data: reportData,
    organizationId,
  })
}
import 'server-only'
import { createWorker, QUEUE_NAMES } from '@/lib/queue'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

/**
 * Webhook Worker
 * 
 * Delivers webhooks to external endpoints with:
 * - HMAC-SHA256 signature verification
 * - Exponential backoff retry
 * - Delivery logging
 */

export interface WebhookJobData {
  url: string
  event: string
  payload: Record<string, unknown>
  secret?: string
  organizationId: string
  integrationId: string
  metadata?: Record<string, unknown>
}

export interface WebhookDeliveryResult {
  success: boolean
  statusCode?: number
  responseBody?: string
  error?: string
  deliveredAt: Date
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Deliver webhook to endpoint
 */
async function deliverWebhook(data: WebhookJobData): Promise<WebhookDeliveryResult> {
  const { url, event, payload, secret } = data

  const body = JSON.stringify({
    event,
    data: payload,
    timestamp: new Date().toISOString(),
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Kawman-ExAct-Webhook/1.0',
    'X-Webhook-Event': event,
  }

  // Add signature if secret is provided
  if (secret) {
    const signature = generateSignature(body, secret)
    headers['X-Webhook-Signature'] = signature
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    })

    const responseBody = await response.text().catch(() => '')

    return {
      success: response.ok,
      statusCode: response.status,
      responseBody: responseBody.slice(0, 1000), // Limit response body size
      deliveredAt: new Date(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      deliveredAt: new Date(),
    }
  }
}

/**
 * Log webhook delivery to database
 */
async function logWebhookDelivery(
  integrationId: string,
  event: string,
  url: string,
  payload: Record<string, unknown>,
  result: WebhookDeliveryResult,
  attempt: number
): Promise<void> {
  try {
    await prisma.webhookDelivery.create({
      data: {
        integrationId,
        event,
        url,
        payload: JSON.parse(JSON.stringify(payload)),
        responseStatus: result.statusCode,
        responseBody: result.responseBody,
        error: result.error,
        success: result.success,
        attempt,
      },
    })
  } catch (error) {
    console.error('[WEBHOOK_WORKER] Failed to log webhook delivery:', error)
  }
}

export function startWebhookWorker() {
  return createWorker<WebhookJobData>(
    QUEUE_NAMES.WEBHOOK,
    async (job) => {
      const { data, id, attemptsMade } = job
      const { url, event, organizationId, integrationId } = data

      console.log(`[WEBHOOK_WORKER] Delivering webhook to ${url} (event: ${event})`)

      const result = await deliverWebhook(data)

      // Log delivery to database
      await logWebhookDelivery(integrationId, event, url, data.payload, result, (attemptsMade ?? 0) + 1)

      if (!result.success) {
        console.error(
          `[WEBHOOK_WORKER] Failed to deliver webhook to ${url}:`,
          result.error || `HTTP ${result.statusCode}`
        )
        throw new Error(
          `Webhook delivery failed: ${result.error || `HTTP ${result.statusCode}`}`
        )
      }

      console.log(
        `[WEBHOOK_WORKER] Successfully delivered webhook to ${url} (status: ${result.statusCode})`
      )
    },
    { concurrency: 5 } // Lower concurrency to avoid overwhelming external endpoints
  )
}

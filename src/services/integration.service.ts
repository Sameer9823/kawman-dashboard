import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

export interface IntegrationItem {
  id: string
  name: string
  type: string
  isActive: boolean
  configSummary: string
  createdAt: string
}

const CONFIG_TYPES = [
  { type: 'webhook', label: 'Webhook', description: 'Send events to an external URL on lead/deal/meeting changes.' },
  { type: 'slack', label: 'Slack', description: 'Post notifications to a Slack channel via an incoming webhook.' },
  { type: 'calendar', label: 'Calendar sync', description: 'Sync meetings and field visits to an external calendar feed.' },
  { type: 'email', label: 'Email forwarding', description: 'Forward specific notification types to an external inbox.' },
] as const

export function getIntegrationTypes() {
  return CONFIG_TYPES
}

/** Summarizes config for display without dumping the full (potentially sensitive) JSON blob into the list view. */
function summarize(config: unknown): string {
  if (config && typeof config === 'object') {
    const obj = config as Record<string, unknown>
    if (typeof obj.url === 'string') return obj.url
    if (typeof obj.channel === 'string') return `#${obj.channel}`
    if (typeof obj.email === 'string') return obj.email
  }
  return 'Configured'
}

export async function getIntegrations(): Promise<IntegrationItem[]> {
  const session = await requireApiSession()
  const rows = await prisma.integration.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    isActive: r.isActive,
    configSummary: summarize(r.config),
    createdAt: r.createdAt.toISOString(),
  }))
}

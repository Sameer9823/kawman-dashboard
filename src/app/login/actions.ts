'use server'

import { requireApiSession } from '@/lib/session'
import { logAudit } from '@/lib/audit-log'

/** Called client-side right after a successful signIn.email() to record a real audit trail entry. */
export async function logLoginAction(): Promise<void> {
  const session = await requireApiSession()
  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'LOGIN',
    resource: 'session',
  })
}

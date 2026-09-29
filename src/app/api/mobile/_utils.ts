import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export interface MobileSession {
  user: {
    id: string
    name: string
    email: string
    roles: string[]
    permissions: string[]
    organizationId: string
  }
  session: unknown
  organizationId: string
}

export async function requireMobileSession(
  request: NextRequest
): Promise<MobileSession> {
  const result = await auth.api.getSession({ headers: request.headers })

  if (!result || !result.user) {
    throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = result.user as Record<string, unknown>
  const permissions = Array.isArray(user.permissions)
    ? user.permissions.map(String)
    : typeof user.permissions === 'string'
      ? user.permissions.split(',').map((p) => p.trim()).filter(Boolean)
      : []

  const roles = Array.isArray(user.roles)
    ? user.roles.map(String)
    : typeof user.roles === 'string'
      ? [user.roles]
      : []

  const organizationId = (user.organizationId as string) ?? ''

  return {
    user: {
      id: result.user.id,
      name: result.user.name ?? '',
      email: result.user.email ?? '',
      roles,
      permissions,
      organizationId,
    },
    session: result.session,
    organizationId,
  }
}

export async function assertFieldVisitsPermission(session: MobileSession): Promise<void> {
  const perms = session.user.permissions
  if (!perms.includes('field_visits.create') && !perms.includes('field_visits.update')) {
    throw NextResponse.json({ error: 'Forbidden: requires field_visits.create or field_visits.update' }, { status: 403 })
  }
}

export async function assertContactsPermission(session: MobileSession): Promise<void> {
  if (
    !session.user.permissions.includes('contacts.create') &&
    !session.user.permissions.includes('contacts.update')
  ) {
    throw NextResponse.json({ error: 'Forbidden: requires contacts permissions' }, { status: 403 })
  }
}

export interface MappedVisit {
  id: string
  title: string
  purpose: string
  status: string
  scheduledAt: string
  address: string | null
  latitude: number | null
  longitude: number | null
  company: string | null
  contact: string | null
  lastCheckInAt: string | null
}

function toNum(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v)
}

export function mapVisitForMobile(visit: Record<string, unknown>): MappedVisit {
  const scheduled = visit.scheduledAt as Date | string | undefined
  const company = visit.company as { name?: string } | null | undefined
  const contact = visit.contact as { name?: string } | null | undefined
  const checkIns = visit.checkIns as Array<{ createdAt?: Date | string }> | undefined
  const lastCheckIn = checkIns && checkIns.length > 0 ? checkIns[0] : undefined

  return {
    id: visit.id as string,
    title: visit.title as string,
    purpose: visit.purpose as string,
    status: visit.status as string,
    scheduledAt: scheduled ? (scheduled instanceof Date ? scheduled.toISOString() : new Date(scheduled).toISOString()) : '',
    address: (visit.address as string | null) ?? null,
    latitude: toNum(visit.latitude),
    longitude: toNum(visit.longitude),
    company: company?.name ?? null,
    contact: contact?.name ?? null,
    lastCheckInAt: lastCheckIn?.createdAt ? new Date(lastCheckIn.createdAt).toISOString() : null,
  }
}

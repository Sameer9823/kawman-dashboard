import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

export interface UserOption {
  id: string
  name: string
}

export async function getOrgUserOptions(): Promise<UserOption[]> {
  const session = await requireApiSession()
  const users = await prisma.user.findMany({
    where: { organizationId: session.user.organizationId, status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  return users.map((u) => ({ id: u.id, name: u.name ?? 'Unnamed user' }))
}

export interface AdminUserRow {
  id: string
  name: string
  email: string
  status: string
  designation: string | null
  phone: string | null
  role: string | null
  department: string | null
  team: string | null
  lastLoginAt: string | null
  createdAt: string
}

/** Full org user roster for the admin panel — requires users.view. */
export async function getOrgUsers(): Promise<AdminUserRow[]> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('users.view')) throw new Error('Forbidden')

  const users = await prisma.user.findMany({
    where: { organizationId: session.user.organizationId },
    include: {
      department: { select: { name: true } },
      team: { select: { name: true } },
      roles: { include: { role: true }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  })

  return users.map((u) => ({
    id: u.id,
    name: u.name ?? 'Unnamed user',
    email: u.email,
    status: u.status,
    designation: u.designation,
    phone: u.phone,
    role: u.roles[0]?.role.name ?? null,
    department: u.department?.name ?? null,
    team: u.team?.name ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }))
}

export async function getOrgUserById(id: string): Promise<AdminUserRow | null> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('users.view')) throw new Error('Forbidden')

  const u = await prisma.user.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: {
      department: { select: { name: true } },
      team: { select: { name: true } },
      roles: { include: { role: true }, take: 1 },
    },
  })
  if (!u) return null

  return {
    id: u.id,
    name: u.name ?? 'Unnamed user',
    email: u.email,
    status: u.status,
    designation: u.designation,
    phone: u.phone,
    role: u.roles[0]?.role.name ?? null,
    department: u.department?.name ?? null,
    team: u.team?.name ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }
}

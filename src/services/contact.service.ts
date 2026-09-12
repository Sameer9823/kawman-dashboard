import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Contact } from '@/types/crm'
import { getRecordScope } from '@/lib/record-scope'
import type { Session } from '@/lib/auth'
import type { Prisma } from '@/generated/prisma'

/** See lib/record-scope.ts — the base "contacts.view" permission only
 * gates page access, not which rows come back. This adds that filter. */
function scopeWhere(user: Session['user']): Prisma.ContactWhereInput {
  const scope = getRecordScope(user)
  if (scope === 'ALL') return {}
  if (scope === 'DEPARTMENT' && user.department?.id) {
    return { owner: { departmentId: user.department.id } }
  }
  return { ownerId: user.id }
}

function toInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

type ContactRow = Awaited<ReturnType<typeof fetchContacts>>[number]

async function fetchContacts(organizationId: string, scopeFilter: Prisma.ContactWhereInput) {
  return prisma.contact.findMany({
    where: { organizationId, ...scopeFilter },
    include: { owner: { select: { name: true } }, company: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    company: row.company?.name ?? '—',
    designation: row.designation ?? '—',
    email: row.email ?? '',
    phone: row.phone ?? row.mobile ?? '',
    owner: row.owner.name ?? 'Unassigned',
    ownerInitials: toInitials(row.owner.name ?? 'U'),
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    lastActivityAt: (row.lastActivityAt ?? row.createdAt).toISOString(),
  }
}

export async function getContacts(): Promise<Contact[]> {
  const session = await requireApiSession()
  const rows = await fetchContacts(session.user.organizationId, scopeWhere(session.user))
  return rows.map(mapContact)
}

export type ContactSortKey = 'name' | 'lastActivityAt' | 'createdAt'

export interface ContactQuery {
  search?: string
  status?: 'ACTIVE' | 'INACTIVE'
  sortKey?: ContactSortKey
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface ContactPage {
  contacts: Contact[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const CONTACT_SORT_FIELD: Record<ContactSortKey, string> = {
  name: 'name',
  lastActivityAt: 'lastActivityAt',
  createdAt: 'createdAt',
}

/**
 * Server-side paginated + searched + sorted contact listing — mirrors
 * services/lead.service.ts#getLeadsPage. Replaces the client-side-filter
 * pattern in contacts-table.tsx.
 */
export async function getContactsPage(query: ContactQuery = {}): Promise<ContactPage> {
  const session = await requireApiSession()
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25))
  const sortKey = query.sortKey ?? 'createdAt'
  const sortDir = query.sortDir ?? 'desc'
  const search = query.search?.trim()

  const where: Prisma.ContactWhereInput = {
    organizationId: session.user.organizationId,
    ...scopeWhere(session.user),
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { company: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      include: { owner: { select: { name: true } }, company: { select: { name: true } } },
      orderBy: { [CONTACT_SORT_FIELD[sortKey]]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    contacts: rows.map(mapContact),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** Lightweight list for form <select> pickers (create deal/meeting). Scoped to caller's visibility. */
export async function getContactOptions(): Promise<{ id: string; name: string; companyId: string | null }[]> {
  const session = await requireApiSession()
  return prisma.contact.findMany({
    where: { organizationId: session.user.organizationId, ...scopeWhere(session.user) },
    select: { id: true, name: true, companyId: true },
    orderBy: { name: 'asc' },
  })
}

export interface ContactDetail extends Contact {
  ownerId: string
  companyId: string | null
  mobile: string
}

/** Full record for the contact detail page, org- and scope-restricted. Returns null if not found, not in this org, or outside the caller's visibility scope. */
export async function getContactById(id: string): Promise<ContactDetail | null> {
  const session = await requireApiSession()
  const row = await prisma.contact.findFirst({
    where: { id, organizationId: session.user.organizationId, ...scopeWhere(session.user) },
    include: { owner: { select: { name: true } }, company: { select: { name: true } } },
  })
  if (!row) return null
  return { ...mapContact(row), ownerId: row.ownerId, companyId: row.companyId, mobile: row.mobile ?? '' }
}
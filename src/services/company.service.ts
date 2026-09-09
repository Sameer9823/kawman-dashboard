import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Company } from '@/types/crm'

function toInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

type CompanyRow = Awaited<ReturnType<typeof fetchCompanies>>[number]

async function fetchCompanies(organizationId: string) {
  return prisma.company.findMany({
    where: { organizationId },
    include: { owner: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry ?? '—',
    website: row.website ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    employees: row.employees ?? 0,
    revenue: row.revenue ? Number(row.revenue) : 0,
    owner: row.owner.name ?? 'Unassigned',
    ownerInitials: toInitials(row.owner.name ?? 'U'),
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    createdAt: row.createdAt.toISOString(),
  }
}

export async function getCompanies(): Promise<Company[]> {
  const session = await requireApiSession()
  const rows = await fetchCompanies(session.user.organizationId)
  return rows.map(mapCompany)
}

export type CompanySortKey = 'name' | 'employees' | 'revenue' | 'createdAt'

export interface CompanyQuery {
  search?: string
  status?: 'ACTIVE' | 'INACTIVE'
  sortKey?: CompanySortKey
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface CompanyPage {
  companies: Company[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const COMPANY_SORT_FIELD: Record<CompanySortKey, string> = {
  name: 'name',
  employees: 'employees',
  revenue: 'revenue',
  createdAt: 'createdAt',
}

/**
 * Server-side paginated + searched + sorted company listing — replaces
 * the fetch-everything-then-filter-in-the-browser pattern in
 * companies-table.tsx, which doesn't scale past a few hundred rows.
 * Mirrors services/lead.service.ts#getLeadsPage exactly.
 */
export async function getCompaniesPage(query: CompanyQuery = {}): Promise<CompanyPage> {
  const session = await requireApiSession()
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25))
  const sortKey = query.sortKey ?? 'createdAt'
  const sortDir = query.sortDir ?? 'desc'
  const search = query.search?.trim()

  const where = {
    organizationId: session.user.organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { city: { contains: search, mode: 'insensitive' as const } },
            { industry: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      include: { owner: { select: { name: true } } },
      orderBy: { [COMPANY_SORT_FIELD[sortKey]]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    companies: rows.map(mapCompany),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** Lightweight list for form <select> pickers (create lead/contact/deal). */
export async function getCompanyOptions(): Promise<{ id: string; name: string }[]> {
  const session = await requireApiSession()
  return prisma.company.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

export interface CompanyDetail extends Company {
  ownerId: string
}

/** Full record for the company detail page, org-scoped. Returns null if not found or not in this org. */
export async function getCompanyById(id: string): Promise<CompanyDetail | null> {
  const session = await requireApiSession()
  const row = await prisma.company.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: { owner: { select: { name: true } } },
  })
  if (!row) return null
  return { ...mapCompany(row), ownerId: row.ownerId }
}

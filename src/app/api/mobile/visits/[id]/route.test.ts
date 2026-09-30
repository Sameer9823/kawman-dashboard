import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/mobile-api', () => ({
  mobileGuard: vi.fn(),
  badRequest: vi.fn((error: string, fieldErrors?: Record<string, string>) =>
    NextResponse.json({ error, fieldErrors }, { status: 400 }),
  ),
  isTrustedCloudinaryImage: vi.fn(() => true),
}))

vi.mock('@/lib/db', () => ({
  prisma: { fieldVisit: { findMany: vi.fn(), findFirst: vi.fn() } },
}))

vi.mock('@/services/company.service', () => ({
  findOrCreateCompanyByName: vi.fn(),
}))
vi.mock('@/services/contact.service', () => ({
  findOrCreateContactByName: vi.fn(),
}))

import { mobileGuard } from '@/lib/mobile-api'
import { prisma } from '@/lib/db'

const mockMobileGuard = vi.mocked(mobileGuard)
const mockFindFirst = vi.mocked(prisma.fieldVisit.findFirst)

const mockSession = {
  user: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    organizationId: 'org-A',
    permissions: ['field_visits.view'],
  },
}

const mockRow = {
  id: 'v1',
  title: 'Site visit at Acme',
  purpose: 'Discuss Q4 pricing',
  status: 'SCHEDULED',
  scheduledAt: new Date('2026-01-15T10:00:00.000Z'),
  address: '123 Main St',
  latitude: 12.34,
  longitude: 56.78,
  company: { name: 'Acme Corp' },
  contact: { name: 'Jane Smith' },
  checkIns: [{ createdAt: new Date('2026-01-15T11:00:00.000Z'), photoUrl: 'https://example.com/photo.jpg' }],
  visitReports: [],
}

const req = (id: string) => new Request(`http://localhost/api/mobile/visits/${id}`)
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mockMobileGuard.mockResolvedValue({ session: mockSession as never })
})

describe('GET /api/mobile/visits/[id] (B3)', () => {
  it('returns 200 and the visit shape for a visit owned by the user', async () => {
    mockFindFirst.mockResolvedValue(mockRow as never)
    const { GET } = await import('@/app/api/mobile/visits/[id]/route')
    const res = await GET(req('v1'), ctx('v1'))
    expect(res.status).toBe(200)
    const data: { visit: { [k: string]: unknown } } = await res.json()
    const v = data.visit
    expect(v.id).toBe('v1')
    expect(v.title).toBe('Site visit at Acme')
    expect(v.company).toBe('Acme Corp')
    expect(v.contact).toBe('Jane Smith')
    expect(v.scheduledAt).toBe('2026-01-15T10:00:00.000Z')
    expect(v.lastCheckInAt).toBe('2026-01-15T11:00:00.000Z')
    expect(v.latitude).toBe(12.34)
    expect(v.longitude).toBe(56.78)
  })

  it('scopes the query to the user org + assignee', async () => {
    mockFindFirst.mockResolvedValue(mockRow as never)
    const { GET } = await import('@/app/api/mobile/visits/[id]/route')
    await GET(req('v1'), ctx('v1'))
    const args = mockFindFirst.mock.calls[0][0] as { where: { id: string; organizationId: string; assigneeId: string }; include: object }
    expect(args.where).toMatchObject({ id: 'v1', organizationId: 'org-A', assigneeId: 'user-1' })
    expect(args.include).toMatchObject({ company: { select: { name: true } }, contact: { select: { name: true } } })
  })

  it('returns 404 for someone else\'s visit (scoped out)', async () => {
    mockFindFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/mobile/visits/[id]/route')
    const res = await GET(req('v1'), ctx('v1'))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Visit not found')
  })

  it('returns 404 for an unknown id', async () => {
    mockFindFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/mobile/visits/[id]/route')
    const res = await GET(req('does-not-exist'), ctx('does-not-exist'))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Visit not found')
  })

  it('returns 401 when unauthenticated', async () => {
    mockMobileGuard.mockResolvedValue({ error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) } as never)
    const { GET } = await import('@/app/api/mobile/visits/[id]/route')
    const res = await GET(req('v1'), ctx('v1'))
    expect(res.status).toBe(401)
    expect(mockFindFirst).not.toHaveBeenCalled()
  })
})

const b2Row = {
  id: 'v1',
  title: 'Site visit at Acme',
  purpose: 'Discuss Q4 pricing',
  status: 'CHECKED_IN',
  scheduledAt: new Date('2026-01-15T10:00:00.000Z'),
  address: '123 Main St',
  latitude: 12.34,
  longitude: 56.78,
  company: { name: 'Acme Corp' },
  contact: { name: 'Jane Smith', mobile: '98765', phone: '12345' },
  checkIns: [
    { id: 'c2', createdAt: new Date('2026-01-15T12:00:00.000Z'), verificationStatus: 'VERIFIED', accuracy: 5.2, photoUrl: 'https://x/p2.jpg' },
    { id: 'c1', createdAt: new Date('2026-01-15T11:00:00.000Z'), verificationStatus: 'PENDING', accuracy: null, photoUrl: null },
  ],
  visitReports: [
    { id: 'r2', purpose: 'Follow-up', createdAt: new Date('2026-01-15T13:00:00.000Z') },
    { id: 'r1', purpose: 'Initial', createdAt: new Date('2026-01-15T09:00:00.000Z') },
  ],
  _count: { visitReports: 2 },
}

describe('GET /api/mobile/visits/[id] (B2: latest 10 check-ins + caller reports)', () => {
  it('returns mapped check-ins, caller reports, contactPhone and reportCount', async () => {
    mockFindFirst.mockResolvedValue(b2Row as never)
    const { GET } = await import('@/app/api/mobile/visits/[id]/route')
    const res = await GET(req('v1'), ctx('v1'))
    expect(res.status).toBe(200)
    const { visit } = await res.json() as { visit: { checkIns: any[]; reports: any[]; contactPhone: string | null; reportCount: number } }
    expect(visit.contactPhone).toBe('98765')
    expect(visit.reportCount).toBe(2)
    expect(visit.checkIns).toHaveLength(2)
    expect(visit.checkIns[0]).toEqual({
      id: 'c2', createdAt: '2026-01-15T12:00:00.000Z', verificationStatus: 'VERIFIED', accuracy: 5.2, photoUrl: 'https://x/p2.jpg',
    })
    expect(visit.checkIns[1]).toEqual({
      id: 'c1', createdAt: '2026-01-15T11:00:00.000Z', verificationStatus: 'PENDING', accuracy: null, photoUrl: null,
    })
    expect(visit.reports).toHaveLength(2)
    expect(visit.reports[0]).toEqual({ id: 'r2', purpose: 'Follow-up', createdAt: '2026-01-15T13:00:00.000Z' })
  })

  it('scopes check-ins, reports, and reportCount to the caller', async () => {
    mockFindFirst.mockResolvedValue(b2Row as never)
    const { GET } = await import('@/app/api/mobile/visits/[id]/route')
    await GET(req('v1'), ctx('v1'))
    const args = mockFindFirst.mock.calls[0][0] as {
      include: {
        checkIns: { take: number }
        visitReports: { where: { createdById: string } }
        _count: { select: { visitReports: { where: { createdById: string } } } }
      }
    }
    expect(args.include.checkIns.take).toBe(10)
    expect(args.include.visitReports.where.createdById).toBe('user-1')
    expect(args.include._count.select.visitReports.where.createdById).toBe('user-1')
  })

  it('returns 403 when the user lacks field_visits.view', async () => {
    mockMobileGuard.mockReset()
    mockMobileGuard.mockResolvedValue({ error: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }) } as never)
    const { GET } = await import('@/app/api/mobile/visits/[id]/route')
    const res = await GET(req('v1'), ctx('v1'))
    expect(res.status).toBe(403)
    expect(mockFindFirst).not.toHaveBeenCalled()
  })
})

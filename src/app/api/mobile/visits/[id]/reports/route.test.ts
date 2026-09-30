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
  prisma: {
    fieldVisit: { findFirst: vi.fn() },
    visitReport: { findMany: vi.fn() },
  },
}))

import { mobileGuard } from '@/lib/mobile-api'
import { prisma } from '@/lib/db'

const mockMobileGuard = vi.mocked(mobileGuard)
const mockFindVisit = vi.mocked(prisma.fieldVisit.findFirst)
const mockFindReports = vi.mocked(prisma.visitReport.findMany)

const mockSession = {
  user: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    organizationId: 'org-A',
    permissions: ['field_visits.view'],
  },
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = new Request('http://localhost/api/mobile/visits/v1/reports')

beforeEach(() => {
  vi.clearAllMocks()
  mockMobileGuard.mockResolvedValue({ session: mockSession as never })
  mockFindVisit.mockResolvedValue({ id: 'v1' } as never)
  mockFindReports.mockResolvedValue([] as never)
})

const report = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  purpose: 'Pricing',
  discussion: 'Discussed Q4 pricing tiers and volume discounts at length.',
  requirements: '30 units by Friday',
  competitorInfo: 'Saw Acme offering 5% more',
  customerFeedback: 'Happy with current terms',
  nextSteps: 'Send quote',
  createdAt: new Date('2026-01-15T13:00:00.000Z'),
  ...over,
})

describe('GET /api/mobile/visits/[id]/reports (B3)', () => {
  it('returns the caller reports, newest first, with all fields', async () => {
    mockFindReports.mockResolvedValue([
      report({ id: 'r2', purpose: 'Follow-up', createdAt: new Date('2026-01-16T09:00:00.000Z') }),
      report({ id: 'r1', createdAt: new Date('2026-01-15T09:00:00.000Z') }),
    ] as never)
    const { GET } = await import('@/app/api/mobile/visits/[id]/reports/route')
    const res = await GET(req, ctx('v1'))
    expect(res.status).toBe(200)
    const data = await res.json() as { reports: { id: string; purpose: string; createdAt: string }[] }
    expect(data.reports).toHaveLength(2)
    expect(data.reports[0]).toMatchObject({
      id: 'r2',
      purpose: 'Follow-up',
      discussion: 'Discussed Q4 pricing tiers and volume discounts at length.',
      requirements: '30 units by Friday',
      competitorInfo: 'Saw Acme offering 5% more',
      customerFeedback: 'Happy with current terms',
      nextSteps: 'Send quote',
      createdAt: '2026-01-16T09:00:00.000Z',
    })
  })

  it('orders by createdAt desc', async () => {
    mockFindReports.mockResolvedValue([] as never)
    const { GET } = await import('@/app/api/mobile/visits/[id]/reports/route')
    await GET(req, ctx('v1'))
    const args = mockFindReports.mock.calls[0][0] as { orderBy: { createdAt: string }; where: { visitId: string; createdById: string } }
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
    expect(args.where).toMatchObject({ visitId: 'v1', createdById: 'user-1' })
  })

  it('returns 404 when the visit is not assigned to the caller', async () => {
    mockFindVisit.mockResolvedValue(null)
    const { GET } = await import('@/app/api/mobile/visits/[id]/reports/route')
    const res = await GET(req, ctx('v1'))
    expect(res.status).toBe(404)
    expect(mockFindReports).not.toHaveBeenCalled()
  })

  it('returns 404 for another organization\'s visit', async () => {
    mockFindVisit.mockResolvedValue(null)
    const { GET } = await import('@/app/api/mobile/visits/[id]/reports/route')
    const res = await GET(req, ctx('other'))
    expect(res.status).toBe(404)
    expect(mockFindVisit.mock.calls[0][0].where).toMatchObject({
      id: 'other',
      organizationId: 'org-A',
      assigneeId: 'user-1',
    })
  })

  it('returns 403 when the user lacks field_visits.view', async () => {
    mockMobileGuard.mockReset()
    mockMobileGuard.mockResolvedValue(
      { error: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }) } as never,
    )
    const { GET } = await import('@/app/api/mobile/visits/[id]/reports/route')
    const res = await GET(req, ctx('v1'))
    expect(res.status).toBe(403)
    expect(mockFindVisit).not.toHaveBeenCalled()
    expect(mockFindReports).not.toHaveBeenCalled()
  })
})

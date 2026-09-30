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
const mockFindMany = vi.mocked(prisma.fieldVisit.findMany)

const mockSession = {
  user: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    organizationId: 'org-A',
    permissions: ['field_visits.view'],
  },
}

const req = (query: string) =>
  new Request(`http://localhost/api/mobile/visits${query}`, { method: 'GET' })

function todayWindow() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMobileGuard.mockResolvedValue({ session: mockSession as never })
  mockFindMany.mockResolvedValue([] as never)
})

describe('GET /api/mobile/visits (date-range filtering, B4)', () => {
  it('uses from/to for scope=today when the range is valid (<=48h)', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const to = new Date('2026-01-02T00:00:00.000Z')
    const { GET } = await import('@/app/api/mobile/visits/route')
    const res = await GET(req(`?scope=today&from=${from.toISOString()}&to=${to.toISOString()}`))
    expect(res.status).toBe(200)
    const args = mockFindMany.mock.calls[0][0] as { where: { scheduledAt?: { gte?: Date; lt?: Date } } }
    expect(args.where.scheduledAt?.gte?.getTime()).toBe(from.getTime())
    expect(args.where.scheduledAt?.lt?.getTime()).toBe(to.getTime())
  })

  it('uses from as the lower bound for scope=upcoming (no upper bound) when range is valid', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const to = new Date('2026-01-02T00:00:00.000Z')
    const { GET } = await import('@/app/api/mobile/visits/route')
    const res = await GET(req(`?scope=upcoming&from=${from.toISOString()}&to=${to.toISOString()}`))
    expect(res.status).toBe(200)
    const args = mockFindMany.mock.calls[0][0] as { where: { scheduledAt?: { gte?: Date; lt?: Date } } }
    expect(args.where.scheduledAt?.gte?.getTime()).toBe(from.getTime())
    expect(args.where.scheduledAt?.lt).toBeUndefined()
  })

  it('falls back to server day when from/to are not valid dates', async () => {
    const { GET } = await import('@/app/api/mobile/visits/route')
    const res = await GET(req('?scope=today&from=not-a-date&to=also-bad'))
    expect(res.status).toBe(200)
    const { start, end } = todayWindow()
    const args = mockFindMany.mock.calls[0][0] as { where: { scheduledAt?: { gte?: Date; lt?: Date } } }
    expect(args.where.scheduledAt?.gte?.getTime()).toBe(start.getTime())
    expect(args.where.scheduledAt?.lt?.getTime()).toBe(end.getTime())
  })

  it('ignores an oversized range (>48h) and falls back', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const to = new Date('2026-01-20T00:00:00.000Z') // > 48h
    const { GET } = await import('@/app/api/mobile/visits/route')
    await GET(req(`?scope=today&from=${from.toISOString()}&to=${to.toISOString()}`))
    const { start, end } = todayWindow()
    const args = mockFindMany.mock.calls[0][0] as { where: { scheduledAt?: { gte?: Date; lt?: Date } } }
    expect(args.where.scheduledAt?.gte?.getTime()).toBe(start.getTime())
    expect(args.where.scheduledAt?.lt?.getTime()).toBe(end.getTime())
  })

  it('ignores an out-of-order range (to before from) and falls back', async () => {
    const from = new Date('2026-01-05T00:00:00.000Z')
    const to = new Date('2026-01-01T00:00:00.000Z') // to < from
    const { GET } = await import('@/app/api/mobile/visits/route')
    await GET(req(`?scope=today&from=${from.toISOString()}&to=${to.toISOString()}`))
    const { start, end } = todayWindow()
    const args = mockFindMany.mock.calls[0][0] as { where: { scheduledAt?: { gte?: Date; lt?: Date } } }
    expect(args.where.scheduledAt?.gte?.getTime()).toBe(start.getTime())
    expect(args.where.scheduledAt?.lt?.getTime()).toBe(end.getTime())
  })

  it('ignores range for scope=all', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const to = new Date('2026-01-02T00:00:00.000Z')
    const { GET } = await import('@/app/api/mobile/visits/route')
    await GET(req(`?scope=all&from=${from.toISOString()}&to=${to.toISOString()}`))
    const args = mockFindMany.mock.calls[0][0] as { where: { scheduledAt?: unknown } }
    expect(args.where.scheduledAt).toBeUndefined()
  })
})

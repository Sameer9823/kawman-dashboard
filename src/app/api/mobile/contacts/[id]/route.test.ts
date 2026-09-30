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
  prisma: { contact: { findFirst: vi.fn() } },
}))

import { mobileGuard } from '@/lib/mobile-api'
import { prisma } from '@/lib/db'

const mockMobileGuard = vi.mocked(mobileGuard)
const mockFindFirst = vi.mocked(prisma.contact.findFirst)

const mockSession = {
  user: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    organizationId: 'org-A',
    permissions: ['contacts.view'],
  },
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = new Request('http://localhost/api/mobile/contacts/c1')

const mockContact = {
  id: 'c1',
  name: 'Jane Doe',
  designation: 'Engineer',
  email: 'jane@example.com',
  phone: '12345',
  mobile: '98765',
  address: '1 St',
  segment: 'PROSPECT',
  status: 'ACTIVE',
  createdAt: new Date('2026-05-01T10:00:00.000Z'),
  company: { id: 'co1', name: 'Acme Corp' },
  visits: [
    { id: 'v1', title: 'Acme visit', scheduledAt: new Date('2026-05-01T10:00:00.000Z'), status: 'COMPLETED' },
    { id: 'v2', title: 'Acme follow-up', scheduledAt: new Date('2026-04-01T09:00:00.000Z'), status: 'SCHEDULED' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMobileGuard.mockResolvedValue({ session: mockSession as never })
  mockFindFirst.mockResolvedValue(mockContact as never)
})

describe('GET /api/mobile/contacts/[id] (B5: detail, owner only)', () => {
  it('returns the contact with company and recent visits', async () => {
    const { GET } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await GET(req, ctx('c1'))
    expect(res.status).toBe(200)
    const data = await res.json() as { contact: { id: string; name: string; company: { id: string; name: string } | null; recentVisits: { id: string; title: string; status: string; scheduledAt: string }[]; createdAt: string; mobile: string; phone: string } }
    const c = data.contact
    expect(c.id).toBe('c1')
    expect(c.name).toBe('Jane Doe')
    expect(c.designation).toBe('Engineer')
    expect(c.email).toBe('jane@example.com')
    expect(c.phone).toBe('12345')
    expect(c.mobile).toBe('98765')
    expect(c.address).toBe('1 St')
    expect(c.segment).toBe('PROSPECT')
    expect(c.status).toBe('ACTIVE')
    expect(c.createdAt).toBe('2026-05-01T10:00:00.000Z')
    expect(c.company).toEqual({ id: 'co1', name: 'Acme Corp' })
    expect(c.recentVisits).toHaveLength(2)
    expect(c.recentVisits[0]).toEqual({ id: 'v1', title: 'Acme visit', status: 'COMPLETED', scheduledAt: '2026-05-01T10:00:00.000Z' })
  })

  it('returns company null when the contact has no company', async () => {
    mockFindFirst.mockResolvedValue({ ...mockContact, company: null, visits: [] } as never)
    const { GET } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await GET(req, ctx('c1'))
    const data = await res.json() as { contact: { company: unknown; recentVisits: unknown[] } }
    expect(data.contact.company).toBeNull()
  })

  it('scopes the query to the caller org + owner and limits recent visits to 5', async () => {
    const { GET } = await import('@/app/api/mobile/contacts/[id]/route')
    await GET(req, ctx('c1'))
    const args = mockFindFirst.mock.calls[0][0] as {
      where: { id: string; organizationId: string; ownerId: string }
      include: { visits: { where: { assigneeId: string }; take: number } }
    }
    expect(args.where).toMatchObject({ id: 'c1', organizationId: 'org-A', ownerId: 'user-1' })
    expect(args.include.visits.take).toBe(5)
    expect(args.include.visits.where).toMatchObject({ assigneeId: 'user-1', organizationId: 'org-A' })
  })

  it('returns 404 for a contact not owned by the caller (scoped out)', async () => {
    mockFindFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await GET(req, ctx('someone-else'))
    expect(res.status).toBe(404)
    expect(mockFindFirst.mock.calls[0][0].where).toMatchObject({ id: 'someone-else', organizationId: 'org-A', ownerId: 'user-1' })
  })

  it('returns 403 when the user lacks contacts.view', async () => {
    mockMobileGuard.mockReset()
    mockMobileGuard.mockResolvedValue(
      { error: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }) } as never,
    )
    const { GET } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await GET(req, ctx('c1'))
    expect(res.status).toBe(403)
    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    mockMobileGuard.mockReset()
    mockMobileGuard.mockResolvedValue({ error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) } as never)
    const { GET } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await GET(req, ctx('c1'))
    expect(res.status).toBe(401)
    expect(mockFindFirst).not.toHaveBeenCalled()
  })
})

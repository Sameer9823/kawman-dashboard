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
    contact: { findFirst: vi.fn(), update: vi.fn() },
    activity: { create: vi.fn() },
  },
}))

vi.mock('@/lib/audit-log', () => ({
  logAudit: vi.fn(),
}))

vi.mock('@/lib/contact-dedupe', () => ({
  buildContactEmailKey: vi.fn((email: string | null | undefined) =>
    email ? email.trim().toLowerCase() : null,
  ),
  duplicateContactEmailMessage: vi.fn((name: string) => `A contact with this email already exists (${name}).`),
}))

vi.mock('@/services/company.service', () => ({
  findOrCreateCompanyByName: vi.fn(),
}))

import { mobileGuard, badRequest } from '@/lib/mobile-api'
import { prisma } from '@/lib/db'
import { logAudit } from '@/lib/audit-log'
import { buildContactEmailKey, duplicateContactEmailMessage } from '@/lib/contact-dedupe'
import { findOrCreateCompanyByName } from '@/services/company.service'

const mockMobileGuard = vi.mocked(mobileGuard)
const mockFindFirst = vi.mocked(prisma.contact.findFirst)
const mockUpdate = vi.mocked(prisma.contact.update)
const mockActivityCreate = vi.mocked(prisma.activity.create)
const mockLogAudit = vi.mocked(logAudit)
const mockBuildEmailKey = vi.mocked(buildContactEmailKey)
const mockDupMessage = vi.mocked(duplicateContactEmailMessage)
const mockFindCompany = vi.mocked(findOrCreateCompanyByName)

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
const patch = (b: unknown) => new Request('http://localhost/api/mobile/contacts/c1',
  { method: 'PATCH', body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' } })

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
  mockUpdate.mockResolvedValue({ id: 'c1', name: 'Jane Doe' } as never)
  mockBuildEmailKey.mockImplementation((email) => (email ? email.trim().toLowerCase() : null))
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
})

describe('PATCH /api/mobile/contacts/[id] (B6: edit contact)', () => {
  beforeEach(() => {
    mockFindFirst.mockReset()
    mockFindFirst.mockResolvedValueOnce({ id: 'c1', emailKey: 'old@example.com' } as never)
  })

  it('updates an owned contact and returns { id }', async () => {
    mockFindFirst.mockResolvedValueOnce(null as never)
    const { PATCH } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await PATCH(patch({ name: 'Jane Doe', company: 'Acme', phone: '-', mobile: '98765', email: 'new@example.com', designation: '-', address: '-' }), ctx('c1'))
    expect(res.status).toBe(200)
    const data = await res.json() as { id: string }
    expect(data.id).toBe('c1')

    const args = mockUpdate.mock.calls[0][0] as { where: { id: string }; data: Record<string, unknown> }
    expect(args.where).toEqual({ id: 'c1' })
    const d = args.data
    expect(d.name).toBe('Jane Doe')
    expect(d.phone).toBeNull()
    expect(d.mobile).toBe('98765')
    expect(d.email).toBe('new@example.com')
    expect(d.designation).toBeNull()
    expect(d.address).toBeNull()
    expect(d.companyId).toBeNull()
    expect(mockFindCompany).toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme', organizationId: 'org-A', ownerId: 'user-1' }))
  })

  it('treats "-" as empty for every field and stores no "-" values', async () => {
    // email is '-' -> null -> no dup check; only the ownership findFirst runs
    const { PATCH } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await PATCH(patch({ name: 'Jane Doe', company: '-', designation: '-', email: '-', phone: '-', mobile: '-', address: '-' }), ctx('c1'))
    expect(res.status).toBe(200)
    const args = mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> }
    const d = args.data
    expect(d.email).toBeNull()
    expect(d.phone).toBeNull()
    expect(d.mobile).toBeNull()
    expect(d.address).toBeNull()
    expect(d.designation).toBeNull()
    expect(d.companyId).toBeNull()
    expect(JSON.stringify(d)).not.toContain('"-"')
    expect(mockFindCompany).not.toHaveBeenCalled()
  })

  it('rejects name "-" with 400 (name min 2)', async () => {
    const { PATCH } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await PATCH(patch({ name: '-', email: 'ok@example.com' }), ctx('c1'))
    expect(res.status).toBe(400)
    expect(badRequest).toHaveBeenCalledWith('Invalid contact', expect.objectContaining({ name: 'Name is required' }))
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 409 when the email belongs to another contact', async () => {
    mockFindFirst.mockReset()
    mockFindFirst.mockResolvedValueOnce({ id: 'c1', emailKey: 'old@example.com' } as never)
    mockFindFirst.mockResolvedValueOnce({ name: 'Existing Contact' } as never)
    mockDupMessage.mockReturnValue('A contact with this email already exists (Existing Contact).')
    const { PATCH } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await PATCH(patch({ name: 'Jane Doe', email: 'dup@example.com' }), ctx('c1'))
    expect(res.status).toBe(409)
    expect(mockDupMessage).toHaveBeenCalledWith('Existing Contact')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('does not 409 when the email is unchanged from the existing record', async () => {
    const { PATCH } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await PATCH(patch({ name: 'Jane Doe', email: 'old@example.com' }), ctx('c1'))
    expect(res.status).toBe(200)
    expect(mockFindFirst).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('writes an Activity and an audit log entry on update', async () => {
    mockFindFirst.mockResolvedValueOnce(null as never)
    const { PATCH } = await import('@/app/api/mobile/contacts/[id]/route')
    await PATCH(patch({ name: 'Jane Doe', email: 'new@example.com' }), ctx('c1'))
    expect(mockActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CONTACT_UPDATED', contactId: 'c1', actorId: 'user-1' }) }),
    )
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', resource: 'Contact', resourceId: 'c1', actorId: 'user-1' }),
    )
  })

  it('returns 404 for a contact not owned by the caller', async () => {
    mockFindFirst.mockReset()
    mockFindFirst.mockResolvedValue(null)
    const { PATCH } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await PATCH(patch({ name: 'Jane Doe' }), ctx('c1'))
    expect(res.status).toBe(404)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks contacts.update', async () => {
    mockMobileGuard.mockReset()
    mockMobileGuard.mockResolvedValue(
      { error: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }) } as never,
    )
    const { PATCH } = await import('@/app/api/mobile/contacts/[id]/route')
    const res = await PATCH(patch({ name: 'Jane Doe' }), ctx('c1'))
    expect(res.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

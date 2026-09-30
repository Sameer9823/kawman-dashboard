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
    contact: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
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
const mockPrismaContact = vi.mocked(prisma.contact)
const mockFindMany = vi.mocked(prisma.contact.findMany)
const mockPrismaActivity = vi.mocked(prisma.activity)
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
    permissions: ['contacts.create'],
  },
}

const jsonBody = (b: unknown) =>
  new Request('http://localhost/api/mobile/contacts', { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' } })
const reqGet = (query = '') => new Request(`http://localhost/api/mobile/contacts${query}`, { method: 'GET' })

beforeEach(() => {
  vi.clearAllMocks()
  mockMobileGuard.mockResolvedValue({ session: mockSession as never })
  mockBuildEmailKey.mockImplementation((email) => (email ? email.trim().toLowerCase() : null))
})

describe('POST /api/mobile/contacts (card scanner save)', () => {
  it('treats "-" as empty: stores null and never creates a company', async () => {
    mockPrismaContact.findFirst.mockResolvedValue(null)
    mockPrismaContact.create.mockResolvedValue({ id: 'contact-1', name: 'Jane Doe' } as never)

    const { POST } = await import('@/app/api/mobile/contacts/route')
    const res = await POST(jsonBody({
      name: 'Jane Doe', company: '-', designation: '-', email: '-', phone: '-', mobile: '-', address: '-',
    }))
    expect(res.status).toBe(201)

    expect(mockFindCompany).not.toHaveBeenCalled()
    const createCall = mockPrismaContact.create.mock.calls[0][0] as { data: Record<string, unknown> }
    const d = createCall.data
    expect(d.email).toBeNull()
    expect(d.phone).toBeNull()
    expect(d.mobile).toBeNull()
    expect(d.address).toBeNull()
    expect(d.designation).toBeNull()
    expect(d.companyId).toBeNull()
    const raw = JSON.stringify(d)
    expect(raw).not.toContain('"-"')
  })

  it('rejects a malformed real email with 400 and fieldErrors.email', async () => {
    const { POST } = await import('@/app/api/mobile/contacts/route')
    const res = await POST(jsonBody({ name: 'Jane Doe', email: 'not-an-email' }))
    expect(res.status).toBe(400)
    expect(badRequest).toHaveBeenCalledWith('Invalid contact', expect.objectContaining({ email: expect.any(String) }))
  })

  it('rejects name "-" with 400 (name is still required, min 2)', async () => {
    const { POST } = await import('@/app/api/mobile/contacts/route')
    const res = await POST(jsonBody({ name: '-', email: 'ok@example.com' }))
    expect(res.status).toBe(400)
    expect(badRequest).toHaveBeenCalledWith(
      'Invalid contact',
      expect.objectContaining({ name: 'Name is required' }),
    )
  })

  it('returns 409 when the email already belongs to another contact', async () => {
    mockBuildEmailKey.mockReturnValue('dup@example.com')
    mockPrismaContact.findFirst.mockResolvedValue({ name: 'Existing Contact' } as never)

    const { POST } = await import('@/app/api/mobile/contacts/route')
    const res = await POST(jsonBody({ name: 'Jane Doe', email: 'dup@example.com' }))
    expect(res.status).toBe(409)
    expect(mockPrismaContact.create).not.toHaveBeenCalled()
    expect(mockDupMessage).toHaveBeenCalledWith('Existing Contact')
  })

  it('returns 401 when the guard is unauthenticated', async () => {
    mockMobileGuard.mockResolvedValue({ error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) } as never)

    const { POST } = await import('@/app/api/mobile/contacts/route')
    const res = await POST(jsonBody({ name: 'Jane Doe' }))
    expect(res.status).toBe(401)
    expect(mockPrismaContact.create).not.toHaveBeenCalled()
  })
})

const cursorFor = (createdAtIso: string, id: string) =>
  Buffer.from(JSON.stringify({ createdAt: createdAtIso, id })).toString('base64')

const b4Row = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'Jane Doe',
  designation: 'Engineer',
  email: 'jane@example.com',
  mobile: '98765',
  phone: '12345',
  company: { name: 'Acme Corp' },
  createdAt: new Date('2026-05-01T10:00:00.000Z'),
  ...over,
})

describe('GET /api/mobile/contacts (B4: my cards, search + cursor pagination)', () => {
  it('returns contacts scoped to the caller and a null nextCursor on the last page', async () => {
    mockFindMany.mockResolvedValue([b4Row({ id: 'c1' }), b4Row({ id: 'c2', name: 'Bob' })] as never)
    const { GET } = await import('@/app/api/mobile/contacts/route')
    const res = await GET(reqGet())
    expect(res.status).toBe(200)
    const data: { contacts: { id: string; name: string }[]; nextCursor: string | null } = await res.json()
    expect(data.contacts).toHaveLength(2)
    expect(data.contacts[0].name).toBe('Jane Doe')
    expect(data.nextCursor).toBeNull()
  })

  it('defaults limit to 20 and returns nextCursor when there are more rows', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => b4Row({ id: `c${i}`, name: `Name ${i}` }))
    mockFindMany.mockResolvedValue(rows as never)
    const { GET } = await import('@/app/api/mobile/contacts/route')
    const res = await GET(reqGet())
    const data = await res.json() as { contacts: unknown[]; nextCursor: string | null }
    expect(data.contacts).toHaveLength(20)
    expect(data.nextCursor).not.toBeNull()
    const last = rows[19]
    const decoded = JSON.parse(Buffer.from(data.nextCursor as string, 'base64').toString('utf8'))
    expect(decoded).toEqual({ createdAt: last.createdAt.toISOString(), id: last.id })
    expect(mockFindMany.mock.calls[0][0].take).toBe(21)
  })

  it('clamps limit to a maximum of 50 and treats invalid limits as 20', async () => {
    mockFindMany.mockResolvedValue([] as never)
    const { GET } = await import('@/app/api/mobile/contacts/route')
    await GET(reqGet('?limit=999'))
    expect(mockFindMany.mock.calls[0][0].take).toBe(51)
    await GET(reqGet('?limit=abc'))
    expect(mockFindMany.mock.calls[1][0].take).toBe(21)
  })

  it('applies search case-insensitively across name/company/email/mobile/phone', async () => {
    mockFindMany.mockResolvedValue([] as never)
    const { GET } = await import('@/app/api/mobile/contacts/route')
    await GET(reqGet('?search=ACME'))
    const args = mockFindMany.mock.calls[0][0] as { where: { OR?: Array<Record<string, unknown>> } }
    const searchBlock = args.where.OR?.[0]
    expect(searchBlock).toBeDefined()
    const inner = (searchBlock as { OR: unknown[] }).OR as Array<{ name?: unknown; company?: unknown }>
    expect(inner).toHaveLength(5)
    expect(inner[0].name).toEqual({ contains: 'ACME', mode: 'insensitive' })
    expect(inner[4].company).toEqual({ name: { contains: 'ACME', mode: 'insensitive' } })
  })

  it('trims and caps search to 100 characters', async () => {
    mockFindMany.mockResolvedValue([] as never)
    const { GET } = await import('@/app/api/mobile/contacts/route')
    await GET(reqGet('?search=' + 'a'.repeat(120)))
    const args = mockFindMany.mock.calls[0][0] as { where: { OR?: Array<Record<string, unknown>> } }
    const nameFilter = (args.where.OR?.[0] as { OR: Array<{ name?: { contains: string } }> }).OR[0].name
    expect(nameFilter?.contains).toHaveLength(100)
  })

  it('adds cursor filters when a cursor is supplied', async () => {
    mockFindMany.mockResolvedValue([] as never)
    const { GET } = await import('@/app/api/mobile/contacts/route')
    const cursor = cursorFor('2026-05-01T10:00:00.000Z', 'c1')
    await GET(reqGet(`?cursor=${cursor}`))
    const args = mockFindMany.mock.calls[0][0] as { where: { OR?: Array<Record<string, unknown>> } }
    const cursorBlock = args.where.OR?.[0] as { OR: unknown[] } | undefined
    expect(cursorBlock).toBeDefined()
    expect(cursorBlock?.OR).toHaveLength(2)
  })

  it('returns 403 when the user lacks contacts.view', async () => {
    mockMobileGuard.mockReset()
    mockMobileGuard.mockResolvedValue(
      { error: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }) } as never,
    )
    const { GET } = await import('@/app/api/mobile/contacts/route')
    const res = await GET(reqGet())
    expect(res.status).toBe(403)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    mockMobileGuard.mockReset()
    mockMobileGuard.mockResolvedValue({ error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) } as never)
    const { GET } = await import('@/app/api/mobile/contacts/route')
    const res = await GET(reqGet())
    expect(res.status).toBe(401)
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})

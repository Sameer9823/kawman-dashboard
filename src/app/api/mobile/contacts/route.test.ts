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
    contact: { findFirst: vi.fn(), create: vi.fn() },
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

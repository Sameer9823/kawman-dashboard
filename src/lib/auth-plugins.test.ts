import { describe, it, expect, vi } from 'vitest'

// Marker factories let us identify which plugin each factory produced
// without depending on the internal shape of the real plugins.
const BEARER = { __tag: 'bearer' }
const NEXT_COOKIES = { __tag: 'nextCookies' }
const CUSTOM_SESSION = { __tag: 'customSession' }

vi.mock('better-auth', () => ({
  betterAuth: vi.fn(() => ({ api: { getSession: vi.fn() }, $Infer: { Session: {} as any } })),
}))

vi.mock('better-auth/plugins/bearer', () => ({
  bearer: vi.fn(() => BEARER),
}))

vi.mock('better-auth/next-js', () => ({
  nextCookies: vi.fn(() => NEXT_COOKIES),
}))

vi.mock('better-auth/plugins/custom-session', () => ({
  customSession: vi.fn(() => CUSTOM_SESSION),
}))

vi.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: vi.fn(() => ({})),
}))

// auth.ts pulls in a number of server-side modules; mock them so the real
// module can be imported without a database or mail transport.
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock('@/services/permission.service', () => ({ getUserPermissions: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendPasswordResetEmail: vi.fn() }))
vi.mock('@/lib/zoho-oauth', () => ({ zohoOAuthPlugins: vi.fn(() => []) }))
vi.mock('@/lib/auth-hooks', () => ({ sessionCreateBefore: vi.fn(), sessionCreateAfter: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins/bearer'
import { nextCookies } from 'better-auth/next-js'
import { customSession } from 'better-auth/plugins/custom-session'

const mockBetterAuth = vi.mocked(betterAuth)

describe('auth plugin registration', () => {
  it('registers the bearer plugin exactly once (no duplicate)', async () => {
    await vi.importActual('@/lib/auth')
    const opts = mockBetterAuth.mock.calls[0][0] as { plugins: unknown[] }
    const bearerPlugins = opts.plugins.filter((p) => p === BEARER)
    expect(bearerPlugins).toHaveLength(1)
    expect(bearer).toHaveBeenCalledTimes(1)
  })

  it('keeps nextCookies() registered last', async () => {
    await vi.importActual('@/lib/auth')
    const opts = mockBetterAuth.mock.calls[0][0] as { plugins: unknown[] }
    expect(opts.plugins[opts.plugins.length - 1]).toBe(NEXT_COOKIES)
    expect(nextCookies).toHaveBeenCalledTimes(1)
  })

  it('keeps customSession in the plugins array', async () => {
    await vi.importActual('@/lib/auth')
    const opts = mockBetterAuth.mock.calls[0][0] as { plugins: unknown[] }
    const cs = opts.plugins.filter((p) => p === CUSTOM_SESSION)
    expect(cs).toHaveLength(1)
    expect(customSession).toHaveBeenCalledTimes(1)
  })
})

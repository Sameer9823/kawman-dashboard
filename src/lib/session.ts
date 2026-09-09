import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

/**
 * Resolves the current request's session exactly once per request
 * (React `cache()` dedupes it across every Server Component/layout
 * that calls this on the same render pass). This is the ONLY place
 * "who is logged in" should be read from on the server.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

/**
 * Use at the top of any protected Server Component / layout / Server
 * Action. Redirects to /login if there's no session. Returns the
 * fully-typed session (including organizationId, roles, permissions —
 * see the customSession plugin in lib/auth.ts).
 */
export async function requireSession() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }
  return session
}

/** Throws (rather than redirecting) — use inside Server Actions / route handlers. */
export async function requireApiSession() {
  const session = await getSession()
  if (!session) {
    throw new Error('Not authenticated')
  }
  return session
}

export async function requirePermission(permission: string) {
  const session = await requireSession()
  if (!session.user.permissions.includes(permission)) {
    redirect('/dashboard?error=forbidden')
  }
  return session
}

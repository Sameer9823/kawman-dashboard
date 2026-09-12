import 'server-only'

/**
 * Validates required env vars at startup.
 * Call `assertEnv()` in instrumentation.ts so production crashes fast
 * with a clear message instead of failing opaquely on first DB/auth call.
 */
const REQUIRED_IN_PRODUCTION = ['DATABASE_URL', 'BETTER_AUTH_SECRET'] as const

export function assertEnv(): void {
  const missing: string[] = []
  const isProd = process.env.NODE_ENV === 'production'
  for (const key of REQUIRED_IN_PRODUCTION) {
    if (!process.env[key]) missing.push(key)
  }
  if (missing.length > 0) {
    const msg = `[env] Missing required environment variables: ${missing.join(', ')}`
    if (isProd) throw new Error(msg)
    console.warn(`${msg} — continuing in development, but auth/DB will fail without them.`)
  }
  // BETTER_AUTH_SECRET should be at least 32 chars
  const secret = process.env.BETTER_AUTH_SECRET
  if (secret && secret.length < 32) {
    console.warn('[env] BETTER_AUTH_SECRET is too short (< 32 chars) — use `openssl rand -hex 32`.')
  }
}

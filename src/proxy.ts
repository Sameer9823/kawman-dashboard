import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { auth } from '@/lib/auth'

// ============================================================
// Security Headers
// ============================================================
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    // Next.js injects inline <script> (and in dev uses eval for HMR) — without
    // 'unsafe-inline' / 'unsafe-eval' every navigation including /login?redirect=
    // is blocked with "Executing inline script violates CSP". Nonce-based CSP
    // would be stricter but needs next.config headers + per-request nonce.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.resend.com https://api.cloudinary.com https://api.assemblyai.com https://generativelanguage.googleapis.com https://api.openai.com wss:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  ...(process.env.NODE_ENV === 'production'
    ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload' }
    : {}),
}

// ============================================================
// Public routes — exact match + slash-prefix only, so
// '/api/auth' does NOT match '/api/auth-bypass'.
// ============================================================
const PUBLIC_EXACT = new Set([
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/api/health',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
])
const PUBLIC_PREFIXES = ['/api/auth', '/_next']

// PUBLIC_PATHS / AUTH_ONLY_PATHS / AUTH_API_ROUTES removed — see PUBLIC_EXACT/PREFIXES and isAuth* helpers above.

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true
  return false
}

function isAuthOnlyPath(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/login/') || pathname === '/signup' || pathname.startsWith('/signup/')
}

function isAuthApiRoute(pathname: string): boolean {
  return pathname === '/api/auth/sign-in' || pathname.startsWith('/api/auth/sign-in/')
    || pathname === '/api/auth/sign-up' || pathname.startsWith('/api/auth/sign-up/')
    || pathname === '/api/auth/request-password-reset' || pathname.startsWith('/api/auth/request-password-reset/')
    || pathname === '/api/auth/reset-password' || pathname.startsWith('/api/auth/reset-password/')
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const response = NextResponse.next()

  // Apply security headers to all responses
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  // Add rate limit headers for auth endpoints
  if (isAuthApiRoute(pathname)) {
    response.headers.set('X-RateLimit-Limit', '20')
    response.headers.set('X-RateLimit-Window', '60')
  }

  // Cheap, edge-safe check: does a (not-yet-expired) session cookie exist?
  // This is NOT a full session/permission check — that happens server-side
  // via requireSession()/requirePermission() in layouts and Server Actions,
  // which hit the DB and can't be spoofed by forging a cookie.
  const sessionCookie = getSessionCookie(request)

  const isPublic = isPublicPath(pathname)
  const isAuthOnly = isAuthOnlyPath(pathname)
  const isApi = isApiPath(pathname)

  if (!sessionCookie && !isPublic) {
    // API routes are consumed by fetch()/XHR, not the browser's top-level
    // navigation — redirecting them would hand a fetch() caller an HTML
    // login page (or a redirect it silently follows) instead of a JSON
    // error it can actually handle. Return a real 401 instead.
    if (isApi) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (sessionCookie && isAuthOnly) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // For authenticated users, verify session is valid (not just cookie exists)
  // This is a lightweight check - full validation happens in requireSession()
  if (sessionCookie && !isPublic) {
    try {
      const session = await auth.api.getSession({ headers: request.headers })
      if (session) {
        // Add user info to headers for downstream use
        response.headers.set('x-user-id', session.user.id)
        response.headers.set('x-org-id', session.user.organizationId)
      }
    } catch {
      // Session invalid - let the server-side requireSession handle redirect
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api/auth (handled by better-auth itself — must not be intercepted)
     * - api/meetings/[id]/upload-recording and /meetings/new — both
     *   receive large (up to 500MB) multipart video uploads. The API
     *   route via fetch(), and /meetings/new via a Server Action
     *   (createMeetingWithVideoAction) that POSTs the multipart body to
     *   the page URL itself. Next has a known race
     *   (github.com/lucasadrianof/nextjs-middleware-bug) where
     *   requestData.body.finalize() isn't awaited when proxy sits in
     *   front of a large multipart body, causing "Unexpected end of form".
     *   Both paths still enforce auth server-side (auth.api.getSession()
     *   in route.ts; requireApiSession() in assertPermission()), so
     *   skipping the edge cookie pre-check is safe.
     * - _next/static, _next/image (Next internals)
     * - favicon.ico, manifest.json, sw.js, and static asset extensions —
     *   the PWA manifest/service-worker/icons must be fetchable
     *   unauthenticated or browsers reject the service worker (non-JS MIME).
     */
    '/((?!api/auth|api/meetings/[^/]+/upload-recording|meetings/new|_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
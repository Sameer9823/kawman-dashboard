import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { auth } from '@/lib/auth'

// ============================================================
// Security Headers
// ============================================================
const SECURITY_HEADERS = {
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Permissions policy (formerly Feature Policy)
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.resend.com https://api.cloudinary.com https://api.assemblyai.com https://generativelanguage.googleapis.com https://api.openai.com wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  // HSTS - only in production
  ...(process.env.NODE_ENV === 'production'
    ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload' }
    : {}),
}

// ============================================================
// Public routes that don't require authentication
// ============================================================
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/api/auth',
  '/api/health',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
]

// Of those, only these should redirect an already-authenticated visitor away
const AUTH_ONLY_PATHS = ['/login', '/signup']

// Auth API routes that need rate limiting headers
const AUTH_API_ROUTES = [
  '/api/auth/sign-in',
  '/api/auth/sign-up',
  '/api/auth/request-password-reset',
  '/api/auth/reset-password',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

function isAuthOnlyPath(pathname: string): boolean {
  return AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p))
}

function isAuthApiRoute(pathname: string): boolean {
  return AUTH_API_ROUTES.some((route) => pathname.startsWith(route))
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
     * - api/auth (handled by better-auth itself)
     * - _next/static, _next/image (Next internals)
     * - favicon.ico, manifest.json, sw.js, and common static asset
     *   extensions — the PWA manifest/service-worker/icons must be
     *   fetchable by an unauthenticated browser (installability checks,
     *   and ServiceWorkerRegistration runs on every page including
     *   /login) or they'd get redirected to an HTML login page instead
     *   of the actual file, which breaks service worker registration
     *   outright (browsers reject a non-JS MIME type for it).
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}

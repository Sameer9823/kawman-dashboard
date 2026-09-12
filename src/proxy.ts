import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

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

const PUBLIC_EXACT = new Set([
  '/login',
  '/superadmin',
  '/forgot-password',
  '/reset-password',
  '/api/health',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
])
const PUBLIC_PREFIXES = ['/api/auth', '/_next']

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true
  return false
}

function isAuthOnlyPath(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/login/')
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
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  if (isAuthApiRoute(pathname)) {
    response.headers.set('X-RateLimit-Limit', '20')
    response.headers.set('X-RateLimit-Window', '60')
  }
  const sessionCookie = getSessionCookie(request)
  const isPublic = isPublicPath(pathname)
  const isAuthOnly = isAuthOnlyPath(pathname)
  const isApi = isApiPath(pathname)

  if (!sessionCookie && !isPublic) {
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

  // NOTE: intentionally no auth.api.getSession() here. The old proxy hit the
  // DB on every navigation via customSession -> prisma.user.findUnique, which
  // on Neon's pooled (pgBouncer) endpoint contended with the ~20 parallel
  // Prisma queries from dashboard.service and produced ETIMEDOUTs
  // (proxy.ts: 1144ms + dashboard 3-9s, AggregateError "object null is not
  // iterable"). Cookie presence is sufficient at the edge; full validation
  // happens server-side in requireSession()/getDashboardMetrics() where we
  // can fail gracefully instead of hanging the proxy.
  return response
}
export const config = {
  matcher: [
    '/((?!api/auth|api/meetings/[^/]+/upload-recording|meetings/new|_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}

import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const PUBLIC_EXACT = ['/login', '/forgot-password', '/reset-password'] as const

const PUBLIC_PREFIXES = [
  '/superadmin',
  '/api/auth',
  '/api/health',
  '/api/mobile/upload-signature',
  '/_next',
  '/static',
] as const

function isPublicPath(pathname: string): boolean {
  if ((PUBLIC_EXACT as readonly string[]).includes(pathname)) return true
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function hasSessionCookie(request: NextRequest): boolean {
  return getSessionCookie(request) !== null
}

function hasBearerToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return !!(authHeader && authHeader.startsWith('Bearer '))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (!hasSessionCookie(request) && !hasBearerToken(request)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const url = new URL('/login', request.url)
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.\\w+$).*)'],
}

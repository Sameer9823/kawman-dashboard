import { NextRequest, NextResponse } from 'next/server'
import { requireMobileSession } from '../_utils'

export async function GET(request: NextRequest) {
  let session
  try {
    session = await requireMobileSession(request)
  } catch (e) {
    return e
  }

  const permissions = session.user.permissions || []

  return NextResponse.json({
    name: session.user.name,
    email: session.user.email,
    roles: session.user.roles || [],
    permissions,
    organizationId: session.user.organizationId,
import { NextResponse } from 'next/server'
import { mobileGuard } from '@/lib/mobile-api'

export async function GET() {
  const g = await mobileGuard()
  if ('error' in g) return g.error
  const u = g.session.user
  return NextResponse.json({
    id: u.id,
    name: u.name,
    email: u.email,
    organizationId: u.organizationId,
    roles: u.roles,
    permissions: u.permissions,
  })
}

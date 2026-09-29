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
  })
}

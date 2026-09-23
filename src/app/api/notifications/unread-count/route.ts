import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { getUnreadCount } from '@/services/notification.service'

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for the current user
 */
export async function GET() {
  try {
    const session = await requireApiSession()

    const count = await getUnreadCount(session.user.id, session.user.organizationId)

    return NextResponse.json({ count })
  } catch (error) {
    console.error('[API] Error fetching unread count:', error)
    return NextResponse.json(
      { error: 'Failed to fetch unread count' },
      { status: 500 }
    )
  }
}
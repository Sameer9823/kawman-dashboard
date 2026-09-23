import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { getAllQueueStats } from '@/lib/queue'
import { areQueuesAvailable } from '@/services/queue.service'

/**
 * GET /api/admin/queues
 * 
 * Returns statistics for all BullMQ queues.
 * Admin-only endpoint for monitoring background job processing.
 */
export async function GET() {
  try {
    const session = await requireApiSession()

    // TODO: Add admin role check
    // For now, any authenticated user can view queue stats

    if (!areQueuesAvailable()) {
      return NextResponse.json(
        {
          available: false,
          message: 'Queues are not available. Redis is not configured.',
          queues: [],
        },
        { status: 503 }
      )
    }

    const stats = await getAllQueueStats()

    return NextResponse.json({
      available: true,
      queues: stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[API] Error fetching queue stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch queue statistics' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { retryWebhookDelivery } from '@/services/integration.service'
import { requireApiSession } from '@/lib/session'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiSession()
    const { id } = await params
    const body = await request.json()
    const { deliveryId } = body

    if (!deliveryId) {
      return NextResponse.json(
        { error: 'deliveryId is required' },
        { status: 400 }
      )
    }

    const result = await retryWebhookDelivery(deliveryId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[API] Error retrying webhook:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retry webhook' },
      { status: 500 }
    )
  }
}
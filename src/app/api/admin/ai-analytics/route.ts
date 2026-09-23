import { NextResponse } from 'next/server'
import { getAIUsageAggregate } from '@/services/ai-analytics.service'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const filters = {
      userId: searchParams.get('userId') || undefined,
      model: searchParams.get('model') || undefined,
      provider: searchParams.get('provider') || undefined,
      feature: searchParams.get('feature') || undefined,
      dateFrom: searchParams.get('dateFrom') ? new Date(searchParams.get('dateFrom')!) : undefined,
      dateTo: searchParams.get('dateTo') ? new Date(searchParams.get('dateTo')!) : undefined,
    }

    const result = await getAIUsageAggregate(filters)
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json(result.data)
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
}
import { NextResponse } from 'next/server'
import { getAIUsageSummary } from '@/services/ai-analytics.service'

export async function GET() {
  try {
    const result = await getAIUsageSummary()
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json(result.data)
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
}
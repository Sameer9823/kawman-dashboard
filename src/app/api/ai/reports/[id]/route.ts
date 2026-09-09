import { NextResponse } from 'next/server'
import { getReport } from '@/services/ai.service'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const report = await getReport(id)
    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(report)
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
}

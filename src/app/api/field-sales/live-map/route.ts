import { NextResponse } from 'next/server'
import { getLiveMapVisits } from '@/services/field-visit.service'

export async function GET() {
  try {
    const visits = await getLiveMapVisits()
    return NextResponse.json(visits)
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
}

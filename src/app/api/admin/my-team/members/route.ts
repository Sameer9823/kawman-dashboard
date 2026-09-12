import { NextResponse } from 'next/server'
import { getTeamMembers } from '@/services/team.service'

export async function GET() {
  try {
    const members = await getTeamMembers()
    return NextResponse.json(members)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch team members'
    const status = msg.startsWith('Forbidden') ? 403 : msg === 'Not authenticated' ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

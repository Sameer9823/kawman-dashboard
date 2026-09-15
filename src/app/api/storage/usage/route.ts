import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const organizationId = session.user.organizationId

  const agg = await prisma.file.aggregate({
    where: { organizationId },
    _sum: { fileSize: true },
    _count: true,
  })

  const usedBytes = Number(agg._sum.fileSize ?? 0)
  const fileCount = agg._count
  const totalGb = 100 // plan limit — keep in sync with /admin/storage
  const usedGb = usedBytes / 1024 ** 3
  const pct = totalGb > 0 ? Math.min(100, (usedGb / totalGb) * 100) : 0

  return NextResponse.json(
    {
      usedBytes,
      usedGb: Number(usedGb.toFixed(2)),
      totalGb,
      pct: Math.round(pct * 10) / 10,
      fileCount,
    },
    {
      headers: { 'Cache-Control': 'private, max-age=30' },
    },
  )
}

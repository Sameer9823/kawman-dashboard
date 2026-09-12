import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json([], { status: 401 })

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id, organizationId: session.user.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(
    notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      data: (n as { data?: unknown }).data ?? null,
      createdAt: n.createdAt.toISOString(),
      read: n.isRead,
    }))
  )
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { id } = body as { id?: string }

  if (id) {
    await prisma.notification.updateMany({
      where: { id, userId: session.user.id },
      data: { isRead: true, readAt: new Date() },
    })
  } else {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true })
}

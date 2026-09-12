import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { toCSV, csvResponse } from '@/lib/csv'
import { getContacts } from '@/services/contact.service'

export async function GET() {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!(session.user.permissions as string[]).includes('contacts.view')) {
    return new Response('Forbidden', { status: 403 })
  }

  const contacts = await getContacts()
  const csv = toCSV(contacts, [
    { key: 'name', header: 'Name' },
    { key: 'company', header: 'Company' },
    { key: 'designation', header: 'Designation' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'owner', header: 'Owner' },
    { key: 'status', header: 'Status' },
    { key: 'lastActivityAt', header: 'Last Activity' },
  ])

  return csvResponse(csv, `contacts-${new Date().toISOString().slice(0, 10)}.csv`)
}

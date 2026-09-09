'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, Mail, Phone, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DeleteRowButton } from '@/components/crm/delete-row-button'
import type { ContactPage, ContactSortKey } from '@/services/contact.service'
import { deleteContactAction } from '@/app/contacts/actions'

/**
 * Server-side paginated / searched / sorted contacts view. All filtering
 * happens in the DB query (see services/contact.service.ts#getContactsPage)
 * — mirrors leads-table.tsx / companies-table.tsx, kept as a card grid
 * since that was this component's existing visual style.
 */
export function ContactsTable({ result }: { result: ContactPage }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sortKey = (searchParams.get('sort') as ContactSortKey | null) ?? 'createdAt'
  const sortDir = (searchParams.get('dir') as 'asc' | 'desc' | null) ?? 'desc'

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      if (!('page' in updates)) next.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (query !== (searchParams.get('q') ?? '')) {
        updateParams({ q: query || null })
      }
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function goToPage(page: number) {
    updateParams({ page: String(page) })
  }

  function handleSortChange(value: string) {
    const [key, dir] = value.split(':') as [ContactSortKey, 'asc' | 'desc']
    updateParams({ sort: key, dir })
  }

  const { contacts, total, page, pageCount } = result
  const rangeStart = total === 0 ? 0 : (page - 1) * result.pageSize + 1
  const rangeEnd = Math.min(page * result.pageSize, total)

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-white/[0.06]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts by name, company, role..."
            className="pl-9"
          />
        </div>
        <select
          value={`${sortKey}:${sortDir}`}
          onChange={(event) => handleSortChange(event.target.value)}
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
          <option value="lastActivityAt:desc">Recently active</option>
        </select>
        <span className="text-xs text-white/35 sm:ml-auto">
          {total === 0 ? '0 contacts' : `${rangeStart}–${rangeEnd} of ${total} contacts`}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
        {contacts.map((contact) => (
          <div key={contact.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 shrink-0 rounded-full bg-purple-600/25 flex items-center justify-center text-xs font-medium text-purple-300">
                  {contact.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="text-sm font-medium text-white hover:text-purple-300 transition-colors truncate block"
                  >
                    {contact.name}
                  </Link>
                  <p className="text-xs text-white/45 truncate">{contact.designation}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <Badge variant={contact.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {contact.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </Badge>
                <DeleteRowButton
                  action={deleteContactAction.bind(null, contact.id)}
                  confirmLabel={`Delete ${contact.name}?`}
                />
              </div>
            </div>
            <p className="text-xs text-white/55 mt-3">{contact.company}</p>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-white/40 flex items-center gap-1.5 truncate">
                <Mail className="h-3 w-3 shrink-0" /> {contact.email}
              </p>
              <p className="text-xs text-white/40 flex items-center gap-1.5">
                <Phone className="h-3 w-3 shrink-0" /> {contact.phone}
              </p>
            </div>
          </div>
        ))}
        {contacts.length === 0 && (
          <div className="col-span-full py-10 text-center text-white/40 text-sm">No contacts match your search.</div>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 p-4 border-t border-white/[0.06]">
          <span className="text-xs text-white/40">
            Page {page} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

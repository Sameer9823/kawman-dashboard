import type { Session } from '@/lib/auth'
import { getRecordScope } from '@/lib/record-scope'

// ---------------------------------------------------------------------------
// Owner-scoped helpers
// ---------------------------------------------------------------------------
// scopeWhere() was copy-pasted verbatim across 4 CRM service files
// (lead/company/contact/deal). Meeting has a genuinely different shape
// (participants OR) and keeps its own function — see meeting.service.ts.
// This keeps Prisma type safety: callers get back the exact
// `Prisma.<Model>WhereInput` for their model, not `any`.
// ---------------------------------------------------------------------------

/**
 * Generic owner-scope clause: ALL → {}, DEPARTMENT → { owner.departmentId },
 * otherwise → { ownerId }. Used by Lead/Company/Contact/Deal which all
 * filter by their direct `ownerId` relation.
 *
 * Implementation intentionally mirrors the old inlined bodies exactly
 * (getRecordScope → ALL/DEPARTMENT + department?.id guard) so query
 * results do not change.
 */
export function ownerScopeWhere<T>(user: Session['user']): T {
  const scope = getRecordScope(user)
  if (scope === 'ALL') return {} as T
  if (scope === 'DEPARTMENT' && user.department?.id) {
    return { owner: { departmentId: user.department.id } } as unknown as T
  }
  return { ownerId: user.id } as unknown as T
}

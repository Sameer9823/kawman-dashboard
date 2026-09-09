'use client'

import { useActionState, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createMeetingWithVideoAction, type CreateMeetingWithVideoState } from '../actions'
import type { UserOption } from '@/services/user.service'

const initialState: CreateMeetingWithVideoState = {}

export function NewMeetingForm({
  users,
  companies,
  contacts,
  currentUserId,
}: {
  users: UserOption[]
  companies: { id: string; name: string }[]
  contacts: { id: string; name: string; companyId: string }[]
  currentUserId: string
}) {
  const [state, formAction, pending] = useActionState(createMeetingWithVideoAction, initialState)
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([currentUserId])

  function toggleParticipant(id: string) {
    setSelectedParticipants((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input type="hidden" name="participantIds" value={selectedParticipants.join(',')} />

        <Field label="Meeting title *" error={state.fieldErrors?.title}>
          <Input name="title" placeholder="Q3 renewal discussion" required />
        </Field>

        <Field label="Video file *" error={state.fieldErrors?.videoFile}>
          <input
            type="file"
            name="videoFile"
            accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
            required
            className="w-full text-sm text-white/70 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border file:border-white/[0.1] file:bg-white/[0.05] file:text-white/70 hover:file:bg-white/[0.1]"
          />
          <p className="text-xs text-white/40 mt-1">MP4, WebM, MOV, AVI, MKV (max 500MB)</p>
        </Field>

        <Field label="Company" error={state.fieldErrors?.companyId}>
          <select
            name="companyId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">No company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contact" error={state.fieldErrors?.contactId}>
          <select
            name="contactId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Deal" error={state.fieldErrors?.dealId}>
          <select
            name="dealId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">No deal</option>
          </select>
        </Field>

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm text-white/70">Participants</label>
          <div className="flex flex-wrap gap-2">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleParticipant(u.id)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  selectedParticipants.includes(u.id)
                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                    : 'bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {u.name}
              </button>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm text-white/70">Notes</label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Agenda or context for this meeting..."
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={pending} disabled={pending}>
            {pending ? 'Uploading…' : 'Upload meeting'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/70">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
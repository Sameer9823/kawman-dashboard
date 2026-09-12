'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  phone: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  image: z.string().trim().url('Enter a valid URL').optional().or(z.literal('')),
})

export interface ProfileFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
}

/** Updates the CURRENT user's own profile only — there is deliberately no userId parameter, so this can never be used to edit someone else's account. */
export async function updateOwnProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  await validateCsrf()
  const session = await requireApiSession()
  const parsed = profileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: data.name,
      phone: data.phone || null,
      designation: data.designation || null,
      image: data.image || null,
    },
  })

  revalidatePath('/settings/profile')
  return { success: true }
}

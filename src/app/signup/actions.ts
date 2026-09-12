'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { ensureRolesAndPermissionsSeeded } from '@/lib/rbac-seed'
import { headers } from 'next/headers'

const signupSchema = z.object({
  organizationName: z.string().trim().min(2, 'Organization name is too short').max(120),
  name: z.string().trim().min(2, 'Your name is too short').max(120),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export interface SignupState {
  success?: boolean
  error?: string
  fieldErrors?: Partial<Record<'organizationName' | 'name' | 'email' | 'password', string>>
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'workspace'
  let candidate = root
  let attempt = 0
  while (await prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    attempt += 1
    candidate = `${root}-${attempt}`
  }
  return candidate
}

export async function signupAction(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  await validateCsrf()
  const parsed = signupSchema.safeParse({
    organizationName: formData.get('organizationName'),
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    const fieldErrors: SignupState['fieldErrors'] = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<SignupState['fieldErrors']>
      fieldErrors[key] = issue.message
    }
    return { fieldErrors }
  }

  const { organizationName, name, email, password } = parsed.data

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existingUser) {
    return { fieldErrors: { email: 'An account with this email already exists' } }
  }

  await ensureRolesAndPermissionsSeeded()

  const slug = await uniqueSlug(organizationName)
  const organization = await prisma.organization.create({
    data: { name: organizationName, slug },
  })

  try {
    const { user: createdUser } = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        // additional field declared in lib/auth.ts betterAuth({ user: { additionalFields }})
        organizationId: organization.id,
      } as never,
      headers: await headers(),
      // nextCookies() plugin (registered in lib/auth.ts) sets the session
      // cookie on this response automatically since we're inside a
      // Server Action — no manual cookie handling needed.
    })

    const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } })

    if (superAdminRole && createdUser) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: createdUser.id, roleId: superAdminRole.id } },
        update: {},
        create: { userId: createdUser.id, roleId: superAdminRole.id },
      })
    }

    return { success: true }
  } catch (err) {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => {})
    const message =
      err && typeof err === 'object' && 'body' in err
        ? ((err as { body?: { message?: string } }).body?.message ?? 'Could not create your account. Please try again.')
        : err instanceof Error
          ? err.message
          : 'Could not create your account. Please try again.'
    return { error: message }
  }
}

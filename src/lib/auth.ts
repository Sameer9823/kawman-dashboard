import 'server-only'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { customSession } from 'better-auth/plugins/custom-session'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { prisma } from '@/lib/db'
import { getUserPermissions } from '@/services/permission.service'
import { sendPasswordResetEmail, sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * Central auth instance. Everything server-side that needs to know
 * "who is logged in" goes through this — never trust client state.
 *
 * organizationId is an additional field on the User model that MUST be
 * supplied at signUp time (see app/(auth)/actions.ts, which creates the
 * Organization + first user together in one transaction). `input: true`
 * lets the signup call set it once; there is no update-profile endpoint
 * that touches it, so a logged-in user can never move themselves into a
 * different organization.
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    // Uses the Resend-backed email service in lib/email.ts when
    // RESEND_API_KEY + EMAIL_FROM are set; otherwise falls back to
    // logging the link server-side so the flow stays testable in dev.
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url)
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once per day of activity
    cookieCache: { enabled: true, maxAge: 60 }, // 60s edge-cookie cache for middleware
  },

  // Better-Auth's built-in limiter, keyed by IP by default. Enabled in every
  // environment (not just production, which is the library default) since
  // the audit flagged auth endpoints as having no throttling at all.
  // Storage is in-memory, which is fine for a single instance; if this is
  // ever deployed with multiple server instances, set `storage:
  // "secondary-storage"` and wire up REDIS_URL so all instances share
  // counters (see `secondaryStorage` note below — omitted here since no
  // Redis client is currently connected for this purpose).
  rateLimit: {
    enabled: true,
    window: 60, // seconds
    max: 20, // generous default for the general auth surface
    customRules: {
      // Credential guessing / brute force — tightest limits.
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60 * 10, max: 5 },
      '/request-password-reset': { window: 60 * 10, max: 3 },
      '/reset-password': { window: 60 * 10, max: 5 },
    },
  },

  user: {
    additionalFields: {
      organizationId: { type: 'string', required: true, input: true },
      employeeId: { type: 'string', required: false, input: true },
      phone: { type: 'string', required: false, input: true },
      designation: { type: 'string', required: false, input: true },
    },
  },

  plugins: [
    // Email verification via OTP - sends verification email on signup
    // Requires RESEND_API_KEY and EMAIL_FROM env vars to actually send emails;
    // otherwise falls back to logging the verification link server-side.
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        const subject = type === 'email-verification'
          ? 'Verify your Kawman ExAct email address'
          : type === 'forget-password'
            ? 'Reset your Kawman ExAct password'
            : 'Your Kawman ExAct verification code'
        const html = `
          <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a;">
            <h2 style="margin:0 0 16px;font-size:18px;">${subject}</h2>
            <p style="font-size:14px;line-height:1.6;">Your verification code is: <strong style="font-size:24px;letter-spacing:4px;">${otp}</strong></p>
            <p style="font-size:14px;line-height:1.6;">This code expires in 5 minutes.</p>
            <p style="font-size:12px;color:#64748b;">If you didn't request this, you can safely ignore this email.</p>
            <p style="margin-top:32px;font-size:12px;color:#64748b;">Kawman ExAct · Enterprise Workspace Platform</p>
          </div>
        `
        if (isEmailConfigured()) {
          await sendEmail({ to: email, subject, html })
        } else {
          console.log(`[email:dev] OTP email to ${email} (${type}) — delivery simulated (OTP hidden)`)
        }
      },
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
    }),

    // Every session response (server AND client) is enriched here with the
    // caller's resolved org/department/team/roles/permissions, computed
    // fresh from the DB — never trust a client-cached permission list.
    customSession(async ({ user, session }) => {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: {
            organization: { select: { id: true, name: true, slug: true } },
            department: { select: { id: true, name: true } },
            team: { select: { id: true, name: true } },
            roles: { include: { role: true } },
          },
        })

        const permissions = dbUser
          ? await getUserPermissions(dbUser.id, dbUser.organizationId)
          : []

        return {
          session,
          user: {
            ...user,
            organizationId: dbUser?.organizationId ?? '',
            organization: dbUser?.organization ?? null,
            department: dbUser?.department ?? null,
            team: dbUser?.team ?? null,
            status: dbUser?.status ?? 'ACTIVE',
            roles: dbUser?.roles.map((r) => r.role.name) ?? [],
            permissions,
          },
        }
      } catch (err) {
        console.error('[auth:customSession] Prisma error (returning bare session):', err)
        return {
          session,
          user: {
            ...user,
            organizationId: (user as unknown as { organizationId?: string }).organizationId ?? '',
            organization: null,
            department: null,
            team: null,
            status: 'ACTIVE',
            roles: [],
            permissions: [],
          },
        }
      }
    }),
    nextCookies(), // must be registered last: applies Set-Cookie on Server Actions
  ],
})

export type Session = typeof auth.$Infer.Session

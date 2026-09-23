import 'server-only'

/**
 * Transactional email, abstracted behind one function so call sites never
 * need to know which provider is behind it (audit: "Add Email Service").
 *
 * Provider: Resend, called via plain `fetch` against their REST API — no
 * SDK dependency needed, keeps package.json untouched. Set RESEND_API_KEY
 * and EMAIL_FROM to go live; see .env.example.
 *
 * Fallback: if no API key is configured, emails are logged to the server
 * console instead of failing outright, so every flow that sends mail
 * (password reset, user invites) stays fully testable in dev without an
 * account or without the send actually reaching an address that may not
 * exist.
 *
 * Queue Support: Emails can be queued via BullMQ for async processing.
 * Use `queueEmail()` from `@/services/queue.service` for background sending.
 */

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  /** Plain-text fallback; auto-derived from html (very roughly) if omitted. */
  text?: string
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Send email directly (synchronous)
 * Use for immediate sends like password reset
 */
export async function sendEmail(input: SendEmailInput): Promise<{ delivered: boolean }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    const missing = [!apiKey && 'RESEND_API_KEY', !from && 'EMAIL_FROM'].filter(Boolean).join(', ')
    // Verbose in dev so the missing-config mode is impossible to miss
    console.warn(
      `[email:dev] ✗ NOT SENT — missing ${missing}. To: ${input.to} | Subject: "${input.subject}" | Mode: dev-log (set RESEND_API_KEY + EMAIL_FROM to actually deliver).`
    )
    return { delivered: false }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[email] ✗ Resend send failed (${res.status}): ${body} | To: ${input.to} | Subject: "${input.subject}"`)
    return { delivered: false }
  }

  console.log(`[email] ✓ Sent via Resend | To: ${input.to} | Subject: "${input.subject}"`)
  return { delivered: true }
}

// ============================================================
// Template System — using React-style templates in templates/
// ============================================================

// Re-export templates
export {
  PasswordResetTemplate,
  UserInviteTemplate,
  LeadAssignedTemplate,
  DealStageChangedTemplate,
  MeetingReminderTemplate,
  DailyReportReminderTemplate,
  FieldVisitAssignedTemplate,
  AIReportReadyTemplate,
  FileSharedTemplate,
  MentionNotificationTemplate,
} from './email/templates'

// Re-export types
export type {
  PasswordResetTemplateProps,
  UserInviteTemplateProps,
  LeadAssignedTemplateProps,
  DealStageChangedTemplateProps,
  MeetingReminderTemplateProps,
  DailyReportReminderTemplateProps,
  FieldVisitAssignedTemplateProps,
  AIReportReadyTemplateProps,
  FileSharedTemplateProps,
  MentionNotificationTemplateProps,
} from './email/templates'

// ============================================================
// High-level email functions (use templates + sendEmail)
// ============================================================

import { PasswordResetTemplate } from './email/templates/password-reset'
import { UserInviteTemplate } from './email/templates/user-invite'

export async function sendPasswordResetEmail(to: string, resetUrl: string, userName?: string) {
  const { html, text } = PasswordResetTemplate({ resetUrl, userName })
  return sendEmail({ to, subject: 'Reset your Kawman ExAct password', html, text })
}

export async function sendUserInviteEmail(
  to: string,
  name: string,
  tempPassword: string,
  loginUrl: string,
  organizationName: string,
  invitedByName?: string
) {
  const { html, text } = UserInviteTemplate({
    loginUrl,
    userName: name,
    tempPassword,
    organizationName,
    invitedByName,
  })
  return sendEmail({ to, subject: `Welcome to ${organizationName}`, html, text })
}

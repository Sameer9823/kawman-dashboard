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
// Templates — kept plain and inline (no MJML/React-email dependency) so
// this stays a single, dependency-free file. Swap for a template system
// later if the design needs to get fancier.
// ============================================================

function wrapper(title: string, bodyHtml: string): string {
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a;">
      <h2 style="margin:0 0 16px;font-size:18px;">${title}</h2>
      ${bodyHtml}
      <p style="margin-top:32px;font-size:12px;color:#64748b;">Kawman ExAct · Enterprise Workspace Platform</p>
    </div>`
}

export function sendPasswordResetEmail(to: string, resetUrl: string) {
  return sendEmail({
    to,
    subject: 'Reset your Kawman ExAct password',
    html: wrapper(
      'Reset your password',
      `<p style="font-size:14px;line-height:1.6;">We received a request to reset your password. This link expires in 1 hour.</p>
       <p style="margin:24px 0;">
         <a href="${resetUrl}" style="background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;">Reset password</a>
       </p>
       <p style="font-size:12px;color:#64748b;">If you didn't request this, you can safely ignore this email.</p>`
    ),
  })
}

export function sendUserInviteEmail(to: string, name: string, tempPassword: string, loginUrl: string) {
  return sendEmail({
    to,
    subject: "You've been added to Kawman ExAct",
    html: wrapper(
      `Welcome, ${name}`,
      `<p style="font-size:14px;line-height:1.6;">An account has been created for you on Kawman ExAct. Use the temporary password below to sign in, then change it from Settings.</p>
       <p style="font-size:14px;">Email: <strong>${to}</strong><br/>Temporary password: <strong>${tempPassword}</strong></p>
       <p style="margin:24px 0;">
         <a href="${loginUrl}" style="background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;">Sign in</a>
       </p>`
    ),
  })
}

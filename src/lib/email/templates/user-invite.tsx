import 'server-only'
import { BaseTemplate, TextTemplate } from './base'

export interface UserInviteTemplateProps {
  loginUrl: string
  userName: string
  tempPassword: string
  organizationName: string
  invitedByName?: string
}

export function UserInviteTemplate({
  loginUrl,
  userName,
  tempPassword,
  organizationName,
  invitedByName,
}: UserInviteTemplateProps): { html: string; text: string } {
  const inviterText = invitedByName ? ` by ${invitedByName}` : ''

  const html = BaseTemplate({
    title: `Welcome to ${organizationName}`,
    preheader: 'Your account has been created - here are your login details',
    children: `
      <p>Hi ${userName},</p>
      <p>You've been added to <strong>${organizationName}</strong> on Kawman ExAct${inviterText}. Your account has been created and is ready to use.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Email:</strong> ${userName}</p>
        <p style="margin: 0; font-size: 14px;"><strong>Temporary Password:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">${tempPassword}</code></p>
      </div>
      
      <p>Please sign in using the temporary password above, then immediately change it from your Settings page for security.</p>
    `,
    cta: {
      text: 'Sign In to Kawman ExAct',
      url: loginUrl,
    },
    footer: 'For security, this temporary password should be changed on first login. Contact your administrator if you need assistance.',
  })

  const text = TextTemplate({
    title: `Welcome to ${organizationName}`,
    children: `Hi ${userName},\n\nYou've been added to ${organizationName} on Kawman ExAct${inviterText}. Your account has been created.\n\nEmail: ${userName}\nTemporary Password: ${tempPassword}\n\nPlease sign in and change your password immediately.`,
    cta: {
      text: 'Sign In',
      url: loginUrl,
    },
  })

  return { html, text }
}
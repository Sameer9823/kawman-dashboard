import 'server-only'
import { headers } from 'next/headers'

/**
 * CSRF protection for Server Actions.
 * 
 * Next.js Server Actions are vulnerable to CSRF attacks because they
 * accept POST requests from any origin. This utility validates that
 * the request comes from the same origin as the application.
 * 
 * Usage in Server Actions:
 * ```ts
 * 'use server'
 * import { validateCsrf } from '@/lib/csrf'
 * 
 * export async function myAction() {
 *   await validateCsrf()
 *   // ... rest of the action
 * }
 * ```
 */
export async function validateCsrf(): Promise<void> {
  const headersList = await headers()
  const origin = headersList.get('origin')
  const host = headersList.get('host')
  
  // In development, allow localhost origins
  if (process.env.NODE_ENV === 'development') {
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      return
    }
  }
  
  // Check if origin matches the host
  if (origin && host) {
    try {
      const originUrl = new URL(origin)
      const hostUrl = new URL(`https://${host}`)
      
      if (originUrl.host === hostUrl.host) {
        return
      }
    } catch {
      // Invalid URL, continue to reject
    }
  }
  
  // If no origin header (e.g., same-origin request from browser), allow it
  // Browsers don't send Origin header for same-origin GET requests
  if (!origin) {
    return
  }
  
  throw new Error('CSRF validation failed: Invalid origin')
}

/**
 * Get the allowed origins for CORS/CSRF validation.
 * Useful for configuring CORS in API routes.
 */
export function getAllowedOrigins(): string[] {
  const origins: string[] = []
  
  // Add the app's base URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL
  if (baseUrl) {
    origins.push(baseUrl)
  }
  
  // Add localhost for development
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:3000', 'http://127.0.0.1:3000')
  }
  
  return origins
}
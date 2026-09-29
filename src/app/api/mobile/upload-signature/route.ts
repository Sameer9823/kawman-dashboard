import { NextRequest, NextResponse } from 'next/server'
import { requireMobileSession } from '../_utils'
import { getCloudinaryPublicConfig, isCloudinaryConfigured, cloudinaryOrgFolder } from '@/lib/cloudinary'
import { checkRateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  let session
  try {
    session = await requireMobileSession(request)
  } catch (e) {
    return e
  }

  const permissions = session.user.permissions
  const hasPermission =
    permissions.includes('field_visits.create') || permissions.includes('field_visits.update')

  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rate limit: max 10 signature uploads per user per hour (3600 seconds)
  const rateKey = `sig-upload:${session.user.id}`
  const rateCheck = await checkRateLimit(rateKey, 10, 3600)
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'Cloudinary is not configured' }, { status: 503 })
  }

  const folder = cloudinaryOrgFolder(session.user.organizationId)
  const timestamp = Math.floor(Date.now() / 1000)

  const signature = signCloudinaryRequest({
    timestamp,
    folder,
  })

  const publicConfig = getCloudinaryPublicConfig()

  return NextResponse.json({
    timestamp,
    folder,
    signature,
    apiKey: publicConfig.apiKey,
    cloudName: publicConfig.cloudName,
  })
}

function signCloudinaryRequest(params: Record<string, string | number>): string {
  const secret = process.env.CLOUDINARY_API_SECRET!
  if (!secret) {
    throw new Error('CLOUDINARY_API_SECRET is not set')
  }

  const sortedKeys = Object.keys(params).sort()
  const stringToSign = sortedKeys.map((k) => `${k}=${params[k]}`).join('&') + '&' + secret

  return crypto.createHash('sha1').update(stringToSign).digest('hex')
}

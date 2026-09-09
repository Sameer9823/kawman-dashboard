import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { isCloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinary'
import { createFileRecord } from '@/services/file.service'
import { checkRateLimit } from '@/lib/rate-limit'
import type { FileVisibility } from '@/types/files'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

// Allowed MIME types for file uploads
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/gzip',
  // Video
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/webm',
  // Code
  'application/json',
  'application/xml',
  'text/html',
  'text/css',
  'text/javascript',
  'application/typescript',
])

export async function POST(request: Request) {
  console.log('[UPLOAD] Starting file upload request')
  let session
  try {
    session = await requireApiSession()
    console.log('[UPLOAD] Session obtained:', { userId: session.user.id, orgId: session.user.organizationId })
  } catch (err) {
    console.error('[UPLOAD] Authentication failed:', err)
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!session.user.permissions.includes('files.upload')) {
    console.warn('[UPLOAD] Permission denied for user:', session.user.id)
    return NextResponse.json({ error: 'You do not have permission to upload files.' }, { status: 403 })
  }

  // Uploads are bandwidth- and storage-costly, so they get their own limit
  // separate from the general API surface (audit: "No Rate Limiting").
  const limit = await checkRateLimit(`file-upload:${session.user.id}`, 30, 60)
  if (!limit.allowed) {
    console.warn('[UPLOAD] Rate limit exceeded for user:', session.user.id)
    return NextResponse.json(
      { error: 'Too many uploads. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  if (!isCloudinaryConfigured()) {
    console.error('[UPLOAD] Cloudinary not configured')
    return NextResponse.json(
      { error: 'Cloudinary is not configured. Ask an admin to set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.' },
      { status: 503 }
    )
  }

  const formData = await request.formData().catch((err) => {
    console.error('[UPLOAD] Failed to parse formData:', err)
    return null
  })
  const file = formData?.get('file')
  if (!file || !(file instanceof File)) {
    console.warn('[UPLOAD] No file provided or invalid file')
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  console.log('[UPLOAD] File received:', { name: file.name, size: file.size, type: file.type })
  if (file.size > MAX_SIZE_BYTES) {
    console.warn('[UPLOAD] File too large:', file.size)
    return NextResponse.json({ error: 'File exceeds the 50MB limit' }, { status: 400 })
  }

  // Validate MIME type
  const mimeType = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    console.warn('[UPLOAD] Disallowed MIME type:', mimeType)
    return NextResponse.json(
      { error: `File type "${mimeType}" is not allowed. Allowed types: images, documents, archives, video, audio, and code files.` },
      { status: 400 }
    )
  }

  const folderId = (formData?.get('folderId') as string) || null
  const visibility = ((formData?.get('visibility') as string) || 'PRIVATE') as FileVisibility
  console.log('[UPLOAD] Upload options:', { folderId, visibility })

  try {
    console.log('[UPLOAD] Converting file to buffer...')
    const buffer = Buffer.from(await file.arrayBuffer())
    console.log('[UPLOAD] Buffer created, size:', buffer.length)

    console.log('[UPLOAD] Uploading to Cloudinary...')
    const upload = await uploadToCloudinary(buffer, {
      organizationId: session.user.organizationId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    })
    console.log('[UPLOAD] Cloudinary upload successful:', { publicId: upload.publicId, resourceType: upload.resourceType, fileSize: upload.fileSize })

    console.log('[UPLOAD] Creating file record in database...')
    const fileId = await createFileRecord({
      fileName: file.name,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: upload.fileSize,
      cloudinaryPublicId: upload.publicId,
      cloudinaryResourceType: upload.resourceType,
      secureUrl: upload.secureUrl,
      thumbnailUrl: upload.thumbnailUrl,
      version: upload.version,
      folderId: folderId || null,
      visibility,
    })
    console.log('[UPLOAD] File record created:', fileId)

    return NextResponse.json({ id: fileId })
  } catch (err) {
    console.error('[UPLOAD] Upload failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
  }
}

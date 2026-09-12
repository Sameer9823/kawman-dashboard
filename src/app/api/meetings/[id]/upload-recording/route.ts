import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission gate — only users who can update meetings may attach recordings
    if (!(session.user.permissions as string[]).includes('meetings.update') && !(session.user.permissions as string[]).includes('meetings.create')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const limit = await checkRateLimit(`meeting-upload:${session.user.id}`, 5, 60)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    if (!isCloudinaryConfigured()) {
      return NextResponse.json({ error: 'File uploads are not configured.' }, { status: 503 })
    }

    const { id: meetingId } = await params

    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, organizationId: session.user.organizationId },
      select: { id: true, organizationId: true },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'])
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Please upload a video file.' }, { status: 400 })
    }

    const maxSize = 50 * 1024 * 1024 // 50 MB — Cloudinary handles larger via chunked upload, but cap API payload
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Maximum size is 50 MB.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const upload = await uploadToCloudinary(buffer, {
      organizationId: session.user.organizationId,
      fileName: file.name,
      mimeType: file.type || 'video/mp4',
    })

    const recording = await prisma.meetingRecording.create({
      data: {
        meetingId,
        cloudinaryPublicId: upload.publicId,
        secureUrl: upload.secureUrl,
        duration: null,
        fileSize: upload.fileSize,
      },
    })

    triggerTranscriptionAndMoM(meetingId, recording.id, upload.secureUrl).catch((e) =>
      console.error('[MEETING-UPLOAD] Transcription/MoM failed:', e)
    )

    return NextResponse.json({
      success: true,
      recording: {
        id: recording.id,
        secureUrl: recording.secureUrl,
        duration: recording.duration,
        fileSize: recording.fileSize,
      },
    })
  } catch (error) {
    console.error('Upload recording error:', error)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}

async function triggerTranscriptionAndMoM(meetingId: string, recordingId: string, videoUrl: string) {
  try {
    const { transcribeVideo } = await import('@/lib/transcription')
    const { generateMeetingSummary } = await import('@/services/meeting.service')

    const transcript = await transcribeVideo(videoUrl)

    if (transcript) {
      await prisma.meetingTranscript.create({
        data: {
          meetingId,
          content: transcript,
          language: 'en',
        },
      })

      await generateMeetingSummary(meetingId)
    }
  } catch (error) {
    console.error('Transcription/MoM generation failed:', error)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: meetingId } = await params

    // Verify meeting exists and user has access
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, organizationId: true },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // Check if user belongs to the same organization
    if (meeting.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Please upload a video file.' }, { status: 400 })
    }

    // Validate file size (500MB max)
    const maxSize = 500 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Maximum size is 500MB.' }, { status: 400 })
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Cloudinary
    const uploadResult = await new Promise<{ secure_url: string; public_id: string; duration?: number }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: `meetings/${meetingId}`,
          public_id: `recording_${Date.now()}`,
          chunk_size: 6000000,
        },
        (error, result) => {
          if (error) reject(error)
          else if (result) resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
            duration: result.duration,
          })
          else reject(new Error('Upload failed'))
        }
      )

      const readable = new Readable()
      readable._read = () => {}
      readable.push(buffer)
      readable.push(null)
      readable.pipe(uploadStream)
    })

    // Create recording record in database
    const recording = await prisma.meetingRecording.create({
      data: {
        meetingId,
        cloudinaryPublicId: uploadResult.public_id,
        secureUrl: uploadResult.secure_url,
        duration: uploadResult.duration ? Math.round(uploadResult.duration) : null,
        fileSize: file.size,
      },
    })

    // Trigger transcription and MoM generation asynchronously
    // We don't await this to return response quickly
    triggerTranscriptionAndMoM(meetingId, recording.id, uploadResult.secure_url).catch(console.error)

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
    // Import dynamically to avoid circular dependencies
    const { transcribeVideo } = await import('@/lib/transcription')
    const { generateMeetingSummary } = await import('@/services/meeting.service')

    // Transcribe the video
    const transcript = await transcribeVideo(videoUrl)

    if (transcript) {
      // Save transcript
      await prisma.meetingTranscript.create({
        data: {
          meetingId,
          content: transcript,
          language: 'en',
        },
      })

      // Generate MoM from transcript
      await generateMeetingSummary(meetingId)
    }
  } catch (error) {
    console.error('Transcription/MoM generation failed:', error)
  }
}
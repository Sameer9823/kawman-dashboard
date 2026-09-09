'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { saveTranscript, addRecordingLink, generateMeetingSummary, updateMeetingSummaryText, createMeetingWithVideo, retryMeetingVideoProcessing } from '@/services/meeting.service'
import { isCloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinary'
import { getTranscriptionService } from '@/lib/transcription'
import { logAudit } from '@/lib/audit-log'

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!session.user.permissions.includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

// ============================================================
// Create meeting (video upload flow)
// ============================================================

const meetingSchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  notes: z.string().trim().optional(),
  companyId: z.string().trim().optional(),
  contactId: z.string().trim().optional(),
  dealId: z.string().trim().optional(),
  participantIds: z.string().trim().optional(),
})

export interface MeetingFormState {
  error?: string
  fieldErrors?: Record<string, string>
}

export async function createMeetingAction(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const session = await assertPermission(PERMISSIONS['meetings.create'].name)
  const parsed = meetingSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const participantIds = data.participantIds
    ? Array.from(new Set(data.participantIds.split(',').map((s) => s.trim()).filter(Boolean)))
    : []
  if (!participantIds.includes(session.user.id)) participantIds.push(session.user.id)

  const meeting = await prisma.meeting.create({
    data: {
      title: data.title,
      type: 'VIDEO_CALL',
      status: 'SCHEDULED',
      scheduledAt: new Date(),
      duration: 0,
      notes: data.notes || null,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
      companyId: data.companyId || null,
      contactId: data.contactId || null,
      dealId: data.dealId || null,
      participants: {
        create: participantIds.map((userId) => ({
          userId,
          role: userId === session.user.id ? 'ORGANIZER' : 'PARTICIPANT',
        })),
      },
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Meeting',
    resourceId: meeting.id,
    metadata: { title: meeting.title, type: meeting.type },
  })

  revalidatePath('/meetings')
  redirect(`/meetings/${meeting.id}`)
}

const MEETING_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'PROCESSING', 'FAILED'] as const

export async function updateMeetingStatusAction(meetingId: string, status: (typeof MEETING_STATUSES)[number]): Promise<void> {
  const session = await assertPermission(PERMISSIONS['meetings.update'].name)
  if (!MEETING_STATUSES.includes(status)) throw new Error('Invalid status')
  const existing = await prisma.meeting.findFirst({ where: { id: meetingId, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status,
      startedAt: status === 'IN_PROGRESS' && !existing.startedAt ? new Date() : existing.startedAt,
      endedAt: status === 'COMPLETED' ? new Date() : existing.endedAt,
    },
  })
  revalidatePath(`/meetings/${meetingId}`)
  revalidatePath('/meetings')
}

// ============================================================
// Transcript
// ============================================================

export interface SimpleActionState {
  error?: string
  success?: boolean
}

export async function saveTranscriptAction(meetingId: string, content: string): Promise<SimpleActionState> {
  try {
    await assertPermission(PERMISSIONS['meetings.update'].name)
    if (!content.trim()) return { error: 'Transcript cannot be empty' }
    await saveTranscript(meetingId, content.trim())
    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings/mom')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save transcript' }
  }
}

// ============================================================
// Recording link
// ============================================================

export async function addRecordingLinkAction(meetingId: string, secureUrl: string, duration?: number): Promise<SimpleActionState> {
  try {
    await assertPermission(PERMISSIONS['meetings.update'].name)
    if (!secureUrl.trim()) return { error: 'A video URL is required' }
    await addRecordingLink(meetingId, secureUrl.trim(), duration)
    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings/videos')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add recording' }
  }
}

// ============================================================
// AI MoM
// ============================================================

export async function generateMomAction(meetingId: string): Promise<SimpleActionState> {
  try {
    await assertPermission(PERMISSIONS['meetings.update'].name)
    await generateMeetingSummary(meetingId)
    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings/mom')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to generate MoM' }
  }
}

export async function editMomSummaryAction(meetingId: string, summary: string): Promise<SimpleActionState> {
  try {
    await assertPermission(PERMISSIONS['meetings.update'].name)
    if (!summary.trim()) return { error: 'Summary cannot be empty' }
    await updateMeetingSummaryText(meetingId, summary.trim())
    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings/mom')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update MoM' }
  }
}

// ============================================================
// Video Upload + Auto Transcription + MoM
// ============================================================

export interface UploadRecordingState {
  error?: string
  success?: boolean
  recordingId?: string
  transcriptId?: string
  summaryId?: string
}

export async function uploadRecordingAction(
  meetingId: string,
  formData: FormData
): Promise<UploadRecordingState> {
  try {
    const session = await assertPermission(PERMISSIONS['meetings.update'].name)
    
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return { error: 'No video file provided' }
    }

    // Validate file type
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    if (!allowedTypes.includes(file.type)) {
      return { error: 'Invalid file type. Please upload MP4, WebM, MOV, AVI, or MKV files.' }
    }

    // Validate file size (500MB max for videos)
    const MAX_VIDEO_SIZE = 500 * 1024 * 1024
    if (file.size > MAX_VIDEO_SIZE) {
      return { error: 'Video file exceeds 500MB limit' }
    }

    if (!isCloudinaryConfigured()) {
      return { error: 'Cloudinary is not configured. Ask an admin to set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.' }
    }

    // Upload to Cloudinary
    const buffer = Buffer.from(await file.arrayBuffer())
    const upload = await uploadToCloudinary(buffer, {
      organizationId: session.user.organizationId,
      fileName: file.name,
      mimeType: file.type,
    })

    // Create meeting recording record
    const recording = await prisma.meetingRecording.create({
      data: {
        meetingId,
        cloudinaryPublicId: upload.publicId,
        secureUrl: upload.secureUrl,
        duration: null, // Could extract from video metadata
        fileSize: BigInt(upload.fileSize),
      },
    })

    // Trigger transcription in background (don't await)
    transcribeAndGenerateMom(meetingId, recording.id, upload.secureUrl).catch(err => {
      console.error('[UPLOAD] Background transcription failed:', err)
    })

    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings/videos')

    return { 
      success: true, 
      recordingId: recording.id,
    }
  } catch (err) {
    console.error('[UPLOAD] Upload recording failed:', err)
    return { error: err instanceof Error ? err.message : 'Failed to upload recording' }
  }
}

async function transcribeAndGenerateMom(meetingId: string, recordingId: string, videoUrl: string) {
  try {
    console.log('[TRANSCRIPTION] Starting transcription for recording:', recordingId)
    
    const transcriptionService = getTranscriptionService()
    const result = await transcriptionService.transcribe(videoUrl)

    // Save transcript
    const transcript = await prisma.meetingTranscript.create({
      data: {
        meetingId,
        content: result.text,
        language: result.language || 'en',
      },
    })

    console.log('[TRANSCRIPTION] Transcript saved:', transcript.id)

    // Generate MoM from transcript
    await generateMeetingSummary(meetingId)
    
    console.log('[TRANSCRIPTION] MoM generated for meeting:', meetingId)
  } catch (err) {
    console.error('[TRANSCRIPTION] Failed:', err)
    // Don't throw - this is a background process
  }
}

// ============================================================
// Create meeting with video upload
// ============================================================

export interface CreateMeetingWithVideoState {
  error?: string
  fieldErrors?: Record<string, string>
  meetingId?: string
}

export async function createMeetingWithVideoAction(
  _prev: CreateMeetingWithVideoState,
  formData: FormData
): Promise<CreateMeetingWithVideoState> {
  const session = await assertPermission(PERMISSIONS['meetings.create'].name)

  const title = formData.get('title')?.toString().trim() || ''
  const notes = formData.get('notes')?.toString().trim()
  const companyId = formData.get('companyId')?.toString().trim() || undefined
  const contactId = formData.get('contactId')?.toString().trim() || undefined
  const dealId = formData.get('dealId')?.toString().trim() || undefined
  const participantIds = formData.get('participantIds')?.toString().trim()
  const file = formData.get('videoFile')

  // Validate required fields
  const fieldErrors: Record<string, string> = {}
  if (!title || title.length < 2) {
    fieldErrors.title = 'Title is required (minimum 2 characters)'
  }
  if (!file || !(file instanceof File)) {
    fieldErrors.videoFile = 'Video file is required'
  } else {
    // Validate file type
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    if (!allowedTypes.includes(file.type)) {
      fieldErrors.videoFile = 'Invalid file type. Please upload MP4, WebM, MOV, AVI, or MKV files.'
    }
    // Validate file size (500MB max)
    const MAX_VIDEO_SIZE = 500 * 1024 * 1024
    if (file.size > MAX_VIDEO_SIZE) {
      fieldErrors.videoFile = 'Video file exceeds 500MB limit'
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors }
  }

  if (!isCloudinaryConfigured()) {
    return { error: 'Cloudinary is not configured. Ask an admin to set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.' }
  }

  const participantIdsArray = participantIds
    ? Array.from(new Set(participantIds.split(',').map((s) => s.trim()).filter(Boolean)))
    : []
  if (!participantIdsArray.includes(session.user.id)) participantIdsArray.push(session.user.id)

  // Upload video to Cloudinary
  const videoFile = file as File
  const buffer = Buffer.from(await videoFile.arrayBuffer())
  const upload = await uploadToCloudinary(buffer, {
    organizationId: session.user.organizationId,
    fileName: videoFile.name,
    mimeType: videoFile.type || 'video/mp4',
  })

  // Create meeting with PROCESSING status
  const meeting = await prisma.meeting.create({
    data: {
      organizationId: session.user.organizationId,
      title,
      type: 'VIDEO_CALL',
      status: 'PROCESSING',
      scheduledAt: new Date(),
      duration: 0,
      companyId: companyId || null,
      contactId: contactId || null,
      dealId: dealId || null,
      notes: notes || null,
      createdById: session.user.id,
      participants: participantIdsArray.length
        ? { connect: participantIdsArray.map((id) => ({ id })) }
        : undefined,
    },
  })

  // Create recording record
  await prisma.meetingRecording.create({
    data: {
      meetingId: meeting.id,
      cloudinaryPublicId: upload.publicId,
      secureUrl: upload.secureUrl,
      duration: null,
      fileSize: BigInt(upload.fileSize),
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Meeting',
    resourceId: meeting.id,
    metadata: { title: meeting.title, type: meeting.type, status: meeting.status, hasVideo: true },
  })

  // Start background processing (fire and forget)
  transcribeAndGenerateMom(meeting.id, '', upload.secureUrl).catch(err => {
    console.error('[MEETING] Background processing failed:', err)
  })

  revalidatePath('/meetings')
  revalidatePath('/meetings/videos')

  return { meetingId: meeting.id }
}

// ============================================================
// Retry video processing
// ============================================================

export async function retryMeetingVideoProcessingAction(meetingId: string) {
  const session = await assertPermission(PERMISSIONS['meetings.update'].name)
  
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, organizationId: session.user.organizationId },
    include: { recordings: { take: 1 } },
  })

  if (!meeting) throw new Error('Meeting not found')
  if (meeting.status !== 'FAILED') throw new Error('Meeting is not in FAILED status')
  if (!meeting.recordings.length) throw new Error('No recording to retry')

  const recording = meeting.recordings[0]

  // Update status to PROCESSING
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { status: 'PROCESSING' },
  })

  // Start background processing
  transcribeAndGenerateMom(meetingId, '', recording.secureUrl).catch(err => {
    console.error('[MEETING] Retry processing error:', err)
  })

  revalidatePath(`/meetings/${meetingId}`)
  revalidatePath('/meetings')

  return { success: true }
}

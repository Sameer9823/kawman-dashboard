import 'server-only'
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary'

export function isCloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

function configure() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
}

/** Cloudinary resource_type for a given MIME type. */
export function resourceTypeForMime(mimeType: string): 'image' | 'video' | 'raw' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return 'video'
  return 'raw'
}

export interface CloudinaryUploadResult {
  publicId: string
  resourceType: string
  secureUrl: string
  thumbnailUrl: string | null
  version: string
  fileSize: number
}

/** Uploads a file buffer to Cloudinary under an org-scoped folder. */
export async function uploadToCloudinary(
  buffer: Buffer,
  options: { organizationId: string; fileName: string; mimeType: string }
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.')
  }
  configure()

  const resourceType = resourceTypeForMime(options.mimeType)
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `kawman-exact/${options.organizationId}`,
        resource_type: resourceType,
        filename_override: options.fileName,
        use_filename: true,
        unique_filename: true,
      },
      (error, uploadResult) => {
        if (error) {
          reject(error)
        } else if (!uploadResult) {
          reject(new Error('Upload failed - no result'))
        } else {
          resolve(uploadResult)
        }
      }
    )
    stream.end(buffer)
  })

  const thumbnailUrl =
    resourceType === 'image'
      ? cloudinary.url(result.public_id, { transformation: [{ width: 300, height: 300, crop: 'fill' }], secure: true })
      : resourceType === 'video'
        ? cloudinary.url(result.public_id, { resource_type: 'video', format: 'jpg', secure: true })
        : null

  return {
    publicId: result.public_id,
    resourceType: result.resource_type,
    secureUrl: result.secure_url,
    thumbnailUrl,
    version: String(result.version),
    fileSize: result.bytes,
  }
}

export async function deleteFromCloudinary(publicId: string, resourceType: string): Promise<void> {
  if (!isCloudinaryConfigured()) return
  configure()
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType as 'image' | 'video' | 'raw' })
}

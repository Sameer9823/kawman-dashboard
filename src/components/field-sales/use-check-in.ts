'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface CheckInLocation {
  lat: number
  lng: number
  acc?: number
}

export interface UseCheckInOptions {
  onLocationCaptured?: (location: CheckInLocation) => void
  onLocationError?: (error: string) => void
  onCameraStarted?: () => void
  onCameraStopped?: () => void
}

export interface UseCheckInReturn {
  location: CheckInLocation | null
  locationError: string | null
  locationLoading: boolean
  captureLocation: () => void
  cameraActive: boolean
  cameraError: string | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  startCamera: () => Promise<void>
  stopCamera: () => void
  capturePhoto: () => void
  photo: File | null
  preview: string | null
  setPhoto: (file: File | null) => void
  clearPhoto: () => void
  fileRef: React.RefObject<HTMLInputElement | null>
  cameraFallbackRef: React.RefObject<HTMLInputElement | null>
  notes: string
  setNotes: (notes: string) => void
}

export function useCheckIn(options: UseCheckInOptions = {}): UseCheckInReturn {
  const {
    onLocationCaptured,
    onLocationError,
    onCameraStarted,
    onCameraStopped,
  } = options

  const [location, setLocation] = useState<CheckInLocation | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)

  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [photo, setPhotoState] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const cameraFallbackRef = useRef<HTMLInputElement>(null)

  const [notes, setNotes] = useState('')

  const captureLocation = useCallback(() => {
    setLocationError(null)
    setLocationLoading(true)

    if (!navigator.geolocation) {
      const error = 'Geolocation not supported on this device.'
      setLocationError(error)
      setLocationLoading(false)
      onLocationError?.(error)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
        }
        setLocation(loc)
        setLocationLoading(false)
        onLocationCaptured?.(loc)
      },
      (err) => {
        const error = err.message || 'Could not get your location. Enable location and try again.'
        setLocationError(error)
        setLocationLoading(false)
        onLocationError?.(error)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }, [onLocationCaptured, onLocationError])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
    onCameraStopped?.()
  }, [onCameraStopped])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
      onCameraStarted?.()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Could not access camera.'
      setCameraError(error)
      cameraFallbackRef.current?.click()
    }
  }, [onCameraStarted])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `checkin-${Date.now()}.jpg`, { type: 'image/jpeg' })
      setPhotoState(file)

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreview(url)
    }, 'image/jpeg', 0.8)
  }, [])

  const setPhoto = useCallback((file: File | null) => {
    if (!file) {
      setPhotoState(null)
      setPreview(null)
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      return
    }

    setPhotoState(file)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreview(url)
  }, [])

  const clearPhoto = useCallback(() => {
    setPhotoState(null)
    setPreview(null)
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [])

  return {
    location,
    locationError,
    locationLoading,
    captureLocation,
    cameraActive,
    cameraError,
    videoRef,
    startCamera,
    stopCamera,
    capturePhoto,
    photo,
    preview,
    setPhoto,
    clearPhoto,
    fileRef,
    cameraFallbackRef,
    notes,
    setNotes,
  }
}
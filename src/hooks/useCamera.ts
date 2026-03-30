import { useRef, useState, useCallback } from 'react'

export type CameraError =
  | { type: 'permission-denied'; message: string }
  | { type: 'not-found'; message: string }
  | { type: 'unknown'; message: string }

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>
  isActive: boolean
  error: CameraError | null
  startCamera: () => Promise<void>
  stopCamera: () => void
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<CameraError | null>(null)

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setIsActive(true)
    } catch (err) {
      const e = err as DOMException
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setError({ type: 'permission-denied', message: 'Camera permission denied. Please allow camera access and reload.' })
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        setError({ type: 'not-found', message: 'No camera found on this device.' })
      } else {
        setError({ type: 'unknown', message: `Camera error: ${e.message}` })
      }
      setIsActive(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsActive(false)
  }, [])

  return { videoRef, isActive, error, startCamera, stopCamera }
}

import { useRef, useState, useCallback } from 'react'

export type CameraError =
  | { type: 'permission-denied'; message: string }
  | { type: 'not-found'; message: string }
  | { type: 'unknown'; message: string }

export interface UseCameraReturn {
  /**
   * Callback ref — pass directly as `ref` to the <video> element.
   * When React attaches a new DOM node (e.g. after a mode switch),
   * the hook re-attaches the active stream immediately so the feed
   * is never lost across conditional re-renders.
   */
  videoRef: (el: HTMLVideoElement | null) => void
  /** The current video element, for inference callers. */
  videoEl: HTMLVideoElement | null
  isActive: boolean
  error: CameraError | null
  startCamera: () => Promise<void>
  stopCamera: () => void
}

export function useCamera(): UseCameraReturn {
  const videoElRef = useRef<HTMLVideoElement | null>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [error, setError]       = useState<CameraError | null>(null)

  // Callback ref — called by React whenever the <video> node changes.
  // Re-attaches the stream on the new element so mode switches don't blank the feed.
  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el
    if (el && streamRef.current) {
      el.srcObject = streamRef.current
      el.play().catch(() => {/* muted — should always succeed */})
    }
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      const el = videoElRef.current
      if (el) {
        el.srcObject = stream
        await el.play()
      }
      setIsActive(true)
    } catch (err) {
      const e = err as DOMException
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setError({ type: 'permission-denied', message: 'camera permission denied. please allow camera access and reload.' })
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        setError({ type: 'not-found', message: 'no camera found on this device.' })
      } else {
        setError({ type: 'unknown', message: `camera error: ${e.message}` })
      }
      setIsActive(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoElRef.current) videoElRef.current.srcObject = null
    setIsActive(false)
  }, [])

  return { videoRef, videoEl: videoElRef.current, isActive, error, startCamera, stopCamera }
}

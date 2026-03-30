import { useRef, useState, useCallback } from 'react'
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
  type Matrix,
} from '@mediapipe/tasks-vision'
import type { FaceResult } from '../types'

// The face_landmarker.task model — float16 quantized for smaller download (~3MB)
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'

export type LandmarkerStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseFaceLandmarkerReturn {
  status: LandmarkerStatus
  error: string | null
  /** Process a video frame and return FaceResult[] for each detected face */
  detectForVideo: (videoEl: HTMLVideoElement) => FaceResult[]
  /** Initialize the landmarker — call once on mount */
  initialize: () => Promise<void>
  /** Clean up the landmarker on unmount */
  destroy: () => void
}

/** Convert MediaPipe Matrix (column-major 4x4) data array into flat number[] */
function matrixToArray(matrix: Matrix | undefined): number[] {
  if (!matrix) return []
  return Array.from(matrix.data)
}

/** Convert MediaPipe NormalizedLandmark to our Landmark type */
function toLandmark(l: NormalizedLandmark) {
  return { x: l.x, y: l.y, z: l.z, visibility: l.visibility }
}

/** Map raw MediaPipe result to our FaceResult[] */
function toFaceResults(result: FaceLandmarkerResult): FaceResult[] {
  return result.faceLandmarks.map((landmarks, i) => ({
    landmarks: landmarks.map(toLandmark),
    transformationMatrix: matrixToArray(result.facialTransformationMatrixes?.[i]),
  }))
}

export function useFaceLandmarker(): UseFaceLandmarkerReturn {
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const [status, setStatus] = useState<LandmarkerStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const initialize = useCallback(async () => {
    if (landmarkerRef.current) return // already initialized
    setStatus('loading')
    setError(null)
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL)
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 4,
        // Lower thresholds to detect smaller/more distant faces.
        // 0.5 is the default but cuts off faces >~1.5m from camera.
        // 0.3 detection + 0.3 presence catches faces at greater distance
        // while the tracking confidence stays higher to reduce jitter.
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
        minTrackingConfidence: 0.5,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      })
      landmarkerRef.current = landmarker
      setStatus('ready')
      console.log('[FaceLandmarker] ready')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[FaceLandmarker] init failed:', msg)
      setError(msg)
      setStatus('error')
    }
  }, [])

  const detectForVideo = useCallback((videoEl: HTMLVideoElement): FaceResult[] => {
    if (!landmarkerRef.current || status !== 'ready') return []
    if (videoEl.readyState < 2) return [] // not enough data yet

    const nowMs = performance.now()
    const result = landmarkerRef.current.detectForVideo(videoEl, nowMs)
    return toFaceResults(result)
  }, [status])

  const destroy = useCallback(() => {
    if (landmarkerRef.current) {
      landmarkerRef.current.close()
      landmarkerRef.current = null
      setStatus('idle')
    }
  }, [])

  return { status, error, detectForVideo, initialize, destroy }
}

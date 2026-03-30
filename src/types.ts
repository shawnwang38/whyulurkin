// Core types for face landmark data flowing through the app

/** A single 3D landmark point from MediaPipe (normalized 0-1 for x/y, depth for z) */
export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}

/**
 * Per-face result from a single inference frame.
 * Mirrors the shape returned by MediaPipe FaceLandmarker.
 *
 * landmarks: 478 points when refineLandmarks:true (includes iris at 468-477)
 * facialTransformationMatrixes: 4x4 column-major matrix for head pose
 */
export interface FaceResult {
  /** 478 normalized landmarks (468 face mesh + 10 iris) */
  landmarks: Landmark[]
  /**
   * 4x4 column-major transformation matrix as flat 16-element array.
   * Encodes head rotation (yaw/pitch/roll) relative to camera.
   * May be empty array if matrix estimation failed.
   */
  transformationMatrix: number[]
}

/** Lurker classification decision for a single face */
export interface LurkerDecision {
  isLurker: boolean
  /** Which tier produced the decision */
  tier: 'head-pose' | 'iris' | 'none'
  /** Diagnostic values for debugging */
  diagnostics: {
    yaw?: number
    pitch?: number
    /** Roll (sideways tilt) in degrees. + = tilted right, - = left */
    roll?: number
    leftIrisOffset?: number
    rightIrisOffset?: number
  }
}

/**
 * Two-tier lurker classifier.
 *
 * Tier 1 — Head pose: face transformation matrix must show yaw, pitch, AND roll
 *   all within threshold → only then proceed to iris check.
 *
 * Tier 2 — Iris gaze: if head pose passes, check iris offset. If iris is
 *   centered within threshold → LURKER (tier: 'iris').
 *
 * If head pose fails → immediately not a lurker. No iris fallback for turned
 * heads. This prevents side profiles with accidentally centered landmarks from
 * triggering detection.
 *
 * If head pose passes but iris offset fails → not a lurker (eyes looking away).
 *
 * Special case: if head pose passes and iris landmarks are unavailable (NaN),
 * we still classify as a lurker via 'head-pose' tier — the face is clearly
 * forward-facing even without iris confirmation.
 */

import type { FaceResult, LurkerDecision } from '../types'
import { getHeadPoseAngles, isLookingByHeadPose } from './headPose'
import { getIrisOffsets, isLookingByIris } from './irisGaze'

export interface ClassifierThresholds {
  headPoseYawDeg: number
  headPosePitchDeg: number
  headPoseRollDeg: number
  irisOffsetThreshold: number
}

export const CLASSIFICATION_THRESHOLDS: ClassifierThresholds = {
  /** Yaw threshold in degrees — strict: ±15° */
  headPoseYawDeg: 15,
  /** Pitch threshold in degrees — strict: ±10° */
  headPosePitchDeg: 10,
  /** Roll threshold in degrees — strict: ±15° */
  headPoseRollDeg: 15,
  /**
   * Iris offset threshold — radius-normalized.
   * 0 = iris centered, 1 = displaced by one iris diameter.
   * 0.20 ≈ iris just slightly off-center.
   */
  irisOffsetThreshold: 0.20,
}

export function classifyFace(face: FaceResult, thresholds: ClassifierThresholds = CLASSIFICATION_THRESHOLDS): LurkerDecision {
  const { transformationMatrix, landmarks } = face
  const hasMatrix = transformationMatrix.length >= 16

  const { yaw, pitch, roll } = hasMatrix
    ? getHeadPoseAngles(transformationMatrix)
    : { yaw: 0, pitch: 0, roll: 0 }

  const { leftOffset, rightOffset } = getIrisOffsets(landmarks)

  const diagnostics = {
    yaw:             hasMatrix ? yaw   : undefined,
    pitch:           hasMatrix ? pitch : undefined,
    roll:            hasMatrix ? roll  : undefined,
    leftIrisOffset:  isNaN(leftOffset)  ? undefined : leftOffset,
    rightIrisOffset: isNaN(rightOffset) ? undefined : rightOffset,
  }

  // Gate: head pose must pass first. If face is turned/tilted, stop here.
  if (hasMatrix && !isLookingByHeadPose(
    transformationMatrix,
    thresholds.headPoseYawDeg,
    thresholds.headPosePitchDeg,
    thresholds.headPoseRollDeg,
  )) {
    return { isLurker: false, tier: 'none', diagnostics }
  }

  // Head pose passed (or no matrix available).
  // If iris landmarks available, use them for confirmation.
  if (!isNaN(leftOffset) && !isNaN(rightOffset)) {
    if (isLookingByIris(landmarks, thresholds.irisOffsetThreshold)) {
      return { isLurker: true, tier: 'iris', diagnostics }
    }
    // Iris says eyes are looking away — not a lurker.
    return { isLurker: false, tier: 'none', diagnostics }
  }

  // No iris landmarks available but head pose passed — classify as lurker.
  return { isLurker: true, tier: 'head-pose', diagnostics }
}

export interface ClassificationResult {
  lurkerCount: number
  decisions: LurkerDecision[]
}

export function classifyFaces(faces: FaceResult[], thresholds: ClassifierThresholds = CLASSIFICATION_THRESHOLDS): ClassificationResult {
  if (faces.length === 0) return { lurkerCount: 0, decisions: [] }
  const decisions = faces.map(f => classifyFace(f, thresholds))
  const lurkerCount = decisions.filter(d => d.isLurker).length
  return { lurkerCount, decisions }
}

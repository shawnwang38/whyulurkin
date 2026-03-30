/**
 * Iris gaze offset estimation using MediaPipe face landmark indices.
 *
 * When refineLandmarks is active, the 478-point array includes:
 *   468:     Left iris center
 *   469–472: Left iris perimeter (4 points on the iris edge)
 *   473:     Right iris center
 *   474–477: Right iris perimeter (4 points on the iris edge)
 *
 * Normalization strategy (radius-based):
 *   1. Compute iris radius from the 4 perimeter landmarks:
 *      radius = mean distance from each perimeter point to the iris center.
 *   2. Measure horizontal displacement: irisCenter.x - perimeterCentroid.x
 *      (perimeterCentroid ≈ irisCenter, used as a sanity check)
 *   3. Offset = (irisCenter.x - eyeMidX) / (2 * radius)
 *      where eyeMidX = midpoint between the eye corner landmarks.
 *
 *   This normalizes displacement in units of iris diameters rather than
 *   eye-corner span. The result is self-referential: it doesn't depend on
 *   eye width (which varies with face angle) but on the iris itself.
 *
 *   Typical values:
 *     - Looking straight: |offset| ≈ 0.0–0.1
 *     - Slight avoidance: |offset| ≈ 0.2–0.4
 *     - Hard look away:   |offset| ≈ 0.5–1.0+
 *
 * Eye corner landmark indices (standard 468-point mesh):
 *   Left eye:  outer corner = 33,  inner corner = 133
 *   Right eye: outer corner = 362, inner corner = 263
 */

import type { Landmark } from '../types'

// Iris center indices
const LEFT_IRIS_CENTER  = 468
const RIGHT_IRIS_CENTER = 473

// Iris perimeter indices (4 points each)
const LEFT_IRIS_PERIMETER  = [469, 470, 471, 472] as const
const RIGHT_IRIS_PERIMETER = [474, 475, 476, 477] as const

// Eye corner landmark indices
const LEFT_EYE_OUTER  = 33
const LEFT_EYE_INNER  = 133
const RIGHT_EYE_OUTER = 362
const RIGHT_EYE_INNER = 263

/**
 * Compute the iris radius as the mean distance from the iris center to each
 * of the 4 perimeter landmarks. Uses only x/y (normalized image plane).
 * Returns NaN if any perimeter point is missing.
 */
function computeIrisRadius(center: Landmark, perimeterPoints: Landmark[]): number {
  if (perimeterPoints.length < 4) return NaN
  let totalDist = 0
  for (const p of perimeterPoints) {
    const dx = p.x - center.x
    const dy = p.y - center.y
    totalDist += Math.sqrt(dx * dx + dy * dy)
  }
  return totalDist / perimeterPoints.length
}

/**
 * Compute horizontal iris offset for one eye, normalized by iris diameter.
 * Returns NaN if iris center, perimeter, or eye corners are missing/degenerate.
 *
 * Offset > 0 → iris displaced outward (toward outer eye corner)
 * Offset < 0 → iris displaced inward (toward inner/nose side)
 */
function computeIrisOffset(
  irisCenter: Landmark,
  irisPerimeter: Landmark[],
  outerCorner: Landmark,
  innerCorner: Landmark,
): number {
  const radius = computeIrisRadius(irisCenter, irisPerimeter)
  if (isNaN(radius) || radius < 1e-6) return NaN

  const eyeMidX = (outerCorner.x + innerCorner.x) / 2
  // Normalize by iris diameter (2 * radius)
  return (irisCenter.x - eyeMidX) / (2 * radius)
}

export interface IrisOffsets {
  /** Horizontal offset for left eye, radius-normalized. NaN if unavailable. */
  leftOffset: number
  /** Horizontal offset for right eye, radius-normalized. NaN if unavailable. */
  rightOffset: number
}

/**
 * Compute radius-normalized horizontal iris offsets for both eyes.
 * Requires landmarks.length >= 478 (refineLandmarks active).
 */
export function getIrisOffsets(landmarks: Landmark[]): IrisOffsets {
  if (landmarks.length < 478) {
    return { leftOffset: NaN, rightOffset: NaN }
  }

  const leftCenter   = landmarks[LEFT_IRIS_CENTER]
  const rightCenter  = landmarks[RIGHT_IRIS_CENTER]
  const leftPerim    = LEFT_IRIS_PERIMETER.map(i => landmarks[i])
  const rightPerim   = RIGHT_IRIS_PERIMETER.map(i => landmarks[i])
  const leftOuter    = landmarks[LEFT_EYE_OUTER]
  const leftInner    = landmarks[LEFT_EYE_INNER]
  const rightOuter   = landmarks[RIGHT_EYE_OUTER]
  const rightInner   = landmarks[RIGHT_EYE_INNER]

  const leftOffset  = computeIrisOffset(leftCenter,  leftPerim,  leftOuter,  leftInner)
  const rightOffset = computeIrisOffset(rightCenter, rightPerim, rightOuter, rightInner)

  return { leftOffset, rightOffset }
}

/**
 * Returns true if both iris offsets are within the threshold.
 * Threshold is in units of iris diameters — 0.20 means the iris center must
 * be within 20% of one iris diameter from the eye midpoint.
 * Returns false if either value is NaN (iris landmarks unavailable).
 */
export function isLookingByIris(landmarks: Landmark[], offsetThreshold = 0.20): boolean {
  const { leftOffset, rightOffset } = getIrisOffsets(landmarks)
  if (isNaN(leftOffset) || isNaN(rightOffset)) return false
  return Math.abs(leftOffset) <= offsetThreshold && Math.abs(rightOffset) <= offsetThreshold
}

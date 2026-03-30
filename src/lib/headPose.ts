/**
 * Head pose extraction from MediaPipe facial transformation matrix.
 *
 * MediaPipe outputs a 4x4 column-major transformation matrix that encodes
 * the face's rotation relative to the camera. We extract yaw, pitch, and roll
 * using standard rotation matrix decomposition.
 *
 * Column-major layout (index → matrix position):
 *   [0]  [4]  [8]  [12]
 *   [1]  [5]  [9]  [13]
 *   [2]  [6]  [10] [14]
 *   [3]  [7]  [11] [15]
 *
 * Rotation sub-matrix (top-left 3x3, row-major access):
 *   R[0,0]=m[0]  R[0,1]=m[4]  R[0,2]=m[8]
 *   R[1,0]=m[1]  R[1,1]=m[5]  R[1,2]=m[9]
 *   R[2,0]=m[2]  R[2,1]=m[6]  R[2,2]=m[10]
 *
 * Yaw   = atan2(R[2,0], R[2,2])                       — rotation around Y (left/right turn)
 * Pitch = atan2(-R[2,1], sqrt(R[2,0]^2 + R[2,2]^2))  — rotation around X (up/down tilt)
 * Roll  = atan2(R[1,0], R[0,0])                       — rotation around Z (head tilt sideways)
 */

const RAD_TO_DEG = 180 / Math.PI

/**
 * Extract yaw, pitch, and roll from a 4x4 column-major transformation matrix.
 * Returns angles in degrees.
 *   Yaw:   + = face turned right,  - = left
 *   Pitch: + = face tilted up,     - = down
 *   Roll:  + = head tilted right,  - = left
 *
 * Returns {yaw: 0, pitch: 0, roll: 0} if the matrix is empty or malformed.
 */
export function getHeadPoseAngles(matrix: number[]): { yaw: number; pitch: number; roll: number } {
  if (!matrix || matrix.length < 16) {
    return { yaw: 0, pitch: 0, roll: 0 }
  }

  // Column-major: column c, row r → index = c * 4 + r
  const r00 = matrix[0]   // col 0, row 0
  const r10 = matrix[1]   // col 0, row 1
  const r20 = matrix[2]   // col 0, row 2
  const r21 = matrix[6]   // col 1, row 2
  const r22 = matrix[10]  // col 2, row 2

  const yaw   = Math.atan2(r20, r22) * RAD_TO_DEG
  const pitch = Math.atan2(-r21, Math.sqrt(r20 * r20 + r22 * r22)) * RAD_TO_DEG
  const roll  = Math.atan2(r10, r00) * RAD_TO_DEG

  return { yaw, pitch, roll }
}

/**
 * Returns true if the head pose is approximately facing the camera.
 * All three angles (yaw, pitch, roll) must be within their respective thresholds.
 * Default thresholds are strict: ±15° yaw, ±10° pitch, ±15° roll.
 */
export function isLookingByHeadPose(
  matrix: number[],
  yawThreshDeg = 15,
  pitchThreshDeg = 10,
  rollThreshDeg = 15,
): boolean {
  if (!matrix || matrix.length < 16) return false
  const { yaw, pitch, roll } = getHeadPoseAngles(matrix)
  return (
    Math.abs(yaw)   <= yawThreshDeg   &&
    Math.abs(pitch) <= pitchThreshDeg &&
    Math.abs(roll)  <= rollThreshDeg
  )
}

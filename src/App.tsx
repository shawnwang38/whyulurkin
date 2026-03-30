import { useEffect, useRef, useCallback, useState } from 'react'
import { useCamera } from './hooks/useCamera'
import { useFaceLandmarker } from './hooks/useFaceLandmarker'
import { usePipOverlay } from './hooks/usePipOverlay'
import { classifyFaces, type ClassificationResult, CLASSIFICATION_THRESHOLDS } from './lib/classifier'
import { ConfigPanel, type ConfigValues } from './components/ConfigPanel'
import styles from './App.module.css'

// Simple mode uses fixed thresholds — user doesn't configure these
const SIMPLE_THRESHOLDS = {
  headPoseYawDeg:      25,
  headPosePitchDeg:    15,
  headPoseRollDeg:     CLASSIFICATION_THRESHOLDS.headPoseRollDeg,
  irisOffsetThreshold: CLASSIFICATION_THRESHOLDS.irisOffsetThreshold,
}

const ADVANCED_DEFAULT_CONFIG: ConfigValues = {
  headPoseYawDeg:   25,
  headPosePitchDeg: 15,
}

const LURKER_THRESHOLD = 1
const EMPTY: ClassificationResult = { lurkerCount: 0, decisions: [] }

type Theme = 'dark' | 'light'
type Mode  = 'simple' | 'advanced'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
}

export default function App() {
  const { videoRef, isActive, error: cameraError, startCamera, stopCamera } = useCamera()
  const { status: landmarkerStatus, error: landmarkerError, detectForVideo, initialize, destroy } = useFaceLandmarker()
  const { pipSupported, openPip, closePip, updatePip, syncPipTheme } = usePipOverlay()

  const [classification, setClassification]   = useState<ClassificationResult>(EMPTY)
  const [advancedConfig, setAdvancedConfig]    = useState<ConfigValues>(ADVANCED_DEFAULT_CONFIG)
  const [mode, setMode]                        = useState<Mode>('simple')
  const [theme, setTheme]                      = useState<Theme>(getInitialTheme)

  // Apply theme on mount and whenever it changes
  useEffect(() => { applyTheme(theme) }, [theme])

  const modeRef   = useRef<Mode>(mode)
  const configRef = useRef<ConfigValues>(advancedConfig)
  useEffect(() => { modeRef.current = mode },          [mode])
  useEffect(() => { configRef.current = advancedConfig }, [advancedConfig])

  const rafRef       = useRef<number | null>(null)
  const frameCount   = useRef(0)
  const lastLogTime  = useRef(performance.now())

  useEffect(() => {
    initialize()
    return () => { destroy() }
  }, [initialize, destroy])

  const runLoop = useCallback(() => {
    const video = videoRef.current
    if (!video || !isActive) return

    const thresholds = modeRef.current === 'simple'
      ? SIMPLE_THRESHOLDS
      : {
          headPoseYawDeg:      configRef.current.headPoseYawDeg,
          headPosePitchDeg:    configRef.current.headPosePitchDeg,
          headPoseRollDeg:     CLASSIFICATION_THRESHOLDS.headPoseRollDeg,
          irisOffsetThreshold: CLASSIFICATION_THRESHOLDS.irisOffsetThreshold,
        }

    const faces  = detectForVideo(video)
    const result = classifyFaces(faces, thresholds)
    setClassification(result)
    updatePip(result.lurkerCount, LURKER_THRESHOLD)

    frameCount.current++
    const now     = performance.now()
    const elapsed = now - lastLogTime.current
    if (elapsed >= 1000) {
      const fps = Math.round(frameCount.current / (elapsed / 1000))
      console.log(`[inference] fps=${fps} faces=${faces.length} lurkers=${result.lurkerCount}`)
      frameCount.current  = 0
      lastLogTime.current = now
    }

    rafRef.current = requestAnimationFrame(runLoop)
  }, [isActive, detectForVideo, videoRef, updatePip])

  useEffect(() => {
    if (isActive && landmarkerStatus === 'ready') {
      rafRef.current = requestAnimationFrame(runLoop)
    } else {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      if (!isActive) setClassification(EMPTY)
    }
    return () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
  }, [isActive, landmarkerStatus, runLoop])

  // Auto-open PiP when tab loses focus
  useEffect(() => {
    const onVisibility = () => {
      if (!isActive || !pipSupported) return
      if (document.visibilityState === 'hidden') openPip(theme)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [isActive, pipSupported, openPip, theme])

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    syncPipTheme(next)
  }

  const handleStart = async () => {
    await startCamera()
    if (pipSupported) await openPip(theme)
  }

  const handleStop = () => {
    stopCamera()
    closePip()
  }

  const isReady   = landmarkerStatus === 'ready'
  const isLoading = landmarkerStatus === 'loading'
  const lurking   = classification.lurkerCount > LURKER_THRESHOLD
  const gazes     = classification.decisions.filter(d => d.isLurker).length
  const faces     = classification.decisions.length

  return (
    <div className={styles.app}>
      {/* theme toggle */}
      <button
        className={styles.themeBtn}
        onClick={toggleTheme}
        aria-label={`switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>

      {/* header */}
      <div className={styles.header}>
        <h1 className={styles.title}>whyulurkin</h1>
        <p className={styles.subtitle}>
          lets you know when someone else is looking at your screen. processed locally — we never receive or store your camera.
        </p>
      </div>

      {/* loading */}
      {isLoading && <p className={styles.loading}>loading model…</p>}

      {/* errors */}
      {cameraError   && <div className={styles.error}>{cameraError.message.toLowerCase()}</div>}
      {landmarkerError && <div className={styles.error}>model error: {landmarkerError.toLowerCase()}</div>}

      {/* start / stop */}
      {!isActive ? (
        <button
          className={styles.startBtn}
          onClick={handleStart}
          disabled={!isReady}
        >
          start
        </button>
      ) : (
        <button
          className={styles.stopBtn}
          onClick={handleStop}
        >
          stop
        </button>
      )}

      {/* advanced mode content */}
      {mode === 'advanced' && (
        <div className={styles.advanced}>
          {/* config */}
          <div className={styles.configCard}>
            <ConfigPanel config={advancedConfig} onChange={setAdvancedConfig} />
          </div>

          {/* stats + camera */}
          {isActive && (
            <>
              <div className={styles.statsBar}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>faces detected</span>
                  <span className={styles.statValue}>{faces}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>gazes detected</span>
                  <span className={`${styles.statValue} ${gazes > 0 ? styles.statAlert : ''}`}>{gazes}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>status</span>
                  <span className={`${styles.statValue} ${lurking ? styles.statAlert : styles.statSafe}`}>
                    {lurking ? '👀' : '✓'}
                  </span>
                </div>
              </div>
              <div className={styles.videoWrap}>
                <video ref={videoRef} className={styles.video} playsInline muted />
              </div>
            </>
          )}
          {!isActive && (
            <div className={styles.videoWrap} style={{ display: 'none' }}>
              <video ref={videoRef} className={styles.video} playsInline muted />
            </div>
          )}
        </div>
      )}

      {/* keep video element mounted even in simple mode so the ref works */}
      {mode === 'simple' && (
        <div style={{ display: 'none' }}>
          <video ref={videoRef} playsInline muted />
        </div>
      )}

      {/* bottom: toggle + link */}
      <div className={styles.bottom}>
        <label className={styles.modeToggle}>
          <span className={`${styles.modeLabel} ${mode === 'simple' ? styles.modeLabelActive : ''}`}>
            simple
          </span>
          <span className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={mode === 'advanced'}
              onChange={e => setMode(e.target.checked ? 'advanced' : 'simple')}
            />
            <span className={styles.toggleTrack} />
            <span className={styles.toggleThumb} />
          </span>
          <span className={`${styles.modeLabel} ${mode === 'advanced' ? styles.modeLabelActive : ''}`}>
            advanced
          </span>
        </label>

        <a
          href="https://x.com/oue2x2"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.xLink}
        >
          𝕏 @oue2x2
        </a>
      </div>
    </div>
  )
}

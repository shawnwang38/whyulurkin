import { useRef, useCallback, useState, useEffect } from 'react'

/** Extend Window to include the Document PiP API (Chrome 116+) */
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>
      window: Window | null
      addEventListener(event: string, handler: () => void): void
      removeEventListener(event: string, handler: () => void): void
    }
  }
}

export const PIP_SUPPORTED = typeof window !== 'undefined' && 'documentPictureInPicture' in window

// Chrome enforces a minimum PiP size. We request as small as possible and accept what we get.
const PIP_WIDTH  = 80
const PIP_HEIGHT = 80

export interface UsePipOverlayReturn {
  pipActive: boolean
  pipSupported: boolean
  /** Open the PiP window with the current theme applied */
  openPip: (theme: string) => Promise<void>
  closePip: () => void
  /** Call each frame to sync lurker state into the PiP window's DOM */
  updatePip: (lurkerCount: number, threshold: number) => void
  /** Re-inject theme styles when theme changes while PiP is open */
  syncPipTheme: (theme: string) => void
}

/** CSS injected into the PiP document for a given theme */
function pipThemeStyles(theme: string): string {
  const dark = theme === 'dark'
  return `
    :root {
      --pip-bg:       ${dark ? '#0a0a0a' : '#f5f4f0'};
      --pip-bg-alert: ${dark ? '#1a0000' : '#fff0f0'};
      --pip-text:     ${dark ? '#e8e8e8' : '#1a1a1a'};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      height: 100%;
      overflow: hidden;
      background: var(--pip-bg);
      transition: background 0.25s;
    }
    #pip-root {
      height: 100vh;
      width: 100vw;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #pip-emoji {
      font-size: 2.2rem;
      opacity: 0.15;
      filter: grayscale(1);
      transition: opacity 0.3s, filter 0.3s;
      user-select: none;
    }
    #pip-emoji.lurking {
      opacity: 1;
      filter: none;
    }
    body.lurking {
      background: var(--pip-bg-alert);
    }
  `
}

/** Inject or update the theme <style> in the PiP document */
function injectThemeStyle(pipWin: Window, theme: string) {
  const doc = pipWin.document
  let styleEl = doc.getElementById('pip-theme') as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = doc.createElement('style')
    styleEl.id = 'pip-theme'
    doc.head.appendChild(styleEl)
  }
  styleEl.textContent = pipThemeStyles(theme)
}

/** Initialize the PiP document structure (called once on open) */
function initPipDocument(pipWin: Window, theme: string) {
  const doc = pipWin.document
  doc.documentElement.style.height = '100%'

  injectThemeStyle(pipWin, theme)

  if (!doc.getElementById('pip-root')) {
    const root = doc.createElement('div')
    root.id = 'pip-root'
    const emoji = doc.createElement('div')
    emoji.id = 'pip-emoji'
    emoji.textContent = '👀'
    root.appendChild(emoji)
    doc.body.appendChild(root)
  }
}

/** Update the PiP visual state each frame */
function renderPipState(pipWin: Window, lurking: boolean) {
  const doc = pipWin.document
  const emoji = doc.getElementById('pip-emoji')
  if (!emoji) return
  if (lurking) {
    emoji.classList.add('lurking')
    doc.body.classList.add('lurking')
  } else {
    emoji.classList.remove('lurking')
    doc.body.classList.remove('lurking')
  }
}

export function usePipOverlay(): UsePipOverlayReturn {
  const pipWinRef   = useRef<Window | null>(null)
  const [pipActive, setPipActive] = useState(false)

  // Clean up if the PiP window is closed by the user
  useEffect(() => {
    const handleLeave = () => { pipWinRef.current = null; setPipActive(false) }
    if (PIP_SUPPORTED) {
      window.documentPictureInPicture!.addEventListener?.('leave', handleLeave)
    }
    return () => {
      if (PIP_SUPPORTED) {
        window.documentPictureInPicture!.removeEventListener?.('leave', handleLeave)
      }
    }
  }, [])

  const openPip = useCallback(async (theme: string) => {
    if (!PIP_SUPPORTED) return
    if (pipWinRef.current && !pipWinRef.current.closed) {
      pipWinRef.current.close()
    }
    try {
      const pipWin = await window.documentPictureInPicture!.requestWindow({
        width:  PIP_WIDTH,
        height: PIP_HEIGHT,
        disallowReturnToOpener: false,
      })
      pipWinRef.current = pipWin
      setPipActive(true)
      initPipDocument(pipWin, theme)
      pipWin.addEventListener('pagehide', () => {
        pipWinRef.current = null
        setPipActive(false)
      })
    } catch (err) {
      console.warn('[pip] failed to open:', err)
    }
  }, [])

  const closePip = useCallback(() => {
    if (pipWinRef.current && !pipWinRef.current.closed) {
      pipWinRef.current.close()
    }
    pipWinRef.current = null
    setPipActive(false)
  }, [])

  const updatePip = useCallback((lurkerCount: number, threshold: number) => {
    const pipWin = pipWinRef.current
    if (!pipWin || pipWin.closed) return
    renderPipState(pipWin, lurkerCount > threshold)
  }, [])

  const syncPipTheme = useCallback((theme: string) => {
    const pipWin = pipWinRef.current
    if (!pipWin || pipWin.closed) return
    injectThemeStyle(pipWin, theme)
  }, [])

  return { pipActive, pipSupported: PIP_SUPPORTED, openPip, closePip, updatePip, syncPipTheme }
}

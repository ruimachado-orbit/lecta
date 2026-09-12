import { ipcMain, BrowserWindow, screen } from 'electron'
import { join } from 'path'

let presenterWindow: BrowserWindow | null = null
let audienceWindow: BrowserWindow | null = null
let sourceWindow: BrowserWindow | null = null
let pendingPresenterPath: string | null = null
let pendingSlideIndex: number = 0
let pendingArtifact: string | null = null

/** Full navigation state as last broadcast by the presenting window. */
export interface PresenterState {
  slideIndex: number
  subSlide: number
  clickStep: number
  mdxTrusted?: boolean
}
let pendingState: PresenterState | null = null
/** True while the audience window occupies a second display. */
let usingExternalDisplay = false
/**
 * The presenting window's geometry before we fullscreened it, so `End` puts the
 * user back exactly where they were.
 */
let presenterLayout: {
  window: BrowserWindow
  bounds: Electron.Rectangle
  wasFullScreen: boolean
} | null = null

function rememberPresenterLayout(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed() || presenterLayout) return
  presenterLayout = { window: win, bounds: win.getBounds(), wasFullScreen: win.isFullScreen() }
}

function fullscreenOnDisplay(win: BrowserWindow | null, display: Electron.Display): void {
  if (!win || win.isDestroyed()) return
  if (!win.isFullScreen()) {
    // Move onto the target display first: fullscreen applies to whichever screen the
    // window currently sits on.
    win.setBounds(display.workArea)
  }
  win.setFullScreen(true)
}

/** Undo `fullscreenOnDisplay`. Safe to call when nothing was changed. */
function restorePresenterLayout(): void {
  usingExternalDisplay = false
  const saved = presenterLayout
  presenterLayout = null
  if (!saved || saved.window.isDestroyed()) return
  if (!saved.wasFullScreen && saved.window.isFullScreen()) {
    saved.window.setFullScreen(false)
  }
  saved.window.setBounds(saved.bounds)
}
let artifactCaptureInterval: ReturnType<typeof setInterval> | null = null
let captureInProgress = false

/** Stream the artifact panel as screenshots — used for webapp artifacts where live sync isn't possible */
function startArtifactCapture(): void {
  stopArtifactCapture()
  if (!sourceWindow || sourceWindow.isDestroyed()) return
  if (!audienceWindow || audienceWindow.isDestroyed()) return

  const src = sourceWindow
  const dst = audienceWindow
  let cachedBounds: { x: number; y: number; width: number; height: number } | null = null
  let boundsAge = 0

  artifactCaptureInterval = setInterval(async () => {
    if (captureInProgress) return
    captureInProgress = true
    try {
      if (src.isDestroyed() || dst.isDestroyed()) { stopArtifactCapture(); return }

      if (!cachedBounds || boundsAge++ > 8) {
        boundsAge = 0
        cachedBounds = await src.webContents.executeJavaScript(`
          (function() {
            var el = document.querySelector('[data-artifact-capture]');
            if (!el) return null;
            var r = el.getBoundingClientRect();
            if (r.width < 10 || r.height < 10) return null;
            return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
          })()
        `)
      }
      if (!cachedBounds) return

      const image = await src.webContents.capturePage()
      if (image.isEmpty()) return

      const fullSize = image.getSize()
      const windowSize = src.getContentBounds()
      const sx = fullSize.width / windowSize.width
      const sy = fullSize.height / windowSize.height

      const cropRect = {
        x: Math.max(0, Math.round(cachedBounds.x * sx)),
        y: Math.max(0, Math.round(cachedBounds.y * sy)),
        width: Math.min(Math.round(cachedBounds.width * sx), fullSize.width),
        height: Math.min(Math.round(cachedBounds.height * sy), fullSize.height)
      }
      cropRect.width = Math.min(cropRect.width, fullSize.width - cropRect.x)
      cropRect.height = Math.min(cropRect.height, fullSize.height - cropRect.y)
      if (cropRect.width < 10 || cropRect.height < 10) return

      const cropped = image.crop(cropRect)
      const png = cropped.toPNG()
      const base64 = png.toString('base64')

      if (!dst.isDestroyed()) {
        dst.webContents.send('presenter:artifact-frame', base64)
      }
    } catch {
      // Silently ignore capture errors
    } finally {
      captureInProgress = false
    }
  }, 100) // ~10fps for smooth webapp mirroring
}

function stopArtifactCapture(): void {
  if (artifactCaptureInterval) {
    clearInterval(artifactCaptureInterval)
    artifactCaptureInterval = null
  }
}

export function registerPresenterHandlers(): void {
  ipcMain.handle('presenter:open', async () => {
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.focus()
      return
    }

    presenterWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Lecta — Speaker Notes',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      presenterWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/presenter`)
    } else {
      presenterWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/presenter'
      })
    }

    presenterWindow.on('closed', () => {
      presenterWindow = null
    })
  })

  ipcMain.handle('presenter:open-audience', async (_event) => {
    const senderContents = _event.sender
    sourceWindow = BrowserWindow.fromWebContents(senderContents) || null

    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.focus()
      return { opened: true, external: usingExternalDisplay }
    }

    const displays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()
    const externalDisplay = displays.find((d) => d.id !== primaryDisplay.id)
    const targetDisplay = externalDisplay || primaryDisplay
    usingExternalDisplay = !!externalDisplay

    // One-click present: with a second screen, the audience view goes fullscreen there and
    // the presenter window goes fullscreen on the primary. Both are restored when the
    // audience window closes, which is the single exit path from presenting.
    if (externalDisplay) {
      rememberPresenterLayout(sourceWindow)
      fullscreenOnDisplay(sourceWindow, primaryDisplay)
    }

    audienceWindow = new BrowserWindow({
      x: targetDisplay.bounds.x + (externalDisplay ? 0 : 50),
      y: targetDisplay.bounds.y + (externalDisplay ? 0 : 50),
      width: externalDisplay ? targetDisplay.bounds.width : Math.min(1280, Math.round(targetDisplay.bounds.width * 0.75)),
      height: externalDisplay ? targetDisplay.bounds.height : Math.min(780, Math.round(targetDisplay.bounds.height * 0.75)),
      minWidth: 640,
      minHeight: 400,
      // Shown once the deck has loaded: an auto-open on a single display is closed again
      // before it ever appears.
      show: false,
      fullscreen: !!externalDisplay,
      title: 'Lecta — Presentation',
      backgroundColor: '#000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true
      }
    })

    audienceWindow.once('ready-to-show', () => {
      if (audienceWindow && !audienceWindow.isDestroyed()) audienceWindow.show()
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      audienceWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/audience`)
    } else {
      audienceWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/audience'
      })
    }

    // No timers: the audience window replies with `presenter:audience-ready` once it has loaded
    // the deck, and that handshake pulls the authoritative state from the presenting window.
    audienceWindow.webContents.on('did-finish-load', () => {
      if (pendingPresenterPath && audienceWindow && !audienceWindow.isDestroyed()) {
        audienceWindow.webContents.send('presenter:load-path', pendingPresenterPath)
      }
    })

    audienceWindow.on('closed', () => {
      audienceWindow = null
      stopArtifactCapture()
      restorePresenterLayout()
      if (sourceWindow && !sourceWindow.isDestroyed()) {
        sourceWindow.webContents.send('presenter:audience-closed')
      }
    })

    return { opened: true, external: usingExternalDisplay }
  })

  ipcMain.handle('presenter:close-audience', async () => {
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.close()
      audienceWindow = null
    }
    // `closed` normally does this; run it here too so a already-gone window still
    // restores the presenting window's size and screen.
    restorePresenterLayout()
  })

  ipcMain.on('presenter:send-path', (_event, rootPath: string) => {
    pendingPresenterPath = rootPath
    if (!sourceWindow || sourceWindow.isDestroyed()) {
      sourceWindow = BrowserWindow.fromWebContents(_event.sender) || null
    }
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:load-path', rootPath)
    }
  })

  ipcMain.on('presenter:sync-slide', (_event, slideIndex: number) => {
    pendingSlideIndex = slideIndex
    if (!sourceWindow || sourceWindow.isDestroyed()) {
      sourceWindow = BrowserWindow.fromWebContents(_event.sender) || null
    }
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.webContents.send('presenter:sync-slide', slideIndex)
    }
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:sync-slide', slideIndex)
    }
  })

  // Full navigation state: slide + sub-slide + click step (+ deck MDX trust flag)
  ipcMain.on('presenter:sync-state', (_event, state: PresenterState) => {
    if (!state || typeof state.slideIndex !== 'number') return
    pendingState = state
    pendingSlideIndex = state.slideIndex
    if (!sourceWindow || sourceWindow.isDestroyed()) {
      sourceWindow = BrowserWindow.fromWebContents(_event.sender) || null
    }
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.webContents.send('presenter:sync-state', state)
    }
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:sync-state', state)
    }
  })

  // Handshake: the audience window announces it is ready; we replay what we know and ask the
  // presenting window for its authoritative state.
  ipcMain.on('presenter:audience-ready', (_event) => {
    const target = BrowserWindow.fromWebContents(_event.sender)
    if (target && !target.isDestroyed()) {
      if (pendingPresenterPath) target.webContents.send('presenter:load-path', pendingPresenterPath)
      if (pendingState) target.webContents.send('presenter:sync-state', pendingState)
      else target.webContents.send('presenter:sync-slide', pendingSlideIndex)
      if (pendingArtifact) target.webContents.send('presenter:sync-artifact', pendingArtifact)
    }
    if (sourceWindow && !sourceWindow.isDestroyed()) {
      sourceWindow.webContents.send('presenter:request-state')
    }
  })

  ipcMain.on('presenter:sync-artifact', (_event, artifact: string | null) => {
    pendingArtifact = artifact
    if (!sourceWindow || sourceWindow.isDestroyed()) {
      sourceWindow = BrowserWindow.fromWebContents(_event.sender) || null
    }
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:sync-artifact', artifact)
    }
    // Start screenshot streaming for webapp artifacts (can't sync live webview state)
    if (artifact === 'webapp' && audienceWindow && !audienceWindow.isDestroyed()) {
      startArtifactCapture()
    } else {
      stopArtifactCapture()
    }
  })

  // Sync execution output to audience window
  ipcMain.on('presenter:sync-execution', (_event, output: string) => {
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:sync-execution', output)
    }
  })

  // Sync code content changes to audience window
  ipcMain.on('presenter:sync-code', (_event, code: string) => {
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:sync-code', code)
    }
  })

  ipcMain.on('presenter:sync-mouse', (_event, pos: { x: number; y: number; area: string } | null) => {
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:sync-mouse', pos)
    }
  })
}

export function getPresenterWindow(): BrowserWindow | null {
  return presenterWindow
}

export function getAudienceWindow(): BrowserWindow | null {
  return audienceWindow
}

import { ipcMain, BrowserWindow, screen } from 'electron'
import { join } from 'path'

let presenterWindow: BrowserWindow | null = null
let audienceWindow: BrowserWindow | null = null
let sourceWindow: BrowserWindow | null = null
let pendingPresenterPath: string | null = null
let pendingSlideIndex: number = 0
let pendingArtifact: string | null = null
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
      return
    }

    const displays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()
    const externalDisplay = displays.find((d) => d.id !== primaryDisplay.id)
    const targetDisplay = externalDisplay || primaryDisplay

    audienceWindow = new BrowserWindow({
      x: targetDisplay.bounds.x + 50,
      y: targetDisplay.bounds.y + 50,
      width: Math.min(1280, Math.round(targetDisplay.bounds.width * 0.75)),
      height: Math.min(780, Math.round(targetDisplay.bounds.height * 0.75)),
      minWidth: 640,
      minHeight: 400,
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

    if (process.env['ELECTRON_RENDERER_URL']) {
      audienceWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/audience`)
    } else {
      audienceWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/audience'
      })
    }

    audienceWindow.webContents.on('did-finish-load', () => {
      if (pendingPresenterPath && audienceWindow && !audienceWindow.isDestroyed()) {
        audienceWindow.webContents.send('presenter:load-path', pendingPresenterPath)
        setTimeout(() => {
          if (audienceWindow && !audienceWindow.isDestroyed()) {
            audienceWindow.webContents.send('presenter:sync-slide', pendingSlideIndex)
            if (pendingArtifact) {
              audienceWindow.webContents.send('presenter:sync-artifact', pendingArtifact)
            }
          }
        }, 300)
      }
    })

    audienceWindow.on('closed', () => {
      audienceWindow = null
      stopArtifactCapture()
      if (sourceWindow && !sourceWindow.isDestroyed()) {
        sourceWindow.webContents.send('presenter:audience-closed')
      }
    })
  })

  ipcMain.handle('presenter:close-audience', async () => {
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.close()
      audienceWindow = null
    }
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

import { ipcMain, BrowserWindow, screen } from 'electron'
import { join } from 'path'

let presenterWindow: BrowserWindow | null = null
let audienceWindow: BrowserWindow | null = null
let sourceWindow: BrowserWindow | null = null // the main window running presenter mode
let pendingPresenterPath: string | null = null
let pendingSlideIndex: number = 0
let pendingArtifact: string | null = null
let artifactCaptureInterval: ReturnType<typeof setInterval> | null = null

/** Capture the artifact panel from the source window and stream to audience */
function startArtifactCapture(): void {
  stopArtifactCapture()
  if (!sourceWindow || sourceWindow.isDestroyed()) return
  if (!audienceWindow || audienceWindow.isDestroyed()) return

  const src = sourceWindow
  const dst = audienceWindow

  artifactCaptureInterval = setInterval(async () => {
    try {
      if (src.isDestroyed() || dst.isDestroyed()) { stopArtifactCapture(); return }

      // Capture the entire presenter window and crop to artifact area in renderer
      // Use capturePage without rect (full page) then let the renderer figure out bounds
      // This is more reliable than trying to calculate DPR-adjusted rects
      const bounds: { x: number; y: number; width: number; height: number } | null =
        await src.webContents.executeJavaScript(`
          (function() {
            var el = document.querySelector('[data-artifact-capture]');
            if (!el) return null;
            var r = el.getBoundingClientRect();
            if (r.width < 10 || r.height < 10) return null;
            return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
          })()
        `)
      if (!bounds) return

      // capturePage returns an image in physical pixels. We need to convert
      // CSS pixel coordinates to physical pixels.
      const image = await src.webContents.capturePage()
      if (image.isEmpty()) return

      const fullSize = image.getSize()
      const windowSize = src.getContentBounds()
      // Scale factor = physical pixels / CSS pixels
      const sx = fullSize.width / windowSize.width
      const sy = fullSize.height / windowSize.height

      const cropRect = {
        x: Math.max(0, Math.round(bounds.x * sx)),
        y: Math.max(0, Math.round(bounds.y * sy)),
        width: Math.min(Math.round(bounds.width * sx), fullSize.width),
        height: Math.min(Math.round(bounds.height * sy), fullSize.height)
      }
      // Ensure rect doesn't exceed image
      cropRect.width = Math.min(cropRect.width, fullSize.width - cropRect.x)
      cropRect.height = Math.min(cropRect.height, fullSize.height - cropRect.y)
      if (cropRect.width < 10 || cropRect.height < 10) return

      const cropped = image.crop(cropRect)
      // Resize for streaming (max 1200px wide for good quality)
      const resized = cropRect.width > 1200
        ? cropped.resize({ width: 1200 })
        : cropped
      const jpeg = resized.toJPEG(80)
      const base64 = jpeg.toString('base64')

      if (!dst.isDestroyed()) {
        dst.webContents.send('presenter:artifact-frame', base64)
      }
    } catch {
      // Silently ignore capture errors
    }
  }, 150) // ~7fps
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

  // Open a fullscreen audience-facing window showing just the current slide
  ipcMain.handle('presenter:open-audience', async (_event) => {
    // Track which window is the source (presenter mode runs in the main window)
    const senderContents = _event.sender
    sourceWindow = BrowserWindow.fromWebContents(senderContents) || null

    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.focus()
      return
    }

    // Try to open on external display if available
    const displays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()
    const externalDisplay = displays.find((d) => d.id !== primaryDisplay.id)
    const targetDisplay = externalDisplay || primaryDisplay

    audienceWindow = new BrowserWindow({
      x: targetDisplay.bounds.x,
      y: targetDisplay.bounds.y,
      width: targetDisplay.bounds.width,
      height: targetDisplay.bounds.height,
      fullscreen: !!externalDisplay,
      simpleFullscreen: !externalDisplay,
      frame: false,
      title: 'Lecta — Presentation',
      backgroundColor: '#000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    if (!externalDisplay) {
      audienceWindow.maximize()
    }

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
              startArtifactCapture()
            }
          }
        }, 300)
      }
    })

    audienceWindow.on('closed', () => {
      audienceWindow = null
      stopArtifactCapture()
    })
  })

  ipcMain.handle('presenter:close-audience', async () => {
    stopArtifactCapture()
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.close()
      audienceWindow = null
    }
  })

  ipcMain.on('presenter:send-path', (_event, rootPath: string) => {
    pendingPresenterPath = rootPath
    // Also track the source window from path sends
    if (!sourceWindow || sourceWindow.isDestroyed()) {
      sourceWindow = BrowserWindow.fromWebContents(_event.sender) || null
    }
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:load-path', rootPath)
    }
  })

  ipcMain.on('presenter:sync-slide', (_event, slideIndex: number) => {
    pendingSlideIndex = slideIndex
    // Track source window
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
    // Track source window
    if (!sourceWindow || sourceWindow.isDestroyed()) {
      sourceWindow = BrowserWindow.fromWebContents(_event.sender) || null
    }
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:sync-artifact', artifact)
    }
    if (artifact && audienceWindow && !audienceWindow.isDestroyed()) {
      startArtifactCapture()
    } else {
      stopArtifactCapture()
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

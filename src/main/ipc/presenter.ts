import { ipcMain, BrowserWindow, screen } from 'electron'
import { join } from 'path'

let presenterWindow: BrowserWindow | null = null
let audienceWindow: BrowserWindow | null = null
let pendingPresenterPath: string | null = null
let pendingSlideIndex: number = 0

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
  ipcMain.handle('presenter:open-audience', async () => {
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

    // If no external display, maximize on primary
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

    // When audience window finishes loading, send the pending path and slide
    audienceWindow.webContents.on('did-finish-load', () => {
      if (pendingPresenterPath && audienceWindow && !audienceWindow.isDestroyed()) {
        audienceWindow.webContents.send('presenter:load-path', pendingPresenterPath)
        setTimeout(() => {
          if (audienceWindow && !audienceWindow.isDestroyed()) {
            audienceWindow.webContents.send('presenter:sync-slide', pendingSlideIndex)
          }
        }, 300)
      }
    })

    audienceWindow.on('closed', () => {
      audienceWindow = null
    })
  })

  ipcMain.handle('presenter:close-audience', async () => {
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.close()
      audienceWindow = null
    }
  })

  // Store and forward presentation path to audience window
  ipcMain.on('presenter:send-path', (_event, rootPath: string) => {
    pendingPresenterPath = rootPath
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:load-path', rootPath)
    }
  })

  ipcMain.on('presenter:sync-slide', (_event, slideIndex: number) => {
    pendingSlideIndex = slideIndex
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.webContents.send('presenter:sync-slide', slideIndex)
    }
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:sync-slide', slideIndex)
    }
  })
}

export function getPresenterWindow(): BrowserWindow | null {
  return presenterWindow
}

export function getAudienceWindow(): BrowserWindow | null {
  return audienceWindow
}

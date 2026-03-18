import { ipcMain, BrowserWindow, screen } from 'electron'
import { join } from 'path'

let presenterWindow: BrowserWindow | null = null
let audienceWindow: BrowserWindow | null = null

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

    // Try to open on a second display if available, otherwise use primary
    const displays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()
    const externalDisplay = displays.find((d) => d.id !== primaryDisplay.id)
    const targetDisplay = externalDisplay || primaryDisplay

    audienceWindow = new BrowserWindow({
      x: targetDisplay.bounds.x,
      y: targetDisplay.bounds.y,
      width: targetDisplay.bounds.width,
      height: targetDisplay.bounds.height,
      fullscreen: true,
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

    if (process.env['ELECTRON_RENDERER_URL']) {
      audienceWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/audience`)
    } else {
      audienceWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/audience'
      })
    }

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

  // Send presentation path to audience window so it can load it
  ipcMain.on('presenter:send-path', (_event, rootPath: string) => {
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('presenter:load-path', rootPath)
    }
  })

  ipcMain.on('presenter:sync-slide', (_event, slideIndex: number) => {
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

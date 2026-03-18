import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'

let presenterWindow: BrowserWindow | null = null

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

    // Load the presenter view route
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

  ipcMain.on('presenter:sync-slide', (_event, slideIndex: number) => {
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.webContents.send('presenter:sync-slide', slideIndex)
    }
  })
}

export function getPresenterWindow(): BrowserWindow | null {
  return presenterWindow
}

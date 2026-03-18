import { config as dotenvConfig } from 'dotenv'
import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'path'
import { registerAllIpcHandlers } from './ipc/register'

// Load .env from project root (for ANTHROPIC_API_KEY, etc.)
dotenvConfig()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Lecta',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Set CSP via session headers — works reliably in both dev and production
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  const devConnect = isDev ? ' ws://localhost:* http://localhost:*' : ''
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self';` +
            ` script-src 'self' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://www.youtube.com https://s.ytimg.com;` +
            ` style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;` +
            ` connect-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://api.anthropic.com${devConnect};` +
            ` worker-src 'self' blob:;` +
            ` child-src 'self' blob:;` +
            ` frame-src 'self' blob: https: http://localhost:* http://127.0.0.1:*;` +
            ` img-src 'self' data: blob: https: file:;` +
            ` font-src 'self' data: https://cdn.jsdelivr.net;`
        ]
      }
    })
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // In dev mode, electron-vite sets ELECTRON_RENDERER_URL
  if (isDev) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.lecta.app')

  registerAllIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }

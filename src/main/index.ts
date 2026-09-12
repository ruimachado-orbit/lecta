import { config as dotenvConfig } from 'dotenv'
import { app, BrowserWindow, ipcMain, net, nativeImage, protocol, session, shell } from 'electron'
import { join, resolve } from 'path'
import { readFile } from 'fs/promises'
import { registerAllIpcHandlers } from './ipc/register'
import { loadSettings } from './ipc/settings'
import { startMcpServer, stopMcpServer } from './services/mcp-manager'
import { isInsideOpenDeck } from './services/deck-roots'

/** Tracks root paths of currently-open decks for lecta-file:// protocol validation */
export { allowedFileRoots } from './services/deck-roots'

// Load .env from project root (for ANTHROPIC_API_KEY, etc.)
dotenvConfig()

// Suppress harmless Chromium GPU warnings
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

// Set app name so dock/taskbar shows "Lecta" instead of "Electron"
app.name = 'Lecta'
process.title = 'Lecta'
if (process.platform === 'darwin') {
  app.setName('Lecta')
  // Patch the dock tooltip in dev mode by modifying the helper plist
  try {
    const { execFileSync } = require('child_process')
    const electronPath = process.execPath
    const plistPath = join(electronPath, '..', '..', 'Info.plist')
    execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleName Lecta', plistPath], { stdio: 'ignore' })
    execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleDisplayName Lecta', plistPath], { stdio: 'ignore' })
  } catch {
    // Non-critical — only affects dev tooltip
  }
}

// Register custom protocol for serving local files (works in both dev and production)
protocol.registerSchemesAsPrivileged([
  { scheme: 'lecta-file', privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true } }
])

let mainWindow: BrowserWindow | null = null
const allWindows: Set<BrowserWindow> = new Set()

function getIconPath(): string {
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  if (isDev) {
    return join(app.getAppPath(), 'build', 'icon.png')
  }
  return join(process.resourcesPath, 'icon.png')
}

function createWindow(): BrowserWindow {
  const icon = nativeImage.createFromPath(getIconPath())

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Lecta',
    icon,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  if (process.platform === 'darwin') {
    app.dock.setIcon(icon)
  }

  // Set CSP via session headers — works reliably in both dev and production
  // Only apply to the app's own pages, not external content (iframes, webviews)
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  const devConnect = isDev ? ' ws://localhost:* http://localhost:*' : ''
  // @vitejs/plugin-react injects an inline preamble script in dev; allow it there only.
  const devScript = isDev ? " 'unsafe-inline'" : ''
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url
    const isAppPage =
      url.startsWith('file://') ||
      url.startsWith('devtools://') ||
      url.startsWith('http://localhost:') ||
      url.startsWith('http://127.0.0.1:')

    if (!isAppPage) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self';` +
            // unsafe-eval required by Monaco Editor and Sandpack code execution
            ` script-src 'self' 'unsafe-eval'${devScript} blob: https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://www.youtube.com https://s.ytimg.com;` +
            ` style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;` +
            ` connect-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://api.anthropic.com https://generativelanguage.googleapis.com${devConnect};` +
            ` worker-src 'self' blob:;` +
            ` child-src 'self' blob:;` +
            ` frame-src 'self' blob: https://www.youtube.com https://codesandbox.io http://localhost:* http://127.0.0.1:*;` +
            ` img-src 'self' data: blob: https: file: lecta-file:;` +
            ` font-src 'self' data: file: blob: https://cdn.jsdelivr.net https://unpkg.com;` +
            ` object-src 'none';` +
            ` base-uri 'self';`
        ]
      }
    })
  })

  // Track the first window as mainWindow for backwards compat
  if (!mainWindow) mainWindow = win
  allWindows.add(win)

  win.on('closed', () => {
    allWindows.delete(win)
    if (mainWindow === win) mainWindow = null
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Window-open / navigation guards are installed globally in 'web-contents-created'

  // In dev mode, electron-vite sets ELECTRON_RENDERER_URL
  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/** URLs the app's own windows may navigate to (renderer bundle, devtools, dev server). */
function isAppUrl(url: string): boolean {
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  if (url.startsWith('file://') || url.startsWith('devtools://') || url === 'about:blank') return true
  if (isDev && (url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:'))) return true
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl && url.startsWith(rendererUrl)) return true
  return false
}

// Security guards applied to EVERY webContents (main, presenter, audience, webview guests)
app.on('web-contents-created', (_event, wc) => {
  const isWebviewGuest = wc.getType() === 'webview'

  wc.on('will-navigate', (e, url) => {
    if (isWebviewGuest) {
      // Guests are isolated (no preload / node) — allow ordinary web navigation only
      if (!/^https?:/.test(url) && url !== 'about:blank') e.preventDefault()
      return
    }
    if (!isAppUrl(url)) e.preventDefault()
  })

  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  wc.on('will-attach-webview', (_e, prefs) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
  })
})

app.whenReady().then(() => {
  app.setAppUserModelId('com.lecta.app')

  // Handle lecta-file:// protocol — serves local files to the renderer
  // URL format: lecta-file:///absolute/path/to/file.png
  protocol.handle('lecta-file', async (request) => {
    let filePath: string
    try {
      filePath = resolve(decodeURIComponent(request.url.replace('lecta-file://', '')))
    } catch {
      // Malformed percent-encoding (URIError)
      return new Response('Bad request', { status: 400 })
    }

    // Validate the resolved path is within an allowed deck root
    if (!isInsideOpenDeck(filePath)) {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      const data = await readFile(filePath)
      const ext = filePath.split('.').pop()?.toLowerCase() || ''
      const mimeMap: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
        svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp',
        pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm'
      }
      return new Response(data, {
        headers: { 'Content-Type': mimeMap[ext] || 'application/octet-stream' }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  registerAllIpcHandlers()

  // Allow renderer to open a new window
  ipcMain.handle('window:new', () => {
    createWindow()
  })

  createWindow()

  // Start MCP server if enabled in settings
  loadSettings().then((settings) => {
    if (settings.mcpServerEnabled) {
      startMcpServer()
    }
    if (settings.localApiEnabled) {
      void import('./services/local-api').then((m) => m.syncLocalApi())
    }
  })

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

app.on('before-quit', () => {
  stopMcpServer()
})

export { mainWindow }

import { createServer, type Server } from 'http'
import { networkInterfaces } from 'os'
import { BrowserWindow } from 'electron'

let server: Server | null = null
let currentPort = 0

function getLocalIP(): string {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

const REMOTE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Lecta Remote</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; color: #fff; font-family: -apple-system, system-ui, sans-serif; height: 100vh; display: flex; flex-direction: column; }
    .header { padding: 20px; text-align: center; border-bottom: 1px solid #222; }
    .header h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.5px; }
    .header .status { font-size: 12px; color: #666; margin-top: 4px; }
    .info { padding: 16px 20px; text-align: center; }
    .info .slide-num { font-size: 48px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .info .slide-total { font-size: 16px; color: #666; }
    .controls { flex: 1; display: flex; gap: 12px; padding: 20px; }
    .btn { flex: 1; border: none; border-radius: 16px; font-size: 20px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.1s, background 0.15s; -webkit-tap-highlight-color: transparent; }
    .btn:active { transform: scale(0.96); }
    .btn-prev { background: #1a1a1a; color: #999; border: 1px solid #333; }
    .btn-next { background: #fff; color: #000; }
    .btn-next:active { background: #e0e0e0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>lecta</h1>
    <div class="status" id="status">Connected</div>
  </div>
  <div class="info">
    <div class="slide-num" id="slideNum">1</div>
    <div class="slide-total">of <span id="totalSlides">1</span></div>
  </div>
  <div class="controls">
    <button class="btn btn-prev" onclick="send('prev')">← Prev</button>
    <button class="btn btn-next" onclick="send('next')">Next →</button>
  </div>
  <script>
    function send(action) {
      fetch('/api/' + action, { method: 'POST' })
        .then(r => r.json())
        .then(d => { update(d); })
        .catch(() => { document.getElementById('status').textContent = 'Disconnected'; });
    }
    function update(d) {
      document.getElementById('slideNum').textContent = d.current;
      document.getElementById('totalSlides').textContent = d.total;
    }
    // Poll for current state
    setInterval(() => {
      fetch('/api/state').then(r => r.json()).then(update).catch(() => {});
    }, 1000);
    fetch('/api/state').then(r => r.json()).then(update).catch(() => {});
  </script>
</body>
</html>`

export function startRemoteControl(port = 3333): { url: string; stop: () => void } {
  if (server) {
    server.close()
  }

  server = createServer((req, res) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

    if (req.url === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      win?.webContents.executeJavaScript(`
        JSON.stringify({ current: window.__lectaSlideState?.current || 1, total: window.__lectaSlideState?.total || 1 })
      `).then((json) => {
        res.end(json)
      }).catch(() => {
        res.end(JSON.stringify({ current: 1, total: 1 }))
      })
      return
    }

    if (req.url === '/api/next' && req.method === 'POST') {
      win?.webContents.executeJavaScript(`
        window.__lectaRemoteAction?.('next');
        JSON.stringify({ current: window.__lectaSlideState?.current || 1, total: window.__lectaSlideState?.total || 1 })
      `).then((json) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(json)
      }).catch(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ current: 1, total: 1 }))
      })
      return
    }

    if (req.url === '/api/prev' && req.method === 'POST') {
      win?.webContents.executeJavaScript(`
        window.__lectaRemoteAction?.('prev');
        JSON.stringify({ current: window.__lectaSlideState?.current || 1, total: window.__lectaSlideState?.total || 1 })
      `).then((json) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(json)
      }).catch(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ current: 1, total: 1 }))
      })
      return
    }

    // Serve the remote control HTML page
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(REMOTE_HTML)
  })

  server.listen(port, '0.0.0.0')
  currentPort = port
  const ip = getLocalIP()
  const url = `http://${ip}:${port}`

  return {
    url,
    stop: () => {
      server?.close()
      server = null
    }
  }
}

export function stopRemoteControl(): void {
  server?.close()
  server = null
}

export function isRemoteRunning(): boolean {
  return server !== null
}

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { randomBytes } from 'crypto'
import { networkInterfaces } from 'os'
import { BrowserWindow } from 'electron'
import { getPresenterWindow as getPresenterWin } from '../ipc/presenter'

let server: Server | null = null
let authToken = ''
let sourceWindow: BrowserWindow | null = null  // window that holds __lectaSlideState

// No background thumbnail capture — capturePage() contends with GPU/renderer
// and causes instability under rapid pointer events. Slide preview is not shown.

// Rate limiting: protect against abuse, not against the legitimate phone remote.
// Pointer events fire ~10/s, poll fires ~1/s — allow plenty of headroom.
const requestLog = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 10_000
const RATE_LIMIT_MAX = 300

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = requestLog.get(ip) || []
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  requestLog.set(ip, recent)
  return recent.length > RATE_LIMIT_MAX
}

function getClientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress || 'unknown'
}

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

function getControlWindow(): BrowserWindow | undefined {
  // Always return the window that was active when remote was started —
  // never fall back to focused window, which may be the audience window.
  if (sourceWindow && !sourceWindow.isDestroyed()) return sourceWindow
  return getPresenterWin() || undefined
}

function jsonResponse(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/** Extract token from path: /{token}/... or /{token} */
function extractToken(url: string): string | null {
  try {
    const pathname = new URL(url, 'http://localhost').pathname
    const parts = pathname.split('/').filter(Boolean)
    return parts[0] || null
  } catch {
    return null
  }
}

/** Get the API path after the token: /{token}/api/state → /api/state */
function getApiPath(url: string): string {
  try {
    const pathname = new URL(url, 'http://localhost').pathname
    const parts = pathname.split('/').filter(Boolean)
    // parts[0] is the token, rest is the path
    return '/' + parts.slice(1).join('/')
  } catch {
    return '/'
  }
}

// ── Remote Control HTML — Minimal phone presenter ──
// Token is injected into the HTML so API calls automatically include it

function buildRemoteHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Lecta Remote</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0a0a0a; --surface: #111; --surface2: #1a1a1a; --border: #222;
      --text: #fff; --text-dim: #999; --text-muted: #555;
      --accent: #6366f1; --red: #ef4444; --green: #22c55e;
    }
    html, body { height: 100%; overflow: hidden; }
    body {
      background: var(--bg); color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
      display: flex; flex-direction: column;
      -webkit-user-select: none; user-select: none;
      -webkit-touch-callout: none;
    }

    /* Header */
    .header {
      padding: 10px 14px; display: flex; align-items: center; gap: 8px;
      border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .header h1 { font-size: 15px; font-weight: 700; letter-spacing: -0.3px; flex: 1; }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
    .status-dot.off { background: var(--red); }
    .slide-counter { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }

    /* Slide counter badge */
    .slide-badge {
      padding: 4px 10px; background: var(--surface2); border: 1px solid var(--border);
      border-radius: 8px; font-size: 13px; color: var(--text-dim);
      font-variant-numeric: tabular-nums; flex-shrink: 0;
    }

    /* Nav buttons */
    .nav { display: flex; gap: 8px; padding: 8px 12px; flex-shrink: 0; }
    .nav-btn {
      flex: 1; height: 52px; border: none; border-radius: 12px;
      font-size: 15px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      -webkit-tap-highlight-color: transparent; transition: transform 0.1s;
    }
    .nav-btn:active { transform: scale(0.95); }
    .nav-btn.prev { background: var(--surface2); color: var(--text-dim); border: 1px solid var(--border); }
    .nav-btn.next { background: #fff; color: #000; }
    .nav-btn.next:active { background: #ddd; }
    .nav-btn:disabled { opacity: 0.25; }

    /* Simple mode */
    #simple-ui {
      display: none; flex-direction: column; height: 100%;
    }
    .simple-nav {
      flex: 1; display: flex; flex-direction: column; gap: 12px; padding: 16px;
    }
    .simple-btn {
      flex: 1; border: none; border-radius: 20px; font-size: 22px; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
      -webkit-tap-highlight-color: transparent; transition: transform 0.1s;
    }
    .simple-btn:active { transform: scale(0.97); }
    .simple-btn.prev { background: var(--surface2); color: var(--text-dim); border: 1px solid var(--border); }
    .simple-btn.next { background: #fff; color: #000; }
    .simple-btn.next:active { background: #ddd; }
    .simple-btn:disabled { opacity: 0.25; }
    .simple-footer {
      padding: 10px 16px 20px; display: flex; align-items: center; justify-content: space-between;
      border-top: 1px solid var(--border);
    }
    .simple-counter { font-size: 14px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .mode-toggle {
      padding: 6px 12px; border: 1px solid var(--border); border-radius: 8px;
      background: var(--surface2); color: var(--text-dim); font-size: 12px;
      cursor: pointer; -webkit-tap-highlight-color: transparent;
    }
    .mode-toggle:active { background: var(--surface); }

    /* Notes */
    .notes { flex: 1; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid var(--border); overflow: hidden; }
    .notes-label {
      padding: 8px 14px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
      color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .notes-body {
      flex: 1; overflow-y: auto; padding: 12px 14px;
      font-size: 15px; line-height: 1.55; color: var(--text-dim);
      -webkit-overflow-scrolling: touch;
    }
    .notes-body .empty { color: var(--text-muted); font-style: italic; font-size: 13px; }
  </style>
</head>
<body>
  <!-- Full UI -->
  <div id="full-ui" style="display:flex; flex-direction:column; height:100%;">
    <div class="header">
      <h1>lecta</h1>
      <div class="status-dot" id="dot"></div>
      <div class="slide-counter"><span id="cur">1</span> / <span id="tot">1</span></div>
      <button class="mode-toggle" onclick="toggleSimple()">Simple</button>
    </div>

    <div class="nav">
      <button class="nav-btn prev" id="prevBtn" ontouchend="tapNav(event,'prev')" onclick="nav('prev')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        Prev
      </button>
      <button class="nav-btn next" id="nextBtn" ontouchend="tapNav(event,'next')" onclick="nav('next')">
        Next
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <div class="notes">
      <div class="notes-label">Speaker Notes</div>
      <div class="notes-body" id="notes"><div class="empty">No notes for this slide</div></div>
    </div>
  </div>

  <!-- Simple mode: big prev/next buttons only -->
  <div id="simple-ui">
    <div class="simple-nav">
      <button class="simple-btn prev" id="sPrevBtn" ontouchend="tapNav(event,'prev')" onclick="nav('prev')">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        Prev
      </button>
      <button class="simple-btn next" id="sNextBtn" ontouchend="tapNav(event,'next')" onclick="nav('next')">
        Next
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
    <div class="simple-footer">
      <div class="simple-counter"><span id="sCur">1</span> / <span id="sTot">1</span></div>
      <div class="status-dot" id="sDot"></div>
      <button class="mode-toggle" onclick="toggleSimple()">Full view</button>
    </div>
  </div>

  <script>
    var TOKEN = ${JSON.stringify(token)};

    // All API calls use /{token}/api/... — no query string, clean URLs
    function q(path) { return '/' + TOKEN + path; }

    /* ── Navigation ── */
    var navInFlight = false;
    function nav(action) {
      if (navInFlight) return;
      navInFlight = true;
      fetch(q('/api/' + action), { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(d) { navInFlight = false; applyState(d); })
        .catch(function() { navInFlight = false; markOff(); });
    }

    /* tapNav: fires on touchend for instant response, prevents the delayed onclick */
    function tapNav(e, action) {
      e.preventDefault();
      nav(action);
    }

    function applyState(d) {
      if (!d) return;
      var cur = d.current || 1, tot = d.total || 1;
      document.getElementById('dot').classList.remove('off');
      document.getElementById('cur').textContent = cur;
      document.getElementById('tot').textContent = tot;
      document.getElementById('prevBtn').disabled = (cur <= 1);
      document.getElementById('nextBtn').disabled = (cur >= tot);
      document.getElementById('sDot').classList.remove('off');
      document.getElementById('sCur').textContent = cur;
      document.getElementById('sTot').textContent = tot;
      document.getElementById('sPrevBtn').disabled = (cur <= 1);
      document.getElementById('sNextBtn').disabled = (cur >= tot);

      var notes = document.getElementById('notes');
      if (d.notes && d.notes.trim()) {
        var tmp = document.createElement('div');
        tmp.textContent = d.notes;
        notes.innerHTML = tmp.innerHTML.replace(/\\n/g, '<br>');
      } else {
        notes.innerHTML = '<div class="empty">No notes for this slide</div>';
      }

    }

    function markOff() {
      document.getElementById('dot').classList.add('off');
      document.getElementById('sDot').classList.add('off');
    }

    /* ── Simple mode ── */
    var simpleMode = false;
    function toggleSimple() {
      simpleMode = !simpleMode;
      document.getElementById('full-ui').style.display = simpleMode ? 'none' : 'flex';
      document.getElementById('simple-ui').style.display = simpleMode ? 'flex' : 'none';
    }

    /* ── Poll for state ── */
    function poll() {
      fetch(q('/api/state')).then(function(r) { return r.json(); }).then(applyState).catch(markOff);
    }
    setInterval(poll, 1500);
    poll();
  </script>
</body>
</html>`
}

export function startRemoteControl(port = 3333, callerWindow?: BrowserWindow): { url: string; stop: () => void } {
  if (server) {
    server.close()
  }

  sourceWindow = callerWindow ?? null
  authToken = randomBytes(16).toString('hex')

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Absorb any response errors (client disconnect after we start writing)
    res.on('error', () => {})

    try {
      const ip = getClientIp(req)
      if (isRateLimited(ip)) { jsonResponse(res, { error: 'Too many requests' }, 429); return }

      const url = req.url || '/'
      const token = extractToken(url)
      if (token !== authToken) {
        res.writeHead(401, { 'Content-Type': 'text/plain' })
        res.end('Unauthorized')
        return
      }

      const path = getApiPath(url)
      const win = getControlWindow()

      // ── GET /{token} — serve phone UI ──
      if (req.method === 'GET' && (path === '/' || path === '')) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(buildRemoteHtml(authToken))
        return
      }

      // ── GET /api/state ──
      if (path === '/api/state' && req.method === 'GET') {
        try {
          if (!win || win.isDestroyed()) {
            jsonResponse(res, { current: 1, total: 1, notes: '', title: '' })
            return
          }
          const json = await win.webContents.executeJavaScript(
            'JSON.stringify({current:window.__lectaSlideState?.current||1,total:window.__lectaSlideState?.total||1,notes:window.__lectaSlideState?.notes||"",title:window.__lectaSlideState?.title||""})'
          )
          jsonResponse(res, JSON.parse(json || '{}'))
        } catch {
          jsonResponse(res, { current: 1, total: 1, notes: '', title: '' })
        }
        return
      }

      // ── POST /api/{next,prev,first,last} ──
      const navActions = ['next', 'prev', 'first', 'last']
      const action = navActions.find((a) => path === `/api/${a}`)
      if (action && req.method === 'POST') {
        try {
          if (!win || win.isDestroyed()) { jsonResponse(res, { current: 1, total: 1 }); return }
          const json = await win.webContents.executeJavaScript(
            `window.__lectaRemoteAction?.('${action}');` +
            'JSON.stringify({current:window.__lectaSlideState?.current||1,total:window.__lectaSlideState?.total||1,notes:window.__lectaSlideState?.notes||"",title:window.__lectaSlideState?.title||""})'
          )
          jsonResponse(res, JSON.parse(json || '{}'))
        } catch {
          jsonResponse(res, { current: 1, total: 1 })
        }
        return
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
    } catch {
      // Last-resort catch — never let an error escape the handler
      try { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Error') } catch { /* already sent */ }
    }
  }

  server = createServer((req, res) => {
    handler(req, res).catch(() => {
      try { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Error') } catch { /* already sent */ }
    })
  })

  // Absorb all socket/server errors — never crash the main process
  server.on('error', () => {})
  server.on('clientError', (_err, socket) => { try { socket.destroy() } catch { /* ignore */ } })

  server.listen(port, '0.0.0.0')

  const ip = getLocalIP()
  // Token in path so the URL contains only alphanumeric + slashes — recognized as a link by all QR readers
  const url = `http://${ip}:${port}/${authToken}`

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
  authToken = ''
  sourceWindow = null
  requestLog.clear()
}

export function isRemoteRunning(): boolean {
  return server !== null
}

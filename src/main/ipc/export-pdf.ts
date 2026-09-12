import { ipcMain, BrowserWindow, dialog } from 'electron'
import { writeFile, readFile } from 'fs/promises'
import { join, resolve, extname, isAbsolute } from 'path'
import { assertInsideOpenDeck, isInsideRoot } from '../services/deck-roots'

/**
 * PDF / HTML export.
 *
 * Both formats are rendered by the app's OWN renderer: a hidden 1280x720 window loads
 * `#/export?deck=…`, which mounts `ExportRoute` and paints every slide (and sub-slide) with the
 * real `ContentRenderer` in the deck's theme. The window signals `export:render-ready` once
 * fonts, images and diagrams have settled; only then do we print (PDF) or capture the DOM (HTML).
 *
 * Nothing here re-implements markdown, themes or layouts — that was the old `slideHtmls`
 * pipeline, and it lost every theme, layout, badge, diagram and image the renderer knows about.
 */

/** How long we wait for the hidden window to render the deck before giving up. */
export const PDF_LOAD_TIMEOUT_MS = 60_000
/** How long after `did-finish-load` we still wait for `export:render-ready` before printing anyway. */
export const RENDER_READY_GRACE_MS = 15_000
/** Settle time after the ready signal so the last paint lands. */
const PDF_SETTLE_MS = 250

/**
 * 1280x720 px at 96 dpi. Electron >= 21 takes custom `pageSize` in INCHES (older versions took
 * microns). `preferCSSPageSize` makes the route's `@page { size: 13.333in 7.5in }` authoritative,
 * so the two agree whichever one Chromium picks.
 */
export const PDF_PAGE_SIZE = { width: 13.333, height: 7.5 }

export const PDF_PRINT_OPTIONS: Record<string, unknown> = {
  landscape: true,
  printBackground: true,
  preferCSSPageSize: true,
  pageSize: PDF_PAGE_SIZE,
  margins: { marginType: 'none' }
}

/**
 * The slice of BrowserWindow that export rendering needs. Kept structural so the
 * load/print flow can be exercised in tests with a fake window.
 */
export interface ExportRenderWindow {
  loadURL(url: string): Promise<void>
  loadFile(filePath: string, options?: { hash?: string }): Promise<void>
  destroy(): void
  webContents: {
    id: number
    once(event: string, listener: (...args: any[]) => void): unknown
    removeListener(event: string, listener: (...args: any[]) => void): unknown
    printToPDF(options: Record<string, unknown>): Promise<Buffer>
    executeJavaScript?(code: string): Promise<unknown>
  }
}

/** Back-compat alias for the pre-render-route name. */
export type PdfRenderWindow = ExportRenderWindow

export interface ExportRouteParams {
  rootPath: string
  theme?: string
  /** Number of slides the renderer expects to draw (informational; the route reloads the deck). */
  slides?: number
  /** Only trusted decks compile MDX; everything else falls back to stripped markdown. */
  mdxTrusted?: boolean
}

export interface ExportLoadOptions extends ExportRouteParams {
  /** `ELECTRON_RENDERER_URL` in dev; when absent we load the built `index.html`. */
  devUrl?: string | null
  /** Built renderer entry (production). */
  indexFile?: string
  loadTimeoutMs?: number
  readyGraceMs?: number
  settleMs?: number
}

/** Build the `#/export…` hash the renderer's export route parses. */
export function buildExportHash(params: ExportRouteParams): string {
  const query = new URLSearchParams()
  query.set('deck', params.rootPath)
  if (params.theme) query.set('theme', params.theme)
  if (typeof params.slides === 'number' && Number.isFinite(params.slides)) {
    query.set('slides', String(params.slides))
  }
  if (params.mdxTrusted) query.set('mdx', '1')
  return `/export?${query.toString()}`
}

/**
 * Accept both the legacy call shape (`slideHtmls` / pre-rendered slide contents, which the new
 * pipeline ignores) and the new options object.
 */
export function normalizeExportOptions(
  arg: unknown,
  fallbackTheme?: string
): { theme?: string; slides?: number; mdxTrusted?: boolean } {
  if (!arg || Array.isArray(arg) || typeof arg !== 'object') {
    return fallbackTheme ? { theme: fallbackTheme } : {}
  }
  const opts = arg as { theme?: unknown; slides?: unknown; mdxTrusted?: unknown }
  return {
    theme: typeof opts.theme === 'string' ? opts.theme : fallbackTheme,
    slides: typeof opts.slides === 'number' ? opts.slides : undefined,
    mdxTrusted: opts.mdxTrusted === true
  }
}

// ---------------------------------------------------------------------------
// render-ready handshake
// ---------------------------------------------------------------------------

/** webContents id → callback armed by an in-flight `loadExportPage`. */
const renderReadyWaiters = new Map<number, () => void>()

/** Called by the `export:render-ready` IPC listener (and by tests) when a page finished painting. */
export function signalRenderReady(webContentsId: number): void {
  renderReadyWaiters.get(webContentsId)?.()
}

/**
 * Load the export route in `win` and resolve once the page reports it is painted.
 *
 * Resolution order: `export:render-ready` (+ a short settle) wins; otherwise `did-finish-load`
 * plus `readyGraceMs`; `did-fail-load` rejects; the whole thing is bounded by `loadTimeoutMs`.
 * The window is NOT destroyed here — callers own its lifetime (HTML export reads the DOM after).
 */
export function loadExportPage(win: ExportRenderWindow, options: ExportLoadOptions): Promise<void> {
  const loadTimeoutMs = options.loadTimeoutMs ?? PDF_LOAD_TIMEOUT_MS
  const readyGraceMs = options.readyGraceMs ?? RENDER_READY_GRACE_MS
  const settleMs = options.settleMs ?? PDF_SETTLE_MS
  const hash = buildExportHash(options)
  const id = win.webContents.id

  return new Promise<void>((resolveLoad, rejectLoad) => {
    let done = false
    let graceTimer: NodeJS.Timeout | null = null
    let settleTimer: NodeJS.Timeout | null = null

    const cleanup = (): void => {
      clearTimeout(timeout)
      if (graceTimer) clearTimeout(graceTimer)
      if (settleTimer) clearTimeout(settleTimer)
      renderReadyWaiters.delete(id)
      win.webContents.removeListener('did-finish-load', onFinish)
      win.webContents.removeListener('did-fail-load', onFail)
    }
    const finish = (): void => {
      if (done) return
      done = true
      cleanup()
      resolveLoad()
    }
    const fail = (error: Error): void => {
      if (done) return
      done = true
      cleanup()
      rejectLoad(error)
    }

    // The page says it is painted — settle briefly, then go.
    renderReadyWaiters.set(id, () => {
      if (done) return
      if (graceTimer) clearTimeout(graceTimer)
      settleTimer = setTimeout(finish, settleMs)
    })

    // Fallback: the page loaded but never signalled (old bundle, crash in the route, …).
    const onFinish = (): void => {
      if (done || graceTimer) return
      graceTimer = setTimeout(finish, readyGraceMs)
    }
    const onFail = (_event: unknown, errorCode: number, errorDescription: string): void => {
      fail(new Error(`Export failed to load slides (${errorCode}: ${errorDescription})`))
    }
    const timeout = setTimeout(() => {
      fail(new Error(`Export timed out after ${loadTimeoutMs} ms while loading slides`))
    }, loadTimeoutMs)

    win.webContents.once('did-finish-load', onFinish)
    win.webContents.once('did-fail-load', onFail)

    // A load rejection is also reported through did-fail-load; swallow the duplicate.
    const devUrl = options.devUrl
    if (devUrl) {
      win.loadURL(`${devUrl.replace(/\/$/, '')}/#${hash}`).catch(() => {})
    } else {
      win.loadFile(options.indexFile ?? rendererIndexFile(), { hash }).catch(() => {})
    }
  })
}

/** What the export route publishes on `window.__lectaExport` once it is done. */
export interface ExportPageStatus {
  ready?: boolean
  slideCount?: number
  error?: string
}

export async function readExportStatus(win: ExportRenderWindow): Promise<ExportPageStatus | null> {
  const exec = win.webContents.executeJavaScript
  if (typeof exec !== 'function') return null
  try {
    const status = await exec.call(win.webContents, 'window.__lectaExport || null')
    return (status as ExportPageStatus) ?? null
  } catch {
    return null
  }
}

/**
 * Render the export route to a PDF buffer. The window is always destroyed, whether the load
 * succeeds, fails (`did-fail-load`) or times out.
 */
export async function renderPdf(win: ExportRenderWindow, options: ExportLoadOptions): Promise<Buffer> {
  try {
    await loadExportPage(win, options)
    const status = await readExportStatus(win)
    if (status?.error) throw new Error(`Export failed to render the deck: ${status.error}`)
    if (status && status.slideCount === 0) throw new Error('Export produced no slides')
    return await win.webContents.printToPDF(PDF_PRINT_OPTIONS)
  } finally {
    try {
      win.destroy()
    } catch {
      /* already destroyed */
    }
  }
}

// ---------------------------------------------------------------------------
// HTML capture
// ---------------------------------------------------------------------------

export interface StyleSheetLike {
  href?: string | null
  cssRules?: ArrayLike<{ cssText: string }> | null
}

export interface CollectedCss {
  css: string
  /** Stylesheets whose rules the page could not read (cross-origin `file://` links). */
  unreadable: string[]
}

/**
 * Collect the page's own CSS into one blob.
 *
 * Runs inside the export window (it is serialized into the capture script), so it must stay
 * dependency-free and plain-JS. Rules that would make the exported file reach the network —
 * `@import url(http…)` and Google Fonts links — are dropped: a shared HTML export has to work
 * offline and must not phone home.
 */
export function collectCss(sheets: StyleSheetLike[]): CollectedCss {
  const parts: string[] = []
  const unreadable: string[] = []
  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s]
    let rules: ArrayLike<{ cssText: string }> | null = null
    try {
      rules = sheet.cssRules || null
    } catch (err) {
      rules = null
    }
    if (!rules) {
      if (sheet.href) unreadable.push(String(sheet.href))
      continue
    }
    for (let i = 0; i < rules.length; i++) {
      const text = rules[i] && rules[i].cssText ? String(rules[i].cssText) : ''
      if (!text) continue
      if (/^\s*@import\s/i.test(text) && /https?:/i.test(text)) continue
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(text)) continue
      parts.push(text)
    }
  }
  return { css: parts.join('\n'), unreadable }
}

export interface CapturedPage {
  css: string
  unreadable: string[]
  body: string
  title: string
  slideCount: number
}

/** Script evaluated in the export window to snapshot its rendered DOM + CSS. */
export function buildCaptureScript(): string {
  return `(function () {
  var collect = ${collectCss.toString()};
  var collected = collect(Array.prototype.slice.call(document.styleSheets));
  var clone = document.documentElement.cloneNode(true);
  var drop = clone.querySelectorAll('script, style, link, noscript, template');
  for (var i = 0; i < drop.length; i++) drop[i].parentNode.removeChild(drop[i]);
  var body = clone.querySelector('body');
  return {
    css: collected.css,
    unreadable: collected.unreadable,
    body: body ? body.innerHTML : '',
    title: document.title || '',
    slideCount: document.querySelectorAll('.export-slide').length
  };
})()`
}

/**
 * Read stylesheets the page itself could not read. Only the app's own bundled CSS is eligible:
 * the file must be a `file://` URL inside the built renderer directory.
 */
export async function readLocalStylesheets(hrefs: string[], rendererRoot: string): Promise<string> {
  const chunks: string[] = []
  for (const href of hrefs) {
    if (!href.startsWith('file://')) continue
    const filePath = fileUrlToPath(href)
    if (!filePath || !isInsideRoot(filePath, rendererRoot)) continue
    try {
      chunks.push(await readFile(filePath, 'utf-8'))
    } catch {
      /* stylesheet vanished — the export just loses that sheet */
    }
  }
  return chunks.join('\n')
}

export interface StandaloneHtmlInput {
  title: string
  css: string
  body: string
  slideCount: number
}

/**
 * Wrap the captured slide DOM in a self-contained deck: the app's own CSS, a screen-only
 * presentation layer, and a small vanilla navigator. No external references of any kind.
 */
export function buildStandaloneHtml({ title, css, body, slideCount }: StandaloneHtmlInput): string {
  const safeTitle = escapeHtml(title || 'Presentation')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
${css}
</style>
<style>
/* --- exported deck: screen presentation layer (print keeps the page-per-slide rules) --- */
@media screen {
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #05050a; }
  #lecta-export-root { position: fixed; inset: 0; }
  .export-slide {
    position: absolute; left: 50%; top: 50%;
    transform: translate(-50%, -50%) scale(var(--export-scale, 1));
    transform-origin: center center;
    display: none; box-shadow: 0 10px 60px rgba(0,0,0,0.55);
  }
  .export-slide.is-active { display: block; }
  .export-chrome {
    position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 10px;
    padding: 7px 14px; border-radius: 999px;
    background: rgba(15,15,20,0.82); border: 1px solid rgba(255,255,255,0.12);
    color: #e6e6ee; font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    z-index: 2147483000; opacity: 0.25; transition: opacity 0.2s;
  }
  .export-chrome:hover { opacity: 1; }
  .export-chrome button {
    background: none; border: 0; color: inherit; font: inherit; cursor: pointer;
    padding: 3px 9px; border-radius: 999px;
  }
  .export-chrome button:hover { background: rgba(255,255,255,0.14); }
  .export-chrome .export-counter { font-variant-numeric: tabular-nums; min-width: 64px; text-align: center; opacity: 0.75; }
  .export-chrome .export-hint { opacity: 0.5; font-size: 11px; }
  #export-notes {
    position: fixed; left: 0; right: 0; bottom: 0; max-height: 38vh; overflow: auto;
    padding: 18px 24px 60px; background: rgba(8,8,12,0.94); color: #d8d8e4;
    border-top: 1px solid rgba(255,255,255,0.12); white-space: pre-wrap;
    font: 400 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    z-index: 2147482000; display: none;
  }
  body.export-show-notes #export-notes { display: block; }
  .export-notes { display: none; }
}
@media print {
  .export-chrome, #export-notes { display: none !important; }
}
</style>
</head>
<body>
${body}
<div id="export-notes"></div>
<div class="export-chrome">
  <button type="button" data-export-prev aria-label="Previous slide">&larr;</button>
  <span class="export-counter" data-export-counter>1 / ${slideCount}</span>
  <button type="button" data-export-next aria-label="Next slide">&rarr;</button>
  <span class="export-hint">f fullscreen &middot; s notes</span>
</div>
<script>
${NAV_SCRIPT}
</script>
</body>
</html>`
}

/** Vanilla navigator for the exported deck — no framework, no network. */
const NAV_SCRIPT = `(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.export-slide'));
  if (slides.length === 0) return;
  var counter = document.querySelector('[data-export-counter]');
  var notesPanel = document.getElementById('export-notes');
  var current = 0;

  function scale() {
    var w = window.innerWidth, h = window.innerHeight;
    var s = Math.min(w / 1280, h / 720);
    if (!isFinite(s) || s <= 0) s = 1;
    document.documentElement.style.setProperty('--export-scale', String(s));
  }

  function show(index) {
    current = Math.max(0, Math.min(slides.length - 1, index));
    for (var i = 0; i < slides.length; i++) {
      if (i === current) slides[i].classList.add('is-active');
      else slides[i].classList.remove('is-active');
    }
    if (counter) counter.textContent = (current + 1) + ' / ' + slides.length;
    if (notesPanel) {
      var note = slides[current].querySelector('.export-notes');
      notesPanel.textContent = note ? note.textContent : '';
    }
    try { location.hash = '#' + (current + 1); } catch (err) { /* ignore */ }
  }

  function next() { if (current < slides.length - 1) show(current + 1); }
  function prev() { if (current > 0) show(current - 1); }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { e.preventDefault(); show(0); }
    else if (e.key === 'End') { e.preventDefault(); show(slides.length - 1); }
    else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    } else if (e.key === 's' || e.key === 'S') {
      document.body.classList.toggle('export-show-notes');
    }
  });

  document.addEventListener('click', function (e) {
    var target = e.target;
    while (target && target !== document.body) {
      if (target.hasAttribute && target.hasAttribute('data-export-prev')) { prev(); return; }
      if (target.hasAttribute && target.hasAttribute('data-export-next')) { next(); return; }
      if (target.tagName === 'A' || target.id === 'export-notes') return;
      target = target.parentNode;
    }
    next();
  });

  window.addEventListener('resize', scale);
  scale();
  var start = parseInt((location.hash || '').replace('#', ''), 10);
  show(isFinite(start) && start > 0 ? start - 1 : 0);
})()`

// ---------------------------------------------------------------------------
// asset inlining
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

function fileUrlToPath(url: string): string | null {
  try {
    let path = decodeURIComponent(url.replace(/^[a-z-]+:\/\//i, ''))
    // Windows: file:///C:/x → /C:/x
    if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1)
    return path
  } catch {
    // Malformed percent-encoding
    return null
  }
}

/**
 * Resolve a document URL to an absolute path inside `rootPath`, or null when it points anywhere
 * else. Deck confinement lives here: the exporter reads whatever this returns.
 */
export function resolveAssetPath(ref: string, rootPath: string): string | null {
  if (!ref) return null
  if (/^(data:|https?:|blob:|about:)/i.test(ref)) return null

  let candidate: string | null
  if (/^(lecta-file|file):\/\//i.test(ref)) {
    candidate = fileUrlToPath(ref)
  } else {
    try {
      candidate = decodeURIComponent(ref)
    } catch {
      candidate = ref
    }
  }
  if (!candidate) return null

  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(rootPath, candidate)
  return isInsideRoot(absolute, rootPath) ? absolute : null
}

async function toDataUri(absolutePath: string): Promise<string | null> {
  const mime = MIME_TYPES[extname(absolutePath).toLowerCase()]
  if (!mime) return null
  try {
    const data = await readFile(absolutePath)
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Replace every deck image reference (`src="…"` and `url(…)`, including `lecta-file://` URLs)
 * with a base64 data URI so the exported file needs no companion assets and makes no requests.
 * References outside the deck root, or of unsupported types, are left untouched.
 */
export async function embedImages(html: string, rootPath: string): Promise<string> {
  const deckRoot = resolve(rootPath)
  const attrPattern = /\b(src|href)=(["'])([^"']+)\2/gi
  const urlPattern = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi

  // Pass 1: read every referenced deck asset (async), keyed by the raw reference.
  const dataUris = new Map<string, string>()
  const candidates = [
    ...[...html.matchAll(attrPattern)].map((m) => m[3]),
    ...[...html.matchAll(urlPattern)].map((m) => m[2])
  ]
  for (const ref of candidates) {
    if (dataUris.has(ref)) continue
    const absolute = resolveAssetPath(ref, deckRoot)
    if (!absolute) continue
    const dataUri = await toDataUri(absolute)
    if (dataUri) dataUris.set(ref, dataUri)
  }
  if (dataUris.size === 0) return html

  // Pass 2: rewrite only the references themselves — never matching text elsewhere on the page.
  return html
    .replace(attrPattern, (full, attr: string, _quote: string, ref: string) => {
      const dataUri = dataUris.get(ref)
      return dataUri ? `${attr}="${dataUri}"` : full
    })
    .replace(urlPattern, (full, _quote: string, ref: string) => {
      const dataUri = dataUris.get(ref)
      return dataUri ? `url("${dataUri}")` : full
    })
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function rendererIndexFile(): string {
  return join(__dirname, '../renderer/index.html')
}

function rendererRoot(): string {
  return join(__dirname, '../renderer')
}

/** Hidden 1280x720 window running the app's own renderer (same preload → same bridge). */
function createExportWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // A hidden window would otherwise be throttled, stalling the render we are waiting for.
      backgroundThrottling: false,
      devTools: false
    }
  })
}

function loadOptionsFor(rootPath: string, options: { theme?: string; slides?: number; mdxTrusted?: boolean }): ExportLoadOptions {
  return {
    rootPath,
    ...options,
    devUrl: process.env['ELECTRON_RENDERER_URL'] || null,
    indexFile: rendererIndexFile()
  }
}

export function registerExportHandlers(): void {
  // The export route reports that every slide has painted.
  ipcMain.on('export:render-ready', (event) => {
    signalRenderReady(event.sender.id)
  })

  ipcMain.handle(
    'export:pdf',
    async (_event, rootPath: string, legacyOrOptions: unknown, title: string): Promise<string | null> => {
      // The renderer loads the deck through this path: confine it to an open deck.
      const deckRoot = assertInsideOpenDeck(rootPath)
      const options = normalizeExportOptions(legacyOrOptions)

      const result = await dialog.showSaveDialog({
        title: 'Export as PDF',
        defaultPath: `${title || 'presentation'}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return null

      const win = createExportWindow()
      const pdfBuffer = await renderPdf(win, loadOptionsFor(deckRoot, options))
      await writeFile(result.filePath, pdfBuffer)
      return result.filePath
    }
  )

  // Export as a single self-contained HTML deck
  ipcMain.handle(
    'export:html',
    async (
      _event,
      rootPath: string,
      legacyOrOptions: unknown,
      title: string,
      theme?: string
    ): Promise<string | null> => {
      // Images are inlined from this root: it must belong to an open deck
      const deckRoot = assertInsideOpenDeck(rootPath)
      const options = normalizeExportOptions(legacyOrOptions, typeof theme === 'string' ? theme : undefined)

      const result = await dialog.showSaveDialog({
        title: 'Export as HTML',
        defaultPath: `${title || 'presentation'}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }]
      })
      if (result.canceled || !result.filePath) return null

      const win = createExportWindow()
      let standalone: string
      try {
        await loadExportPage(win, loadOptionsFor(deckRoot, options))
        const status = await readExportStatus(win)
        if (status?.error) throw new Error(`Export failed to render the deck: ${status.error}`)

        const captured = (await win.webContents.executeJavaScript!.call(
          win.webContents,
          buildCaptureScript()
        )) as CapturedPage
        if (!captured || captured.slideCount === 0) throw new Error('Export produced no slides')

        const linkedCss = await readLocalStylesheets(captured.unreadable || [], rendererRoot())
        standalone = buildStandaloneHtml({
          title: title || captured.title,
          css: `${linkedCss}\n${captured.css}`,
          body: captured.body,
          slideCount: captured.slideCount
        })
      } finally {
        try {
          win.destroy()
        } catch {
          /* already destroyed */
        }
      }

      const inlined = await embedImages(standalone, deckRoot)
      await writeFile(result.filePath, inlined, 'utf-8')
      return result.filePath
    }
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

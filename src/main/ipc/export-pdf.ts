import { ipcMain, BrowserWindow, dialog } from 'electron'
import { writeFile, readFile, unlink } from 'fs/promises'
import { join, resolve, extname } from 'path'
import { tmpdir } from 'os'

export function registerExportHandlers(): void {
  ipcMain.handle(
    'export:pdf',
    async (_event, rootPath: string, slideHtmls: string[], title: string): Promise<string | null> => {
      const result = await dialog.showSaveDialog({
        title: 'Export as PDF',
        defaultPath: `${title || 'presentation'}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })

      if (result.canceled || !result.filePath) return null

      // Create a hidden window to render slides
      const win = new BrowserWindow({
        width: 1280,
        height: 720,
        show: false,
        webPreferences: {
          offscreen: true
        }
      })

      try {
        // Build a single HTML document with all slides as pages
        const fullHtml = buildPdfHtml(slideHtmls, title)

        // Write to a temp file so that relative image paths (e.g. images/photo.png)
        // resolve against the presentation's root directory via <base href>
        const tmpPath = join(tmpdir(), `lecta-export-${Date.now()}.html`)
        const htmlWithBase = fullHtml.replace(
          '<head>',
          `<head>\n  <base href="file://${rootPath.replace(/\\/g, '/')}/">`
        )
        await writeFile(tmpPath, htmlWithBase, 'utf-8')

        // Attach listener BEFORE loading so we don't miss the event
        const loaded = new Promise<void>((resolve) => {
          win.webContents.on('did-finish-load', () => {
            setTimeout(resolve, 800)
          })
        })
        win.loadFile(tmpPath)
        await loaded

        const pdfBuffer = await win.webContents.printToPDF({
          landscape: true,
          printBackground: true,
          preferCSSPageSize: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 }
        })

        await writeFile(result.filePath, pdfBuffer)
        // Clean up temp file
        try { await unlink(tmpPath) } catch {}
        return result.filePath
      } finally {
        win.destroy()
      }
    }
  )

  // Export as self-contained HTML SPA
  ipcMain.handle(
    'export:html',
    async (_event, rootPath: string, slideContents: (string | { content: string; isPreRendered: boolean })[], title: string, theme: string): Promise<string | null> => {
      const result = await dialog.showSaveDialog({
        title: 'Export as HTML',
        defaultPath: `${title || 'presentation'}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }]
      })

      if (result.canceled || !result.filePath) return null

      // Normalize: accept both old string[] format and new { content, isPreRendered }[] format
      const normalized = slideContents.map((s) =>
        typeof s === 'string' ? { content: s, isPreRendered: false } : s
      )
      // Embed images as base64 data URIs in each slide before JSON serialization
      const embedded = await Promise.all(
        normalized.map(async (s) => ({
          ...s,
          content: await embedImages(s.content, rootPath)
        }))
      )
      const html = buildSpaHtml(embedded, title, theme)
      await writeFile(result.filePath, html, 'utf-8')
      return result.filePath
    }
  )
}

export function buildSpaHtml(slideData: { content: string; isPreRendered: boolean }[], title: string, theme: string): string {
  const slidesJson = JSON.stringify(slideData)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: ${theme === 'light' ? '#f8fafc' : '#0a0a0a'}; color: ${theme === 'light' ? '#1e293b' : '#e2e8f0'}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; height: 100vh; }
  .slide-container { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
  .slide { width: 1280px; height: 720px; padding: 48px; transform-origin: center center; background: ${theme === 'light' ? '#ffffff' : '#0f172a'}; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.3); overflow: hidden; position: relative; }
  .slide h1 { font-size: 2.5rem; font-weight: 700; margin-bottom: 1rem; color: ${theme === 'light' ? '#0f172a' : '#ffffff'}; }
  .slide h2 { font-size: 2rem; font-weight: 600; margin-bottom: 0.75rem; }
  .slide h3 { font-size: 1.5rem; font-weight: 500; margin-bottom: 0.5rem; }
  .slide p { font-size: 1.25rem; line-height: 1.6; margin-bottom: 0.75rem; }
  .slide ul { padding-left: 1.5rem; margin-bottom: 0.75rem; }
  .slide li { font-size: 1.125rem; line-height: 1.6; margin-bottom: 0.25rem; }
  .slide strong { font-weight: 700; }
  .slide em { font-style: italic; }
  .slide code { background: rgba(99,102,241,0.15); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  .slide pre { background: rgba(0,0,0,0.3); border-radius: 8px; padding: 16px; margin: 12px 0; overflow-x: auto; }
  .slide pre code { background: none; padding: 0; }
  .slide img { max-width: 100%; height: auto; border-radius: 8px; }
  .slide blockquote { border-left: 3px solid #6366f1; padding-left: 16px; margin: 12px 0; font-style: italic; opacity: 0.8; }
  .slide table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .slide th, .slide td { padding: 8px 12px; border-bottom: 1px solid rgba(${theme === 'light' ? '0,0,0' : '255,255,255'},0.1); text-align: left; }
  .slide th { font-weight: 600; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px; }
  .slide hr { border: none; border-top: 1px solid rgba(${theme === 'light' ? '0,0,0' : '255,255,255'},0.1); margin: 24px 0; }
  .nav { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); padding: 8px 16px; border-radius: 40px; z-index: 100; }
  .nav button { background: none; border: none; color: #fff; font-size: 18px; cursor: pointer; padding: 4px 12px; border-radius: 20px; transition: background 0.15s; }
  .nav button:hover { background: rgba(255,255,255,0.15); }
  .nav span { color: #999; font-size: 14px; font-variant-numeric: tabular-nums; min-width: 60px; text-align: center; }
</style>
</head>
<body>
<div class="slide-container" id="slideContainer"></div>
<div class="nav">
  <button onclick="prev()">&larr;</button>
  <span id="counter">1 / 1</span>
  <button onclick="next()">&rarr;</button>
</div>
<script>
const slides = ${slidesJson};
let current = 0;
const container = document.getElementById('slideContainer');
const counter = document.getElementById('counter');

function render() {
  const slide = slides[current] || { content: '', isPreRendered: false };
  const md = typeof slide === 'string' ? slide : slide.content;
  const preRendered = typeof slide === 'object' && slide.isPreRendered;
  let html;
  if (preRendered) {
    html = md;
  } else {
    html = md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
      .replace(/\`(.+?)\`/g, '<code>$1</code>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\\/li>)/gs, '<ul>$1</ul>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^---$/gm, '<hr>')
      .replace(/^(?!<[hulbh])((?!<).+)$/gm, '<p>$1</p>')
      .replace(/<p><\\/p>/g, '');
  }
  container.innerHTML = '<div class="slide">' + html + '</div>';
  counter.textContent = (current + 1) + ' / ' + slides.length;
  // Scale slide to fit viewport
  const el = container.querySelector('.slide');
  if (el) {
    const sw = window.innerWidth, sh = window.innerHeight;
    const s = Math.min(sw / 1280, sh / 720) * 0.9;
    el.style.transform = 'scale(' + s + ')';
  }
}

function next() { if (current < slides.length - 1) { current++; render(); } }
function prev() { if (current > 0) { current--; render(); } }
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') next();
  if (e.key === 'ArrowLeft') prev();
});
window.addEventListener('resize', render);
render();
</script>
</body>
</html>`
}

export function buildPdfHtml(slideHtmls: string[], title: string): string {
  const slides = slideHtmls.map((html, i) => `
    <div class="slide" ${i > 0 ? 'style="page-break-before: always;"' : ''}>
      ${html}
    </div>
  `).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page {
      size: 1280px 720px;
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slide {
      width: 1280px;
      height: 720px;
      overflow: hidden;
      position: relative;
    }
    img { max-width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>${slides}</body>
</html>`
}

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

export async function embedImages(html: string, rootPath: string): Promise<string> {
  // Match src="..." attributes that reference local (non-data-uri, non-http) images
  const srcRegex = /src=["'](?!data:|https?:\/\/|blob:)([^"']+)["']/g
  const matches = [...html.matchAll(srcRegex)]
  if (matches.length === 0) return html

  let result = html
  for (const match of matches) {
    const relPath = match[1]
    const absPath = resolve(rootPath, relPath)
    const ext = extname(absPath).toLowerCase()
    const mime = MIME_TYPES[ext]
    if (!mime) continue
    try {
      const data = await readFile(absPath)
      const dataUri = `data:${mime};base64,${data.toString('base64')}`
      result = result.replace(match[0], `src="${dataUri}"`)
    } catch {
      // Image not found — leave the original src
    }
  }
  return result
}

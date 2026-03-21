import { ipcMain, BrowserWindow, dialog } from 'electron'
import { writeFile } from 'fs/promises'

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
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)

        // Wait for rendering
        await new Promise((r) => setTimeout(r, 1500))

        const pdfBuffer = await win.webContents.printToPDF({
          landscape: true,
          printBackground: true,
          preferCSSPageSize: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 }
        })

        await writeFile(result.filePath, pdfBuffer)
        return result.filePath
      } finally {
        win.destroy()
      }
    }
  )

  // Export as self-contained HTML SPA
  ipcMain.handle(
    'export:html',
    async (_event, slideContents: (string | { content: string; isPreRendered: boolean })[], title: string, theme: string): Promise<string | null> => {
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
      const html = buildSpaHtml(normalized, title, theme)
      await writeFile(result.filePath, html, 'utf-8')
      return result.filePath
    }
  )
}

function buildSpaHtml(slideData: { content: string; isPreRendered: boolean }[], title: string, theme: string): string {
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
  const slide = container.querySelector('.slide');
  if (slide) {
    const sw = window.innerWidth, sh = window.innerHeight;
    const s = Math.min(sw / 1280, sh / 720) * 0.9;
    slide.style.transform = 'scale(' + s + ')';
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

function buildPdfHtml(slideHtmls: string[], title: string): string {
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
      background: #000;
      color: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slide {
      width: 1280px;
      height: 720px;
      padding: 48px;
      background: #000;
      overflow: hidden;
      position: relative;
    }
    h1 { font-size: 36px; font-weight: 700; margin-bottom: 24px; color: #fff; }
    h2 { font-size: 30px; font-weight: 600; margin-bottom: 16px; color: #fff; }
    h3 { font-size: 24px; font-weight: 500; margin-bottom: 12px; color: #e5e5e5; }
    p { font-size: 20px; line-height: 1.6; margin-bottom: 16px; color: #d4d4d4; }
    ul, ol { font-size: 18px; line-height: 1.6; margin-bottom: 16px; margin-left: 24px; color: #d4d4d4; }
    li { margin-bottom: 8px; }
    code { background: #262626; padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 16px; }
    pre { background: #171717; padding: 16px; border-radius: 8px; margin-bottom: 16px; overflow: hidden; font-size: 14px; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #fff; padding-left: 16px; color: #a3a3a3; font-style: italic; margin-bottom: 16px; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #262626; border: 1px solid #404040; padding: 8px 16px; text-align: left; font-weight: 600; }
    td { border: 1px solid #404040; padding: 8px 16px; color: #d4d4d4; }
    hr { border: none; border-top: 1px solid #404040; margin: 32px 0; }
  </style>
</head>
<body>${slides}</body>
</html>`
}

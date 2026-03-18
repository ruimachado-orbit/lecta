import { ipcMain, BrowserWindow, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'

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

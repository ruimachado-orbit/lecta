import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { stat } from 'fs/promises'
import { basename, join } from 'path'
import { isInsideOpenDeck } from '../services/deck-roots'
import { atomicWriteFile } from '../services/safe-fs'
import { buildPptx, type PptxDeckInput } from '../services/pptx-exporter'

/**
 * `export:pptx` — render the open deck to an editable PowerPoint file.
 * The renderer sends the loaded slides (markdown, code, notes) so the export
 * reflects unsaved edits; the deck root must be a registered open deck so
 * image paths stay confined to it.
 */
export function registerPptxExportHandlers(): void {
  // Reveal a file the app produced (export result). Only existing regular
  // files are revealed; never directories, never non-existent paths.
  ipcMain.handle('shell:show-item-in-folder', async (_event, filePath: string): Promise<void> => {
    if (typeof filePath !== 'string' || !filePath) throw new Error('Invalid path')
    const st = await stat(filePath)
    if (!st.isFile()) throw new Error('Not a file')
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle(
    'export:pptx',
    async (event, deck: PptxDeckInput): Promise<{ path: string; slideCount: number; warnings: string[] } | null> => {
      if (!deck || typeof deck !== 'object' || typeof deck.rootPath !== 'string' || !Array.isArray(deck.slides)) {
        throw new Error('Invalid export payload')
      }
      if (!isInsideOpenDeck(deck.rootPath)) {
        throw new Error('Export refused: presentation is not open')
      }
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const safeName = (deck.title || basename(deck.rootPath) || 'presentation').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'presentation'
      const { canceled, filePath } = await dialog.showSaveDialog(win as BrowserWindow, {
        title: 'Export as PowerPoint',
        defaultPath: join(deck.rootPath, `${safeName}.pptx`),
        filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
      })
      if (canceled || !filePath) return null
      const result = await buildPptx(deck)
      await atomicWriteFile(filePath, result.buffer)
      return { path: filePath, slideCount: result.slideCount, warnings: result.warnings }
    }
  )
}

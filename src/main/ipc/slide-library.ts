import { ipcMain, app } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { atomicWriteFile, withLock } from '../services/safe-fs'

export interface StoredSlide {
  id: string
  name: string
  markdown: string
  layout?: string
  codeContent?: string
  codeLanguage?: string
  savedAt: string
  tags?: string[]
}

const getLibraryPath = (): string =>
  join(app.getPath('userData'), 'slide-library.json')

let cachedLibrary: StoredSlide[] | null = null
/** Set when the on-disk file exists but could not be parsed — we must never overwrite it. */
let loadError: Error | null = null

async function loadLibrary(): Promise<StoredSlide[]> {
  if (cachedLibrary) return cachedLibrary
  try {
    const content = await readFile(getLibraryPath(), 'utf-8')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) throw new Error('slide-library.json is not an array')
    cachedLibrary = parsed as StoredSlide[]
    loadError = null
    return cachedLibrary
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      loadError = null
      cachedLibrary = []
      return cachedLibrary
    }
    // Corrupt file: serve an empty in-memory copy but refuse to write over it
    loadError = err as Error
    return []
  }
}

async function saveLibrary(library: StoredSlide[]): Promise<void> {
  if (loadError) {
    throw new Error(`Refusing to overwrite unreadable slide-library.json: ${loadError.message}`)
  }
  await withLock('slide-library', async () => {
    cachedLibrary = library
    await atomicWriteFile(getLibraryPath(), JSON.stringify(library, null, 2))
  })
}

export function registerSlideLibraryHandlers(): void {
  ipcMain.handle(
    'library:save-slide',
    async (
      _event,
      slide: { name: string; markdown: string; layout?: string; codeContent?: string; codeLanguage?: string; tags?: string[] }
    ): Promise<StoredSlide> => {
      const library = await loadLibrary()
      const stored: StoredSlide = {
        id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: slide.name,
        markdown: slide.markdown,
        layout: slide.layout,
        codeContent: slide.codeContent,
        codeLanguage: slide.codeLanguage,
        savedAt: new Date().toISOString(),
        tags: slide.tags
      }
      library.unshift(stored)
      await saveLibrary(library)
      return stored
    }
  )

  ipcMain.handle('library:list-slides', async (): Promise<StoredSlide[]> => {
    return loadLibrary()
  })

  ipcMain.handle('library:delete-slide', async (_event, id: string): Promise<void> => {
    const library = await loadLibrary()
    const filtered = library.filter((s) => s.id !== id)
    await saveLibrary(filtered)
  })

  ipcMain.handle(
    'library:rename-slide',
    async (_event, id: string, newName: string): Promise<void> => {
      const library = await loadLibrary()
      const slide = library.find((s) => s.id === id)
      if (slide) {
        slide.name = newName
        await saveLibrary(library)
      }
    }
  )
}

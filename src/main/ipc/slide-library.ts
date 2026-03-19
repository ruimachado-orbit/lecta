import { ipcMain, app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

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

async function loadLibrary(): Promise<StoredSlide[]> {
  if (cachedLibrary) return cachedLibrary
  try {
    const content = await readFile(getLibraryPath(), 'utf-8')
    cachedLibrary = JSON.parse(content)
    return cachedLibrary!
  } catch {
    cachedLibrary = []
    return cachedLibrary
  }
}

async function saveLibrary(library: StoredSlide[]): Promise<void> {
  cachedLibrary = library
  const dir = app.getPath('userData')
  await mkdir(dir, { recursive: true })
  await writeFile(getLibraryPath(), JSON.stringify(library, null, 2))
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

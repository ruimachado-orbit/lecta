import { ipcMain, app, dialog } from 'electron'
import { readFile, mkdir, stat, readdir, rm } from 'fs/promises'
import { join, resolve, extname } from 'path'
import { homedir } from 'os'
import { DECK_CONFIG_FILE } from '../../../packages/shared/src/constants'
import { atomicWriteFile, withLock } from '../services/safe-fs'
import { isInsideOpenDeck, isInsideRoot } from '../services/deck-roots'

// ── Types ──

export interface LibraryFolder {
  id: string
  name: string
  parentId: string | null // null = root
  color?: string
}

export interface LibraryEntry {
  id: string
  path: string
  title: string
  type: 'presentation' | 'notebook'
  folderId: string | null // null = unfiled
  tags: string[]
  createdAt: string
  updatedAt: string
  slideCount: number
  firstSlidePreview: string
  firstSlideContent?: string
  firstSlideIsMdx?: boolean
  theme?: string
}

interface LibraryData {
  folders: LibraryFolder[]
  entries: LibraryEntry[]
  tagColors?: Record<string, string>
}

// ── Persistence ──

let library: LibraryData = { folders: [], entries: [], tagColors: {} }
let libraryLoaded = false
/**
 * True when library.json exists but could not be read/parsed. The in-memory
 * library is then empty for reasons that have nothing to do with the user's
 * data, so writing it back would destroy the whole library: never save.
 */
let libraryUnreadable = false

function getLibraryPath(): string {
  return join(app.getPath('userData'), 'library.json')
}

function emptyLibrary(): LibraryData {
  return { folders: [], entries: [], tagColors: {} }
}

async function loadLibrary(): Promise<LibraryData> {
  let content: string
  try {
    content = await readFile(getLibraryPath(), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      library = emptyLibrary()
      libraryUnreadable = false
    } else {
      console.warn('[library] library.json is unreadable; not touching it:', err)
      library = emptyLibrary()
      libraryUnreadable = true
    }
    libraryLoaded = true
    return library
  }

  try {
    const parsed = JSON.parse(content) as LibraryData
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('library.json is not an object')
    }
    library = parsed
    if (!library.folders) library.folders = []
    if (!library.entries) library.entries = []
    if (!library.tagColors) library.tagColors = {}
    libraryUnreadable = false
  } catch (err) {
    console.warn('[library] library.json failed to parse; keeping it as-is:', err)
    library = emptyLibrary()
    libraryUnreadable = true
  }
  libraryLoaded = true
  return library
}

async function ensureLoaded(): Promise<void> {
  if (!libraryLoaded) await loadLibrary()
}

async function saveLibrary(): Promise<void> {
  if (libraryUnreadable) {
    console.warn('[library] Refusing to overwrite an unparsable library.json')
    return
  }
  try {
    await withLock('library', async () => {
      await mkdir(app.getPath('userData'), { recursive: true })
      await atomicWriteFile(getLibraryPath(), JSON.stringify(library, null, 2))
    })
  } catch (err) {
    console.warn('[library] Failed to save library.json:', err)
  }
}

// ── Path validation ──

function getLectaDocumentsDir(): string {
  return join(homedir(), 'Documents', 'Lecta')
}

/**
 * A path the renderer asked us to open or delete must (a) live in a place the
 * library owns — ~/Documents/Lecta, the app's userData dir — or in an open
 * deck, and (b) actually be a deck: a `.lecta` file or a directory holding a
 * lecta.yaml. Returns the resolved path, or null when it is neither.
 */
async function validateDeckPath(deckPath: unknown): Promise<string | null> {
  if (typeof deckPath !== 'string' || deckPath.length === 0) return null
  const resolved = resolve(deckPath)

  const inManagedLocation =
    isInsideRoot(resolved, getLectaDocumentsDir()) ||
    isInsideRoot(resolved, app.getPath('userData')) ||
    isInsideOpenDeck(resolved)
  if (!inManagedLocation) return null

  try {
    const s = await stat(resolved)
    if (s.isDirectory()) {
      await stat(join(resolved, DECK_CONFIG_FILE))
      return resolved
    }
    return extname(resolved).toLowerCase() === '.lecta' ? resolved : null
  } catch {
    return null
  }
}

/** Delete a deck file/folder after validating it really is one of ours. */
async function deleteDeckAtPath(deckPath: string): Promise<void> {
  const validated = await validateDeckPath(deckPath)
  if (!validated) {
    console.warn(`[library] Refusing to delete a path that is not a managed deck: ${deckPath}`)
    return
  }
  try {
    const s = await stat(validated)
    await rm(validated, { recursive: s.isDirectory() })
  } catch (err) {
    console.warn(`[library] Failed to delete ${validated}:`, err)
  }
}

/**
 * Read a deck's metadata for the library. `.lecta` archives are inspected in a
 * throwaway directory so a deck that is currently open keeps its workspace.
 */
async function readDeckMetadata(deckPath: string): Promise<{
  title: string
  type: 'presentation' | 'notebook'
  slideCount: number
  preview: string
  fullContent: string
  isMdx: boolean
  theme?: string
} | null> {
  const { parsePresentationYaml } = await import('../../../packages/shared/src/utils/yaml-parser')
  const { resolveRelativePath } = await import('../../../packages/shared/src/utils/path-resolver')

  const fromDir = async (dir: string): Promise<{
    title: string; type: 'presentation' | 'notebook'; slideCount: number
    preview: string; fullContent: string; isMdx: boolean; theme?: string
  }> => {
    const yamlContent = await readFile(join(dir, DECK_CONFIG_FILE), 'utf-8')
    const config = parsePresentationYaml(yamlContent, dir)
    const isNotebook = /^type:\s*["']?notebook["']?\s*$/m.test(yamlContent)

    let preview = ''
    let fullContent = ''
    let isMdx = false
    if (config.slides.length > 0) {
      try {
        const md = await readFile(resolveRelativePath(dir, config.slides[0].content), 'utf-8')
        fullContent = md
        isMdx = config.slides[0].content.endsWith('.mdx')
        preview = md.replace(/<!--.*?-->/gs, '').trim().split('\n').filter((l: string) => l.trim()).slice(0, 5).join('\n').slice(0, 200)
      } catch { /* first slide missing — no preview */ }
    }

    return {
      title: config.title,
      type: isNotebook ? 'notebook' : 'presentation',
      slideCount: config.slides.length,
      preview,
      fullContent,
      isMdx,
      theme: config.theme
    }
  }

  try {
    const s = await stat(deckPath)
    if (s.isDirectory()) return await fromDir(deckPath)
    const { withExtractedLectaFile } = await import('../services/lecta-file')
    return await withExtractedLectaFile(deckPath, fromDir)
  } catch {
    return null
  }
}

// ── Public: upsert from recent decks / on open ──

export async function upsertLibraryEntry(item: {
  path: string
  title: string
  type?: 'presentation' | 'notebook'
  slideCount: number
  firstSlidePreview: string
  firstSlideContent?: string
  firstSlideIsMdx?: boolean
  theme?: string
}): Promise<void> {
  await ensureLoaded()

  const existing = library.entries.find((e) => e.path === item.path)
  if (existing) {
    existing.title = item.title
    existing.slideCount = item.slideCount
    existing.firstSlidePreview = item.firstSlidePreview
    existing.firstSlideContent = item.firstSlideContent
    existing.firstSlideIsMdx = item.firstSlideIsMdx
    existing.theme = item.theme
    existing.updatedAt = new Date().toISOString()
  } else {
    library.entries.push({
      id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      path: item.path,
      title: item.title,
      type: item.type || 'presentation',
      folderId: null,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: item.slideCount,
      firstSlidePreview: item.firstSlidePreview,
      firstSlideContent: item.firstSlideContent,
      firstSlideIsMdx: item.firstSlideIsMdx,
      theme: item.theme,
    })
  }
  await saveLibrary()
}

/**
 * Scan ~/Documents/Lecta for .lecta files and auto-add missing ones to the library.
 *
 * Only `.lecta` archives are picked up. A bare `deck.md` is NOT a deck — a single-file
 * deck becomes one when it is opened (`fs:open-single-file` materializes it into a
 * sibling folder), and the folder is what lands in the library from there.
 */
async function scanLectaDocumentsFolder(): Promise<void> {
  const lectaDir = getLectaDocumentsDir()
  let files: string[]
  try {
    files = await readdir(lectaDir)
  } catch {
    // ~/Documents/Lecta doesn't exist yet — that's fine
    return
  }

  const existingPaths = new Set(library.entries.map((e) => e.path))
  let added = false

  for (const file of files) {
    if (!file.endsWith('.lecta')) continue
    const filePath = join(lectaDir, file)
    if (existingPaths.has(filePath)) continue

    // Inspect the archive without disturbing the workspace of an open deck
    const meta = await readDeckMetadata(filePath)
    if (!meta) continue

    library.entries.push({
      id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      path: filePath,
      title: meta.title,
      type: meta.type,
      folderId: null,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: meta.slideCount,
      firstSlidePreview: meta.preview,
      firstSlideContent: meta.fullContent,
      firstSlideIsMdx: meta.isMdx,
      theme: meta.theme,
    })
    added = true
  }

  if (added) await saveLibrary()
}

// ── IPC Handlers ──

export function registerLibraryHandlers(): void {
  ipcMain.handle('library:get', async (): Promise<LibraryData> => {
    await loadLibrary()
    await scanLectaDocumentsFolder()
    return library
  })

  // ── Folders ──

  ipcMain.handle('library:create-folder', async (_event, name: string, parentId: string | null, color?: string): Promise<LibraryFolder> => {
    await ensureLoaded()
    const folder: LibraryFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      parentId: parentId || null,
      color,
    }
    library.folders.push(folder)
    await saveLibrary()
    return folder
  })

  ipcMain.handle('library:rename-folder', async (_event, folderId: string, name: string): Promise<void> => {
    await ensureLoaded()
    const folder = library.folders.find((f) => f.id === folderId)
    if (folder) folder.name = name
    await saveLibrary()
  })

  ipcMain.handle('library:delete-folder', async (_event, folderId: string): Promise<void> => {
    await ensureLoaded()
    // Move children to parent
    const folder = library.folders.find((f) => f.id === folderId)
    const parentId = folder?.parentId || null
    library.folders.filter((f) => f.parentId === folderId).forEach((f) => { f.parentId = parentId })
    library.entries.filter((e) => e.folderId === folderId).forEach((e) => { e.folderId = parentId })
    library.folders = library.folders.filter((f) => f.id !== folderId)
    await saveLibrary()
  })

  ipcMain.handle('library:set-folder-color', async (_event, folderId: string, color: string): Promise<void> => {
    await ensureLoaded()
    const folder = library.folders.find((f) => f.id === folderId)
    if (folder) folder.color = color
    await saveLibrary()
  })

  // ── Entries ──

  ipcMain.handle('library:move-entry', async (_event, entryId: string, folderId: string | null): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    if (entry) entry.folderId = folderId
    await saveLibrary()
  })

  ipcMain.handle('library:set-tags', async (_event, entryId: string, tags: string[]): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    if (entry) entry.tags = tags
    await saveLibrary()
  })

  ipcMain.handle('library:add-tag', async (_event, entryId: string, tag: string): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    if (entry && !entry.tags.includes(tag)) {
      entry.tags.push(tag)
      await saveLibrary()
    }
  })

  ipcMain.handle('library:remove-tag', async (_event, entryId: string, tag: string): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    if (entry) {
      entry.tags = entry.tags.filter((t) => t !== tag)
      await saveLibrary()
    }
  })

  ipcMain.handle('library:delete-entry', async (_event, entryId: string, deleteFile: boolean): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    library.entries = library.entries.filter((e) => e.id !== entryId)
    await saveLibrary()

    if (deleteFile && entry) {
      await deleteDeckAtPath(entry.path)
    }
  })

  ipcMain.handle('library:rename-entry', async (_event, entryId: string, title: string): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    if (entry) {
      entry.title = title
      entry.updatedAt = new Date().toISOString()
    }
    await saveLibrary()
  })

  // ── Tags ──

  ipcMain.handle('library:get-all-tags', async (): Promise<string[]> => {
    await ensureLoaded()
    const tagSet = new Set<string>()
    library.entries.forEach((e) => e.tags.forEach((t) => tagSet.add(t)))
    return Array.from(tagSet).sort()
  })

  ipcMain.handle('library:get-tag-colors', async (): Promise<Record<string, string>> => {
    await ensureLoaded()
    return library.tagColors || {}
  })

  ipcMain.handle('library:set-tag-color', async (_event, tag: string, color: string): Promise<void> => {
    await ensureLoaded()
    if (!library.tagColors) library.tagColors = {}
    library.tagColors[tag] = color
    await saveLibrary()
  })

  // ── Enhanced folder delete ──

  ipcMain.handle('library:delete-folder-with-entries', async (_event, folderId: string, deleteEntries: boolean): Promise<void> => {
    await ensureLoaded()
    if (deleteEntries) {
      // Delete all entries in this folder
      const toDelete = library.entries.filter((e) => e.folderId === folderId)
      for (const entry of toDelete) {
        await deleteDeckAtPath(entry.path)
      }
      library.entries = library.entries.filter((e) => e.folderId !== folderId)
    } else {
      // Move entries to root (unfiled)
      library.entries.filter((e) => e.folderId === folderId).forEach((e) => { e.folderId = null })
    }
    // Also move sub-folders to root
    library.folders.filter((f) => f.parentId === folderId).forEach((f) => { f.parentId = null })
    library.folders = library.folders.filter((f) => f.id !== folderId)
    await saveLibrary()
  })

  // ── Import .lecta files into library without opening them ──

  ipcMain.handle('library:import-lecta-files', async (): Promise<number> => {
    await ensureLoaded()
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      defaultPath: getLectaDocumentsDir(),
      filters: [
        { name: 'Lecta Presentations', extensions: ['lecta'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Import Presentations'
    })

    if (result.canceled || result.filePaths.length === 0) return 0

    let imported = 0
    for (const filePath of result.filePaths) {
      // A `.lecta` archive is inspected in a throwaway dir and recorded under
      // its own path — never under the temp workspace, which is disposable.
      const meta = await readDeckMetadata(filePath)
      if (!meta) continue

      await upsertLibraryEntry({
        path: filePath,
        title: meta.title,
        type: meta.type,
        slideCount: meta.slideCount,
        firstSlidePreview: meta.preview,
        firstSlideContent: meta.fullContent,
        firstSlideIsMdx: meta.isMdx,
        theme: meta.theme,
      })
      imported++
    }

    return imported
  })
}

import { ipcMain, app } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { atomicWriteFile, withLock } from '../services/safe-fs'

export interface DesignElement {
  id: string
  name: string
  category: 'component' | 'color-palette' | 'typography' | 'snippet' | 'layout-pattern'
  description: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface DesignSystem {
  version: number
  elements: DesignElement[]
}

const getDesignSystemPath = (): string =>
  join(app.getPath('userData'), 'design-system.json')

let cached: DesignSystem | null = null
/** Set when the on-disk file exists but could not be parsed — we must never overwrite it. */
let loadError: Error | null = null

async function load(): Promise<DesignSystem> {
  if (cached) return cached
  try {
    const content = await readFile(getDesignSystemPath(), 'utf-8')
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.elements)) {
      throw new Error('design-system.json has an unexpected shape')
    }
    cached = parsed as DesignSystem
    loadError = null
    return cached
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      loadError = null
      cached = { version: 1, elements: [] }
      return cached
    }
    // Corrupt file: serve an empty in-memory copy but refuse to write over it
    loadError = err as Error
    return { version: 1, elements: [] }
  }
}

async function save(ds: DesignSystem): Promise<void> {
  if (loadError) {
    throw new Error(`Refusing to overwrite unreadable design-system.json: ${loadError.message}`)
  }
  await withLock('design-system', async () => {
    cached = ds
    await atomicWriteFile(getDesignSystemPath(), JSON.stringify(ds, null, 2))
  })
}

export function registerDesignSystemHandlers(): void {
  ipcMain.handle('design-system:list', async (
    _event,
    opts?: { category?: string; tags?: string[]; search?: string }
  ): Promise<DesignElement[]> => {
    const ds = await load()
    let elements = ds.elements

    if (opts?.category) {
      elements = elements.filter(e => e.category === opts.category)
    }
    if (opts?.tags && opts.tags.length > 0) {
      elements = elements.filter(e => opts.tags!.some(t => e.tags.includes(t)))
    }
    if (opts?.search) {
      const q = opts.search.toLowerCase()
      elements = elements.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      )
    }

    return elements
  })

  ipcMain.handle('design-system:get', async (
    _event,
    id: string
  ): Promise<DesignElement | null> => {
    const ds = await load()
    return ds.elements.find(e => e.id === id) || null
  })

  ipcMain.handle('design-system:save', async (
    _event,
    element: {
      id?: string
      name: string
      category: DesignElement['category']
      description: string
      content: string
      tags: string[]
    }
  ): Promise<DesignElement> => {
    const ds = await load()
    const now = new Date().toISOString()

    if (element.id) {
      const idx = ds.elements.findIndex(e => e.id === element.id)
      if (idx !== -1) {
        ds.elements[idx] = { ...ds.elements[idx], ...element, id: element.id, updatedAt: now }
        await save(ds)
        return ds.elements[idx]
      }
    }

    const newElement: DesignElement = {
      id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: element.name,
      category: element.category,
      description: element.description,
      content: element.content,
      tags: element.tags,
      createdAt: now,
      updatedAt: now,
    }
    ds.elements.unshift(newElement)
    await save(ds)
    return newElement
  })

  ipcMain.handle('design-system:delete', async (
    _event,
    id: string
  ): Promise<boolean> => {
    const ds = await load()
    const before = ds.elements.length
    ds.elements = ds.elements.filter(e => e.id !== id)
    if (ds.elements.length < before) {
      await save(ds)
      return true
    }
    return false
  })
}

import { create } from 'zustand'

export interface ImageEntry {
  /** Relative path within workspace, e.g. "images/1234-ai-generated.png" */
  relativePath: string
  /** Full lecta-file:// URL for display */
  fullSrc: string
  /** How the image was added */
  source: 'generated' | 'uploaded' | 'edited'
  /** Provider used (for generated/edited images) */
  provider?: string
  /** Original prompt (for generated images) */
  prompt?: string
  /** Timestamp of creation */
  createdAt: number
  /** File size in bytes (if known) */
  fileSize?: number
}

interface ImageState {
  /** All images in the current workspace */
  images: ImageEntry[]
  /** Whether the image library panel is open */
  isPanelOpen: boolean

  // Actions
  addImage: (entry: Omit<ImageEntry, 'createdAt'>) => void
  removeImage: (relativePath: string) => void
  clearImages: () => void
  loadImagesFromWorkspace: (rootPath: string) => Promise<void>
  togglePanel: () => void
  setPanel: (open: boolean) => void
}

export const useImageStore = create<ImageState>((set, get) => ({
  images: [],
  isPanelOpen: false,

  addImage: (entry) => {
    const newEntry: ImageEntry = { ...entry, createdAt: Date.now() }
    set((state) => ({
      images: [newEntry, ...state.images.filter((i) => i.relativePath !== entry.relativePath)]
    }))
  },

  removeImage: (relativePath) => {
    set((state) => ({
      images: state.images.filter((i) => i.relativePath !== relativePath)
    }))
  },

  clearImages: () => set({ images: [] }),

  loadImagesFromWorkspace: async (rootPath: string) => {
    try {
      const files = await window.electronAPI.listImages(rootPath)
      const existing = get().images
      const existingPaths = new Set(existing.map((i) => i.relativePath))

      const newEntries: ImageEntry[] = files
        .filter((f) => !existingPaths.has(f.relativePath))
        .map((f) => ({
          relativePath: f.relativePath,
          fullSrc: `lecta-file://${rootPath}/${f.relativePath}`,
          source: (f.relativePath.includes('-ai-generated') || f.relativePath.includes('-ai-edited')
            ? 'generated'
            : 'uploaded') as 'generated' | 'uploaded',
          createdAt: f.timestamp,
          fileSize: f.size,
        }))

      if (newEntries.length > 0) {
        set((state) => ({
          images: [...newEntries, ...state.images].sort((a, b) => b.createdAt - a.createdAt)
        }))
      }
    } catch {
      // images directory may not exist yet
    }
  },

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  setPanel: (open) => set({ isPanelOpen: open }),
}))

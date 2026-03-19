import { create } from 'zustand'
import type { LoadedNotebook, LoadedNote, Notebook, NoteLayout } from '../../../../packages/shared/src/types/notebook'

interface NotebookState {
  notebook: Notebook | null
  pages: LoadedNote[] // flat DFS order with depth
  currentPageIndex: number
  isLoading: boolean
  error: string | null
  isSaving: boolean
  lastSavedAt: Date | null
  hasUnsavedChanges: boolean

  // Derived
  currentPage: () => LoadedNote | null
  totalPages: () => number

  // Actions
  loadNotebook: (folderPath: string) => Promise<void>
  goToPage: (index: number) => void
  nextPage: () => void
  prevPage: () => void
  updateMarkdownContent: (pageIndex: number, content: string) => void
  savePageContent: (pageIndex: number) => Promise<void>
  addNote: (noteId: string) => Promise<void>
  addSubnote: (noteId: string) => Promise<void>
  deleteNote: () => Promise<void>
  renameNote: (noteId: string, newId: string) => Promise<void>
  setNoteLayout: (layout: NoteLayout) => Promise<void>
  addCodeToNote: (language: string) => Promise<void>
  addVideoToNote: (url: string) => Promise<void>
  addWebAppToNote: (url: string) => Promise<void>
  archiveNote: () => Promise<void>
  unarchiveNote: (noteId: string) => Promise<void>
  reset: () => void
}

function applyLoaded(loaded: LoadedNotebook, goToIndex?: number) {
  // Pack .lecta archive after structural changes (fire-and-forget)
  if (loaded.config?.rootPath) {
    window.electronAPI.saveLecta(loaded.config.rootPath).catch(() => {})
  }
  return {
    notebook: loaded.config,
    pages: loaded.pages,
    currentPageIndex: goToIndex ?? 0,
    isLoading: false,
    error: null
  }
}

export const useNotebookStore = create<NotebookState>((set, get) => ({
  notebook: null,
  pages: [],
  currentPageIndex: 0,
  isLoading: false,
  error: null,
  isSaving: false,
  lastSavedAt: null,
  hasUnsavedChanges: false,

  currentPage: () => {
    const { pages, currentPageIndex } = get()
    return pages[currentPageIndex] ?? null
  },

  totalPages: () => get().pages.length,

  loadNotebook: async (folderPath: string) => {
    set({ isLoading: true, error: null })
    try {
      const loaded: LoadedNotebook = await window.electronAPI.loadNotebook(folderPath)
      set(applyLoaded(loaded))
      // Clear presentation store so App.tsx doesn't render AppShell
      const { usePresentationStore } = await import('./presentation-store')
      usePresentationStore.getState().reset()
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message })
    }
  },

  goToPage: (index: number) => {
    const { pages } = get()
    if (index >= 0 && index < pages.length) {
      set({ currentPageIndex: index })
    }
  },

  nextPage: () => {
    const { currentPageIndex, pages } = get()
    if (currentPageIndex < pages.length - 1) {
      set({ currentPageIndex: currentPageIndex + 1 })
    }
  },

  prevPage: () => {
    const { currentPageIndex } = get()
    if (currentPageIndex > 0) {
      set({ currentPageIndex: currentPageIndex - 1 })
    }
  },

  updateMarkdownContent: (pageIndex: number, content: string) => {
    set((state) => {
      const pages = [...state.pages]
      if (pages[pageIndex]) {
        pages[pageIndex] = { ...pages[pageIndex], markdownContent: content }
      }
      return { pages, hasUnsavedChanges: true }
    })
  },

  savePageContent: async (pageIndex: number) => {
    const { notebook, pages } = get()
    if (!notebook) return
    const page = pages[pageIndex]
    if (!page) return

    set({ isSaving: true })
    try {
      await window.electronAPI.saveNoteContent(
        notebook.rootPath,
        page.config.content,
        page.markdownContent
      )
      // Pack changes into .lecta file
      await window.electronAPI.saveLecta(notebook.rootPath)
      set({ isSaving: false, lastSavedAt: new Date(), hasUnsavedChanges: false })
    } catch {
      set({ isSaving: false })
    }
  },

  addNote: async (noteId: string) => {
    const { notebook, currentPageIndex } = get()
    if (!notebook) return
    try {
      const loaded: LoadedNotebook = await window.electronAPI.addNote(
        notebook.rootPath,
        noteId,
        currentPageIndex
      )
      set(applyLoaded(loaded, currentPageIndex + 1))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  addSubnote: async (noteId: string) => {
    const { notebook, pages, currentPageIndex } = get()
    if (!notebook) return
    const currentPage = pages[currentPageIndex]
    if (!currentPage) return
    try {
      const loaded: LoadedNotebook = await window.electronAPI.addSubnote(
        notebook.rootPath,
        currentPage.config.id,
        noteId
      )
      // Go to the new subnote (it'll be right after current in DFS order)
      set(applyLoaded(loaded, currentPageIndex + 1))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  deleteNote: async () => {
    const { notebook, pages, currentPageIndex } = get()
    if (!notebook || pages.length <= 1) return
    const currentPage = pages[currentPageIndex]
    if (!currentPage) return
    try {
      const loaded: LoadedNotebook = await window.electronAPI.deleteNote(
        notebook.rootPath,
        currentPage.config.id
      )
      const newIndex = Math.min(currentPageIndex, loaded.pages.length - 1)
      set(applyLoaded(loaded, newIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  renameNote: async (noteId: string, newId: string) => {
    const { notebook, currentPageIndex } = get()
    if (!notebook) return
    try {
      const loaded: LoadedNotebook = await window.electronAPI.renameNote(
        notebook.rootPath,
        noteId,
        newId
      )
      set(applyLoaded(loaded, currentPageIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  setNoteLayout: async (layout: NoteLayout) => {
    const { notebook, pages, currentPageIndex } = get()
    if (!notebook) return
    const page = pages[currentPageIndex]
    if (!page) return
    try {
      const loaded: LoadedNotebook = await window.electronAPI.setNoteLayout(
        notebook.rootPath,
        page.config.id,
        layout
      )
      set(applyLoaded(loaded, currentPageIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  addCodeToNote: async (language: string) => {
    const { notebook, pages, currentPageIndex } = get()
    if (!notebook) return
    const page = pages[currentPageIndex]
    if (!page) return
    try {
      const loaded: LoadedNotebook = await window.electronAPI.addCodeToNote(notebook.rootPath, page.config.id, language)
      set(applyLoaded(loaded, currentPageIndex))
    } catch (error) { set({ error: (error as Error).message }) }
  },

  addVideoToNote: async (url: string) => {
    const { notebook, pages, currentPageIndex } = get()
    if (!notebook) { console.error('addVideoToNote: no notebook'); return }
    const page = pages[currentPageIndex]
    if (!page) { console.error('addVideoToNote: no page'); return }
    try {
      console.log('addVideoToNote:', notebook.rootPath, page.config.id, url)
      const loaded: LoadedNotebook = await window.electronAPI.addVideoToNote(notebook.rootPath, page.config.id, url)
      set(applyLoaded(loaded, currentPageIndex))
    } catch (error) {
      console.error('addVideoToNote error:', error)
      set({ error: (error as Error).message })
    }
  },

  addWebAppToNote: async (url: string) => {
    const { notebook, pages, currentPageIndex } = get()
    if (!notebook) { console.error('addWebAppToNote: no notebook'); return }
    const page = pages[currentPageIndex]
    if (!page) { console.error('addWebAppToNote: no page'); return }
    try {
      console.log('addWebAppToNote:', notebook.rootPath, page.config.id, url)
      const loaded: LoadedNotebook = await window.electronAPI.addWebAppToNote(notebook.rootPath, page.config.id, url)
      set(applyLoaded(loaded, currentPageIndex))
    } catch (error) {
      console.error('addWebAppToNote error:', error)
      set({ error: (error as Error).message })
    }
  },

  archiveNote: async () => {
    const { notebook, pages, currentPageIndex } = get()
    if (!notebook) return
    const page = pages[currentPageIndex]
    if (!page) return
    try {
      const loaded: LoadedNotebook = await window.electronAPI.archiveNote(
        notebook.rootPath,
        page.config.id
      )
      const newIndex = Math.min(currentPageIndex, loaded.pages.length - 1)
      set(applyLoaded(loaded, newIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  unarchiveNote: async (noteId: string) => {
    const { notebook, currentPageIndex } = get()
    if (!notebook) return
    try {
      const loaded: LoadedNotebook = await window.electronAPI.unarchiveNote(
        notebook.rootPath,
        noteId
      )
      set(applyLoaded(loaded, currentPageIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  reset: async () => {
    set({
      notebook: null,
      pages: [],
      currentPageIndex: 0,
      isLoading: false,
      error: null
    })
    // Also clear presentation store so App.tsx goes to HomeScreen
    const { usePresentationStore } = await import('./presentation-store')
    usePresentationStore.getState().reset()
  }
}))

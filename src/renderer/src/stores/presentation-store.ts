import { create } from 'zustand'
import type { LoadedPresentation, LoadedSlide, Presentation, SupportedLanguage } from '../../../../packages/shared/src/types/presentation'
import { useUIStore } from './ui-store'

interface PresentationState {
  presentation: Presentation | null
  slides: LoadedSlide[]
  currentSlideIndex: number
  isLoading: boolean
  error: string | null
  isSaving: boolean
  lastSavedAt: Date | null
  hasUnsavedChanges: boolean

  // Sub-slide state (synced from useSubSlides hook)
  currentSubSlide: number
  totalSubSlides: number

  // Click animation state (for incremental reveal in presentation mode)
  clickStep: number
  totalClickSteps: number

  // Per-deck trust flag for executable MDX slides (persisted per rootPath in localStorage)
  mdxTrusted: boolean
  setMdxTrusted: (trusted: boolean) => void

  // Derived getters
  currentSlide: () => LoadedSlide | null
  totalSlides: () => number

  // Actions
  openFolder: () => Promise<void>
  loadPresentation: (folderPath: string) => Promise<void>
  goToSlide: (index: number) => void
  nextSlide: () => void
  prevSlide: () => void
  updateCodeContent: (slideIndex: number, content: string) => void
  updateMarkdownContent: (slideIndex: number, content: string) => void
  saveSlideContent: (slideIndex: number) => Promise<void>
  updateNotesContent: (slideIndex: number, content: string) => void
  handleFileChanged: (filePath: string, content: string, relativePath?: string) => void
  reset: () => void
  /** Apply AI-generated markdown to a slide. Refuses (with a toast) for executable .mdx slides. */
  applyAIContent: (slideIndex: number, content: string, save?: boolean) => boolean

  // Editing actions
  addSlide: (slideId: string, format?: string) => Promise<void>
  addCodeToSlide: (language: SupportedLanguage) => Promise<void>
  addArtifact: () => Promise<void>
  addVideo: (url: string, label?: string) => Promise<void>
  addWebApp: (url: string, label?: string) => Promise<void>
  addPrompt: (prompt: string, label?: string) => Promise<void>
  updatePrompt: (promptIndex: number, promptText: string, response?: string) => Promise<void>
  toggleSkipSlide: (slideIndex: number) => void
  setSlideTransition: (transition: string) => Promise<void>
  setSlideLayout: (layout: string) => Promise<void>
  removeAttachment: (type: AttachmentType, artifactIndex?: number) => Promise<void>
  renameSlide: (slideIndex: number, newId: string) => Promise<void>
  deleteSlide: (slideIndex: number) => Promise<void>
  reorderSlide: (fromIndex: number, toIndex: number) => Promise<void>
  setTheme: (themeId: string) => Promise<void>
  updatePresenterNotes: (notes: string) => Promise<void>

  // Undo/redo
  undo: () => void
  redo: () => void
}

export type AttachmentType = 'code' | 'video' | 'webapp' | 'prompt' | 'artifact'

// Undo/redo history — stored outside zustand to avoid triggering re-renders.
// Entries are keyed by slide id (not index) so reorder/delete cannot redirect an undo to another slide.
const MAX_HISTORY = 100
interface HistoryEntry { slideId: string; content: string }
let undoStack: HistoryEntry[] = []
let redoStack: HistoryEntry[] = []
let lastSnapshotTime = 0
const SNAPSHOT_DEBOUNCE = 800 // ms — group rapid edits into one undo entry

/** Drop all undo/redo history (called on deck load, tab restore and reset). */
export function clearUndoHistory(): void {
  undoStack = []
  redoStack = []
  lastSnapshotTime = 0
}

/** Pop entries until one whose slide still exists is found; returns it with its current index. */
function popLiveEntry(stack: HistoryEntry[], slides: LoadedSlide[]): { entry: HistoryEntry; index: number } | null {
  while (stack.length > 0) {
    const entry = stack.pop()!
    const index = slides.findIndex((s) => s.config.id === entry.slideId)
    if (index >= 0) return { entry, index }
  }
  return null
}

// ---- MDX trust persistence (per deck rootPath) ----
const MDX_TRUST_KEY = 'lecta:mdx-trusted-decks'

function readTrustedDecks(): string[] {
  try {
    const raw = localStorage.getItem(MDX_TRUST_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : []
  } catch {
    return []
  }
}

function isDeckTrusted(rootPath: string | undefined): boolean {
  if (!rootPath) return false
  return readTrustedDecks().includes(rootPath)
}

function persistDeckTrust(rootPath: string, trusted: boolean): void {
  try {
    const set = new Set(readTrustedDecks())
    if (trusted) set.add(rootPath)
    else set.delete(rootPath)
    localStorage.setItem(MDX_TRUST_KEY, JSON.stringify([...set]))
  } catch {
    // localStorage unavailable — trust is session-only
  }
}

// ---- Path helpers for file-watcher events ----
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

// ---- Presenter sync ----
export interface PresenterSyncState {
  slideIndex: number
  subSlide: number
  clickStep: number
  mdxTrusted: boolean
}

/** True in the audience window, which mirrors state and must never drive it. */
export const isAudienceWindow = (): boolean =>
  typeof window !== 'undefined' && window.location.hash === '#/audience'

/** Send the full navigation state to the presenter/audience windows (never from the audience itself). */
export function syncPresenterState(): void {
  if (isAudienceWindow()) return
  const { currentSlideIndex, currentSubSlide, clickStep, mdxTrusted } = usePresentationStore.getState()
  const state: PresenterSyncState = {
    slideIndex: currentSlideIndex,
    subSlide: Math.max(0, currentSubSlide),
    clickStep,
    mdxTrusted
  }
  const api = window.electronAPI as unknown as { syncPresenterState?: (s: PresenterSyncState) => void }
  if (typeof api.syncPresenterState === 'function') {
    api.syncPresenterState(state)
  } else {
    // Preload without the full-state channel — fall back to slide-index sync
    window.electronAPI.syncPresenterSlide(currentSlideIndex)
  }
}

/**
 * Apply a presenter state broadcast in the audience window. Never echoes back:
 * `syncPresenterState` is a no-op there.
 */
export function applyPresenterState(state: Partial<PresenterSyncState>): void {
  const { slides, presentation } = usePresentationStore.getState()
  const patch: Record<string, unknown> = {}
  if (typeof state.slideIndex === 'number' && state.slideIndex >= 0 && state.slideIndex < slides.length) {
    patch.currentSlideIndex = state.slideIndex
    if (presentation) patch.presentation = { ...presentation, lastViewedIndex: state.slideIndex }
  }
  if (typeof state.subSlide === 'number') patch.currentSubSlide = Math.max(0, state.subSlide)
  if (typeof state.clickStep === 'number') patch.clickStep = state.clickStep
  if (typeof state.mdxTrusted === 'boolean') patch.mdxTrusted = state.mdxTrusted
  usePresentationStore.setState(patch)
}

function applyLoaded(loaded: LoadedPresentation, goToIndex?: number) {
  return {
    presentation: loaded.config,
    slides: loaded.slides,
    currentSlideIndex: goToIndex ?? 0,
    isLoading: false,
    error: null
  }
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  presentation: null,
  slides: [],
  currentSlideIndex: 0,
  isLoading: false,
  error: null,
  isSaving: false,
  lastSavedAt: null,
  hasUnsavedChanges: false,
  currentSubSlide: 0,
  totalSubSlides: 1,
  clickStep: 0,
  totalClickSteps: 0,
  mdxTrusted: false,

  setMdxTrusted: (trusted: boolean) => {
    const rootPath = get().presentation?.rootPath
    if (rootPath) persistDeckTrust(rootPath, trusted)
    set({ mdxTrusted: trusted })
    syncPresenterState()
  },

  currentSlide: () => {
    const { slides, currentSlideIndex } = get()
    return slides[currentSlideIndex] ?? null
  },

  totalSlides: () => get().slides.length,

  openFolder: async () => {
    try {
      const folderPath = await window.electronAPI.openFolder()
      if (folderPath) {
        await get().loadPresentation(folderPath)
      }
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  loadPresentation: async (folderPath: string) => {
    set({ isLoading: true, error: null })
    try {
      const loaded: any = await window.electronAPI.loadPresentation(folderPath)

      // Check if this is actually a notebook
      if (loaded?.__notebook) {
        set({ isLoading: false, error: null, presentation: null, slides: [], currentSlideIndex: 0 })
        const { useNotebookStore } = await import('./notebook-store')
        await useNotebookStore.getState().loadNotebook(loaded.rootPath)
        return
      }

      const pres = loaded as LoadedPresentation
      // Restore last viewed slide index (clamped to valid range)
      const lastIdx = pres.config.lastViewedIndex
      const restoreIdx = (lastIdx != null && lastIdx > 0 && lastIdx < pres.slides.length) ? lastIdx : 0

      // A freshly loaded deck has no edit history to undo into
      clearUndoHistory()

      const mdxTrusted = isDeckTrusted(pres.config.rootPath)

      // Pre-compile MDX for the current slide (and neighbors) — only for decks the user has trusted
      if (mdxTrusted) {
        const { prefetchMdx } = await import('../components/slides/MdxRenderer')
        const slidesToPrefetch = [restoreIdx - 1, restoreIdx, restoreIdx + 1]
        for (const idx of slidesToPrefetch) {
          const s = pres.slides[idx]
          if (s?.isMdx) prefetchMdx(s.markdownContent)
        }
      }

      set({ ...applyLoaded(pres, restoreIdx), mdxTrusted, hasUnsavedChanges: false })

      // Open the code panel by default when the restored slide carries code
      if (pres.slides[restoreIdx]?.config.code) {
        useUIStore.setState({ showRightPane: true })
      }

      // Re-check AI key availability (deck might have its own .env)
      useUIStore.getState().checkAiEnabled()

      // Load groups from presentation config into UI store
      if (loaded.config.groups && loaded.config.groups.length > 0) {
        useUIStore.getState().loadGroupsFromPresentation(loaded.config.groups)
      } else {
        useUIStore.getState().loadGroupsFromPresentation([])
      }

      // Auto-register as a tab (lazy import to avoid circular deps)
      const { useTabsStore } = await import('./tabs-store')
      const tabsState = useTabsStore.getState()
      const alreadyOpen = tabsState.tabs.some((t) => t.rootPath === loaded.config.rootPath)
      if (!alreadyOpen) {
        const tabId = `tab-${Date.now()}`
        useTabsStore.setState((s) => ({
          tabs: [...s.tabs, {
            id: tabId,
            type: 'presentation' as const,
            title: loaded.config.title,
            rootPath: loaded.config.rootPath,
            presentation: loaded.config,
            slides: loaded.slides,
            currentSlideIndex: 0
          }],
          activeTabId: tabId
        }))
      } else {
        // Switch to existing tab
        const existing = tabsState.tabs.find((t) => t.rootPath === loaded.config.rootPath)
        if (existing) useTabsStore.setState({ activeTabId: existing.id })
      }
    } catch (error) {
      set({
        isLoading: false,
        error: (error as Error).message
      })
    }
  },

  goToSlide: (index: number) => {
    const { slides, presentation } = get()
    if (index >= 0 && index < slides.length) {
      set({ currentSlideIndex: index, currentSubSlide: 0, clickStep: 0, totalClickSteps: 0 })
      syncPresenterState()
      // Update lastViewedIndex in config (persisted on next save)
      if (presentation) {
        set({ presentation: { ...presentation, lastViewedIndex: index } })
      }
    }
  },

  nextSlide: () => {
    const { currentSlideIndex, slides, currentSubSlide, totalSubSlides, clickStep, totalClickSteps, presentation } = get()
    // 1. Advance click steps first (incremental reveal)
    if (totalClickSteps > 0 && clickStep < totalClickSteps) {
      set({ clickStep: clickStep + 1 })
      syncPresenterState()
      return
    }
    // 2. Then advance sub-slides
    if (totalSubSlides > 1 && currentSubSlide < totalSubSlides - 1) {
      set({ currentSubSlide: currentSubSlide + 1, clickStep: 0, totalClickSteps: 0 })
      syncPresenterState()
      return
    }
    // 3. Then go to next slide
    if (currentSlideIndex < slides.length - 1) {
      const newIndex = currentSlideIndex + 1
      set({ currentSlideIndex: newIndex, currentSubSlide: 0, clickStep: 0, totalClickSteps: 0 })
      syncPresenterState()
      if (presentation) set({ presentation: { ...presentation, lastViewedIndex: newIndex } })
    }
  },

  prevSlide: () => {
    const { currentSlideIndex, currentSubSlide, clickStep, presentation } = get()
    // 1. Go back click steps first
    if (clickStep > 0) {
      set({ clickStep: clickStep - 1 })
      syncPresenterState()
      return
    }
    // 2. Then go back sub-slides
    if (currentSubSlide > 0) {
      set({ currentSubSlide: currentSubSlide - 1, clickStep: 0, totalClickSteps: 0 })
      syncPresenterState()
      return
    }
    // 3. Then go to previous slide
    if (currentSlideIndex > 0) {
      const newIndex = currentSlideIndex - 1
      // -1 means "go to last sub-slide" — resolved by useSubSlides once the new slide is measured,
      // which then re-syncs the resolved state to the audience.
      set({ currentSlideIndex: newIndex, currentSubSlide: -1, clickStep: 0, totalClickSteps: 0 })
      syncPresenterState()
      if (presentation) set({ presentation: { ...presentation, lastViewedIndex: newIndex } })
    }
  },

  updateCodeContent: (slideIndex: number, content: string) => {
    set((state) => {
      const slides = [...state.slides]
      if (slides[slideIndex]) {
        slides[slideIndex] = { ...slides[slideIndex], codeContent: content }
      }
      return { slides, hasUnsavedChanges: true }
    })
  },

  updateMarkdownContent: (slideIndex: number, content: string) => {
    const target = get().slides[slideIndex]
    const prev = target?.markdownContent
    if (target && prev !== undefined && prev !== content) {
      const slideId = target.config.id
      const now = Date.now()
      const lastEntry = undoStack[undoStack.length - 1]
      // Only push a new snapshot if enough time passed or slide changed
      if (now - lastSnapshotTime > SNAPSHOT_DEBOUNCE || !lastEntry || lastEntry.slideId !== slideId) {
        undoStack.push({ slideId, content: prev })
        if (undoStack.length > MAX_HISTORY) undoStack.shift()
      }
      lastSnapshotTime = now
      redoStack = []
    }
    set((state) => {
      const slides = [...state.slides]
      if (slides[slideIndex]) {
        slides[slideIndex] = { ...slides[slideIndex], markdownContent: content }
      }
      return { slides, hasUnsavedChanges: true }
    })
  },

  saveSlideContent: async (slideIndex: number) => {
    const { presentation, slides } = get()
    if (!presentation) return
    const slide = slides[slideIndex]
    if (!slide) return

    set({ isSaving: true })
    try {
      const mdPath = `${presentation.rootPath}/${slide.config.content}`
      await window.electronAPI.writeFile(mdPath, slide.markdownContent)

      if (slide.config.code && slide.codeContent !== null) {
        const codePath = `${presentation.rootPath}/${slide.config.code.file}`
        await window.electronAPI.writeFile(codePath, slide.codeContent)
      }

      // Save notes if they exist (creates file + updates YAML if needed)
      if (slide.notesContent) {
        const notesPath = await window.electronAPI.saveNotes(
          presentation.rootPath,
          slideIndex,
          slide.notesContent
        )
        // Update local config so subsequent saves know the notes path
        if (!slide.config.notes) {
          set((state) => {
            const slides = [...state.slides]
            if (slides[slideIndex]) {
              slides[slideIndex] = {
                ...slides[slideIndex],
                config: { ...slides[slideIndex].config, notes: notesPath }
              }
            }
            return { slides }
          })
        }
      }

      // Pack changes back into .lecta file if workspace is from one
      await window.electronAPI.saveLecta(presentation.rootPath)

      set({ isSaving: false, lastSavedAt: new Date(), hasUnsavedChanges: false })
    } catch (err) {
      console.error('saveSlideContent failed:', err)
      set({ isSaving: false })
    }
  },

  updateNotesContent: (slideIndex: number, content: string) => {
    set((state) => {
      const slides = [...state.slides]
      if (slides[slideIndex]) {
        slides[slideIndex] = { ...slides[slideIndex], notesContent: content }
      }
      return { slides, hasUnsavedChanges: true }
    })
  },

  handleFileChanged: (filePath: string, content: string, relativePath?: string) => {
    const state = get()
    const presentation = state.presentation
    if (!presentation) return

    // Never clobber edits the user has not saved yet — the watcher will fire again after our own save.
    if (state.hasUnsavedChanges) return

    const normFull = normalizePath(filePath)
    const normRoot = normalizePath(presentation.rootPath)
    const rel = relativePath
      ? normalizePath(relativePath)
      : normFull.startsWith(normRoot + '/') ? normFull.slice(normRoot.length + 1) : null
    if (!rel) return

    let changed = false
    const slides = state.slides.map((slide) => {
      if (slide.config.code && normalizePath(slide.config.code.file) === rel) {
        if (slide.codeContent === content) return slide // echo of our own save
        changed = true
        return { ...slide, codeContent: content }
      }
      if (normalizePath(slide.config.content) === rel) {
        if (slide.markdownContent === content) return slide
        changed = true
        return { ...slide, markdownContent: content }
      }
      return slide
    })

    if (changed) set({ slides })
  },

  applyAIContent: (slideIndex: number, content: string, save = true) => {
    const slide = get().slides[slideIndex]
    if (!slide) return false
    if (slide.isMdx) {
      useUIStore.getState().setAiAlert(
        'AI output cannot be written into an executable .mdx slide. Convert the slide to .md first or edit it manually.'
      )
      return false
    }
    get().updateMarkdownContent(slideIndex, content)
    if (save) void get().saveSlideContent(slideIndex)
    return true
  },

  addSlide: async (slideId: string, format?: string) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.addSlide(
        presentation.rootPath,
        slideId,
        currentSlideIndex,
        format
      )
      set(applyLoaded(loaded, currentSlideIndex + 1))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  addCodeToSlide: async (language: SupportedLanguage) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.addCodeToSlide(
        presentation.rootPath,
        currentSlideIndex,
        language
      )
      set(applyLoaded(loaded, currentSlideIndex))
      useUIStore.setState({ pendingArtifactOpen: 'code', showRightPane: true })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  addArtifact: async () => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.addArtifact(
        presentation.rootPath,
        currentSlideIndex
      )
      if (loaded) {
        set(applyLoaded(loaded, currentSlideIndex))
        useUIStore.setState({ pendingArtifactOpen: 'files', showRightPane: true })
      }
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  addVideo: async (url: string, label?: string) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.addVideo(
        presentation.rootPath,
        currentSlideIndex,
        url,
        label
      )
      set(applyLoaded(loaded, currentSlideIndex))
      useUIStore.setState({ pendingArtifactOpen: 'video', showRightPane: true })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  addWebApp: async (url: string, label?: string) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.addWebApp(
        presentation.rootPath,
        currentSlideIndex,
        url,
        label
      )
      set(applyLoaded(loaded, currentSlideIndex))
      useUIStore.setState({ pendingArtifactOpen: 'webapp', showRightPane: true })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  addPrompt: async (prompt: string, label?: string) => {
    const { presentation, currentSlideIndex, slides } = get()
    if (!presentation) return
    try {
      const promptCount = slides[currentSlideIndex]?.config.prompts?.length ?? 0
      const loaded = await window.electronAPI.addPrompt(
        presentation.rootPath,
        currentSlideIndex,
        prompt,
        label
      )
      set(applyLoaded(loaded, currentSlideIndex))
      useUIStore.setState({ pendingArtifactOpen: `prompt-${promptCount}`, showRightPane: true })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  updatePrompt: async (promptIndex: number, promptText: string, response?: string) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.updatePrompt(
        presentation.rootPath,
        currentSlideIndex,
        promptIndex,
        promptText,
        response
      )
      set(applyLoaded(loaded, currentSlideIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  toggleSkipSlide: async (slideIndex: number) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.toggleSkipSlide(presentation.rootPath, slideIndex)
      set(applyLoaded(loaded, currentSlideIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  setSlideTransition: async (transition: string) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.setSlideTransition(
        presentation.rootPath,
        currentSlideIndex,
        transition
      )
      set(applyLoaded(loaded, currentSlideIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  setSlideLayout: async (layout: string) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.setSlideLayout(
        presentation.rootPath,
        currentSlideIndex,
        layout
      )
      set(applyLoaded(loaded, currentSlideIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  removeAttachment: async (type: AttachmentType, artifactIndex?: number) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.removeAttachment(
        presentation.rootPath,
        currentSlideIndex,
        type,
        artifactIndex
      )
      set(applyLoaded(loaded, currentSlideIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  renameSlide: async (slideIndex: number, newId: string) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.renameSlide(
        presentation.rootPath,
        slideIndex,
        newId
      )
      set(applyLoaded(loaded, currentSlideIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  deleteSlide: async (slideIndex: number) => {
    const { presentation, slides, currentSlideIndex } = get()
    if (!presentation || slides.length <= 1) return
    try {
      const loaded = await window.electronAPI.deleteSlide(
        presentation.rootPath,
        slideIndex
      )
      const newIndex = Math.min(currentSlideIndex, loaded.slides.length - 1)
      set(applyLoaded(loaded, newIndex))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  reorderSlide: async (fromIndex: number, toIndex: number) => {
    const { presentation } = get()
    if (!presentation || fromIndex === toIndex) return
    try {
      const loaded = await window.electronAPI.reorderSlide(
        presentation.rootPath,
        fromIndex,
        toIndex
      )
      set({
        presentation: loaded.config,
        slides: loaded.slides,
        currentSlideIndex: toIndex,
        error: null
      })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  setTheme: async (themeId: string) => {
    const { presentation } = get()
    if (!presentation) return
    // Optimistic update
    set({ presentation: { ...presentation, theme: themeId } })
    // Persist to YAML
    try {
      await window.electronAPI.setTheme(presentation.rootPath, themeId)
    } catch { /* best effort */ }
  },

  updatePresenterNotes: async (notes: string) => {
    const { presentation } = get()
    if (!presentation) return
    set({ presentation: { ...presentation, presenterNotes: notes } })
    try {
      await window.electronAPI.updatePresenterNotes(presentation.rootPath, notes)
    } catch { /* best effort */ }
  },

  undo: () => {
    const live = popLiveEntry(undoStack, get().slides)
    if (!live) return
    const { entry, index } = live
    const current = get().slides[index]?.markdownContent
    if (current !== undefined) {
      redoStack.push({ slideId: entry.slideId, content: current })
    }
    set((state) => {
      const slides = [...state.slides]
      if (slides[index]) {
        slides[index] = { ...slides[index], markdownContent: entry.content }
      }
      return { slides, hasUnsavedChanges: true }
    })
  },

  redo: () => {
    const live = popLiveEntry(redoStack, get().slides)
    if (!live) return
    const { entry, index } = live
    const current = get().slides[index]?.markdownContent
    if (current !== undefined) {
      undoStack.push({ slideId: entry.slideId, content: current })
    }
    set((state) => {
      const slides = [...state.slides]
      if (slides[index]) {
        slides[index] = { ...slides[index], markdownContent: entry.content }
      }
      return { slides, hasUnsavedChanges: true }
    })
  },

  reset: () => {
    clearUndoHistory()
    set({
      presentation: null,
      slides: [],
      currentSlideIndex: 0,
      isLoading: false,
      error: null,
      hasUnsavedChanges: false,
      mdxTrusted: false
    })
  }
}))

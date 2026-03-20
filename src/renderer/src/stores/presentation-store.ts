import { create } from 'zustand'
import type { LoadedPresentation, LoadedSlide, Presentation, SupportedLanguage } from '../../../../packages/shared/src/types/presentation'

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
  handleFileChanged: (filePath: string, content: string) => void
  reset: () => void

  // Editing actions
  addSlide: (slideId: string) => Promise<void>
  addCodeToSlide: (language: SupportedLanguage) => Promise<void>
  addArtifact: () => Promise<void>
  addVideo: (url: string, label?: string) => Promise<void>
  addWebApp: (url: string, label?: string) => Promise<void>
  addPrompt: (prompt: string, label?: string) => Promise<void>
  updatePrompt: (promptIndex: number, promptText: string, response?: string) => Promise<void>
  toggleSkipSlide: (slideIndex: number) => void
  setSlideTransition: (transition: string) => Promise<void>
  setSlideLayout: (layout: string) => Promise<void>
  removeAttachment: (type: 'code' | 'video' | 'webapp' | 'prompt' | 'artifact', artifactIndex?: number) => Promise<void>
  renameSlide: (slideIndex: number, newId: string) => Promise<void>
  deleteSlide: (slideIndex: number) => Promise<void>
  reorderSlide: (fromIndex: number, toIndex: number) => Promise<void>
  setTheme: (themeId: string) => Promise<void>
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
      set(applyLoaded(pres, restoreIdx))

      // Re-check AI key availability (deck might have its own .env)
      const { useUIStore } = await import('./ui-store')
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
      set({ currentSlideIndex: index, currentSubSlide: 0, clickStep: 0 })
      window.electronAPI.syncPresenterSlide(index)
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
      return
    }
    // 2. Then advance sub-slides
    if (totalSubSlides > 1 && currentSubSlide < totalSubSlides - 1) {
      set({ currentSubSlide: currentSubSlide + 1, clickStep: 0 })
      return
    }
    // 3. Then go to next slide
    if (currentSlideIndex < slides.length - 1) {
      const newIndex = currentSlideIndex + 1
      set({ currentSlideIndex: newIndex, currentSubSlide: 0, clickStep: 0 })
      window.electronAPI.syncPresenterSlide(newIndex)
      if (presentation) set({ presentation: { ...presentation, lastViewedIndex: newIndex } })
    }
  },

  prevSlide: () => {
    const { currentSlideIndex, currentSubSlide, clickStep, presentation } = get()
    // 1. Go back click steps first
    if (clickStep > 0) {
      set({ clickStep: clickStep - 1 })
      return
    }
    // 2. Then go back sub-slides
    if (currentSubSlide > 0) {
      set({ currentSubSlide: currentSubSlide - 1 })
      return
    }
    // 3. Then go to previous slide
    if (currentSlideIndex > 0) {
      const newIndex = currentSlideIndex - 1
      set({ currentSlideIndex: newIndex, currentSubSlide: 0, clickStep: 0 })
      window.electronAPI.syncPresenterSlide(newIndex)
      if (presentation) set({ presentation: { ...presentation, lastViewedIndex: newIndex } })
      // After the slide loads and sub-slides are computed, jump to last sub-slide
      // This is handled by setting a flag — the useSubSlides hook will pick it up
      set({ currentSubSlide: -1 }) // -1 means "go to last"
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

  handleFileChanged: (filePath: string, content: string) => {
    set((state) => {
      const presentation = state.presentation
      if (!presentation) return state

      const slides = state.slides.map((slide) => {
        if (slide.config.code) {
          const fullCodePath = `${presentation.rootPath}/${slide.config.code.file}`
          if (fullCodePath === filePath) {
            return { ...slide, codeContent: content }
          }
        }
        return slide
      })

      return { slides }
    })
  },

  addSlide: async (slideId: string) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.addSlide(
        presentation.rootPath,
        slideId,
        currentSlideIndex
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
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  addPrompt: async (prompt: string, label?: string) => {
    const { presentation, currentSlideIndex } = get()
    if (!presentation) return
    try {
      const loaded = await window.electronAPI.addPrompt(
        presentation.rootPath,
        currentSlideIndex,
        prompt,
        label
      )
      set(applyLoaded(loaded, currentSlideIndex))
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

  removeAttachment: async (type: 'code' | 'video' | 'webapp' | 'artifact', artifactIndex?: number) => {
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

  reset: () => {
    set({
      presentation: null,
      slides: [],
      currentSlideIndex: 0,
      isLoading: false,
      error: null
    })
  }
}))

import { create } from 'zustand'
import type { LoadedPresentation, LoadedSlide, Presentation } from '../../../../packages/shared/src/types/presentation'

interface PresentationState {
  presentation: Presentation | null
  slides: LoadedSlide[]
  currentSlideIndex: number
  isLoading: boolean
  error: string | null

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
  updateNotesContent: (slideIndex: number, content: string) => void
  handleFileChanged: (filePath: string, content: string) => void
  reset: () => void
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  presentation: null,
  slides: [],
  currentSlideIndex: 0,
  isLoading: false,
  error: null,

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
      const loaded: LoadedPresentation = await window.electronAPI.loadPresentation(folderPath)
      set({
        presentation: loaded.config,
        slides: loaded.slides,
        currentSlideIndex: 0,
        isLoading: false
      })
    } catch (error) {
      set({
        isLoading: false,
        error: (error as Error).message
      })
    }
  },

  goToSlide: (index: number) => {
    const { slides } = get()
    if (index >= 0 && index < slides.length) {
      set({ currentSlideIndex: index })
      window.electronAPI.syncPresenterSlide(index)
    }
  },

  nextSlide: () => {
    const { currentSlideIndex, slides } = get()
    if (currentSlideIndex < slides.length - 1) {
      const newIndex = currentSlideIndex + 1
      set({ currentSlideIndex: newIndex })
      window.electronAPI.syncPresenterSlide(newIndex)
    }
  },

  prevSlide: () => {
    const { currentSlideIndex } = get()
    if (currentSlideIndex > 0) {
      const newIndex = currentSlideIndex - 1
      set({ currentSlideIndex: newIndex })
      window.electronAPI.syncPresenterSlide(newIndex)
    }
  },

  updateCodeContent: (slideIndex: number, content: string) => {
    set((state) => {
      const slides = [...state.slides]
      if (slides[slideIndex]) {
        slides[slideIndex] = { ...slides[slideIndex], codeContent: content }
      }
      return { slides }
    })
  },

  updateNotesContent: (slideIndex: number, content: string) => {
    set((state) => {
      const slides = [...state.slides]
      if (slides[slideIndex]) {
        slides[slideIndex] = { ...slides[slideIndex], notesContent: content }
      }
      return { slides }
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

import { create } from 'zustand'
import { usePresentationStore } from './presentation-store'
import type { Presentation, LoadedSlide } from '../../../../packages/shared/src/types/presentation'

export interface Tab {
  id: string
  title: string
  rootPath: string
  presentation: Presentation
  slides: LoadedSlide[]
  currentSlideIndex: number
}

interface TabsState {
  tabs: Tab[]
  activeTabId: string | null

  openInNewTab: (folderPath: string) => Promise<void>
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  syncCurrentTab: () => void
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openInNewTab: async (folderPath: string) => {
    const presentationStore = usePresentationStore.getState()

    // Flush pending content to disk before switching
    if (presentationStore.hasUnsavedChanges && presentationStore.presentation) {
      await presentationStore.saveSlideContent(presentationStore.currentSlideIndex)
    }

    // Save current tab state before switching
    get().syncCurrentTab()

    // Load the new presentation
    await presentationStore.loadPresentation(folderPath)

    const { presentation, slides, currentSlideIndex } = usePresentationStore.getState()
    if (!presentation) return

    const tabId = `tab-${Date.now()}`
    const newTab: Tab = {
      id: tabId,
      title: presentation.title,
      rootPath: presentation.rootPath,
      presentation,
      slides,
      currentSlideIndex
    }

    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: tabId
    }))
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get()
    const remaining = tabs.filter((t) => t.id !== tabId)

    if (remaining.length === 0) {
      // No tabs left — go back to home screen
      usePresentationStore.getState().reset()
      set({ tabs: [], activeTabId: null })
      return
    }

    // If closing the active tab, switch to the nearest one
    if (activeTabId === tabId) {
      const closedIndex = tabs.findIndex((t) => t.id === tabId)
      const nextTab = remaining[Math.min(closedIndex, remaining.length - 1)]
      // Restore that tab's state
      usePresentationStore.setState({
        presentation: nextTab.presentation,
        slides: nextTab.slides,
        currentSlideIndex: nextTab.currentSlideIndex,
        error: null
      })
      set({ tabs: remaining, activeTabId: nextTab.id })
    } else {
      set({ tabs: remaining })
    }
  },

  switchTab: (tabId: string) => {
    const { tabs, activeTabId } = get()
    if (tabId === activeTabId) return

    // Flush pending content to disk before switching
    const presState = usePresentationStore.getState()
    if (presState.hasUnsavedChanges && presState.presentation) {
      presState.saveSlideContent(presState.currentSlideIndex)
    }

    // Save current state to the current tab
    get().syncCurrentTab()

    // Restore the target tab
    const target = tabs.find((t) => t.id === tabId)
    if (!target) return

    usePresentationStore.setState({
      presentation: target.presentation,
      slides: target.slides,
      currentSlideIndex: target.currentSlideIndex,
      error: null
    })

    set({ activeTabId: tabId })
  },

  syncCurrentTab: () => {
    const { tabs, activeTabId } = get()
    if (!activeTabId) return

    const { presentation, slides, currentSlideIndex } = usePresentationStore.getState()
    if (!presentation) return

    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, presentation, slides, currentSlideIndex, title: presentation.title }
          : t
      )
    })
  }
}))

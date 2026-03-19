import { create } from 'zustand'
import { usePresentationStore } from './presentation-store'
import type { Presentation, LoadedSlide } from '../../../../packages/shared/src/types/presentation'

export interface Tab {
  id: string
  type: 'home' | 'presentation'
  title: string
  rootPath?: string
  presentation?: Presentation
  slides?: LoadedSlide[]
  currentSlideIndex?: number
}

interface TabsState {
  tabs: Tab[]
  activeTabId: string | null

  openInNewTab: (folderPath: string) => Promise<void>
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => Promise<void>
  newHomeTab: () => void
  goHome: () => void
  syncCurrentTab: () => void
}

function makeHomeTab(): Tab {
  return {
    id: `home-${Date.now()}`,
    type: 'home',
    title: 'Home'
  }
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
      type: 'presentation',
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
      // No tabs left — show bare home screen
      usePresentationStore.getState().reset()
      set({ tabs: [], activeTabId: null })
      return
    }

    // If closing the active tab, switch to the nearest one
    if (activeTabId === tabId) {
      const closedIndex = tabs.findIndex((t) => t.id === tabId)
      const nextTab = remaining[Math.min(closedIndex, remaining.length - 1)]

      if (nextTab.type === 'presentation' && nextTab.presentation) {
        usePresentationStore.setState({
          presentation: nextTab.presentation,
          slides: nextTab.slides || [],
          currentSlideIndex: nextTab.currentSlideIndex || 0,
          error: null
        })
      } else {
        // Switching to a home tab
        usePresentationStore.getState().reset()
      }
      set({ tabs: remaining, activeTabId: nextTab.id })
    } else {
      set({ tabs: remaining })
    }
  },

  newHomeTab: () => {
    // Save current tab state
    get().syncCurrentTab()

    const tab = makeHomeTab()
    usePresentationStore.getState().reset()
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id
    }))
  },

  goHome: () => {
    // Save current tab state, then clear presentation to show HomeScreen
    get().syncCurrentTab()
    usePresentationStore.getState().reset()
    set({ activeTabId: null })
  },

  switchTab: async (tabId: string) => {
    const { tabs, activeTabId } = get()
    if (tabId === activeTabId) return

    // Flush pending content to disk before switching
    const presState = usePresentationStore.getState()
    if (presState.hasUnsavedChanges && presState.presentation) {
      await presState.saveSlideContent(presState.currentSlideIndex)
    }

    // Save current state to the current tab
    get().syncCurrentTab()

    // Restore the target tab
    const target = tabs.find((t) => t.id === tabId)
    if (!target) return

    if (target.type === 'presentation' && target.presentation) {
      usePresentationStore.setState({
        presentation: target.presentation,
        slides: target.slides || [],
        currentSlideIndex: target.currentSlideIndex || 0,
        error: null
      })
    } else {
      // Home tab
      usePresentationStore.getState().reset()
    }

    set({ activeTabId: tabId })
  },

  syncCurrentTab: () => {
    const { tabs, activeTabId } = get()
    if (!activeTabId) return

    const currentTab = tabs.find((t) => t.id === activeTabId)
    if (!currentTab || currentTab.type !== 'presentation') return

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

import { create } from 'zustand'
import { usePresentationStore } from './presentation-store'
import { useNotebookStore } from './notebook-store'
import type { Presentation, LoadedSlide } from '../../../../packages/shared/src/types/presentation'
import type { Notebook, LoadedNote } from '../../../../packages/shared/src/types/notebook'

export interface Tab {
  id: string
  type: 'home' | 'presentation' | 'notebook'
  title: string
  rootPath?: string
  // Presentation state
  presentation?: Presentation
  slides?: LoadedSlide[]
  currentSlideIndex?: number
  // Notebook state
  notebook?: Notebook
  pages?: LoadedNote[]
  currentPageIndex?: number
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

/** Reset both presentation and notebook stores so App.tsx renders HomeScreen */
function resetToHome(): void {
  usePresentationStore.getState().reset()
  useNotebookStore.setState({
    notebook: null,
    pages: [],
    currentPageIndex: 0,
    isLoading: false,
    error: null
  })
}

/** Restore a tab's content into the global stores */
function restoreTab(tab: Tab): void {
  if (tab.type === 'presentation' && tab.presentation) {
    useNotebookStore.setState({ notebook: null, pages: [], currentPageIndex: 0, error: null })
    usePresentationStore.setState({
      presentation: tab.presentation,
      slides: tab.slides || [],
      currentSlideIndex: tab.currentSlideIndex || 0,
      error: null
    })
  } else if (tab.type === 'notebook' && tab.notebook) {
    usePresentationStore.getState().reset()
    useNotebookStore.setState({
      notebook: tab.notebook,
      pages: tab.pages || [],
      currentPageIndex: tab.currentPageIndex || 0,
      isLoading: false,
      error: null
    })
  } else {
    resetToHome()
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

    // Clear both stores before loading
    resetToHome()

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
      resetToHome()
      set({ tabs: [], activeTabId: null })
      return
    }

    // If closing the active tab, switch to the nearest one
    if (activeTabId === tabId) {
      const closedIndex = tabs.findIndex((t) => t.id === tabId)
      const nextTab = remaining[Math.min(closedIndex, remaining.length - 1)]
      restoreTab(nextTab)
      set({ tabs: remaining, activeTabId: nextTab.id })
    } else {
      set({ tabs: remaining })
    }
  },

  newHomeTab: () => {
    // Save current tab state
    get().syncCurrentTab()

    const tab = makeHomeTab()
    resetToHome()
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id
    }))
  },

  goHome: () => {
    const { tabs, activeTabId } = get()
    // Save current tab state, then convert the active tab to a home tab
    get().syncCurrentTab()
    resetToHome()

    if (activeTabId) {
      set({
        tabs: tabs.map((t) =>
          t.id === activeTabId
            ? { ...t, type: 'home' as const, title: 'Home', presentation: undefined, slides: undefined, rootPath: undefined, currentSlideIndex: undefined, notebook: undefined, pages: undefined, currentPageIndex: undefined }
            : t
        )
      })
    } else if (tabs.length === 0) {
      const tab = makeHomeTab()
      set({ tabs: [tab], activeTabId: tab.id })
    }
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

    restoreTab(target)
    set({ activeTabId: tabId })
  },

  syncCurrentTab: () => {
    const { tabs, activeTabId } = get()
    const { presentation, slides, currentSlideIndex } = usePresentationStore.getState()
    const { notebook, pages: nbPages, currentPageIndex } = useNotebookStore.getState()

    // No tabs exist yet — create one if content is loaded
    if (tabs.length === 0 || !activeTabId) {
      if (presentation) {
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
        set({ tabs: [...tabs, newTab], activeTabId: tabId })
      } else if (notebook) {
        const tabId = `tab-${Date.now()}`
        const newTab: Tab = {
          id: tabId,
          type: 'notebook',
          title: notebook.title,
          rootPath: notebook.rootPath,
          notebook,
          pages: nbPages,
          currentPageIndex
        }
        set({ tabs: [...tabs, newTab], activeTabId: tabId })
      }
      return
    }

    const currentTab = tabs.find((t) => t.id === activeTabId)
    if (!currentTab) return

    if (notebook) {
      // Sync notebook state
      set({
        tabs: tabs.map((t) =>
          t.id === activeTabId
            ? { ...t, type: 'notebook' as const, notebook, pages: nbPages, currentPageIndex, title: notebook.title, rootPath: notebook.rootPath, presentation: undefined, slides: undefined, currentSlideIndex: undefined }
            : t
        )
      })
    } else if (presentation) {
      // Sync presentation state
      set({
        tabs: tabs.map((t) =>
          t.id === activeTabId
            ? { ...t, type: 'presentation' as const, presentation, slides, currentSlideIndex, title: presentation.title, rootPath: presentation.rootPath, notebook: undefined, pages: undefined, currentPageIndex: undefined }
            : t
        )
      })
    } else if (currentTab.type !== 'home') {
      // Content gone — convert to home
      set({
        tabs: tabs.map((t) =>
          t.id === activeTabId
            ? { ...t, type: 'home' as const, title: 'Home', presentation: undefined, slides: undefined, rootPath: undefined, currentSlideIndex: undefined, notebook: undefined, pages: undefined, currentPageIndex: undefined }
            : t
        )
      })
    }
  }
}))

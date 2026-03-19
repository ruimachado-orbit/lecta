import { create } from 'zustand'
import type { ChatStreamEvent, PresentationSnapshot, SlideSnapshot } from '../../../../packages/shared/src/types/chat'
import { usePresentationStore } from './presentation-store'

export interface ToolCallInfo {
  id: string
  name: string
  input: unknown
  result?: string
  status: 'pending' | 'executing' | 'success' | 'error'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallInfo[]
  timestamp: number
}

export interface ChatTab {
  id: string
  title: string
  messages: ChatMessage[]
  isStreaming: boolean
  currentStreamingText: string
  activeToolCalls: ToolCallInfo[]
  pendingConfirmation: { toolCallId: string; toolName: string; toolInput: unknown } | null
  error: string | null
}

interface ChatState {
  // Full-screen chat mode (replaces HomeScreen)
  showFullChat: boolean

  // Sidebar panel mode (overlay when presentation is open)
  isSidebarOpen: boolean

  // Tabs
  tabs: ChatTab[]
  activeTabId: string | null

  // Settings
  actionMode: 'auto' | 'ask'

  // Actions — navigation
  openFullChat: (initialMessage?: string) => void
  closeFullChat: () => void
  toggleSidebar: () => void
  openSidebar: () => void
  closeSidebar: () => void

  // Actions — tabs
  createTab: (initialMessage?: string) => string
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void

  // Actions — chat
  setActionMode: (mode: 'auto' | 'ask') => void
  sendMessage: (text: string) => Promise<void>
  confirmAction: (approved: boolean) => void
  clearActiveTab: () => void
}

function makeTab(title?: string): ChatTab {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title || 'New chat',
    messages: [],
    isStreaming: false,
    currentStreamingText: '',
    activeToolCalls: [],
    pendingConfirmation: null,
    error: null
  }
}

/** Capture a simplified HTML snapshot of the currently rendered slide DOM (page-agent inspired). */
function captureSlideHtml(): string | undefined {
  try {
    const slideEl = document.querySelector('.slide-content')
    if (!slideEl) return undefined
    return slideEl.innerHTML
  } catch {
    return undefined
  }
}

function buildSnapshot(): PresentationSnapshot {
  const presStore = usePresentationStore.getState()
  const presentation = presStore.presentation
  const slides = presStore.slides
  const currentIdx = presStore.currentSlideIndex
  const currentRenderedHtml = captureSlideHtml()

  return {
    title: presentation?.title || 'Untitled',
    author: presentation?.author || 'Unknown',
    theme: presentation?.theme || 'default',
    rootPath: presentation?.rootPath || '',
    currentSlideIndex: currentIdx,
    slides: slides.map((s: any, i: number): SlideSnapshot => ({
      id: s.config.id,
      markdownContent: s.markdownContent || '',
      codeContent: s.codeContent || null,
      codeLanguage: s.codeLanguage || null,
      notesContent: s.notesContent || null,
      layout: s.config.layout || 'default',
      transition: s.config.transition || 'none',
      ...(i === currentIdx && currentRenderedHtml ? { renderedHtml: currentRenderedHtml } : {})
    }))
  }
}

function dispatchRendererAction(action: string, params: Record<string, unknown>): void {
  const presStore = usePresentationStore.getState()

  switch (action) {
    case 'goToSlide':
      presStore.goToSlide(params.index as number)
      break
    case 'updateAndSaveSlide':
      presStore.updateMarkdownContent(params.slideIndex as number, params.content as string)
      presStore.saveSlideContent(params.slideIndex as number)
      break
    case 'updateAndSaveNotes':
      presStore.updateNotesContent(params.slideIndex as number, params.content as string)
      {
        const rootPath = presStore.presentation?.rootPath
        if (rootPath) {
          window.electronAPI.saveNotes(rootPath, params.slideIndex as number, params.content as string)
        }
      }
      break
    case 'updateCode':
      presStore.updateCodeContent(params.slideIndex as number, params.content as string)
      break
    case 'addSlide':
      presStore.addSlide(params.slideId as string)
      break
    case 'deleteSlide':
      presStore.deleteSlide(params.slideIndex as number)
      break
    case 'reorderSlide':
      presStore.reorderSlide(params.fromIndex as number, params.toIndex as number)
      break
    case 'setSlideLayout':
      presStore.goToSlide(params.slideIndex as number)
      presStore.setSlideLayout(params.layout as string)
      break
    case 'addBulkSlides': {
      const slides = params.slides as { id: string; markdown: string }[]
      const rootPath = presStore.presentation?.rootPath
      const afterIdx = presStore.currentSlideIndex
      if (rootPath && slides.length > 0) {
        window.electronAPI.addBulkSlides(rootPath, slides, afterIdx).then((loaded: any) => {
          usePresentationStore.setState({
            presentation: loaded.config,
            slides: loaded.slides,
            currentSlideIndex: afterIdx + 1
          })
        })
      }
      break
    }
    case 'insertChartInSlide': {
      const idx = params.slideIndex as number
      const svg = params.svg as string
      const slide = presStore.slides[idx]
      if (slide) {
        const newContent = slide.markdownContent + '\n\n' + svg
        presStore.updateMarkdownContent(idx, newContent)
        presStore.saveSlideContent(idx)
      }
      break
    }
    case 'generateImage': {
      const rootPath = presStore.presentation?.rootPath
      if (rootPath) {
        window.electronAPI.generateImage(
          rootPath,
          params.prompt as string,
          params.aspectRatio as string
        ).then((imagePath: string) => {
          const pStore = usePresentationStore.getState()
          const slideIdx = pStore.currentSlideIndex
          const slide = pStore.slides[slideIdx]
          if (slide) {
            const imgMarkdown = `\n\n![Generated image](${imagePath})`
            const newContent = slide.markdownContent + imgMarkdown
            pStore.updateMarkdownContent(slideIdx, newContent)
            pStore.saveSlideContent(slideIdx)
          }
        })
      }
      break
    }
  }
}

function buildApiMessages(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content
  }))
}

/** Get the active tab, or undefined */
function getActiveTab(state: ChatState): ChatTab | undefined {
  return state.tabs.find((t) => t.id === state.activeTabId)
}

/** Update the active tab's fields immutably */
function updateActiveTab(
  state: ChatState,
  updater: (tab: ChatTab) => Partial<ChatTab>
): Partial<ChatState> {
  return {
    tabs: state.tabs.map((t) =>
      t.id === state.activeTabId ? { ...t, ...updater(t) } : t
    )
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  showFullChat: false,
  isSidebarOpen: false,
  tabs: [],
  activeTabId: null,
  actionMode: 'auto',

  // --- Navigation ---

  openFullChat: (initialMessage?: string) => {
    const state = get()
    if (state.tabs.length === 0) {
      const tab = makeTab()
      set({ showFullChat: true, tabs: [tab], activeTabId: tab.id })
      if (initialMessage) {
        // Defer so state is settled
        setTimeout(() => get().sendMessage(initialMessage), 0)
      }
    } else {
      set({ showFullChat: true })
      if (initialMessage) {
        // Create a new tab for this message
        const tab = makeTab()
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
        setTimeout(() => get().sendMessage(initialMessage), 0)
      }
    }
  },

  closeFullChat: () => set({ showFullChat: false }),

  toggleSidebar: () => {
    const state = get()
    if (!state.isSidebarOpen && state.tabs.length === 0) {
      const tab = makeTab()
      set({ isSidebarOpen: true, tabs: [tab], activeTabId: tab.id })
    } else {
      set({ isSidebarOpen: !state.isSidebarOpen })
    }
  },
  openSidebar: () => {
    const state = get()
    if (state.tabs.length === 0) {
      const tab = makeTab()
      set({ isSidebarOpen: true, tabs: [tab], activeTabId: tab.id })
    } else {
      set({ isSidebarOpen: true })
    }
  },
  closeSidebar: () => set({ isSidebarOpen: false }),

  // --- Tabs ---

  createTab: (initialMessage?: string) => {
    const tab = makeTab()
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    if (initialMessage) {
      setTimeout(() => get().sendMessage(initialMessage), 0)
    }
    return tab.id
  },

  closeTab: (tabId: string) => {
    const state = get()
    const remaining = state.tabs.filter((t) => t.id !== tabId)
    const wasActive = state.activeTabId === tabId
    set({
      tabs: remaining,
      activeTabId: wasActive
        ? remaining[remaining.length - 1]?.id ?? null
        : state.activeTabId,
      // If no tabs left, close full chat
      showFullChat: remaining.length > 0 ? state.showFullChat : false,
      isSidebarOpen: remaining.length > 0 ? state.isSidebarOpen : false
    })
  },

  switchTab: (tabId: string) => set({ activeTabId: tabId }),

  // --- Chat ---

  setActionMode: (mode) => set({ actionMode: mode }),

  sendMessage: async (text: string) => {
    const state = get()
    const tab = getActiveTab(state)
    if (!tab) return

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: Date.now()
    }

    // Set tab title from first message
    const isFirstMessage = tab.messages.length === 0
    const title = isFirstMessage ? text.slice(0, 40) + (text.length > 40 ? '...' : '') : tab.title

    set((s) => updateActiveTab(s, () => ({
      title,
      messages: [...tab.messages, userMessage, assistantMessage],
      isStreaming: true,
      currentStreamingText: '',
      activeToolCalls: [],
      error: null
    })))

    const snapshot = buildSnapshot()
    const apiMessages = buildApiMessages([...tab.messages, userMessage])
    const activeTabId = state.activeTabId!

    try {
      await window.electronAPI.chatSendMessage(
        apiMessages,
        snapshot,
        state.actionMode,
        (event: ChatStreamEvent) => {
          const currentState = get()
          // Only update if this tab is still present
          const currentTab = currentState.tabs.find((t) => t.id === activeTabId)
          if (!currentTab) return

          const updateTab = (updater: (tab: ChatTab) => Partial<ChatTab>): void => {
            set((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === activeTabId ? { ...t, ...updater(t) } : t
              )
            }))
          }

          switch (event.type) {
            case 'text_delta': {
              const newText = currentTab.currentStreamingText + event.text
              updateTab((t) => {
                const msgs = [...t.messages]
                const last = msgs[msgs.length - 1]
                if (last?.role === 'assistant') last.content = newText
                return { currentStreamingText: newText, messages: msgs }
              })
              break
            }

            case 'tool_call_start': {
              const toolCall: ToolCallInfo = {
                id: event.id,
                name: event.toolName,
                input: event.toolInput,
                status: 'executing'
              }
              updateTab((t) => {
                const msgs = [...t.messages]
                const last = msgs[msgs.length - 1]
                if (last?.role === 'assistant') {
                  last.toolCalls = [...(last.toolCalls || []), toolCall]
                }
                return { activeToolCalls: [...t.activeToolCalls, toolCall], messages: msgs }
              })
              break
            }

            case 'tool_call_result': {
              updateTab((t) => {
                const calls = t.activeToolCalls.map((tc) =>
                  tc.id === event.id
                    ? { ...tc, result: event.result, status: (event.success ? 'success' : 'error') as ToolCallInfo['status'] }
                    : tc
                )
                const msgs = [...t.messages]
                const last = msgs[msgs.length - 1]
                if (last?.role === 'assistant' && last.toolCalls) {
                  last.toolCalls = last.toolCalls.map((tc) =>
                    tc.id === event.id
                      ? { ...tc, result: event.result, status: (event.success ? 'success' : 'error') as ToolCallInfo['status'] }
                      : tc
                  )
                }
                return { activeToolCalls: calls, messages: msgs }
              })
              if (event.rendererAction) {
                dispatchRendererAction(event.rendererAction.action, event.rendererAction.params)
              }
              break
            }

            case 'tool_confirm_request': {
              updateTab(() => ({
                pendingConfirmation: {
                  toolCallId: event.id,
                  toolName: event.toolName,
                  toolInput: event.toolInput
                }
              }))
              break
            }

            case 'error': {
              updateTab(() => ({ error: event.message }))
              break
            }

            case 'done': {
              updateTab(() => ({
                isStreaming: false,
                currentStreamingText: '',
                activeToolCalls: [],
                pendingConfirmation: null
              }))
              break
            }
          }
        }
      )
    } catch (err) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === activeTabId
            ? { ...t, isStreaming: false, error: (err as Error).message }
            : t
        )
      }))
    }
  },

  confirmAction: (approved: boolean) => {
    const tab = getActiveTab(get())
    if (tab?.pendingConfirmation) {
      window.electronAPI.chatConfirmAction(tab.pendingConfirmation.toolCallId, approved)
      set((s) => updateActiveTab(s, () => ({ pendingConfirmation: null })))
    }
  },

  clearActiveTab: () => {
    set((s) => updateActiveTab(s, () => ({
      messages: [],
      currentStreamingText: '',
      activeToolCalls: [],
      error: null,
      pendingConfirmation: null,
      title: 'New chat'
    })))
  }
}))

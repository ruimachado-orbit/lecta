import { create } from 'zustand'
import type { ChatStreamEvent, PresentationSnapshot, SlideSnapshot } from '../../../../packages/shared/src/types/chat'
import { getLastExecution } from '../components/chat/code-run-bridge'
import { agentPromptFor, runSlashCommand } from '../components/chat/slash-actions'
import { parseSlashCommand, type SlashCommandName } from '../components/chat/slash-commands'
import { usePresentationStore } from './presentation-store'

/** Terminal message the main process sends when a turn is cancelled. */
const CANCELLED_MESSAGE = 'Cancelled'

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

/** Text the user selected elsewhere in the app, quoted into the next message. */
export interface ChatAttachment {
  /** Where it came from, e.g. "Slide 3 selection". */
  label: string
  text: string
}

interface ChatState {
  // Full-screen chat mode (replaces HomeScreen)
  showFullChat: boolean

  // Sidebar panel mode (overlay when presentation is open)
  isSidebarOpen: boolean

  // Tabs
  tabs: ChatTab[]
  activeTabId: string | null

  // Composer — shared by the sidebar and the full-screen view so a slash command
  // prefilled from a toolbar button lands in whichever one is on screen.
  composerDraft: string
  attachment: ChatAttachment | null

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

  // Actions — composer
  setComposerDraft: (text: string) => void
  /** Open the chat with `prefill` in the composer (used by the ✨ buttons). */
  openWithPrefill: (prefill: string) => void
  /** Open the chat and run `text` straight away (one-click AI buttons). */
  runCommand: (text: string) => void
  setAttachment: (attachment: ChatAttachment | null) => void

  // Actions — chat
  setActionMode: (mode: 'auto' | 'ask') => void
  sendMessage: (text: string) => Promise<void>
  cancel: () => void
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

/**
 * The snapshot plus the last code run. `lastExecution` is an extra field rather
 * than part of `PresentationSnapshot`: the shared type is owned elsewhere, and
 * `get_last_output` reads it through the same optional shape in
 * `chat-agent-tools.ts`.
 */
export type ChatSnapshot = PresentationSnapshot & {
  lastExecution?: {
    slideIndex: number
    language: string
    status: string
    output: string
    exitCode: number | null
    durationMs: number
    isExecuting: boolean
  }
}

function buildSnapshot(): ChatSnapshot {
  const presStore = usePresentationStore.getState()
  const presentation = presStore.presentation
  const slides = presStore.slides
  const currentIdx = presStore.currentSlideIndex
  const currentRenderedHtml = captureSlideHtml()

  const lastExecution = getLastExecution()

  return {
    ...(lastExecution ? { lastExecution } : {}),
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
    case 'updateAndSaveSlide': {
      // Refuses .mdx targets (toast shown): AI output is never written into executable slides.
      const ok = presStore.applyAIContent(params.slideIndex as number, params.content as string)
      if (!ok) return
      break
    }
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
      if (slides.length > 0) {
        if (rootPath) {
          // Presentation is open — add slides to it
          window.electronAPI.addBulkSlides(rootPath, slides, afterIdx).then((loaded: any) => {
            usePresentationStore.setState({
              presentation: loaded.config,
              slides: loaded.slides,
              currentSlideIndex: afterIdx + 1
            })
          })
        } else {
          // No presentation open — create one, add slides, and open it
          const title = slides[0]?.markdown?.match(/^#\s+(.+)/m)?.[1] || 'AI Generated Presentation'
          window.electronAPI.createPresentation(title).then(async (newPath: string | null) => {
            if (!newPath) return
            const loaded = await window.electronAPI.addBulkSlides(newPath, slides, 0)
            const { useTabsStore } = await import('./tabs-store')
            useTabsStore.getState().openInNewTab(newPath)
          })
        }
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

/* -------------------------------------------------------------------------- */
/* Slash commands                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Run a slash command that is handled in the renderer (no model turn): the
 * command's own service call does the work and its report becomes the reply.
 * The tab still shows as streaming so the composer is disabled and Stop — which
 * cancels the underlying `ai:*` request — stays available.
 */
async function runLocalSlashCommand(
  command: SlashCommandName,
  args: string,
  displayText: string
): Promise<void> {
  const tabId = useChatStore.getState().activeTabId
  const tab = useChatStore.getState().tabs.find((t) => t.id === tabId)
  if (!tabId || !tab) return

  const now = Date.now()
  const userMessage: ChatMessage = { id: `msg-${now}`, role: 'user', content: displayText, timestamp: now }
  const assistantMessage: ChatMessage = {
    id: `msg-${now + 1}`,
    role: 'assistant',
    content: '',
    timestamp: now
  }
  const title = tab.messages.length === 0
    ? displayText.slice(0, 40) + (displayText.length > 40 ? '...' : '')
    : tab.title

  useChatStore.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.id === tabId
        ? {
            ...t,
            title,
            messages: [...t.messages, userMessage, assistantMessage],
            isStreaming: true,
            currentStreamingText: '',
            error: null
          }
        : t
    )
  }))

  const outcome = await runSlashCommand(command, args)

  useChatStore.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.id === tabId
        ? {
            ...t,
            messages: t.messages.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, content: outcome.kind === 'agent' ? 'Sending that to the assistant…' : outcome.message }
                : m
            ),
            isStreaming: false,
            currentStreamingText: ''
          }
        : t
    )
  }))

  // Safety net: a command that turned out to need the agent after all.
  if (outcome.kind === 'agent') await useChatStore.getState().sendMessage(outcome.prompt)
}

/* -------------------------------------------------------------------------- */
/* Running the deck's code for the agent                                       */
/* -------------------------------------------------------------------------- */

/**
 * Cap on the history sent to the model. The main process caps again, but doing
 * it here keeps the IPC payload (and the snapshot round-trip) bounded too.
 */
const MAX_HISTORY_MESSAGES = 40
const MAX_HISTORY_CHARS = 60_000

function buildApiMessages(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const mapped = messages.map((m) => ({ role: m.role, content: m.content }))

  let kept = mapped.slice(-MAX_HISTORY_MESSAGES)
  let total = kept.reduce((sum, m) => sum + m.content.length, 0)
  while (kept.length > 1 && total > MAX_HISTORY_CHARS) {
    total -= kept[0].content.length
    kept = kept.slice(1)
  }
  // The first message must be a user turn for the Anthropic API.
  while (kept.length > 1 && kept[0].role !== 'user') {
    kept = kept.slice(1)
  }
  return kept
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
  composerDraft: '',
  attachment: null,
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

  // --- Composer ---

  setComposerDraft: (text: string) => set({ composerDraft: text }),

  /**
   * The ✨ buttons that replaced the scattered prompt bars all land here: open
   * the chat (creating a tab if needed) with the slash command already typed.
   */
  openWithPrefill: (prefill: string) => {
    const state = get()
    if (state.tabs.length === 0) {
      const tab = makeTab()
      set({ tabs: [tab], activeTabId: tab.id })
    }
    set({ composerDraft: prefill })
    if (!state.showFullChat) set({ isSidebarOpen: true })
  },

  /**
   * One-click AI buttons (Beautify, Generate notes) send their slash command
   * without the user typing: same path, same transcript, Stop still available.
   */
  runCommand: (text: string) => {
    const state = get()
    if (state.tabs.length === 0) {
      const tab = makeTab()
      set({ tabs: [tab], activeTabId: tab.id })
    }
    set({ composerDraft: '' })
    if (!state.showFullChat) set({ isSidebarOpen: true })
    void get().sendMessage(text)
  },

  setAttachment: (attachment) => set({ attachment }),

  // --- Chat ---

  setActionMode: (mode) => set({ actionMode: mode }),

  sendMessage: async (rawText: string) => {
    const state = get()
    const tab = getActiveTab(state)
    if (!tab) return

    // A quoted selection (from "Ask AI" on selected text) rides along once.
    const attachment = state.attachment
    if (attachment) set({ attachment: null })
    const quoted = attachment
      ? `${attachment.label}:\n> ${attachment.text.split('\n').join('\n> ')}\n\n`
      : ''

    const parsed = parseSlashCommand(rawText)
    if (parsed) {
      const expanded = agentPromptFor(parsed.command)
      if (expanded) {
        // A shorthand for asking the agent — carry on down the normal path.
        return get().sendMessage(quoted + expanded)
      }
      const args = attachment ? `${parsed.args}\n\nSelected text:\n${attachment.text}`.trim() : parsed.args
      await runLocalSlashCommand(parsed.command, args, quoted + rawText)
      return
    }

    const text = quoted + rawText

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
              // A user-initiated stop is not a failure — no red banner for it.
              if (event.message === CANCELLED_MESSAGE) break
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
    } finally {
      // The preload helper drops its IPC listener when the turn ends; make sure
      // the tab leaves the streaming state even if no `done` event arrived.
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                isStreaming: false,
                currentStreamingText: '',
                activeToolCalls: [],
                pendingConfirmation: null
              }
            : t
        )
      }))
    }
  },

  /**
   * Stop the turn in flight: the main process aborts the provider request and
   * ends the stream with a `Cancelled` error, but the tab leaves the streaming
   * state immediately so the composer is usable again.
   */
  cancel: () => {
    const state = get()
    const activeTabId = state.activeTabId
    void window.electronAPI.cancelAI()
    if (!activeTabId) return
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              isStreaming: false,
              currentStreamingText: '',
              activeToolCalls: [],
              pendingConfirmation: null
            }
          : t
      )
    }))
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

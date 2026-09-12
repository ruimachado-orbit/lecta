import { useRef, useEffect } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { useUIStore } from '../../stores/ui-store'
import { ChatComposer } from './ChatComposer'
import { ChatMessageComponent } from './ChatMessage'
import { SelectionToolbar } from './SelectionToolbar'

const QUICK_ACTIONS = [
  { label: 'Beautify slide', message: '/prettify' },
  { label: 'Speaker notes', message: '/notes' },
  { label: 'Run the code', message: '/run' },
  { label: 'Summarize deck', message: 'Give me an overview of the entire presentation' }
]

export function ChatWelcome({ onQuickAction }: { onQuickAction: (msg: string) => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
      <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-gray-300 mb-1">Lecta AI</h3>
      <p className="text-xs text-gray-500 mb-1">
        Ask me to view, edit, run or improve your slides
      </p>
      <p className="text-[10px] text-gray-600 mb-4">
        Type <span className="font-mono text-gray-500">/</span> for commands
      </p>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => onQuickAction(action.message)}
            className="px-2.5 py-1 text-[10px] rounded-full bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors border border-gray-800"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ConfirmationBanner(): JSX.Element | null {
  const { confirmAction } = useChatStore()
  const tabs = useChatStore((s) => s.tabs)
  const activeTabId = useChatStore((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const pending = activeTab?.pendingConfirmation
  if (!pending) return null

  const friendlyName = pending.toolName.replace(/_/g, ' ')

  return (
    <div className="mx-3 mb-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-yellow-500 text-xs font-medium">Confirm action</span>
      </div>
      <p className="text-xs text-gray-300 mb-2">
        The assistant wants to <span className="font-medium text-yellow-400">{friendlyName}</span>
      </p>
      <div className="text-[10px] text-gray-500 bg-gray-900 rounded px-2 py-1 mb-2 max-h-16 overflow-auto">
        {JSON.stringify(pending.toolInput, null, 2)}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => confirmAction(true)}
          className="px-3 py-1 text-[10px] font-medium rounded bg-green-600 hover:bg-green-500 text-white transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => confirmAction(false)}
          className="px-3 py-1 text-[10px] font-medium rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  )
}

/**
 * Inline chat panel — used inside a PanelGroup in AppShell.
 * Fills its parent container (no fixed positioning).
 */
export function ChatSidebarPanel(): JSX.Element {
  const { tabs, activeTabId, sendMessage, clearActiveTab, closeSidebar } = useChatStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const providerStatuses = useUIStore((s) => s.providerStatuses)
  const noProviders = !providerStatuses.some((s) => s.hasKey)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeTab?.messages])

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <svg className="w-4 h-4 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
        <span className="text-xs font-medium text-gray-300 flex-1">Lecta AI</span>

        {activeTab && activeTab.messages.length > 0 && (
          <button
            onClick={clearActiveTab}
            className="text-gray-600 hover:text-gray-400 transition-colors"
            title="Clear history"
            aria-label="Clear history"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        )}

        <button
          onClick={closeSidebar}
          className="text-gray-600 hover:text-gray-400 transition-colors"
          title="Close chat"
          aria-label="Close chat"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {!activeTab || activeTab.messages.length === 0 ? (
          noProviders ? (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
              </div>
              <p className="text-xs text-gray-500">No AI providers configured.</p>
              <p className="text-xs text-gray-600">Add provider credentials in Settings to use chat.</p>
            </div>
          ) : (
            <ChatWelcome onQuickAction={(msg) => {
              if (!activeTab?.isStreaming) sendMessage(msg)
            }} />
          )
        ) : (
          activeTab.messages.map((msg) => (
            <ChatMessageComponent key={msg.id} message={msg} />
          ))
        )}

        {activeTab?.isStreaming && activeTab.messages.length > 0 && (
          <div className="flex items-center gap-1.5 text-gray-500 text-xs">
            <span className="inline-block w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
            Thinking...
          </div>
        )}

        {activeTab?.error && (
          <div className="px-3 py-2 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-500">
            {activeTab.error}
          </div>
        )}
      </div>

      <SelectionToolbar />
      <ConfirmationBanner />

      <ChatComposer compact />
    </div>
  )
}

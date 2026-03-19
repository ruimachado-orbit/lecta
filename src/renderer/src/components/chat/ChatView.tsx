import { useState, useRef, useEffect } from 'react'
import { useChatStore, type ChatTab } from '../../stores/chat-store'
import { ChatMessageComponent } from './ChatMessage'
import { ConfirmationBanner, ActionModeToggle, ChatWelcome } from './ChatPanel'

/**
 * Full-screen chat view — replaces HomeScreen when the user starts a conversation.
 * Supports multiple tabs, each with its own conversation.
 */
export function ChatView(): JSX.Element {
  const {
    tabs, activeTabId, switchTab, createTab, closeTab,
    closeFullChat, sendMessage, clearActiveTab
  } = useChatStore()

  const activeTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div className="h-screen flex flex-col bg-gray-950" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Tab bar */}
      <div
        className="flex items-center border-b border-gray-800 bg-gray-950 flex-shrink-0 pl-20"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Home button */}
        <button
          onClick={closeFullChat}
          className="px-3 py-2 text-gray-500 hover:text-gray-300 hover:bg-gray-900 transition-colors"
          title="Back to Home"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </button>

        {/* Tabs */}
        <div className="flex-1 flex items-center overflow-x-auto gap-0.5 px-1">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onSelect={() => switchTab(tab.id)}
              onClose={() => closeTab(tab.id)}
            />
          ))}
        </div>

        {/* New tab */}
        <button
          onClick={() => createTab()}
          className="px-2 py-2 text-gray-600 hover:text-gray-300 hover:bg-gray-900 transition-colors flex-shrink-0"
          title="New chat"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Chat content */}
      {activeTab ? (
        <ChatTabContent tab={activeTab} onSend={sendMessage} onClear={clearActiveTab} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          No active chat
        </div>
      )}
    </div>
  )
}

function TabButton({
  tab, isActive, onSelect, onClose
}: {
  tab: ChatTab
  isActive: boolean
  onSelect: () => void
  onClose: () => void
}): JSX.Element {
  return (
    <div
      className={`group flex items-center gap-1 px-2.5 py-1.5 rounded-t text-xs cursor-pointer transition-colors max-w-[180px] ${
        isActive
          ? 'bg-gray-900 text-gray-200 border-b-2 border-indigo-500'
          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900/50'
      }`}
      onClick={onSelect}
    >
      <span className="truncate flex-1">{tab.title}</span>
      {tab.isStreaming && (
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-300 transition-opacity flex-shrink-0"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

function ChatTabContent({
  tab, onSend, onClear
}: {
  tab: ChatTab
  onSend: (text: string) => Promise<void>
  onClear: () => void
}): JSX.Element {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [tab.messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [tab.id])

  const handleSend = (): void => {
    const text = input.trim()
    if (!text || tab.isStreaming) return
    setInput('')
    onSend(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {tab.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <ChatWelcome onQuickAction={(msg) => { if (!tab.isStreaming) onSend(msg) }} />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            {tab.messages.map((msg) => (
              <ChatMessageComponent key={msg.id} message={msg} />
            ))}

            {tab.isStreaming && (
              <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                <span className="inline-block w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                Thinking...
              </div>
            )}

            {tab.error && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                {tab.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation */}
      {tab.pendingConfirmation && (
        <ConfirmationBanner />
      )}

      {/* Input */}
      <div className="border-t border-gray-800 p-3 flex-shrink-0">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <ActionModeToggle />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Lecta AI..."
            rows={1}
            className="flex-1 resize-none bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 max-h-32 overflow-y-auto"
            style={{ minHeight: '42px' }}
            disabled={tab.isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || tab.isStreaming}
            className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 text-white flex items-center justify-center transition-colors flex-shrink-0"
            title="Send"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

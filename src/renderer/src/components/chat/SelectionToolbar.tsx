import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useUIStore } from '../../stores/ui-store'
import { useChatStore } from '../../stores/chat-store'
import { usePresentationStore } from '../../stores/presentation-store'
import { useTabsStore } from '../../stores/tabs-store'

/**
 * Floating toolbar for selected text — inside an assistant chat message or on the
 * slide itself. "Ask AI" quotes the selection into the chat composer; "Generate
 * Presentation" opens a new Home tab with the AI Generate panel pre-filled.
 */
export function SelectionToolbar(): JSX.Element | null {
  const [selection, setSelection] = useState<
    { text: string; x: number; y: number; source: 'chat' | 'slide' } | null
  >(null)

  const handleMouseUp = useCallback(() => {
    // Small delay so the browser finalises the selection range
    requestAnimationFrame(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null)
        return
      }

      const text = sel.toString().trim()
      if (text.length < 3) {
        setSelection(null)
        return
      }

      // Assistant messages (never user bubbles) and slide content are askable.
      const anchor = sel.anchorNode
      if (!anchor) { setSelection(null); return }
      const el = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor as HTMLElement
      if (!el) { setSelection(null); return }
      const inChat = !!el.closest('[data-chat-role="assistant"]')
      const inSlide = !!el.closest('.slide-content, .ProseMirror')
      if (!inChat && !inSlide) { setSelection(null); return }

      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setSelection({
        text,
        x: rect.left + rect.width / 2,
        y: rect.top,
        source: inChat ? 'chat' : 'slide'
      })
    })
  }, [])

  // Clear when selection is lost (click elsewhere, etc.)
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!selection) return
    const target = e.target as HTMLElement
    // If clicking the toolbar itself, don't clear
    if (target.closest('[data-selection-toolbar]')) return
    setSelection(null)
  }, [selection])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [handleMouseUp, handleMouseDown])

  const handleAsk = useCallback(() => {
    if (!selection) return
    const chat = useChatStore.getState()
    const slideIndex = usePresentationStore.getState().currentSlideIndex
    chat.setAttachment({
      label: selection.source === 'slide' ? `Slide ${slideIndex + 1} selection` : 'Chat selection',
      text: selection.text
    })
    // Land in whichever chat surface is on screen.
    if (!chat.showFullChat) chat.openSidebar()

    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [selection])

  const handleGenerate = useCallback(() => {
    if (!selection) return
    const text = selection.text

    // 1. Store the prompt so AIGeneratePanel picks it up
    useUIStore.getState().setPendingGeneratePrompt(text)

    // 2. Close the full-screen chat (if we're in it)
    useChatStore.getState().closeFullChat()

    // 3. Open a new Home tab (which shows HomeScreen)
    useTabsStore.getState().newHomeTab()

    // Clear selection UI
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [selection])

  if (!selection) return null

  // Position the toolbar above the selection, centered
  const toolbarWidth = 280
  const left = Math.max(8, Math.min(selection.x - toolbarWidth / 2, window.innerWidth - toolbarWidth - 8))
  const top = selection.y - 40

  return createPortal(
    <div
      data-selection-toolbar
      className="flex items-center gap-1 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-[9999]"
      style={{
        position: 'fixed',
        left,
        top: Math.max(4, top),
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <button
        onClick={handleAsk}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-200 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
        title="Quote this selection into the chat"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
        Ask AI
      </button>
      <button
        onClick={handleGenerate}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
        </svg>
        Generate Presentation
      </button>
    </div>,
    document.body
  )
}

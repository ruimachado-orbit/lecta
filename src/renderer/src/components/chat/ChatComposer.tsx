import { useEffect, useMemo, useRef, useState } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { ModelSelector } from '../ai/ModelSelector'
import {
  completeSlashCommand,
  matchSlashCommands,
  slashAutocompleteQuery,
  type SlashCommand
} from './slash-commands'

/** "Slide 3 · Python demo" — what the agent will act on if you say "this slide". */
function useSlideChip(): string | null {
  const slides = usePresentationStore((s) => s.slides)
  const index = usePresentationStore((s) => s.currentSlideIndex)
  const slide = slides[index]
  if (!slide) return null

  const heading = slide.markdownContent
    ?.split('\n')
    .find((line) => line.trim().startsWith('#'))
    ?.replace(/^#{1,6}\s*/, '')
    .replace(/[*_`>]/g, '')
    .trim()

  const label = heading || slide.config.id
  return `Slide ${index + 1} · ${label.slice(0, 40)}`
}

/** Auto (act immediately) vs Ask (confirm every change). */
function ActionModeToggle(): JSX.Element {
  const actionMode = useChatStore((s) => s.actionMode)
  const setActionMode = useChatStore((s) => s.setActionMode)
  const label =
    actionMode === 'auto'
      ? 'Auto mode: actions execute immediately'
      : 'Ask mode: confirmation required before changes'

  return (
    <button
      onClick={() => setActionMode(actionMode === 'auto' ? 'ask' : 'auto')}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium transition-colors flex-shrink-0 ${
        actionMode === 'auto'
          ? 'bg-green-600/20 text-green-500 hover:bg-green-600/30'
          : 'bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600/30'
      }`}
      title={label}
      aria-label={label}
    >
      {actionMode === 'auto' ? (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
          </svg>
          Auto
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          Ask
        </>
      )}
    </button>
  )
}

/**
 * The one place to type. Shared by the sidebar and the full-screen chat so a
 * slash command prefilled by a toolbar button lands in whichever is on screen.
 */
export function ChatComposer({ compact = false }: { compact?: boolean }): JSX.Element {
  const draft = useChatStore((s) => s.composerDraft)
  const setDraft = useChatStore((s) => s.setComposerDraft)
  const attachment = useChatStore((s) => s.attachment)
  const setAttachment = useChatStore((s) => s.setAttachment)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const cancel = useChatStore((s) => s.cancel)
  const tabs = useChatStore((s) => s.tabs)
  const activeTabId = useChatStore((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const providerStatuses = useUIStore((s) => s.providerStatuses)
  const noProviders = !providerStatuses.some((s) => s.hasKey)

  const isStreaming = !!activeTab?.isStreaming
  const isDisabled = noProviders || isStreaming

  const slideChip = useSlideChip()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [highlight, setHighlight] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const query = slashAutocompleteQuery(draft)
  const matches = useMemo(() => (query === null ? [] : matchSlashCommands(query)), [query])
  const isOpen = !dismissed && query !== null && matches.length > 0

  // Keep the highlight in range as the list narrows.
  useEffect(() => {
    setHighlight(0)
  }, [query])

  // A prefill from a toolbar button arrives through the store — take the caret.
  useEffect(() => {
    if (!draft) return
    const el = inputRef.current
    if (!el || document.activeElement === el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [draft])

  const applyCompletion = (command: SlashCommand): void => {
    setDraft(completeSlashCommand(command))
    setDismissed(false)
    requestAnimationFrame(() => {
      const el = inputRef.current
      el?.focus()
      el?.setSelectionRange(el.value.length, el.value.length)
    })
  }

  const handleSend = (): void => {
    const text = draft.trim()
    if (!text || isDisabled) return
    setDraft('')
    setDismissed(false)
    void sendMessage(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applyCompletion(matches[Math.min(highlight, matches.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const listboxId = 'chat-slash-commands'
  const textSize = compact ? 'text-xs' : 'text-sm'

  return (
    <div className={`border-t border-gray-800 flex-shrink-0 ${compact ? 'p-2' : 'p-3'} ${noProviders ? 'opacity-50' : ''}`}>
      <div className={`${compact ? 'space-y-1.5' : 'max-w-2xl mx-auto space-y-2'}`}>
        {/* Context row: what the agent is looking at, and anything you attached */}
        {(slideChip || attachment) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {slideChip && (
              <span
                className="px-2 py-0.5 rounded-full bg-gray-900 border border-gray-800 text-[10px] text-gray-400 truncate max-w-full"
                title="The slide the assistant will act on"
              >
                {slideChip}
              </span>
            )}
            {attachment && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-600/15 border border-indigo-500/30 text-[10px] text-indigo-300 max-w-full">
                <span className="truncate max-w-[220px]">
                  {attachment.label}: “{attachment.text.slice(0, 60)}
                  {attachment.text.length > 60 ? '…' : ''}”
                </span>
                <button
                  onClick={() => setAttachment(null)}
                  className="text-indigo-300/70 hover:text-white transition-colors"
                  title="Remove attachment"
                  aria-label="Remove attachment"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
          </div>
        )}

        <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
          <ActionModeToggle />
          <ModelSelector compact />
          <span className="text-[10px] text-gray-600 ml-auto hidden sm:inline">/ for commands</span>
        </div>

        <div className="relative">
          {isOpen && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Slash commands"
              className="absolute bottom-full mb-1.5 left-0 right-0 z-[9980] max-h-56 overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 shadow-2xl py-1"
            >
              {matches.map((command, i) => (
                <li key={command.name} id={`${listboxId}-${command.name}`} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // Keep focus in the textarea so the caret does not jump.
                      e.preventDefault()
                      applyCompletion(command)
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left px-3 py-1.5 transition-colors ${
                      i === highlight ? 'bg-gray-800' : 'hover:bg-gray-800/60'
                    }`}
                  >
                    <span className="text-xs font-mono text-indigo-300">/{command.name}</span>
                    {command.argsHint && (
                      <span className="text-[10px] font-mono text-gray-600 ml-1">{command.argsHint}</span>
                    )}
                    <span className="block text-[10px] text-gray-500 truncate">{command.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={`flex items-end ${compact ? 'gap-1.5' : 'gap-2'}`}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setDismissed(false)
              }}
              onKeyDown={handleKeyDown}
              placeholder={noProviders ? 'Configure an AI provider in Settings' : 'Ask Lecta AI, or / for a command'}
              rows={1}
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                isOpen ? `${listboxId}-${matches[Math.min(highlight, matches.length - 1)].name}` : undefined
              }
              className={`flex-1 resize-none bg-gray-900 border border-gray-800 ${
                compact ? 'rounded-lg px-3 py-2 max-h-24' : 'rounded-2xl px-4 py-2.5 max-h-32'
              } ${textSize} text-gray-300 placeholder-gray-500 focus:outline-none focus:border-gray-700 overflow-y-auto disabled:cursor-not-allowed`}
              style={{ minHeight: compact ? '36px' : '42px' }}
              disabled={isDisabled}
            />
            {isStreaming ? (
              <button
                onClick={cancel}
                className={`${compact ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-full'} bg-red-600/80 hover:bg-red-600 text-white flex items-center justify-center transition-colors flex-shrink-0`}
                title="Stop generating"
                aria-label="Stop generating"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!draft.trim() || isDisabled}
                className={`${compact ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-full'} bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 text-white flex items-center justify-center transition-colors flex-shrink-0`}
                title="Send"
                aria-label="Send"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

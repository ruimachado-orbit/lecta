import { useEffect, useMemo, useRef, useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { getAllThemes } from '../../themes/theme-registry'
import { SHORTCUTS, formatKeys } from '../../hooks/useKeyboardShortcuts'
import { useOverlay, prefersReducedMotion } from './overlay'
import { addSlide, exportDeckAs, importSlidesIntoDeck, startPresenting, EXPORT_LABELS, type ExportKind } from './deck-commands'
import { showAIError } from '../ai/AIAlert'

type CommandGroup = 'Slides' | 'Actions' | 'Themes' | 'Recent decks'

interface Command {
  id: string
  title: string
  group: CommandGroup
  /** Extra words the fuzzy match should consider (never displayed). */
  keywords?: string
  hint?: string
  run: () => void | Promise<void>
}

interface Scored {
  command: Command
  score: number
}

/**
 * Subsequence fuzzy match. Returns a score (higher is better) or -1 for no match.
 * Consecutive characters and word-start matches score higher, so "exp pdf" finds
 * "Export PDF" ahead of "Expand panel".
 */
function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) return 0
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase().replace(/\s+/g, '')
  let score = 0
  let hi = 0
  let streak = 0
  for (let ni = 0; ni < n.length; ni++) {
    const c = n[ni]
    let found = -1
    for (let i = hi; i < h.length; i++) {
      if (h[i] === c) { found = i; break }
    }
    if (found === -1) return -1
    const atWordStart = found === 0 || /[\s\-_/:]/.test(h[found - 1])
    streak = found === hi ? streak + 1 : 0
    score += 1 + streak * 2 + (atWordStart ? 3 : 0)
    hi = found + 1
  }
  // Prefer shorter targets when the score ties.
  return score - h.length * 0.01
}

/** First non-empty line of a slide's markdown, cleaned up for a list row. */
function slideTitle(markdown: string, fallback: string): string {
  const line = markdown.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('---'))
  if (!line) return fallback
  return line.replace(/^#{1,6}\s*/, '').replace(/[*_`>]/g, '').slice(0, 80) || fallback
}

export function CommandPalette(): JSX.Element | null {
  const open = useUIStore((s) => s.showCommandPalette)
  const setOpen = useUIStore((s) => s.setCommandPalette)
  const slides = usePresentationStore((s) => s.slides)
  const hasDeck = usePresentationStore((s) => !!s.presentation)

  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [recents, setRecents] = useState<{ path: string; title: string }[]>([])

  const close = (): void => setOpen(false)
  useOverlay(panelRef, { open, onClose: close, trapFocus: true, autoFocus: false })

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()
    void window.electronAPI
      .getRecentDecks()
      .then((decks: unknown[]) => {
        setRecents(
          decks
            .map((d) =>
              typeof d === 'string'
                ? { path: d, title: d.split('/').pop() || d }
                : { path: String((d as { path?: string }).path ?? ''), title: String((d as { title?: string }).title ?? '') }
            )
            .filter((d) => d.path)
            .slice(0, 8)
        )
      })
      .catch(() => setRecents([]))
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = []

    // Slides — jump straight to one.
    slides.forEach((slide, index) => {
      list.push({
        id: `slide-${index}`,
        title: `${index + 1}. ${slideTitle(slide.markdownContent ?? '', slide.config.id)}`,
        group: 'Slides',
        keywords: slide.config.id,
        run: () => usePresentationStore.getState().goToSlide(index)
      })
    })

    const shortcutFor = (label: string): string | undefined => {
      const found = SHORTCUTS.find((s) => s.label === label)
      return found ? formatKeys(found.keys) : undefined
    }

    if (hasDeck) {
      list.push(
        {
          id: 'action-present',
          title: 'Start presenting',
          group: 'Actions',
          hint: shortcutFor('Start presenting'),
          run: startPresenting
        },
        {
          id: 'action-add-slide',
          title: 'Add a slide',
          group: 'Actions',
          hint: shortcutFor('Add a slide'),
          run: addSlide
        },
        {
          id: 'action-notes',
          title: 'Toggle speaker notes',
          group: 'Actions',
          hint: shortcutFor('Toggle speaker notes'),
          run: () => useUIStore.getState().toggleNotes()
        },
        {
          id: 'action-slide-map',
          title: 'Open the slide map',
          group: 'Actions',
          run: () => useUIStore.getState().toggleSlideMap()
        },
        {
          id: 'action-import',
          title: 'Import slides from another deck',
          group: 'Actions',
          run: () => { void importSlidesIntoDeck() }
        },
        {
          id: 'action-article',
          title: 'Generate an article from this deck',
          group: 'Actions',
          run: () => useUIStore.getState().toggleArticlePanel()
        }
      )

      for (const kind of ['pdf', 'html', 'pptx'] as ExportKind[]) {
        list.push({
          id: `action-export-${kind}`,
          title: EXPORT_LABELS[kind],
          group: 'Actions',
          keywords: `export ${kind} save download`,
          run: async () => {
            try {
              await exportDeckAs(kind)
            } catch (err) {
              showAIError(err)
            }
          }
        })
      }

      for (const theme of getAllThemes()) {
        list.push({
          id: `theme-${theme.id}`,
          title: `Theme: ${theme.name}`,
          group: 'Themes',
          keywords: theme.id,
          run: () => usePresentationStore.getState().setTheme(theme.id)
        })
      }
    }

    list.push(
      {
        id: 'action-settings',
        title: 'Open Settings',
        group: 'Actions',
        keywords: 'api key provider preferences',
        run: () => useUIStore.getState().openSettings()
      },
      {
        id: 'action-shortcuts',
        title: 'Keyboard shortcuts',
        group: 'Actions',
        hint: shortcutFor('Keyboard shortcuts'),
        run: () => useUIStore.getState().setShortcuts(true)
      }
    )

    for (const deck of recents) {
      list.push({
        id: `recent-${deck.path}`,
        title: deck.title || deck.path,
        group: 'Recent decks',
        keywords: deck.path,
        run: () => { void usePresentationStore.getState().loadPresentation(deck.path) }
      })
    }

    return list
  }, [slides, hasDeck, recents])

  const results = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 40)
    const scored: Scored[] = []
    for (const command of commands) {
      const score = Math.max(
        fuzzyScore(command.title, query),
        command.keywords ? fuzzyScore(command.keywords, query) - 2 : -1
      )
      if (score >= 0) scored.push({ command, score })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 40).map((s) => s.command)
  }, [commands, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, results])

  if (!open) return null

  const runCommand = (command: Command | undefined): void => {
    if (!command) return
    close()
    void command.run()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runCommand(results[activeIndex])
    }
  }

  let lastGroup: CommandGroup | null = null

  return (
    <div
      className="fixed inset-0 z-[9995] flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[12vh] px-4"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
        style={prefersReducedMotion() ? undefined : { animation: 'dialogIn 0.15s ease-out' }}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-800">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a slide, run a command, switch theme…"
            aria-label="Search commands and slides"
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 focus:outline-none"
          />
          <kbd className="text-[11px] font-mono text-gray-400 border border-gray-700 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto py-1" role="listbox" aria-label="Results">
          {results.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">No matching command.</p>
          )}
          {results.map((command, index) => {
            const showGroup = command.group !== lastGroup
            lastGroup = command.group
            const active = index === activeIndex
            return (
              <div key={command.id}>
                {showGroup && (
                  <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                    {command.group}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => runCommand(command)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors ${
                    active ? 'bg-gray-800 text-white' : 'text-gray-200 hover:bg-gray-800/60'
                  }`}
                >
                  <span className="flex-1 min-w-0 truncate">{command.title}</span>
                  {command.hint && <kbd className="text-[11px] font-mono text-gray-400">{command.hint}</kbd>}
                </button>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-[11px] text-gray-400">
          <span>↑↓ to move</span>
          <span>⏎ to run</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { usePresentationStore } from '../stores/presentation-store'
import { useUIStore } from '../stores/ui-store'

/** Selector for anything that owns its own text editing (and therefore its own undo stack). */
const EDITABLE_SELECTOR = '.ProseMirror, [contenteditable="true"], .monaco-editor, input, textarea, select'

/** True when the event originated inside an editor or form control. */
export function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || !!target.closest(EDITABLE_SELECTOR)
}

/**
 * When a binding applies:
 * - `always`     — anywhere in the app, deck open or not
 * - `deck`       — only with a presentation loaded
 * - `presenting` — only while presenting
 */
export type ShortcutScope = 'always' | 'deck' | 'presenting'

export interface Shortcut {
  /**
   * Canonical key spec: `Mod` means ⌘ on macOS and Ctrl elsewhere. Examples:
   * `Mod+K`, `Shift+N`, `ArrowLeft`, `F5`, `?`.
   */
  keys: string
  /** Human label, shown in the shortcuts overlay, the Help page and the palette. */
  label: string
  when: ShortcutScope
  /** Group heading in the shortcuts overlay. */
  group: 'Navigate' | 'Present' | 'Edit' | 'App'
  /**
   * What the binding does. Omitted for shortcuts owned by another component
   * (they are listed for the user but bound elsewhere) — see `ownedElsewhere`.
   */
  run?: () => void
  /** Fire even when focus is inside a text editor. */
  allowWhileTyping?: boolean
  /** Documented here but bound by the component that owns the behaviour. */
  ownedElsewhere?: boolean
}

const presentation = () => usePresentationStore.getState()
const ui = () => useUIStore.getState()

/**
 * The single source of truth for every keyboard binding. The handler below, the
 * `?` shortcuts overlay, the command palette and the Help page all read this
 * table, so the documentation cannot drift from the behaviour again.
 */
export const SHORTCUTS: Shortcut[] = [
  {
    keys: 'ArrowLeft',
    label: 'Previous slide',
    when: 'deck',
    group: 'Navigate',
    run: () => presentation().prevSlide()
  },
  {
    keys: 'ArrowRight',
    label: 'Next slide',
    when: 'deck',
    group: 'Navigate',
    run: () => presentation().nextSlide()
  },
  {
    keys: 'Mod+K',
    label: 'Command palette',
    when: 'always',
    group: 'App',
    allowWhileTyping: true,
    run: () => ui().toggleCommandPalette()
  },
  {
    keys: '?',
    label: 'Keyboard shortcuts',
    when: 'always',
    group: 'App',
    run: () => ui().toggleShortcuts()
  },
  {
    keys: 'F5',
    label: 'Start presenting',
    when: 'deck',
    group: 'Present',
    allowWhileTyping: true,
    run: () => ui().togglePresenting()
  },
  {
    keys: 'Escape',
    label: 'Exit presenting',
    when: 'presenting',
    group: 'Present',
    allowWhileTyping: true,
    run: () => ui().endPresentation()
  },
  {
    keys: 'Shift+S',
    label: 'Toggle speaker notes',
    when: 'deck',
    group: 'Present',
    run: () => ui().toggleNotes()
  },
  {
    keys: 'Shift+N',
    label: 'Add a slide',
    when: 'deck',
    group: 'Edit',
    run: () => {
      const { addSlide, slides } = presentation()
      addSlide(`slide-${slides.length + 1}`)
    }
  },
  {
    keys: 'Mod+S',
    label: 'Save the current slide',
    when: 'deck',
    group: 'Edit',
    allowWhileTyping: true,
    run: () => {
      const { currentSlideIndex, saveSlideContent, hasUnsavedChanges } = presentation()
      if (hasUnsavedChanges) saveSlideContent(currentSlideIndex)
    }
  },
  {
    keys: 'Mod+Z',
    label: 'Undo slide edit',
    when: 'deck',
    group: 'Edit',
    run: () => presentation().undo()
  },
  {
    keys: 'Mod+Shift+Z',
    label: 'Redo slide edit',
    when: 'deck',
    group: 'Edit',
    run: () => presentation().redo()
  },
  {
    keys: 'Mod+Enter',
    label: 'Run the slide code',
    when: 'deck',
    group: 'Edit',
    allowWhileTyping: true,
    // Bound by useCodeExecution, which owns the runtime.
    ownedElsewhere: true
  },
  {
    keys: 'Mod+/',
    label: 'Toggle the AI chat',
    when: 'always',
    group: 'App',
    allowWhileTyping: true,
    run: () => {
      void import('../stores/chat-store').then(({ useChatStore }) => {
        useChatStore.getState().toggleSidebar()
      })
    }
  }
]

const IS_MAC = typeof navigator !== 'undefined' && /mac|darwin/i.test(navigator.platform || navigator.userAgent || '')

const KEY_GLYPHS: Record<string, string> = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  enter: '⏎',
  escape: 'Esc',
  shift: '⇧'
}

/** Render a key spec for display, using the platform's modifier glyphs. */
export function formatKeys(spec: string): string {
  return spec
    .split('+')
    .map((part) => {
      const lower = part.toLowerCase()
      if (lower === 'mod') return IS_MAC ? '⌘' : 'Ctrl'
      if (lower === 'shift') return IS_MAC ? '⇧' : 'Shift'
      if (lower === 'alt') return IS_MAC ? '⌥' : 'Alt'
      return KEY_GLYPHS[lower] ?? (part.length === 1 ? part.toUpperCase() : part)
    })
    .join(IS_MAC ? ' ' : ' + ')
}

/** Does this keyboard event match the binding's key spec? */
export function matchesKeys(spec: string, e: KeyboardEvent): boolean {
  const parts = spec.split('+')
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase())
  const wantMod = mods.includes('mod')
  const wantShift = mods.includes('shift')
  const wantAlt = mods.includes('alt')

  if (wantMod !== (e.metaKey || e.ctrlKey)) return false
  if (wantAlt !== e.altKey) return false
  // Shift is only checked for keys where it changes nothing about the character
  // produced: `?` and `/` share a physical key on most layouts.
  const shiftMatters = /^[a-z0-9]$/i.test(key) || key.length > 1
  if (shiftMatters && wantShift !== e.shiftKey) return false

  return e.key.toLowerCase() === key.toLowerCase()
}

/** Is this binding available right now? */
export function isShortcutActive(shortcut: Shortcut): boolean {
  if (shortcut.when === 'deck') return usePresentationStore.getState().slides.length > 0
  if (shortcut.when === 'presenting') return useUIStore.getState().isPresenting
  return true
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const typing = isEditingTarget(e.target)
      // While the palette or the shortcut sheet is up, only app-level bindings run —
      // arrow keys must not walk the deck behind an open overlay.
      const { showCommandPalette, showShortcuts } = useUIStore.getState()
      const overlayOpen = showCommandPalette || showShortcuts

      for (const shortcut of SHORTCUTS) {
        if (shortcut.ownedElsewhere || !shortcut.run) continue
        if (!matchesKeys(shortcut.keys, e)) continue
        if (typing && !shortcut.allowWhileTyping) continue
        if (overlayOpen && shortcut.when !== 'always') continue
        if (!isShortcutActive(shortcut)) continue
        e.preventDefault()
        shortcut.run()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}

import { useEffect } from 'react'
import { usePresentationStore } from '../stores/presentation-store'
import { useUIStore } from '../stores/ui-store'

/** Selector for anything that owns its own text editing (and therefore its own undo stack). */
const EDITABLE_SELECTOR = '.ProseMirror, [contenteditable="true"], .monaco-editor, input, textarea, select'

/** True when the event originated inside an editor or form control. */
function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || !!target.closest(EDITABLE_SELECTOR)
}

export function useKeyboardShortcuts(): void {
  const { nextSlide, prevSlide } = usePresentationStore()
  const { togglePresenting, endPresentation, toggleNotes } = useUIStore()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const editing = isEditingTarget(e.target)

      // Cmd+/ or Ctrl+/ — toggle chat agent (works everywhere)
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        import('../stores/chat-store').then(({ useChatStore }) => {
          useChatStore.getState().toggleSidebar()
        })
        return
      }

      // Cmd+Z / Cmd+Shift+Z — store-level undo/redo.
      // Never while an editor has focus: Monaco and Tiptap own their own history, and running
      // both would replace the whole slide behind the user's cursor.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        if (editing) return
        e.preventDefault()
        if (e.shiftKey) usePresentationStore.getState().redo()
        else usePresentationStore.getState().undo()
        return
      }

      // Cmd+S / Ctrl+S — save current slide (works everywhere, including editors)
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const { currentSlideIndex, saveSlideContent, hasUnsavedChanges } = usePresentationStore.getState()
        if (hasUnsavedChanges) {
          saveSlideContent(currentSlideIndex)
        }
        return
      }

      // Everything below is a bare key — never steal it from a text editor,
      // except Cmd/Ctrl+Enter, which runs the slide's code.
      if (editing && !((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
        return
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          prevSlide()
          break
        case 'ArrowRight':
          e.preventDefault()
          nextSlide()
          break
        case 'F5':
          e.preventDefault()
          togglePresenting()
          break
        case 'Escape':
          e.preventDefault()
          // Single exit path: also closes the audience window and restores the theme
          endPresentation()
          break
        case 'N':
          if (e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            const { addSlide, slides } = usePresentationStore.getState()
            addSlide(`slide-${slides.length + 1}`)
          }
          break
        case 'S':
          if (e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            toggleNotes()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextSlide, prevSlide, togglePresenting, endPresentation, toggleNotes])
}

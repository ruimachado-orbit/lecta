import { useEffect } from 'react'
import { usePresentationStore } from '../stores/presentation-store'
import { useUIStore } from '../stores/ui-store'

export function useKeyboardShortcuts(): void {
  const { nextSlide, prevSlide } = usePresentationStore()
  const { togglePresenting, setPresenting, toggleNotes } = useUIStore()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Don't capture shortcuts when typing in an input or the Monaco editor
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.closest('.monaco-editor')
      ) {
        // Allow Cmd+Enter even in Monaco (to run code)
        if (!(e.metaKey && e.key === 'Enter') && !(e.ctrlKey && e.key === 'Enter')) {
          return
        }
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
          setPresenting(false)
          window.electronAPI.closeAudienceWindow()
          // Restore user's theme
          { const t = useUIStore.getState().theme; document.documentElement.setAttribute('data-theme', t) }
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
  }, [nextSlide, prevSlide, togglePresenting, setPresenting, toggleNotes])
}

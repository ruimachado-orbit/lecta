import { useEffect, useRef, type RefObject } from 'react'

/**
 * Shared behaviour for every modal and popover in the app: focus trap, Escape,
 * click-outside, focus restore and reduced-motion awareness.
 *
 * A module-level stack keeps nested overlays honest — only the topmost one reacts
 * to Escape or to an outside click, so closing a picker inside a dialog does not
 * also close the dialog.
 */

const overlayStack: symbol[] = []

/** True when the OS asks for reduced motion. Safe to call outside a browser. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  )
}

export interface OverlayOptions {
  open: boolean
  onClose: () => void
  /** Keep Tab inside the overlay (modals) instead of letting it walk the page (popovers). */
  trapFocus?: boolean
  /** Move focus into the overlay when it opens. Default true. */
  autoFocus?: boolean
  /** Close when a pointer press lands outside the overlay. Default true. */
  closeOnOutsideClick?: boolean
}

/**
 * Wire an overlay element up to the shared behaviour. `ref` must point at the
 * element that contains every part of the overlay the user can interact with.
 */
export function useOverlay(
  ref: RefObject<HTMLElement | null>,
  { open, onClose, trapFocus = false, autoFocus = true, closeOnOutsideClick = true }: OverlayOptions
): void {
  // Keep the latest onClose without re-running the effect on every render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const id = Symbol('overlay')
    overlayStack.push(id)
    const isTopmost = (): boolean => overlayStack[overlayStack.length - 1] === id

    const previouslyFocused = document.activeElement as HTMLElement | null
    let focusFrame: number | null = null

    if (autoFocus) {
      // Wait a frame so the overlay content is in the DOM before we reach for it.
      focusFrame = requestAnimationFrame(() => {
        focusFrame = null
        const container = ref.current
        if (!container || container.contains(document.activeElement)) return
        const first = focusableIn(container)[0]
        if (first) {
          first.focus()
        } else {
          container.tabIndex = -1
          container.focus()
        }
      })
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isTopmost()) return
      if (e.key === 'Escape') {
        e.preventDefault()
        // Never let Escape also reach the global handler (which ends a presentation).
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab' && trapFocus) {
        const container = ref.current
        if (!container) return
        const items = focusableIn(container)
        if (items.length === 0) {
          e.preventDefault()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey && (active === first || !container.contains(active))) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    const onPointerDown = (e: MouseEvent): void => {
      if (!closeOnOutsideClick || !isTopmost()) return
      const container = ref.current
      if (!container) return
      if (!container.contains(e.target as Node)) {
        onCloseRef.current()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown, true)
      if (focusFrame !== null) cancelAnimationFrame(focusFrame)
      const idx = overlayStack.lastIndexOf(id)
      if (idx !== -1) overlayStack.splice(idx, 1)
      // Restore focus to whatever opened us, when that element is still around.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [open, trapFocus, autoFocus, closeOnOutsideClick, ref])
}

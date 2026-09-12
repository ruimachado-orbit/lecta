import { useId, useRef, type ReactNode } from 'react'
import { useOverlay, prefersReducedMotion } from './overlay'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  /** Accessible name for the popover surface. */
  label: string
  /** Horizontal edge the panel is pinned to, relative to its trigger. */
  align?: 'left' | 'right'
  /** Vertical side: below the trigger (default) or above it. */
  side?: 'bottom' | 'top' | 'left-of'
  widthClass?: string
  /**
   * Render children without the popover's own panel chrome or positioning — for
   * panels that already position and style themselves. They still get Escape,
   * click-outside, focus management and focus restore.
   */
  bare?: boolean
  children: ReactNode
}

/**
 * A popover anchored to the element that opened it. Put it inside a
 * `position: relative` wrapper next to its trigger button.
 *
 * Shares all of `Dialog`'s behaviour except the focus trap: Tab may leave a
 * popover, which is what non-modal surfaces are supposed to do.
 */
export function Popover({
  open,
  onClose,
  label,
  align = 'right',
  side = 'bottom',
  widthClass = 'w-56',
  bare = false,
  children
}: PopoverProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const labelId = useId()

  useOverlay(panelRef, { open, onClose, trapFocus: false })

  if (!open) return null

  if (bare) {
    // `display: contents` keeps the wrapper out of layout, so the child's own
    // absolute positioning still resolves against the trigger's wrapper.
    return (
      <div ref={panelRef} style={{ display: 'contents' }}>
        {children}
      </div>
    )
  }

  const position = [
    side === 'bottom' ? 'top-full mt-1' : side === 'top' ? 'bottom-full mb-1' : 'top-0 mr-2',
    side === 'left-of' ? 'right-full' : align === 'right' ? 'right-0' : 'left-0'
  ].join(' ')

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      aria-labelledby={labelId}
      className={`absolute ${position} z-[9980] ${widthClass} bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden`}
      style={{
        ...(prefersReducedMotion() ? {} : { animation: 'popoverIn 0.12s ease-out' }),
        WebkitAppRegion: 'no-drag'
      } as React.CSSProperties}
    >
      <span id={labelId} className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/** Section heading inside a popover menu. */
export function MenuLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-gray-400 font-medium">
      {children}
    </div>
  )
}

/** A single row in a popover menu. Always has a visible text label. */
export function MenuItem({
  onClick,
  icon,
  children,
  hint,
  active = false,
  disabled = false
}: {
  onClick: () => void
  icon?: ReactNode
  children: ReactNode
  hint?: string
  active?: boolean
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? 'bg-gray-800 text-white' : 'text-gray-200 hover:bg-gray-800 hover:text-white'
      }`}
    >
      {icon && <span className="w-4 h-4 flex-shrink-0 text-gray-400" aria-hidden="true">{icon}</span>}
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {hint && <kbd className="text-[11px] font-mono text-gray-400">{hint}</kbd>}
    </button>
  )
}

/** Thin rule between groups of menu items. */
export function MenuSeparator(): JSX.Element {
  return <div className="h-px bg-gray-800 my-1" role="separator" />
}

import { useId, useRef, type ReactNode } from 'react'
import { useOverlay, prefersReducedMotion } from './overlay'

export interface DialogProps {
  open: boolean
  onClose: () => void
  /** Accessible name. Rendered as the dialog title unless `hideTitle` is set. */
  title: string
  hideTitle?: boolean
  /** Optional line under the title. */
  description?: string
  /** Right-hand side of the header (secondary actions). */
  headerAction?: ReactNode
  /** Footer row, usually the primary/secondary buttons. */
  footer?: ReactNode
  /** Tailwind width class for the panel. */
  widthClass?: string
  /** Set false for destructive flows where a stray click must not dismiss. */
  dismissOnBackdrop?: boolean
  children?: ReactNode
}

/**
 * The one modal in the app: `role="dialog"`, `aria-modal`, focus trap, Escape to
 * close, click-outside to close, focus restored to the opener, and no entry
 * animation when the OS asks for reduced motion.
 */
export function Dialog({
  open,
  onClose,
  title,
  hideTitle = false,
  description,
  headerAction,
  footer,
  widthClass = 'max-w-md',
  dismissOnBackdrop = true,
  children
}: DialogProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useOverlay(panelRef, {
    open,
    onClose,
    trapFocus: true,
    closeOnOutsideClick: dismissOnBackdrop
  })

  if (!open) return null

  const reduced = prefersReducedMotion()

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={`w-full ${widthClass} bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[85vh]`}
        style={reduced ? undefined : { animation: 'dialogIn 0.15s ease-out' }}
      >
        <div className={`flex items-start gap-3 px-5 py-3.5 ${hideTitle ? 'sr-only' : 'border-b border-gray-800'}`}>
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-white">{title}</h2>
            {description && (
              <p id={descId} className="text-xs text-gray-400 mt-0.5">{description}</p>
            )}
          </div>
          {headerAction}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            title="Close"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">{children}</div>

        {footer && (
          <div className="px-5 py-3 border-t border-gray-800 flex items-center gap-2 justify-end flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Confirmation dialog built on `Dialog` — used before anything destructive. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
}): JSX.Element | null {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      widthClass="max-w-sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              destructive ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-white hover:bg-gray-200 text-black'
            }`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="px-5 py-4 text-sm text-gray-300">{message}</p>
    </Dialog>
  )
}

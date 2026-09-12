import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface KbdProps {
  children: ReactNode
  className?: string
}

/** A keyboard-key cap for shortcuts. */
export function Kbd({ children, className }: KbdProps): JSX.Element {
  return (
    <kbd
      className={cx(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-ink-600',
        'bg-ink-800 px-1.5 font-mono text-[11px] font-medium text-ink-300',
        'shadow-[0_1.5px_0_0_var(--color-ink-600)]',
        className
      )}
    >
      {children}
    </kbd>
  )
}

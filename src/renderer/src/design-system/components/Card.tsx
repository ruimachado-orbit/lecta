import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface CardProps {
  children: ReactNode
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  footer?: ReactNode
  interactive?: boolean
  className?: string
}

/** A raised, layered card with optional header + footer. */
export function Card({
  children,
  title,
  description,
  icon,
  footer,
  interactive = false,
  className
}: CardProps): JSX.Element {
  return (
    <div
      className={cx(
        'card overflow-hidden',
        interactive &&
          'transition-[transform,border-color,box-shadow] duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-ink-500 hover:shadow-3',
        className
      )}
    >
      {(title || description || icon) && (
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          {icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-700/60 text-signal-400">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink-50">{title}</h3>}
            {description && <p className="mt-1 text-sm leading-relaxed text-ink-300">{description}</p>}
          </div>
        </div>
      )}
      <div className={cx('px-5 pb-5', title || description || icon ? 'pt-1' : 'p-5')}>{children}</div>
      {footer && <div className="hairline" />}
      {footer && <div className="flex items-center gap-2 px-5 py-3.5">{footer}</div>}
    </div>
  )
}

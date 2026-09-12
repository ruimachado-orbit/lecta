import type { InputHTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  icon?: ReactNode
  leading?: ReactNode
}

/** A labelled text field with hint/error states and optional adornments. */
export function Input({ label, hint, error, icon, leading, className, id, ...rest }: InputProps): JSX.Element {
  return (
    <div className={cx('w-full', className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-200">
          {label}
        </label>
      )}
      <div
        className={cx(
          'flex h-10 items-center gap-2 rounded-xl border bg-ink-900/70 px-3 transition-colors duration-150',
          'focus-within:border-signal-500 focus-within:shadow-glow',
          error ? 'border-danger/50' : 'border-ink-600 hover:border-ink-500'
        )}
      >
        {icon && <span className="text-ink-400">{icon}</span>}
        {leading && <span className="text-ink-400">{leading}</span>}
        <input
          id={id}
          className={cx(
            'h-full w-full min-w-0 bg-transparent text-sm text-ink-50 placeholder:text-ink-400',
            'focus:outline-none'
          )}
          {...rest}
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-[12px] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}

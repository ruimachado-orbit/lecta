import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  size?: 'sm' | 'md'
  className?: string
}

/** A pill-style segmented control with a sliding active indicator. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className
}: SegmentedControlProps<T>): JSX.Element {
  return (
    <div
      role="tablist"
      className={cx(
        'inline-flex items-center gap-0.5 rounded-xl border border-ink-600 bg-ink-900/70 p-0.5',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cx(
              'inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-all duration-150 ease-out-soft',
              size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
              active
                ? 'bg-ink-50 text-ink-950 shadow-1'
                : 'text-ink-300 hover:text-ink-50'
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

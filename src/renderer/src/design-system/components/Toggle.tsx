import { cx } from '../lib/cx'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

/** A switch with an animated, signal-colored thumb. */
export function Toggle({ checked, onChange, label, description, disabled, size = 'md' }: ToggleProps): JSX.Element {
  const isSm = size === 'sm'

  return (
    <label className={cx('group inline-flex items-center gap-3', disabled ? 'opacity-45' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200 ease-out-soft',
          isSm ? 'h-5 w-9' : 'h-6 w-11',
          checked ? 'border-signal-500/60 bg-signal-500/20' : 'border-ink-600 bg-ink-800'
        )}
      >
        <span
          className={cx(
            'inline-block rounded-full shadow transition-transform duration-200 ease-out-soft',
            isSm ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]',
            checked
              ? isSm
                ? 'translate-x-[19px] bg-signal-400'
                : 'translate-x-[23px] bg-signal-400'
              : 'translate-x-[3px] bg-ink-300'
          )}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-ink-50">{label}</span>}
          {description && <span className="block text-[13px] text-ink-400">{description}</span>}
        </span>
      )}
    </label>
  )
}

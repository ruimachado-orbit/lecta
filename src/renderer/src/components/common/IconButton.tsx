import type { ReactNode } from 'react'

/**
 * An icon-only control that cannot ship without an accessible name: `label`
 * becomes both the tooltip and the `aria-label`. Pass `showLabel` to render the
 * text next to the icon as well.
 */
export function IconButton({
  label,
  onClick,
  children,
  active = false,
  disabled = false,
  showLabel = false,
  tone = 'default',
  className = ''
}: {
  label: string
  onClick: () => void
  children: ReactNode
  active?: boolean
  disabled?: boolean
  showLabel?: boolean
  tone?: 'default' | 'primary' | 'danger'
  className?: string
}): JSX.Element {
  const toneClass =
    tone === 'primary'
      ? 'bg-signal-500 hover:bg-signal-400 text-ink-950 font-semibold'
      : tone === 'danger'
        ? 'bg-red-600 hover:bg-red-500 text-white'
        : active
          ? 'bg-gray-700 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={tone === 'default' ? active : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed ${toneClass} ${className}`}
    >
      {children}
      {showLabel && <span className="text-sm font-medium">{label}</span>}
    </button>
  )
}

/** Trigger for a `Popover` menu: always shows its text label plus a chevron. */
export function MenuTrigger({
  label,
  open,
  onClick,
  icon,
  disabled = false
}: {
  label: string
  open: boolean
  onClick: () => void
  icon?: ReactNode
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup="menu"
      aria-expanded={open}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed ${
                    open ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
    >
      {icon}
      <span>{label}</span>
      <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>
    </button>
  )
}

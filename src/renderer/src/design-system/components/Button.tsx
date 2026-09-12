import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx'

export type ButtonVariant = 'signal' | 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  signal:
    'bg-signal-500 text-ink-950 hover:bg-signal-400 shadow-glow font-semibold',
  primary:
    'bg-ink-50 text-ink-950 hover:bg-white font-semibold',
  secondary:
    'bg-ink-700/70 text-ink-100 border border-ink-600 hover:bg-ink-600 hover:border-ink-500',
  ghost:
    'text-ink-200 hover:bg-ink-700/60 hover:text-ink-50',
  danger:
    'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25'
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  isLoading?: boolean
  fullWidth?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  isLoading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      className={cx(
        'inline-flex items-center justify-center font-medium tracking-[-0.01em]',
        'transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out-soft',
        'active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none',
        'select-none whitespace-nowrap',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {isLoading ? <Spinner /> : icon}
      {children}
      {iconRight}
    </button>
  )
}

export function Spinner({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={cx('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

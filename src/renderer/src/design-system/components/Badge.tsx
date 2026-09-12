import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

export type BadgeTone = 'neutral' | 'signal' | 'ice' | 'success' | 'warning' | 'danger'
export type BadgeSize = 'sm' | 'md'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-700/70 text-ink-200 border-ink-600',
  signal: 'bg-signal-500/12 text-signal-400 border-signal-500/30',
  ice: 'bg-ice-500/12 text-ice-300 border-ice-500/30',
  success: 'bg-success/12 text-success border-success/30',
  warning: 'bg-warning/12 text-warning border-warning/30',
  danger: 'bg-danger/12 text-danger border-danger/30'
}

const SIZES: Record<BadgeSize, string> = {
  sm: 'h-5 px-2 text-[11px] gap-1 rounded-full',
  md: 'h-6 px-2.5 text-xs gap-1.5 rounded-full'
}

export interface BadgeProps {
  tone?: BadgeTone
  size?: BadgeSize
  icon?: ReactNode
  children: ReactNode
  className?: string
}

/** A pill for status, tags, counts and metadata. */
export function Badge({ tone = 'neutral', size = 'md', icon, children, className }: BadgeProps): JSX.Element {
  return (
    <span
      className={cx(
        'inline-flex items-center font-medium border leading-none whitespace-nowrap',
        TONES[tone],
        SIZES[size],
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}

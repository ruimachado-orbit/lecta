/**
 * Visual presets shared by every renderer of a pinned element.
 *
 * The surfaces are expressed purely in theme tokens (`--slide-glass-*`, `--slide-surface`,
 * `--slide-shadow-color`) so a "liquid glass" element reads correctly on a light theme and
 * on a dark one without the element itself knowing which is in play.
 */
import type { CSSProperties } from 'react'
import type { ElementShadow, ElementStyle } from './element-model'

/** Corner radius a style preset applies when the element does not set its own. */
export const STYLE_RADIUS: Record<ElementStyle, number> = { none: 0, glass: 20, card: 16, frame: 14 }

/** Outer shadow for each `shadow=` value; the preset supplies one when the element does not. */
const SHADOW_CSS: Record<ElementShadow, string | undefined> = {
  none: undefined,
  soft: '0 18px 40px -12px var(--slide-shadow-color)',
  hard: '0 10px 20px -4px var(--slide-shadow-color), 0 2px 6px -1px var(--slide-shadow-color)',
}

const STYLE_DEFAULT_SHADOW: Record<ElementStyle, ElementShadow> = {
  none: 'none',
  glass: 'soft',
  card: 'soft',
  frame: 'none',
}

/** The 1px inner highlight along the top edge that makes glass read as glass. */
const GLASS_HIGHLIGHT = 'inset 0 1px 0 0 var(--slide-glass-border)'

export interface SurfaceOptions {
  /** Explicit `radius=` from the element, if any. */
  radius?: number
  /** Explicit `shadow=` from the element, if any. */
  shadow?: ElementShadow
}

/** Radius actually applied: the element's own, else the preset's. */
export function effectiveRadius(style: ElementStyle | undefined, radius?: number): number {
  if (radius !== undefined) return radius
  return STYLE_RADIUS[style ?? 'none']
}

/**
 * The surface (background / border / shadow) a style preset paints *behind* an element.
 * `none` still honours an explicit `shadow=`, so shadows work without a preset.
 */
export function surfaceStyle(style: ElementStyle | undefined, opts: SurfaceOptions = {}): CSSProperties {
  const preset = style ?? 'none'
  const radius = effectiveRadius(preset, opts.radius)
  const shadowKind = opts.shadow ?? STYLE_DEFAULT_SHADOW[preset]
  const outer = SHADOW_CSS[shadowKind]

  const base: CSSProperties = {}
  if (radius) base.borderRadius = radius

  switch (preset) {
    case 'glass':
      return {
        ...base,
        background: 'var(--slide-glass-bg)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        border: '1px solid var(--slide-glass-border)',
        boxShadow: [GLASS_HIGHLIGHT, outer].filter(Boolean).join(', '),
      }
    case 'card':
      return {
        ...base,
        background: 'var(--slide-surface)',
        border: '1px solid var(--slide-glass-border)',
        boxShadow: outer,
      }
    case 'frame':
      return {
        ...base,
        border: '2px solid var(--slide-glass-border)',
        boxShadow: outer,
      }
    default:
      return { ...base, boxShadow: outer }
  }
}

/** Inner padding a style preset adds so content does not touch the surface edge. */
export function surfacePadding(style: ElementStyle | undefined): number {
  return style && style !== 'none' ? 16 : 0
}

/* ── Slide backgrounds ───────────────────────────────────────────────── */

export interface GradientPreset {
  id: string
  label: string
  css: string
}

/**
 * Six gradients that all read well behind translucent surfaces — a glass element on a flat
 * background is invisible, so the picker always has something to offer.
 */
export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  { id: 'aurora', label: 'Aurora', css: 'linear-gradient(135deg, #4c1d95 0%, #1e3a8a 50%, #0f172a 100%)' },
  { id: 'ember', label: 'Ember', css: 'linear-gradient(135deg, #7c2d12 0%, #b91c1c 45%, #1c1917 100%)' },
  { id: 'mint', label: 'Mint', css: 'linear-gradient(135deg, #ecfdf5 0%, #a7f3d0 50%, #6ee7b7 100%)' },
  { id: 'dusk', label: 'Dusk', css: 'linear-gradient(160deg, #0f172a 0%, #334155 55%, #64748b 100%)' },
  { id: 'blush', label: 'Blush', css: 'linear-gradient(135deg, #fdf2f8 0%, #fbcfe8 50%, #c4b5fd 100%)' },
  { id: 'ocean', label: 'Ocean', css: 'linear-gradient(135deg, #082f49 0%, #0e7490 55%, #22d3ee 100%)' },
]

/** Suggested when glass is applied to a slide that has no background of its own. */
export const SUGGESTED_GLASS_GRADIENT = GRADIENT_PRESETS[0]

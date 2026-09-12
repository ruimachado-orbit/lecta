/**
 * Floating inspector for the pinned element selected on the slide canvas.
 *
 * It is a portal onto `document.body` rather than a child of the canvas: the canvas is
 * CSS-scaled to fit its container, and a panel inside it would be scaled (and clipped)
 * with the slide. Every edit goes straight through the element model to the full slide
 * markdown, so there is no local draft state to keep in sync.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ELEMENT_STYLES,
  type AlignTarget,
  type Bounds,
  type ElementShadow,
  type SlideElement,
} from './element-model'
import { SUGGESTED_GLASS_GRADIENT, effectiveRadius } from './style-presets'
import { imageStyle } from './PinnedElements'

export interface InspectorProps {
  el: SlideElement
  bounds: Bounds
  /** Whether the width/height inputs keep the current ratio. */
  aspectLock: boolean
  onAspectLock: (on: boolean) => void
  onChange: (patch: Record<string, unknown>) => void
  onAlign: (target: AlignTarget) => void
  onZ: (direction: 'forward' | 'backward') => void
  onDelete: () => void
  onClose: () => void
  /** True when the slide has no backdrop, so a glass element would have nothing behind it. */
  glassNeedsBackground: boolean
  /** Apply the suggested gradient backdrop to the slide. */
  onAddSuggestedBackground: () => void
}

const ALIGNMENTS: { target: AlignTarget; label: string; icon: string }[] = [
  { target: 'left', label: 'Align left', icon: 'M3 3v18M7 7h10v3H7zM7 14h6v3H7z' },
  { target: 'center', label: 'Align centre', icon: 'M12 3v18M7 7h10v3H7zM9 14h6v3H9z' },
  { target: 'right', label: 'Align right', icon: 'M21 3v18M7 7h10v3H7zM11 14h6v3h-6z' },
  { target: 'top', label: 'Align top', icon: 'M3 3h18M7 7h3v10H7zM14 7h3v6h-3z' },
  { target: 'middle', label: 'Align middle', icon: 'M3 12h18M7 7h3v10H7zM14 9h3v6h-3z' },
  { target: 'bottom', label: 'Align bottom', icon: 'M3 21h18M7 7h3v10H7zM14 11h3v6h-3z' },
]

const SHADOWS: ElementShadow[] = ['none', 'soft', 'hard']

export function Inspector(props: InspectorProps): JSX.Element | null {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(<InspectorPanel {...props} />, document.body)
}

function InspectorPanel({
  el,
  bounds,
  aspectLock,
  onAspectLock,
  onChange,
  onAlign,
  onZ,
  onDelete,
  onClose,
  glassNeedsBackground,
  onAddSuggestedBackground,
}: InspectorProps): JSX.Element {
  const isText = el.kind === 'textbox'
  const ratio = bounds.h > 0 ? bounds.w / bounds.h : 1

  const setSize = (dim: 'w' | 'h', value: number) => {
    if (isText) return onChange({ w: Math.max(40, value) })
    const next = Math.max(8, value)
    if (!aspectLock) return onChange({ [dim]: next })
    return dim === 'w'
      ? onChange({ w: next, h: Math.round(next / (ratio || 1)) })
      : onChange({ h: next, w: Math.round(next * (ratio || 1)) })
  }

  return (
    <aside
      className="fixed right-3 top-20 z-[1000] w-60 rounded-xl border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur text-gray-300"
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="Element inspector"
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {el.kind === 'textbox' ? 'Text box' : el.kind === 'image' ? 'Image' : `Shape · ${el.shape}`}
        </span>
        <button onClick={onClose} title="Close inspector" aria-label="Close inspector"
          className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800">
          <Icon d="M6 18 18 6M6 6l12 12" />
        </button>
      </header>

      <div className="p-3 space-y-3 max-h-[calc(100vh-8rem)] overflow-y-auto">
        <Section label="Position">
          <div className="grid grid-cols-2 gap-2">
            <NumField label="X" value={Math.round(el.x)} onChange={(v) => onChange({ x: v })} />
            <NumField label="Y" value={Math.round(el.y)} onChange={(v) => onChange({ y: v })} />
          </div>
        </Section>

        <Section
          label="Size"
          action={
            <button
              onClick={() => onAspectLock(!aspectLock)}
              title={aspectLock ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              aria-label={aspectLock ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              className={`w-5 h-5 rounded flex items-center justify-center ${aspectLock ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`}
            >
              <Icon d={aspectLock ? 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75M3.75 21.75h16.5a.75.75 0 0 0 .75-.75V11.25a.75.75 0 0 0-.75-.75H3.75a.75.75 0 0 0-.75.75V21a.75.75 0 0 0 .75.75Z' : 'M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a.75.75 0 0 0 .75-.75V11.25a.75.75 0 0 0-.75-.75H3.75a.75.75 0 0 0-.75.75V21a.75.75 0 0 0 .75.75Z'} />
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <NumField label="W" value={Math.round(bounds.w)} onChange={(v) => setSize('w', v)} />
            <NumField label="H" value={Math.round(bounds.h)} onChange={(v) => setSize('h', v)} disabled={isText} />
          </div>
        </Section>

        <Section label="Style">
          <div className="grid grid-cols-4 gap-1">
            {ELEMENT_STYLES.map((s) => (
              <Chip
                key={s}
                // Images render glass unless overridden — show the effective style as active.
                active={(el.style ?? (el.kind === 'image' ? 'glass' : 'none')) === s}
                // For images 'None' must be explicit: `undefined` means glass.
                onClick={() => onChange({ style: s === 'none' && el.kind !== 'image' ? undefined : s })}
                label={s === 'none' ? 'None' : s[0].toUpperCase() + s.slice(1)}
              />
            ))}
          </div>
          {(el.style ?? (el.kind === 'image' ? 'glass' : 'none')) === 'glass' && glassNeedsBackground && (
            <button
              onClick={onAddSuggestedBackground}
              className="mt-2 w-full text-left text-[10px] leading-snug rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-200 hover:bg-amber-500/20 transition-colors"
            >
              Glass needs something behind it — add the “{SUGGESTED_GLASS_GRADIENT.label}” background to this slide.
            </button>
          )}
        </Section>

        {el.kind !== 'textbox' && (
          <>
            {el.kind === 'image' && (
              <Section label="Fit">
                <div className="grid grid-cols-3 gap-1">
                  {(['auto', 'cover', 'contain'] as const).map((f) => (
                    <Chip
                      key={f}
                      active={(el.fit ?? 'auto') === f}
                      onClick={() => onChange({ fit: f === 'auto' ? undefined : f })}
                      label={f[0].toUpperCase() + f.slice(1)}
                    />
                  ))}
                </div>
              </Section>
            )}

            <Section label={`Radius · ${el.kind === 'image' && el.radius === undefined ? `${effectiveRadius(imageStyle(el))}px (glass default)` : `${el.radius ?? 0}px`}`}>
              <Slider min={0} max={64} value={el.radius ?? effectiveRadius(el.kind === 'image' ? imageStyle(el) : el.style)} onChange={(v) => onChange({ radius: v || undefined })} />
            </Section>

            <Section label={`Opacity · ${el.opacity ?? 100}%`}>
              <Slider min={0} max={100} value={el.opacity ?? 100} onChange={(v) => onChange({ opacity: v === 100 ? undefined : v })} />
            </Section>

            <Section label={`Rotation · ${el.rotate ?? 0}°`}>
              <Slider min={-180} max={180} value={el.rotate ?? 0} onChange={(v) => onChange({ rotate: v || undefined })} />
            </Section>

            <Section label="Shadow">
              <div className="grid grid-cols-3 gap-1">
                {SHADOWS.map((s) => (
                  <Chip key={s} active={(el.shadow ?? 'none') === s} onClick={() => onChange({ shadow: s === 'none' ? undefined : s })} label={s[0].toUpperCase() + s.slice(1)} />
                ))}
              </div>
            </Section>

            <Section label="Order">
              <div className="grid grid-cols-2 gap-1">
                <Chip onClick={() => onZ('backward')} label="Send back" />
                <Chip onClick={() => onZ('forward')} label="Bring front" />
              </div>
            </Section>
          </>
        )}

        {el.kind === 'textbox' && (
          <Section label={`Padding · ${el.pad ?? 12}px`}>
            <Slider min={0} max={64} value={el.pad ?? 12} onChange={(v) => onChange({ pad: v })} />
          </Section>
        )}

        <Section label="Align to slide">
          <div className="grid grid-cols-6 gap-1">
            {ALIGNMENTS.map((a) => (
              <button
                key={a.target}
                onClick={() => onAlign(a.target)}
                title={a.label}
                aria-label={a.label}
                className="h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <Icon d={a.icon} />
              </button>
            ))}
          </div>
        </Section>

        <button
          onClick={onDelete}
          className="w-full rounded-md bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 text-[11px] py-1.5 transition-colors"
        >
          Delete element
        </button>

        <p className="text-[10px] leading-snug text-gray-600">
          Arrows nudge 1px, Shift+arrows 10px, Delete removes.
        </p>
      </div>
    </aside>
  )
}

/* ── Small controls ── */

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

function NumField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }): JSX.Element {
  return (
    <label className={`flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800/60 px-1.5 ${disabled ? 'opacity-40' : ''}`}>
      <span className="text-[10px] text-gray-500 w-3">{label}</span>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        className="w-full bg-transparent py-1 text-[11px] text-gray-200 outline-none"
      />
    </label>
  )
}

function Slider({ min, max, value, onChange }: { min: number; max: number; value: number; onChange: (v: number) => void }): JSX.Element {
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-indigo-500"
    />
  )
}

function Chip({ active, onClick, label }: { active?: boolean; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`h-7 rounded text-[10px] transition-colors ${active ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
    >
      {label}
    </button>
  )
}

function Icon({ d }: { d: string }): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

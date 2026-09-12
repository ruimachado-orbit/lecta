import { useState } from 'react'
import { SLIDE_LAYOUTS, LayoutThumbnail } from './SlideNavigator'

/**
 * Visual layout picker (Presenton insert-palette style): the current layout as
 * a thumbnail button, opening a grid of all layouts. Shared by the generation
 * outline step and the slide navigator's add-slide menu.
 */
export function LayoutPicker({
  value, onChange, disabled, label,
}: {
  value: string
  onChange: (layout: string) => void
  disabled?: boolean
  label?: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const current = SLIDE_LAYOUTS.find((l) => l.value === value) ?? SLIDE_LAYOUTS[0]

  return (
    <span className="relative inline-block shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={label ?? `Layout: ${current.label}`}
        aria-label={label ?? `Layout: ${current.label}`}
        aria-expanded={open}
        className="block rounded border border-gray-700 hover:border-indigo-400 overflow-hidden transition-colors disabled:opacity-30"
      >
        <LayoutThumbnail layout={current.value} active={false} />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <span className="fixed z-[9999] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 grid grid-cols-3 gap-1.5 w-[210px]">
            {SLIDE_LAYOUTS.filter((l) => l.value !== 'blank').map((l) => (
              <button
                key={l.value}
                onClick={() => { onChange(l.value); setOpen(false) }}
                title={l.label}
                aria-label={l.label}
                className={`rounded-md p-1 transition-colors ${
                  l.value === value ? 'bg-indigo-500/20 ring-1 ring-indigo-400/50' : 'hover:bg-gray-800'
                }`}
              >
                <LayoutThumbnail layout={l.value} active={l.value === value} />
                <span className={`block text-[9px] mt-0.5 text-center truncate ${
                  l.value === value ? 'text-indigo-300 font-medium' : 'text-gray-500'
                }`}>{l.label}</span>
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  )
}

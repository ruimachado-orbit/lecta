import { useState } from 'react'
import { ICON_NAMES, iconSvg } from './icons'

/**
 * Icon picker for the slide edit toolbar: a popover grid of the curated
 * inline icon set. Picking one inserts `{{icon:name}}` at the cursor, which
 * the renderer expands to theme-aware inline SVG.
 */
export function IconPicker({ onInsert }: { onInsert: (text: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const matches = ICON_NAMES.filter((n) => n.includes(query.toLowerCase()))

  return (
    <span className="relative inline-block">
      <button
        onClick={() => { setOpen((v) => !v); setQuery('') }}
        title="Insert icon"
        aria-label="Insert icon"
        aria-expanded={open}
        className="px-1.5 py-0.5 text-[11px] rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        ❖
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <span className="fixed z-[9999] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 w-[240px]">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons..."
              aria-label="Search icons"
              className="w-full px-2 py-1 mb-1.5 text-xs bg-gray-950 text-gray-200 rounded border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-600"
            />
            <span className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
              {matches.map((name) => (
                <button
                  key={name}
                  onClick={() => { onInsert(`{{icon:${name}}}`); setOpen(false) }}
                  title={name}
                  aria-label={`Insert ${name} icon`}
                  className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors [&>svg]:w-4 [&>svg]:h-4 [&>svg]:mx-auto [&>svg]:block"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: iconSvg(name, 16) ?? '' }}
                />
              ))}
              {matches.length === 0 && (
                <span className="col-span-6 text-center text-[11px] text-gray-600 py-2">No icons match.</span>
              )}
            </span>
          </span>
        </>
      )}
    </span>
  )
}

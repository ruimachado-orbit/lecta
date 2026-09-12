import { useState } from 'react'
import { getAllThemes } from '../../themes/theme-registry'
import { SLIDE_LAYOUTS } from '../slides/SlideNavigator'
import { LayoutPicker } from '../slides/LayoutPicker'

export { LayoutPicker }

const LAYOUT_IDS = SLIDE_LAYOUTS.map((l) => l.value).filter((v) => v !== 'blank')

export interface OutlineItem {
  id: string
  title: string
  layout: string
  keyPoints: string[]
}

/**
 * Editable outline (Presenton `outline/` step): rename, relayout, reorder,
 * delete, and drop back to generation. Edits stay local until the user
 * continues — the deck is only written in step 3.
 */
export function OutlineEditor({
  outline, onChange, disabled,
}: {
  outline: OutlineItem[]
  onChange: (next: OutlineItem[]) => void
  disabled?: boolean
}): JSX.Element {
  const [editing, setEditing] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const move = (from: number, to: number) => {
    if (to < 0 || to >= outline.length) return
    const next = [...outline]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  const startEdit = (i: number) => {
    setEditing(i)
    setEditTitle(outline[i].title)
  }

  const commitEdit = () => {
    if (editing === null) return
    const title = editTitle.trim()
    if (title) {
      const next = [...outline]
      next[editing] = { ...next[editing], title }
      onChange(next)
    }
    setEditing(null)
  }

  if (outline.length === 0) {
    return <p className="text-sm text-gray-500">No outline yet — generate one from step 1.</p>
  }

  return (
    <ol className="space-y-2">
      {outline.map((item, i) => (
        <li
          key={`${item.id}-${i}`}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 font-mono w-6 shrink-0">{i + 1}</span>
            {editing === i ? (
              <input
                autoFocus
                value={editTitle}
                disabled={disabled}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setEditing(null)
                }}
                onBlur={commitEdit}
                className="flex-1 px-2 py-1 bg-gray-950 text-sm text-gray-200 rounded border border-indigo-500 focus:outline-none"
                aria-label={`Slide ${i + 1} title`}
              />
            ) : (
              <button
                onClick={() => startEdit(i)}
                disabled={disabled}
                title="Click to rename"
                className="flex-1 text-left text-sm text-gray-200 truncate hover:text-white disabled:opacity-50"
              >
                {item.title}
              </button>
            )}
            <LayoutPicker
              value={LAYOUT_IDS.includes(item.layout) ? item.layout : 'default'}
              disabled={disabled}
              label={`Slide ${i + 1} layout`}
              onChange={(layout) => {
                const next = [...outline]
                next[i] = { ...next[i], layout }
                onChange(next)
              }}
            />
            <div className="flex items-center shrink-0">
              <button
                onClick={() => move(i, i - 1)}
                disabled={disabled || i === 0}
                aria-label={`Move slide ${i + 1} up`}
                className="px-1.5 py-1 text-gray-500 hover:text-white disabled:opacity-20"
              >↑</button>
              <button
                onClick={() => move(i, i + 1)}
                disabled={disabled || i === outline.length - 1}
                aria-label={`Move slide ${i + 1} down`}
                className="px-1.5 py-1 text-gray-500 hover:text-white disabled:opacity-20"
              >↓</button>
              <button
                onClick={() => onChange(outline.filter((_, j) => j !== i))}
                disabled={disabled || outline.length <= 1}
                aria-label={`Delete slide ${i + 1}`}
                className="px-1.5 py-1 text-gray-500 hover:text-red-400 disabled:opacity-20"
              >×</button>
            </div>
          </div>
          {item.keyPoints.length > 0 && (
            <p className="text-[11px] text-gray-500 truncate mt-1 pl-8">
              {item.keyPoints.slice(0, 3).join(' · ')}
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * Theme gallery for the wizard: visual theme cards (same data as the
 * in-deck ThemePicker) so the template choice happens before generation.
 */
export function TemplateGallery({
  value, onChange, disabled,
}: {
  value: string
  onChange: (themeId: string) => void
  disabled?: boolean
}): JSX.Element {
  const themes = getAllThemes()
  return (
    <div>
      <label className="text-sm text-gray-300 block mb-1.5">Template</label>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Template">
        {themes.map((theme) => {
          const active = value === theme.id
          const { bg, text, accent, muted } = theme.previewColors
          return (
            <button
              key={theme.id}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(theme.id)}
              className={`rounded-lg p-1.5 text-left transition-all disabled:opacity-30 ${
                active ? 'ring-2 ring-white bg-gray-800' : 'hover:bg-gray-800/50'
              }`}
            >
              <div className="w-full aspect-video rounded-md overflow-hidden relative" style={{ background: bg }}>
                <div className="absolute inset-0 p-2.5 flex flex-col">
                  <div className="font-bold text-[8px] leading-tight mb-1" style={{ color: text, fontFamily: theme.fonts.heading.family }}>
                    Slide title
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full" style={{ background: accent }} />
                      <div className="h-[3px] rounded-full" style={{ background: muted, width: '60%', opacity: 0.4 }} />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full" style={{ background: accent }} />
                      <div className="h-[3px] rounded-full" style={{ background: muted, width: '45%', opacity: 0.4 }} />
                    </div>
                  </div>
                  <div className="h-[2px] rounded-full mt-auto" style={{ background: accent, width: '40%' }} />
                </div>
              </div>
              <div className="mt-1 px-0.5">
                <div className="text-[11px] font-medium text-gray-200 flex items-center gap-1">
                  {theme.name}
                  {active && (
                    <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

import { usePresentationStore } from '../../stores/presentation-store'
import { LayoutPicker } from './LayoutPicker'
import { getAllThemes } from '../../themes/theme-registry'
import { useState } from 'react'

export type BlockStyle = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullets' | 'numbers'

interface FormatPanelProps {
  /** The selected editable block (null when nothing — or a locked block — is selected). */
  block: { key: string; kind: string; markdown: string } | null
  onBold: () => void
  onItalic: () => void
  onStyle: (style: BlockStyle) => void
  onInsert: (kind: 'heading' | 'text' | 'bullets' | 'quote' | 'divider' | 'code') => void
}

const TRANSITIONS = [
  { value: 'none', label: 'None' },
  { value: 'left', label: '← Left' },
  { value: 'right', label: 'Right →' },
  { value: 'top', label: '↑ Top' },
  { value: 'bottom', label: 'Bottom ↓' },
] as const

/**
 * The PowerPoint-style sidebar for the canvas editor: text formatting for the
 * selected block, insert actions, and slide-level layout / transition / theme.
 */
export function FormatPanel({ block, onBold, onItalic, onStyle, onInsert }: FormatPanelProps): JSX.Element {
  const setSlideLayout = usePresentationStore((s) => s.setSlideLayout)
  const setSlideTransition = usePresentationStore((s) => s.setSlideTransition)
  const setTheme = usePresentationStore((s) => s.setTheme)
  const slides = usePresentationStore((s) => s.slides)
  const currentSlideIndex = usePresentationStore((s) => s.currentSlideIndex)
  const presentation = usePresentationStore((s) => s.presentation)
  const [showThemePicker, setShowThemePicker] = useState(false)

  const slide = slides[currentSlideIndex]
  const layout = slide?.config.layout ?? 'default'
  const transition = slide?.config.transition ?? 'none'
  const themeId = presentation?.theme ?? 'dark'
  const themes = getAllThemes()

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col gap-4 overflow-y-auto border-l border-gray-800 bg-gray-900/70 px-3 py-3">
      {/* ── Text ── */}
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Text</h3>
        {block ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1">
              <FmtBtn onClick={onBold} title="Bold (⌘B)">
                <b>B</b>
              </FmtBtn>
              <FmtBtn onClick={onItalic} title="Italic (⌘I)">
                <i>I</i>
              </FmtBtn>
            </div>
            <label className="block text-[10px] text-gray-500" htmlFor="fmt-block-style">
              Style
            </label>
            <select
              id="fmt-block-style"
              value={guessStyle(block.markdown)}
              onChange={(e) => onStyle(e.target.value as BlockStyle)}
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="p">Paragraph</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="quote">Quote</option>
              <option value="bullets">Bullets</option>
              <option value="numbers">Numbers</option>
            </select>
          </div>
        ) : (
          <p className="text-[11px] leading-snug text-gray-600">Click a text block on the canvas to format it.</p>
        )}
      </section>

      {/* ── Insert ── */}
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Insert</h3>
        <div className="grid grid-cols-3 gap-1">
          <FmtBtn onClick={() => onInsert('heading')} title="Heading block">H</FmtBtn>
          <FmtBtn onClick={() => onInsert('text')} title="Text block">T</FmtBtn>
          <FmtBtn onClick={() => onInsert('bullets')} title="Bullet list">•</FmtBtn>
          <FmtBtn onClick={() => onInsert('quote')} title="Quote">❝</FmtBtn>
          <FmtBtn onClick={() => onInsert('divider')} title="Sub-slide divider">---</FmtBtn>
          <FmtBtn onClick={() => onInsert('code')} title="Code block">{'{ }'}</FmtBtn>
        </div>
      </section>

      {/* ── Slide ── */}
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Slide</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">Layout</span>
            <LayoutPicker value={layout} onChange={(l) => void setSlideLayout(l)} label="Slide layout" />
          </div>
          <div>
            <span className="mb-1 block text-[11px] text-gray-400">Transition</span>
            <div className="grid grid-cols-5 gap-1">
              {TRANSITIONS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => void setSlideTransition(t.value)}
                  title={t.label}
                  aria-label={`Transition ${t.label}`}
                  aria-pressed={transition === t.value}
                  className={`rounded-md px-1 py-1 text-[11px] transition-colors ${
                    transition === t.value
                      ? 'bg-indigo-500 font-medium text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                >
                  {t.value === 'none' ? '·' : t.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-[11px] text-gray-400">Theme</span>
            {!showThemePicker ? (
              <button
                onClick={() => setShowThemePicker(true)}
                className="flex w-full items-center gap-2 rounded-md bg-gray-800 px-2 py-1.5 text-left text-[11px] text-gray-300 transition-colors hover:bg-gray-700"
              >
                <ThemeDot id={themeId} themes={themes} />
                <span className="flex-1 truncate">{themes.find((t) => t.id === themeId)?.name ?? themeId}</span>
                <span className="text-gray-500">▾</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      void setTheme(t.id)
                      setShowThemePicker(false)
                    }}
                    title={t.description}
                    className={`rounded-md border p-1 text-left transition-colors ${
                      t.id === themeId ? 'border-indigo-400 bg-indigo-500/10' : 'border-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <span
                      className="block h-8 rounded"
                      style={{ background: `linear-gradient(135deg, ${t.previewColors.bg} 60%, ${t.previewColors.accent} 60%)` }}
                    />
                    <span className="mt-0.5 block truncate text-[10px] text-gray-300">{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="mt-auto text-[10px] leading-snug text-gray-600">
        Tip: double-click text to edit · drag ⠿ to reorder · Alt+↑/↓ moves a block · code, images and diagrams edit in Source.
      </p>
    </aside>
  )
}

function ThemeDot({ id, themes }: { id: string; themes: { id: string; previewColors: { bg: string; accent: string } }[] }): JSX.Element {
  const t = themes.find((x) => x.id === id)
  return (
    <span
      className="h-4 w-4 shrink-0 rounded-full border border-white/20"
      style={{ background: t ? `linear-gradient(135deg, ${t.previewColors.bg} 55%, ${t.previewColors.accent} 55%)` : undefined }}
    />
  )
}

function FmtBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rounded-md bg-gray-800 px-2 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
    >
      {children}
    </button>
  )
}

function guessStyle(markdown: string): BlockStyle {
  const first = markdown.split('\n')[0].trim()
  if (/^###\s/.test(first)) return 'h3'
  if (/^##\s/.test(first)) return 'h2'
  if (/^#\s/.test(first)) return 'h1'
  if (/^>\s?/.test(first)) return 'quote'
  if (/^([-*+])\s+/.test(first)) return 'bullets'
  if (/^\d+[.)]\s+/.test(first)) return 'numbers'
  return 'p'
}

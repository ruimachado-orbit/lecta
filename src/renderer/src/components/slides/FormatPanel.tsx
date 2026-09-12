import { usePresentationStore } from '../../stores/presentation-store'
import { LayoutPicker } from './LayoutPicker'
import { getAllThemes } from '../../themes/theme-registry'
import { slideBackground, patchSlideBackground } from './slide-background'
import { useState } from 'react'

export type BlockStyle = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullets' | 'numbers'
export type BlockAlignOption = 'left' | 'center' | 'right' | null

interface FormatPanelProps {
  /** The selected editable block (null when nothing — or a locked block — is selected). */
  block: { key: string; kind: string; markdown: string } | null
  align: 'left' | 'center' | 'right' | null
  canUndo: boolean
  canRedo: boolean
  slideIndex?: number
  /** >1 when several blocks are selected (bulk delete/duplicate apply to all). */
  selectedCount: number
  /** Current section label + block count, when the anchor sits in a section. */
  sectionLabel: string | null
  onUndo: () => void
  onRedo: () => void
  onBold: () => void
  onItalic: () => void
  onTextColor: (color: string) => void
  onHighlight: (color: string) => void
  onStyle: (style: BlockStyle) => void
  onAlign: (align: Exclude<BlockAlignOption, null> | null) => void
  onDuplicate: () => void
  onDeleteBlock: () => void
  onSelectSection: () => void
  onAddSectionBefore: () => void
  onAddSectionAfter: () => void
  onInsert: (kind: 'heading' | 'text' | 'bullets' | 'quote' | 'divider' | 'code' | 'textbox' | 'shape') => void
}

const TRANSITIONS = [
  { value: 'none', label: 'None' },
  { value: 'left', label: '← Left' },
  { value: 'right', label: 'Right →' },
  { value: 'top', label: '↑ Top' },
  { value: 'bottom', label: 'Bottom ↓' },
] as const

const TEXT_COLORS = ['#0c0a09', '#57534e', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#6d28d9', '#db2777']
const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#ddd6fe', '#fecdd3', '#fed7aa']

const BG_SWATCHES = ['#ffffff', '#fafaf9', '#f5f3ff', '#eff6ff', '#f0fdf4', '#fffbeb', '#0c0a09', '#1c1917']

/**
 * The PowerPoint-style sidebar for the canvas editor: history, text
 * formatting, alignment, insert actions, and slide-level layout /
 * transition / theme / background.
 */
export function FormatPanel({
  block,
  align,
  canUndo,
  canRedo,
  slideIndex,
  selectedCount,
  sectionLabel,
  onUndo,
  onRedo,
  onBold,
  onItalic,
  onTextColor,
  onHighlight,
  onStyle,
  onAlign,
  onDuplicate,
  onDeleteBlock,
  onSelectSection,
  onAddSectionBefore,
  onAddSectionAfter,
  onInsert,
}: FormatPanelProps): JSX.Element {
  const setSlideLayout = usePresentationStore((s) => s.setSlideLayout)
  const setSlideTransition = usePresentationStore((s) => s.setSlideTransition)
  const setTheme = usePresentationStore((s) => s.setTheme)
  const slides = usePresentationStore((s) => s.slides)
  const currentSlideIndex = usePresentationStore((s) => s.currentSlideIndex)
  const presentation = usePresentationStore((s) => s.presentation)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [showBgPicker, setShowBgPicker] = useState(false)

  const slide = slides[currentSlideIndex]
  const layout = slide?.config.layout ?? 'default'
  const transition = slide?.config.transition ?? 'none'
  const themeId = presentation?.theme ?? 'dark'
  const themes = getAllThemes()
  const bg = typeof slideIndex === 'number' ? slideBackground(slideIndex) : undefined

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col gap-4 overflow-y-auto border-l border-gray-800 bg-gray-900/70 px-3 py-3">
      {/* ── History ── */}
      <div className="flex items-center gap-1">
        <FmtBtn onClick={onUndo} title="Undo (⌘Z)" disabled={!canUndo}>↩</FmtBtn>
        <FmtBtn onClick={onRedo} title="Redo (⇧⌘Z)" disabled={!canRedo}>↪</FmtBtn>
        {selectedCount > 0 && (
          <>
            <span className="w-1" />
            <FmtBtn onClick={onDuplicate} title={selectedCount > 1 ? `Duplicate ${selectedCount} blocks` : 'Duplicate block'}>⧉</FmtBtn>
            <FmtBtn onClick={onDeleteBlock} title={selectedCount > 1 ? `Delete ${selectedCount} blocks (⌫)` : 'Delete block (⌫)'} danger>✕</FmtBtn>
          </>
        )}
      </div>
      {selectedCount > 1 && (
        <p className="text-[11px] text-indigo-300">{selectedCount} blocks selected — ⌫ deletes all.</p>
      )}
      {sectionLabel && (
        <div className="space-y-1">
          {selectedCount <= 1 && (
            <button
              onClick={onSelectSection}
              title="Select the whole section"
              className="w-full rounded-md bg-gray-800 px-2 py-1.5 text-left text-[11px] text-gray-300 transition-colors hover:bg-gray-700"
            >
              § {sectionLabel} — select all
            </button>
          )}
          <div className="grid grid-cols-2 gap-1">
            <FmtBtn onClick={onAddSectionBefore} title="Add section before this one">+↑ Section</FmtBtn>
            <FmtBtn onClick={onAddSectionAfter} title="Add section after this one">+↓ Section</FmtBtn>
          </div>
        </div>
      )}

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
            <div>
              <span className="mb-1 block text-[11px] text-gray-400">Color</span>
              <div className="flex flex-wrap gap-1">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={onTextColor.bind(null, c)}
                    onMouseDown={(e) => e.preventDefault()}
                    title={`Text color ${c}`}
                    aria-label={`Text color ${c}`}
                    className="h-5 w-5 rounded-full border border-white/20 transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-gray-400">Highlight</span>
              <div className="flex flex-wrap gap-1">
                {HIGHLIGHTS.map((c) => (
                  <button
                    key={c}
                    onClick={onHighlight.bind(null, c)}
                    onMouseDown={(e) => e.preventDefault()}
                    title={`Highlight ${c}`}
                    aria-label={`Highlight ${c}`}
                    className="h-5 w-5 rounded-sm border border-white/20 transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-gray-400">Align</span>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { v: null, icon: 'Auto', label: 'Default alignment' },
                    { v: 'left', icon: '←', label: 'Align left' },
                    { v: 'center', icon: '↔', label: 'Align center' },
                    { v: 'right', icon: '→', label: 'Align right' },
                  ] as const
                ).map((a) => (
                  <FmtBtn
                    key={String(a.v)}
                    onClick={() => onAlign(a.v)}
                    title={a.label}
                    active={(align ?? null) === a.v}
                  >
                    {a.icon}
                  </FmtBtn>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-gray-400" htmlFor="fmt-block-style">
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
          </div>
        ) : (
          <p className="text-[11px] leading-snug text-gray-600">Click a text block on the canvas to format it.</p>
        )}
      </section>

      {/* ── Insert ── */}
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Insert</h3>
        <div className="grid grid-cols-4 gap-1">
          <FmtBtn onClick={() => onInsert('heading')} title="Heading block">H</FmtBtn>
          <FmtBtn onClick={() => onInsert('text')} title="Text block">T</FmtBtn>
          <FmtBtn onClick={() => onInsert('bullets')} title="Bullet list">•</FmtBtn>
          <FmtBtn onClick={() => onInsert('quote')} title="Quote">❝</FmtBtn>
          <FmtBtn onClick={() => onInsert('divider')} title="Sub-slide divider">---</FmtBtn>
          <FmtBtn onClick={() => onInsert('code')} title="Code block">{'{ }'}</FmtBtn>
          <FmtBtn onClick={() => onInsert('textbox')} title="Floating text box (drag freely)">▢T</FmtBtn>
          <FmtBtn onClick={() => onInsert('shape')} title="Shape (drag freely)">▢</FmtBtn>
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
          <div>
            <span className="mb-1 block text-[11px] text-gray-400">Background</span>
            {!showBgPicker ? (
              <button
                onClick={() => setShowBgPicker(true)}
                className="flex w-full items-center gap-2 rounded-md bg-gray-800 px-2 py-1.5 text-left text-[11px] text-gray-300 transition-colors hover:bg-gray-700"
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-white/20"
                  style={{ background: bg?.color ?? 'transparent' }}
                />
                <span className="flex-1 truncate">{bg?.color ? bg.color : 'Default'}</span>
                <span className="text-gray-500">▾</span>
              </button>
            ) : (
              <div className="rounded-md border border-gray-800 p-2">
                <div className="flex flex-wrap gap-1">
                  {BG_SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        if (typeof slideIndex === 'number') void patchSlideBackground(slideIndex, { color: c })
                      }}
                      title={c}
                      aria-label={`Background ${c}`}
                      className="h-5 w-5 rounded-full border border-white/20 transition-transform hover:scale-110"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (typeof slideIndex === 'number') void patchSlideBackground(slideIndex, { color: undefined })
                    setShowBgPicker(false)
                  }}
                  className="mt-1.5 w-full rounded-md bg-gray-800 px-2 py-1 text-[11px] text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
                >
                  Clear background
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="mt-auto text-[10px] leading-snug text-gray-600">
        Tip: click text to edit · ⠿ drags to reorder · ⌘Z undoes · code, images and diagrams edit in Source.
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
  active = false,
  danger = false,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
  danger?: boolean
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      // Keep focus (and the text selection) inside the canvas editor so
      // execCommand-based formatting applies to the selected text.
      onMouseDown={(e) => e.preventDefault()}
      title={title}
      aria-label={title}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={`rounded-md px-2 py-1.5 text-xs transition-colors disabled:cursor-default disabled:opacity-30 ${
        active
          ? 'bg-indigo-500 font-medium text-white'
          : danger
            ? 'bg-gray-800 text-gray-300 hover:bg-red-500/30 hover:text-red-300'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function guessStyle(markdown: string): BlockStyle {
  const lines = markdown.split('\n')
  const first = lines.find((l) => l.trim() !== '' && !/^<!--[^<>]*-->\s*$/.test(l.trim())) ?? lines[0] ?? ''
  const text = first.trim()
  if (/^###\s/.test(text)) return 'h3'
  if (/^##\s/.test(text)) return 'h2'
  if (/^#\s/.test(text)) return 'h1'
  if (/^>\s?/.test(text)) return 'quote'
  if (/^([-*+])\s+/.test(text)) return 'bullets'
  if (/^\d+[.)]\s+/.test(text)) return 'numbers'
  return 'p'
}

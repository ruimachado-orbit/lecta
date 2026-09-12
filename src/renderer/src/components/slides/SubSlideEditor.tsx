import { useCallback, useEffect, useRef, useState } from 'react'
import { WysiwygEditor } from './WysiwygEditor'
import { ContentRenderer } from './ContentRenderer'

const SLIDE_W = 1280
const SLIDE_H = 720

/** Split full markdown into sections by --- separators (the sub-slide model). */
export function splitFullMdSections(fullMd: string): string[] {
  const hasBreaks = fullMd.split('\n').some((l) => /^(?:---+|\*\s*\*\s*\*|___+)$/.test(l.trim()))
  if (!hasBreaks) return [fullMd]
  return fullMd.split(/\n?(?:---+|\*\s*\*\s*\*|___+)\n?/).map((s) => s.trim())
}

interface SubSlide {
  markdown: string
  index: number
}

interface SubSlideEditorProps {
  subSlides: SubSlide[]
  currentSubSlide: number
  setCurrentSubSlide: (n: number) => void
  slideIndex: number
  currentSlide: {
    markdownContent: string
    isMdx?: boolean
    config: { layout?: string; id: string }
  }
  presentation: { rootPath?: string; theme?: string } | null
  updateMarkdownContent: (idx: number, md: string) => void
  saveSlideContent: (idx: number) => void
  wysiwygHeaderSlot?: HTMLDivElement | null
}

/**
 * The reimagined slide editor: one sub-slide at a time, at a comfortable,
 * zoomable size, with a thumbnail filmstrip for navigating and managing
 * sub-slides (add / duplicate / reorder / delete). No more vertical stack of
 * tiny canvases and no more thinking in `---` page breaks.
 */
export function SubSlideEditor({
  subSlides,
  currentSubSlide,
  setCurrentSubSlide,
  slideIndex,
  currentSlide,
  presentation,
  updateMarkdownContent,
  saveSlideContent,
  wysiwygHeaderSlot
}: SubSlideEditorProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(0.5)
  const [zoomOverride, setZoomOverride] = useState<number | null>(null) // null = fit

  const slideTheme = presentation?.theme || 'dark'
  const layout = currentSlide.config.layout
  const zoom = zoomOverride ?? fitScale

  // Recompute fit scale when the viewport resizes (only when in "fit" mode).
  useEffect(() => {
    const container = viewportRef.current
    if (!container) return
    const update = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      const hMargin = 40
      const vMargin = 40
      const s = Math.min((cw - hMargin) / SLIDE_W, (ch - vMargin) / SLIDE_H, 1)
      setFitScale(Math.max(0.15, s))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  /** Rewrite the full slide markdown by mutating the split sections. */
  const writeSections = useCallback(
    (sections: string[], select?: number) => {
      const newMd = sections.length === 1 ? sections[0] : sections.join('\n\n---\n\n')
      updateMarkdownContent(slideIndex, newMd)
      saveSlideContent(slideIndex)
      if (typeof select === 'number') setCurrentSubSlide(Math.max(0, Math.min(select, sections.length - 1)))
    },
    [slideIndex, updateMarkdownContent, saveSlideContent, setCurrentSubSlide]
  )

  const addSubSlide = useCallback(() => {
    const sections = splitFullMdSections(currentSlide.markdownContent)
    sections.push('')
    writeSections(sections, sections.length - 1)
  }, [currentSlide.markdownContent, writeSections])

  const duplicateSubSlide = useCallback(
    (index: number) => {
      const sections = splitFullMdSections(currentSlide.markdownContent)
      sections.splice(index + 1, 0, sections[index])
      writeSections(sections, index + 1)
    },
    [currentSlide.markdownContent, writeSections]
  )

  const deleteSubSlide = useCallback(
    (index: number) => {
      const sections = splitFullMdSections(currentSlide.markdownContent)
      if (sections.length <= 1) return
      sections.splice(index, 1)
      const select = currentSubSlide >= sections.length ? sections.length - 1 : currentSubSlide
      writeSections(sections, select)
    },
    [currentSlide.markdownContent, currentSubSlide, writeSections]
  )

  const moveSubSlide = useCallback(
    (index: number, dir: -1 | 1) => {
      const sections = splitFullMdSections(currentSlide.markdownContent)
      const to = index + dir
      if (to < 0 || to >= sections.length) return
      const [item] = sections.splice(index, 1)
      sections.splice(to, 0, item)
      writeSections(sections, to)
    },
    [currentSlide.markdownContent, writeSections]
  )

  const replaceSubSlide = useCallback(
    (index: number, newMd: string) => {
      const sections = splitFullMdSections(currentSlide.markdownContent)
      if (sections.length <= 1 && index === 0) {
        updateMarkdownContent(slideIndex, newMd)
      } else {
        sections[index] = newMd
        updateMarkdownContent(slideIndex, sections.join('\n\n---\n\n'))
      }
      saveSlideContent(slideIndex)
    },
    [currentSlide.markdownContent, slideIndex, updateMarkdownContent, saveSlideContent]
  )

  const setZoom = (next: number | null) => setZoomOverride(next)
  const nudgeZoom = (delta: number) => setZoomOverride(Math.max(0.2, Math.min(1.5, Math.round((zoom + delta) * 10) / 10)))
  const displayZoom = Math.round(zoom * 100)

  return (
    <div className="flex h-full flex-col" data-slide-theme={slideTheme} style={{ background: 'var(--slide-bg)' }}>
      {/* ── Edit viewport (full-size, zoomable) ── */}
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-auto">
        {/* Zoom controls */}
        <div className="sticky top-2 z-30 flex justify-end pr-3">
          <div className="flex items-center gap-0.5 rounded-full border border-gray-700/60 bg-gray-900/85 px-1.5 py-0.5 backdrop-blur">
            <ZoomBtn label="Zoom out" onClick={() => nudgeZoom(-0.1)}>−</ZoomBtn>
            <button
              onClick={() => setZoom(null)}
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] transition-colors ${
                zoomOverride === null ? 'text-signal-400' : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Fit slide to window"
            >
              {zoomOverride === null ? 'Fit' : `${displayZoom}%`}
            </button>
            <ZoomBtn label="Zoom in" onClick={() => nudgeZoom(0.1)}>+</ZoomBtn>
            <div className="mx-0.5 h-4 w-px bg-gray-700" />
            <button
              onClick={() => setZoomOverride(1)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                zoomOverride === 1 ? 'text-signal-400' : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Actual size (100%)"
            >
              1:1
            </button>
          </div>
        </div>

        <div className="flex items-start justify-center px-5 pb-6 pt-1">
          <div
            className="relative shrink-0 rounded-md shadow-3"
            style={{ width: SLIDE_W * zoom, height: SLIDE_H * zoom }}
          >
            <div
              data-slide-theme={slideTheme}
              style={{
                width: SLIDE_W,
                height: SLIDE_H,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                background: 'var(--slide-bg)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.12)',
                borderRadius: 4,
                overflow: 'hidden'
              }}
            >
              <div className={`relative h-full ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
                <WysiwygEditor
                  key={currentSubSlide}
                  slideIndex={slideIndex}
                  subSlideMarkdown={subSlides[currentSubSlide]?.markdown ?? ''}
                  onSubSlideChange={(md) => replaceSubSlide(currentSubSlide, md)}
                  headerSlot={wysiwygHeaderSlot}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sub-slide filmstrip ── */}
      <SubSlideFilmstrip
        subSlides={subSlides}
        currentSubSlide={currentSubSlide}
        onSelect={setCurrentSubSlide}
        onAdd={addSubSlide}
        onDuplicate={duplicateSubSlide}
        onDelete={deleteSubSlide}
        onMove={moveSubSlide}
        rootPath={presentation?.rootPath}
        isMdx={currentSlide.isMdx}
        slideTheme={slideTheme}
      />
    </div>
  )
}

function ZoomBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-700/60 hover:text-white"
    >
      {children}
    </button>
  )
}

interface SubSlideFilmstripProps {
  subSlides: SubSlide[]
  currentSubSlide: number
  onSelect: (n: number) => void
  onAdd: () => void
  onDuplicate: (n: number) => void
  onDelete: (n: number) => void
  onMove: (n: number, dir: -1 | 1) => void
  rootPath?: string
  isMdx?: boolean
  slideTheme: string
}

function SubSlideFilmstrip({
  subSlides,
  currentSubSlide,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  rootPath,
  isMdx,
  slideTheme
}: SubSlideFilmstripProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [currentSubSlide])

  return (
    <div className="flex items-center gap-2 border-t border-gray-800 bg-gray-900/70 px-3 py-2">
      <span className="shrink-0 font-mono text-[10px] text-gray-500">
        {currentSubSlide + 1}/{subSlides.length}
      </span>
      <div ref={scrollRef} className="flex min-h-0 flex-1 items-center gap-2 overflow-x-auto py-1">
        {subSlides.map((sub, i) => {
          const active = i === currentSubSlide
          return (
            <div key={`subfilm-${sub.index}`} className="group relative shrink-0">
              <button
                ref={active ? activeRef : undefined}
                onClick={() => onSelect(i)}
                aria-pressed={active}
                aria-label={`Sub-slide ${i + 1}`}
                className={`relative block overflow-hidden rounded-md transition-all ${
                  active ? 'ring-2 ring-signal-500' : 'opacity-70 ring-1 ring-white/10 hover:opacity-100 hover:ring-white/30'
                }`}
                style={{ width: 96, height: 54 }}
              >
                <span className="pointer-events-none absolute left-0 top-0 z-10 h-full w-full">
                  <span style={{ width: 1280, height: 720, transform: 'scale(0.075)', transformOrigin: 'top left', display: 'block', background: 'var(--slide-bg)' }}>
                    <ContentRenderer markdown={sub.markdown} rootPath={rootPath} isMdx={isMdx} preview />
                  </span>
                </span>
                <span className={`absolute bottom-0.5 left-0.5 z-20 rounded px-1 text-[9px] font-semibold leading-tight ${active ? 'bg-signal-500 text-ink-950' : 'bg-black/60 text-gray-300'}`}>
                  {i + 1}
                </span>
              </button>

              {/* Always-visible duplicate + delete */}
              <div className="absolute right-0.5 top-0.5 z-30 flex gap-0.5">
                <button
                  onClick={() => onDuplicate(i)}
                  title="Duplicate sub-slide"
                  aria-label={`Duplicate sub-slide ${i + 1}`}
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-md border border-gray-600/70 bg-ink-900/80 text-[10px] leading-none text-gray-300 backdrop-blur transition-colors hover:border-signal-500 hover:text-signal-400"
                >
                  ⧉
                </button>
                {subSlides.length > 1 && (
                  <button
                    onClick={() => onDelete(i)}
                    title="Delete sub-slide"
                    aria-label={`Delete sub-slide ${i + 1}`}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-md border border-gray-600/70 bg-ink-900/80 text-[10px] leading-none text-gray-300 backdrop-blur transition-colors hover:border-red-500 hover:bg-red-500/30 hover:text-red-300"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Hover: reorder */}
              {subSlides.length > 1 && (
                <div className="absolute -bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-gray-700 bg-gray-900 px-0.5 py-0.5 opacity-0 shadow-2xl transition-opacity group-hover:opacity-100">
                  <FilmAction label="Move left" disabled={i === 0} onClick={() => onMove(i, -1)}>←</FilmAction>
                  <FilmAction label="Move right" disabled={i === subSlides.length - 1} onClick={() => onMove(i, 1)}>→</FilmAction>
                </div>
              )}
            </div>
          )
        })}

        <button
          onClick={onAdd}
          className="flex h-[54px] w-[54px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-gray-600 text-gray-500 transition-colors hover:border-signal-500 hover:text-signal-400"
          title="Add sub-slide"
        >
          <span className="text-sm leading-none">+</span>
          <span className="text-[8px] leading-none">Sub-slide</span>
        </button>
      </div>
    </div>
  )
}

function FilmAction({
  children,
  onClick,
  label,
  disabled = false
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-5 w-5 items-center justify-center rounded text-[10px] text-gray-400 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  )
}

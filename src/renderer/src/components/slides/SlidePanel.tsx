import { useCallback, useRef, useState, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { SlideRenderer } from './SlideRenderer'
import { SlideNavigator } from './SlideNavigator'
import { SlideEditToolbar } from './SlideEditToolbar'
import { WysiwygEditor } from './WysiwygEditor'
import { AIGeneratePanel, AIImproveBar, AIChangeBar } from './AISlidePanel'
import { ArtifactBar } from '../artifacts/ArtifactBar'
import { useSubSlides } from '../../hooks/useSubSlides'
import { DrawingOverlay, DrawingToolbar } from './DrawingOverlay'
import { DraggableElements } from './DraggableElements'
import Editor, { type OnMount } from '@monaco-editor/react'

export function SlidePanel(): JSX.Element {
  const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent, presentation } = usePresentationStore()
  const slideTheme = presentation?.theme || 'dark'
  const { showNavigator, editingSlide, editorMode, setEditorMode, slideGroups } = useUIStore()
  const currentSlide = slides[currentSlideIndex]

  // Compute current group label
  const groupLabel = (() => {
    if (!currentSlide) return null
    const slideId = currentSlide.config.id
    for (const group of slideGroups) {
      const idx = group.slideIds.indexOf(slideId)
      if (idx >= 0) return { name: group.name, position: idx + 1, total: group.slideIds.length, color: group.color }
    }
    return null
  })()
  const editorRef = useRef<any>(null)
  const { showAIGenerate } = useUIStore()
  const [drawingMode, setDrawingMode] = useState(false)

  const { subSlides, currentSubSlide, setCurrentSubSlide, breakOffsets } = useSubSlides(
    currentSlide?.markdownContent ?? '',
    currentSlideIndex
  )

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor

    // Add sub-slide break decorations
    const updateDecorations = () => {
      if (!breakOffsets || breakOffsets.length === 0) {
        editor.removeDecorations(editor.getModel()?.getAllDecorations()?.filter(
          (d: any) => d.options?.className === 'subslide-break-line'
        ).map((d: any) => d.id) || [])
        return
      }
      const model = editor.getModel()
      if (!model) return

      const content = model.getValue()
      const decorations = breakOffsets.map((offset, i) => {
        // Find line number for this character offset
        let charCount = 0
        const lines = content.split('\n')
        let lineNum = 1
        for (let l = 0; l < lines.length; l++) {
          charCount += lines[l].length + 1 // +1 for newline
          if (charCount >= offset) {
            lineNum = l + 2 // +2: 1-indexed + next line
            break
          }
        }
        return {
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: {
            isWholeLine: true,
            className: 'subslide-break-line',
            before: {
              content: ` ── Sub-slide ${i + 2} ──`,
              inlineClassName: 'subslide-break-label'
            }
          }
        }
      })

      (editor as any).__subSlideDecorations = editor.deltaDecorations(
        (editor as any).__subSlideDecorations || [],
        decorations
      )
    }

    // Run once and on content change
    updateDecorations()
    editor.onDidChangeModelContent(updateDecorations)
  }

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateMarkdownContent(currentSlideIndex, value)
      }
    },
    [currentSlideIndex, updateMarkdownContent]
  )

  const handleEditorBlur = useCallback(() => {
    saveSlideContent(currentSlideIndex)
  }, [currentSlideIndex, saveSlideContent])

  if (!currentSlide) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No slides loaded
      </div>
    )
  }

  const activeMarkdown = subSlides[currentSubSlide]?.markdown ?? currentSlide.markdownContent

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Group + sub-slide labels */}
      {(groupLabel || subSlides.length > 1) && (
        <div className="h-8 border-b border-gray-800 flex items-center px-4 gap-3 flex-shrink-0"
          style={groupLabel ? {
            backgroundColor: groupLabel.color ? `${groupLabel.color}15` : 'rgba(255,255,255,0.03)',
            borderBottomColor: groupLabel.color ? `${groupLabel.color}30` : undefined
          } : undefined}>
          {/* Group label */}
          {groupLabel && (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: groupLabel.color || '#a3a3a3' }} />
              <span className="text-[12px] font-semibold tracking-wide" style={{ color: groupLabel.color || '#a3a3a3' }}>{groupLabel.name}</span>
              <span className="text-[11px] font-mono opacity-60" style={{ color: groupLabel.color || '#a3a3a3' }}>{groupLabel.position}/{groupLabel.total}</span>
            </div>
          )}
          {/* Sub-slide label */}
          {subSlides.length > 1 && (
            <div className="flex items-center gap-1.5">
              {groupLabel && <div className="w-px h-4 bg-gray-700" />}
              <span className="text-[11px] text-gray-400 font-medium truncate max-w-[120px]">{currentSlide.config.id}</span>
              <span className="text-[10px] text-gray-500 font-mono">{currentSubSlide + 1}/{subSlides.length}</span>
            </div>
          )}
        </div>
      )}
      {/* Editor toolbar */}
      {editingSlide && (
        <>
          <div className="h-7 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2">
            <button
              onClick={() => { setEditorMode('wysiwyg'); setDrawingMode(false) }}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                editorMode === 'wysiwyg' && !drawingMode ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Visual
            </button>
            <button
              onClick={() => { setEditorMode('markdown'); setDrawingMode(false) }}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                editorMode === 'markdown' && !drawingMode ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Markdown
            </button>
            <button
              onClick={() => setDrawingMode(!drawingMode)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                drawingMode ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
              Draw
            </button>
            <div className="flex-1" />
            <AIChangeBar />
          </div>
          {editorMode === 'markdown' && !drawingMode && <SlideEditToolbar editorRef={editorRef} />}
        </>
      )}

      {/* AI change bar (preview mode) + AI improve bar */}
      {!editingSlide && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-gray-800 bg-gray-900/50">
          <AIChangeBar />
          <AIImproveBar />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {editingSlide && drawingMode ? (
          /* Drawing mode: toolbar left + canvas right */
          <div className="flex-1 min-h-0 flex">
            <DrawingToolbar />
            <div className="flex-1 min-w-0">
              <SlideCanvas
                markdown={currentSlide.markdownContent}
                rootPath={presentation?.rootPath}
                layout={currentSlide.config.layout}
                slideIndex={currentSlideIndex}
                drawingMode={true}
              />
            </div>
          </div>
        ) : editingSlide && editorMode === 'wysiwyg' ? (
          /* WYSIWYG: editor IS the canvas */
          <EditableSlideCanvas slideIndex={currentSlideIndex} breakOffsets={breakOffsets} rootPath={presentation?.rootPath} layout={currentSlide.config.layout} />
        ) : editingSlide && editorMode === 'markdown' ? (
          /* Markdown: split view — canvas top, editor bottom */
          <>
            <div className="h-[40%] flex-shrink-0 border-b border-gray-800">
              <SlideCanvas markdown={currentSlide.markdownContent} rootPath={presentation?.rootPath} layout={currentSlide.config.layout} slideIndex={currentSlideIndex} />
            </div>
            <div className="flex-1 min-h-0" onBlur={handleEditorBlur}>
              <Editor
                height="100%"
                language="markdown"
                value={currentSlide.markdownContent}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                theme="vs-dark"
                options={{
                  fontSize: 14, lineHeight: 20,
                  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                  minimap: { enabled: false }, scrollBeyondLastLine: true,
                  padding: { top: 12, bottom: 12 }, lineNumbers: 'on',
                  renderLineHighlight: 'none', wordWrap: 'on',
                  automaticLayout: true, tabSize: 2
                }}
              />
            </div>
          </>
        ) : subSlides.length > 1 ? (
          /* Preview mode with multiple sub-slides: show all stacked */
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 px-2">
            <div className="flex flex-col items-center gap-4">
              {subSlides.map((sub, i) => (
                <div key={i} className="w-full relative">
                  {/* Sub-slide label */}
                  <div className="flex items-center justify-center mb-1">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      i === currentSubSlide
                        ? 'bg-white/10 text-white'
                        : 'text-gray-600'
                    }`}>
                      Sub-slide {i + 1}
                    </span>
                  </div>
                  <div
                    className={`cursor-pointer transition-all ${
                      i === currentSubSlide
                        ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-gray-950 rounded'
                        : 'opacity-70 hover:opacity-90'
                    }`}
                    onClick={() => setCurrentSubSlide(i)}
                  >
                    <SlideCanvas
                      markdown={sub.markdown}
                      rootPath={presentation?.rootPath}
                      layout={currentSlide.config.layout}
                      slideIndex={currentSlideIndex}
                      editable={i === currentSubSlide}
                      onUpdateMarkdown={(md) => {
                        // Replace this sub-slide's content in the full markdown
                        const hasManualBreaks = currentSlide.markdownContent.split('\n').some(
                          (l: string) => /^(?:---+|\*\s*\*\s*\*|___+)$/.test(l.trim())
                        )
                        if (hasManualBreaks) {
                          const parts = currentSlide.markdownContent.split(/(\n?(?:---+|\*\s*\*\s*\*|___+)\n?)/)
                          const sections: string[] = []
                          const separators: string[] = []
                          let current = ''
                          for (const part of parts) {
                            if (/^(\n?(?:---+|\*\s*\*\s*\*|___+)\n?)$/.test(part)) {
                              sections.push(current)
                              separators.push(part)
                              current = ''
                            } else {
                              current = part
                            }
                          }
                          sections.push(current)
                          sections[i] = md
                          let result = sections[0]
                          for (let j = 0; j < separators.length; j++) {
                            result += separators[j] + (sections[j + 1] ?? '')
                          }
                          updateMarkdownContent(currentSlideIndex, result)
                        } else {
                          updateMarkdownContent(currentSlideIndex, md)
                        }
                        saveSlideContent(currentSlideIndex)
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Preview mode: single slide */
          <SlideCanvas
            markdown={activeMarkdown}
            rootPath={presentation?.rootPath}
            transition={currentSlide.config.transition}
            layout={currentSlide.config.layout}
            slideIndex={currentSlideIndex}
            drawingMode={drawingMode}
            editable={true}
            onUpdateMarkdown={(md) => {
              updateMarkdownContent(currentSlideIndex, md)
              saveSlideContent(currentSlideIndex)
            }}
          />
        )}
      </div>

      {/* Sub-slide count indicator (compact, since all are visible above) */}
      {subSlides.length > 1 && (
        <div className="h-6 bg-gray-900/50 border-t border-gray-800 flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] text-gray-500 font-mono">
            {subSlides.length} sub-slides
          </span>
        </div>
      )}

      {/* Artifact chips */}
      {currentSlide.config.artifacts.length > 0 && (
        <ArtifactBar artifacts={currentSlide.config.artifacts} />
      )}

      {/* AI Generate panel */}
      {showAIGenerate && <AIGeneratePanel />}

      {/* Slide navigator */}
      {showNavigator && (
        <div className="border-t border-gray-800">
          <SlideNavigator subSlideCount={subSlides.length} currentSubSlide={currentSubSlide} />
        </div>
      )}
    </div>
  )
}

/** 16:9 slide canvas that auto-scales content to fit */
function SlideCanvas({ markdown, rootPath, transition, layout, slideIndex, drawingMode, editable, onUpdateMarkdown }: {
  markdown: string; rootPath?: string; transition?: string; layout?: string; slideIndex?: number; drawingMode?: boolean
  editable?: boolean; onUpdateMarkdown?: (md: string) => void
}): JSX.Element {
  const slideTheme = usePresentationStore((s) => s.presentation?.theme) || 'dark'
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const slideRef = useRef<HTMLDivElement>(null)
  const transitionRef = useRef<HTMLDivElement>(null)
  const [canvasScale, setCanvasScale] = useState(1)
  const [contentScale, setContentScale] = useState(1)

  // Trigger entrance animation on markdown change
  useEffect(() => {
    const el = transitionRef.current
    if (!el || !transition || transition === 'none') return
    el.classList.remove('slide-enter')
    void el.offsetWidth
    el.classList.add('slide-enter')
  }, [markdown, transition])

  const SLIDE_W = 1280
  const SLIDE_H = 720
  const PAD = 48 // p-12 = 48px each side
  const CONTENT_H = SLIDE_H - PAD * 2

  // Scale the canvas frame to fit the container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateScale = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      const margin = 16
      const s = Math.min((cw - margin * 2) / SLIDE_W, (ch - margin * 2) / SLIDE_H)
      setCanvasScale(Math.max(0.05, s))
    }

    updateScale()
    const ro = new ResizeObserver(updateScale)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Scale content down if it overflows the slide height
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const measure = () => {
      // Reset scale to measure natural height
      el.style.transform = 'scale(1)'
      el.style.transformOrigin = 'top left'
      const natural = el.scrollHeight
      if (natural > CONTENT_H) {
        const s = CONTENT_H / natural
        setContentScale(Math.max(0.3, s))
      } else {
        setContentScale(1)
      }
    }

    // Measure after render + images/diagrams load (multiple passes for async content)
    measure()
    const t1 = setTimeout(measure, 200)
    const t2 = setTimeout(measure, 600)
    const t3 = setTimeout(measure, 1500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [markdown])

  return (
    <div ref={containerRef} className="h-full w-full flex items-center justify-center bg-neutral-800 overflow-hidden">
      <div
        ref={slideRef}
        className="relative rounded overflow-hidden"
        data-slide-theme={slideTheme}
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${canvasScale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.6), 0 0 80px rgba(0,0,0,0.4)'
        }}
      >
        <div className="absolute inset-0 rounded" style={{ background: 'var(--slide-bg)' }} />
        <div ref={transitionRef} className={`absolute inset-0 ${layout === 'blank' ? '' : 'p-12'} overflow-hidden ${transition && transition !== 'none' ? `slide-transition-${transition}` : ''} ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
          <div
            ref={contentRef}
            style={{
              width: layout === 'blank' ? SLIDE_W : SLIDE_W - PAD * 2,
              height: layout === 'blank' ? SLIDE_H : undefined,
              transform: `scale(${contentScale})`,
              transformOrigin: 'top left'
            }}
          >
            <SlideRenderer markdown={markdown} rootPath={rootPath} />
          </div>
        </div>
        {/* Draggable elements overlay (text boxes) */}
        {editable && onUpdateMarkdown && (
          <div className="absolute inset-0 p-12" style={{ zIndex: 10 }}>
            <DraggableElements
              markdown={markdown}
              canvasScale={canvasScale}
              onUpdateMarkdown={onUpdateMarkdown}
              editable={true}
            />
          </div>
        )}
        {/* Layout label (preview mode — no lines) */}
        {layout && layout !== 'default' && layout !== 'blank' && (
          <LayoutGuide layout={layout} width={SLIDE_W} height={SLIDE_H} pad={PAD} showLines={false} />
        )}
        {/* Drawing overlay */}
        {typeof slideIndex === 'number' && (
          <DrawingOverlay
            slideIndex={slideIndex}
            active={!!drawingMode}
            width={SLIDE_W}
            height={SLIDE_H}
          />
        )}
      </div>
    </div>
  )
}

/** Editable slide canvas — WYSIWYG editor rendered inside the scaled 16:9 frame */
function EditableSlideCanvas({ slideIndex, breakOffsets, rootPath, layout }: {
  slideIndex: number; breakOffsets?: number[]; rootPath?: string; layout?: string
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasScale, setCanvasScale] = useState(1)
  const { slides, updateMarkdownContent, saveSlideContent } = usePresentationStore()
  const slideTheme = usePresentationStore((s) => s.presentation?.theme) || 'dark'
  const markdown = slides[slideIndex]?.markdownContent ?? ''

  const SLIDE_W = 1280
  const SLIDE_H = 720
  const PAD = 48

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateScale = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      const margin = 16
      const s = Math.min((cw - margin * 2) / SLIDE_W, (ch - margin * 2) / SLIDE_H)
      setCanvasScale(Math.max(0.05, s))
    }
    updateScale()
    const ro = new ResizeObserver(updateScale)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Show visual break indicators for sub-slides
  const numSubSlides = (breakOffsets?.length ?? 0) + 1

  return (
    <div ref={containerRef} className="h-full w-full bg-neutral-800 overflow-y-auto overflow-x-hidden"
      data-slide-theme={slideTheme}>
      {/* Sub-slide count badge */}
      {numSubSlides > 1 && (
        <div className="sticky top-0 z-10 flex justify-center py-1">
          <span className="text-[10px] font-mono text-gray-400 bg-gray-800/80 backdrop-blur px-2 py-0.5 rounded-full">
            {numSubSlides} sub-slides — edit below, breaks shown as dashed lines
          </span>
        </div>
      )}
      <div
        className="relative rounded mx-auto"
        style={{
          width: SLIDE_W,
          minHeight: SLIDE_H,
          zoom: canvasScale,
          marginTop: 16,
          marginBottom: 16,
          background: 'var(--slide-bg)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.6), 0 0 80px rgba(0,0,0,0.4)'
        }}
      >
        <div className={`relative ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
          <WysiwygEditor slideIndex={slideIndex} breakOffsets={breakOffsets} />
        </div>
        {/* Layout guide overlay */}
        {layout && layout !== 'default' && layout !== 'blank' && (
          <LayoutGuide layout={layout} width={SLIDE_W} height={SLIDE_H} pad={PAD} />
        )}
      </div>
    </div>
  )
}

/** Visual guide overlay showing column dividers and layout name */
function LayoutGuide({ layout, width, height, pad, showLines = true }: {
  layout: string; width: number; height: number; pad: number; showLines?: boolean
}): JSX.Element {
  const LAYOUT_LABELS: Record<string, string> = {
    'center': 'Center', 'title': 'Title', 'section': 'Section',
    'two-col': '2 Columns', 'two-col-wide-left': 'Wide Left', 'two-col-wide-right': 'Wide Right',
    'three-col': '3 Columns', 'top-bottom': 'Top / Bottom',
    'big-number': 'Big Number', 'quote': 'Quote',
  }

  const dividers: { x?: number[]; y?: number[] } = {
    'two-col': { x: [0.5] },
    'two-col-wide-left': { x: [0.6] },
    'two-col-wide-right': { x: [0.4] },
    'three-col': { x: [0.333, 0.666] },
    'top-bottom': { y: [0.5] },
  }[layout] ?? {}

  const contentW = width - pad * 2
  const contentH = height - pad * 2

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      <div className={`absolute top-2 right-2 rounded bg-indigo-600/80 text-white font-medium ${showLines ? 'px-2 py-0.5 text-[10px]' : 'px-1.5 py-px text-[8px] opacity-70'}`}>
        {LAYOUT_LABELS[layout] || layout}
      </div>
      {showLines && dividers.x?.map((frac, i) => (
        <div
          key={`v${i}`}
          className="absolute border-l border-dashed border-indigo-400/30"
          style={{ left: pad + contentW * frac, top: pad, bottom: pad }}
        />
      ))}
      {showLines && dividers.y?.map((frac, i) => (
        <div
          key={`h${i}`}
          className="absolute border-t border-dashed border-indigo-400/30"
          style={{ top: pad + contentH * frac, left: pad, right: pad }}
        />
      ))}
    </div>
  )
}

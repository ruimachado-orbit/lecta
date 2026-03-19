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
  const [wysiwygHeaderSlot, setWysiwygHeaderSlot] = useState<HTMLDivElement | null>(null)

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

  const { subSlides, currentSubSlide, setCurrentSubSlide, breakOffsets, hasManualBreaks } = useSubSlides(
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

  // Extract positioned image/textbox/shape comments from the full markdown
  // so they appear on every sub-slide (they're global to the slide, not tied to a section)
  const fullMd = currentSlide.markdownContent
  const globalComments: string[] = []
  fullMd.replace(/<!--\s*image\s[^>]*-->/gi, (m) => { globalComments.push(m); return '' })
  fullMd.replace(/<!--\s*textbox[\s\S]*?\/textbox\s*-->/gi, (m) => { globalComments.push(m); return '' })
  fullMd.replace(/<!--\s*shape\s[^>]*-->/gi, (m) => { globalComments.push(m); return '' })

  const subSlideMarkdown = subSlides[currentSubSlide]?.markdown ?? currentSlide.markdownContent
  const activeMarkdown = globalComments.length > 0
    ? subSlideMarkdown + '\n' + globalComments.join('\n')
    : subSlideMarkdown

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
<<<<<<< Updated upstream
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

      {/* AI change bar (preview mode) + AI improve bar + Chat */}
      {!editingSlide && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-gray-800 bg-gray-900/50">
          <AIChangeBar />
          <AIImproveBar />
        </div>
      )}
=======
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
      {editorMode === 'wysiwyg' && !drawingMode && <div ref={setWysiwygHeaderSlot} className="bg-gray-900 border-b border-gray-800 shrink-0" />}
>>>>>>> Stashed changes

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
        ) : editingSlide && editorMode === 'wysiwyg' && subSlides.length > 1 && hasManualBreaks ? (
          /* WYSIWYG with manual sub-slides (---): stacked canvases, click to edit */
          <SubSlideStackEditor
            subSlides={subSlides}
            currentSubSlide={currentSubSlide}
            setCurrentSubSlide={setCurrentSubSlide}
            slideIndex={currentSlideIndex}
            currentSlide={currentSlide}
            presentation={presentation}
            updateMarkdownContent={updateMarkdownContent}
            saveSlideContent={saveSlideContent}
            wysiwygHeaderSlot={wysiwygHeaderSlot}
          />
        ) : editingSlide && editorMode === 'wysiwyg' ? (
          /* WYSIWYG: single canvas */
          <EditableSlideCanvas slideIndex={currentSlideIndex} breakOffsets={breakOffsets} rootPath={presentation?.rootPath} layout={currentSlide.config.layout} wysiwygHeaderSlot={wysiwygHeaderSlot} />
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
        ) : (
          /* Preview/read mode: show active sub-slide only */
          <SlideCanvas
            markdown={activeMarkdown}
            rootPath={presentation?.rootPath}
            transition={currentSlide.config.transition}
            layout={currentSlide.config.layout}
            slideIndex={currentSlideIndex}
            drawingMode={drawingMode}
            editable={true}
            showGlobalLayers={true}
            onUpdateMarkdown={(md) => {
              updateMarkdownContent(currentSlideIndex, md)
              saveSlideContent(currentSlideIndex)
            }}
          />
        )}
      </div>

      {/* Sub-slide pagination */}
      {subSlides.length > 1 && (
        <div className="h-8 bg-gray-900 border-t border-gray-800 flex items-center justify-center gap-1.5 px-4 shrink-0">
          {subSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSubSlide(i)}
              className={`w-6 h-5 rounded text-[9px] font-medium transition-colors ${
                i === currentSubSlide
                  ? 'bg-white text-black'
                  : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
              }`}
            >
              {i + 1}
            </button>
          ))}
          <span className="text-[9px] text-gray-600 ml-2">
            {currentSubSlide + 1}/{subSlides.length} sub-slides
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

/** Read-only overlay for positioned images — renders outside content scaling so images appear at correct slide coordinates */
function PositionedImagesOverlay({ markdown, rootPath, pad }: { markdown: string; rootPath?: string; pad: number }): JSX.Element | null {
  const regex = /<!--\s*image\s+x=(-?\d+)\s+y=(-?\d+)\s+w=(\d+)\s+src=([^\s]+)(?:\s+border=([^\s]+))?(?:\s+radius=(\d+))?\s*-->/gi
  const images: { x: number; y: number; w: number; src: string; border?: string; radius?: number }[] = []
  let match
  while ((match = regex.exec(markdown)) !== null) {
    images.push({
      x: parseInt(match[1]), y: parseInt(match[2]), w: parseInt(match[3]),
      src: match[4],
      border: match[5]?.replace(/_/g, ' '),
      radius: match[6] ? parseInt(match[6]) : undefined,
    })
  }
  if (images.length === 0) return null

  const resolve = (src: string) => {
    if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('lecta-file://')) return src
    if (rootPath) return `lecta-file://${rootPath}/${src}`
    return src
  }

  return (
    <div className="absolute inset-0" style={{ padding: pad, zIndex: 8, pointerEvents: 'none' }}>
      {images.map((img, i) => (
        <img
          key={`pimg-${i}`}
          src={resolve(img.src)}
          style={{
            position: 'absolute',
            left: img.x,
            top: img.y,
            width: img.w,
            border: img.border || undefined,
            borderRadius: img.radius || undefined,
          }}
        />
      ))}
    </div>
  )
}

/** 16:9 slide canvas that auto-scales content to fit */
function SlideCanvas({ markdown, rootPath, transition, layout, slideIndex, drawingMode, editable, onUpdateMarkdown, showGlobalLayers }: {
  markdown: string; rootPath?: string; transition?: string; layout?: string; slideIndex?: number; drawingMode?: boolean
  editable?: boolean; onUpdateMarkdown?: (md: string) => void; showGlobalLayers?: boolean
}): JSX.Element {
  const slideTheme = usePresentationStore((s) => s.presentation?.theme) || 'dark'
  const containerRef = useRef<HTMLDivElement>(null)
  const slideRef = useRef<HTMLDivElement>(null)
  const transitionRef = useRef<HTMLDivElement>(null)
  const [canvasScale, setCanvasScale] = useState(1)

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
            style={{
              width: layout === 'blank' ? SLIDE_W : SLIDE_W - PAD * 2,
              height: layout === 'blank' ? SLIDE_H : undefined,
            }}
          >
            <SlideRenderer markdown={markdown} rootPath={rootPath} />
          </div>
        </div>
        {/* Positioned images overlay — always visible, outside content scaling */}
        <PositionedImagesOverlay markdown={markdown} rootPath={rootPath} pad={layout === 'blank' ? 0 : PAD} />
        {/* Draggable elements overlay (text boxes, shapes, positioned images — editable) */}
        {editable && onUpdateMarkdown && (
          <div className="absolute inset-0 p-12" style={{ zIndex: 10 }}>
            <DraggableElements
              markdown={markdown}
              canvasScale={canvasScale}
              onUpdateMarkdown={onUpdateMarkdown}
              editable={true}
              rootPath={rootPath}
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
        {/* Global layers — persistent header/footer on every slide */}
        {showGlobalLayers && (
          <GlobalLayers width={SLIDE_W} height={SLIDE_H} />
        )}
      </div>
    </div>
  )
}

/** Global layers: persistent header/footer rendered on every slide */
function GlobalLayers({ width, height }: { width: number; height: number }): JSX.Element | null {
  const presentation = usePresentationStore((s) => s.presentation)
  const currentSlideIndex = usePresentationStore((s) => s.currentSlideIndex)
  const totalSlides = usePresentationStore((s) => s.slides.length)
  const currentSlide = usePresentationStore((s) => s.slides[s.currentSlideIndex])

  if (!presentation) return null

  // Skip global layers on title/cover slides
  const layout = currentSlide?.config.layout
  if (layout === 'title' || layout === 'blank') return null

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 8 }}>
      {/* Bottom bar: title left, slide number right */}
      <div className="absolute bottom-0 left-0 right-0 px-12 pb-3 flex items-end justify-between">
        <span style={{ fontSize: 11, opacity: 0.4, color: 'var(--slide-text)', fontWeight: 500 }}>
          {presentation.title}
        </span>
        <span style={{ fontSize: 11, opacity: 0.35, color: 'var(--slide-text)', fontFamily: 'monospace' }}>
          {currentSlideIndex + 1} / {totalSlides}
        </span>
      </div>
    </div>
  )
}

/** Editable slide canvas — WYSIWYG editor rendered inside the scaled 16:9 frame */
function EditableSlideCanvas({ slideIndex, breakOffsets, rootPath, layout, subSlideCount, wysiwygHeaderSlot }: {
  slideIndex: number; breakOffsets?: number[]; rootPath?: string; layout?: string; subSlideCount?: number; wysiwygHeaderSlot?: HTMLDivElement | null
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

  const numSubSlides = subSlideCount ?? 1

  return (
    <div ref={containerRef} className="h-full w-full bg-neutral-800 overflow-y-auto overflow-x-hidden"
      data-slide-theme={slideTheme}>
      {/* Sub-slide count badge */}
      {numSubSlides > 1 && (
        <div className="sticky top-0 z-10 flex justify-center py-1">
          <span className="text-[10px] font-mono text-gray-400 bg-gray-800/80 backdrop-blur px-2 py-0.5 rounded-full">
            {numSubSlides} sub-slides — use --- to add page breaks
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
          <WysiwygEditor slideIndex={slideIndex} breakOffsets={breakOffsets} headerSlot={wysiwygHeaderSlot} />
        </div>
        {/* Positioned images/textboxes overlay in editor mode */}
        <div className="absolute inset-0 p-12" style={{ zIndex: 10, pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }}>
            <DraggableElements
              markdown={markdown}
              canvasScale={canvasScale}
              onUpdateMarkdown={(newMd) => { updateMarkdownContent(slideIndex, newMd); saveSlideContent(slideIndex) }}
              editable={true}
              rootPath={rootPath}
            />
          </div>
        </div>
        {/* Layout guide overlay */}
        {layout && layout !== 'default' && layout !== 'blank' && (
          <LayoutGuide layout={layout} width={SLIDE_W} height={SLIDE_H} pad={PAD} />
        )}
        {/* Drawing overlay (read-only) */}
        <DrawingOverlay slideIndex={slideIndex} active={false} width={SLIDE_W} height={SLIDE_H} />
      </div>
    </div>
  )
}

/** Split full markdown into sections by --- separators */
function splitFullMdSections(fullMd: string): string[] {
  const hasBreaks = fullMd.split('\n').some(l => /^(?:---+|\*\s*\*\s*\*|___+)$/.test(l.trim()))
  if (!hasBreaks) return [fullMd]
  return fullMd.split(/\n?(?:---+|\*\s*\*\s*\*|___+)\n?/).map(s => s.trim()).filter(s => s.length > 0)
}

/** Stacked sub-slide editor — shows all sub-slides as separate canvases, selected one is WYSIWYG-editable */
function SubSlideStackEditor({ subSlides, currentSubSlide, setCurrentSubSlide, slideIndex, currentSlide, presentation, updateMarkdownContent, saveSlideContent, wysiwygHeaderSlot }: {
  subSlides: { markdown: string; index: number }[]
  currentSubSlide: number
  setCurrentSubSlide: (n: number) => void
  slideIndex: number
  currentSlide: any
  presentation: any
  updateMarkdownContent: (idx: number, md: string) => void
  saveSlideContent: (idx: number) => void
  wysiwygHeaderSlot?: HTMLDivElement | null
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [baseScale, setBaseScale] = useState(0.5)
  const [zoomOffset, setZoomOffset] = useState(0) // -3 to +3 steps, each step = 0.08
  const canvasScale = Math.max(0.15, Math.min(1.2, baseScale + zoomOffset * 0.08))
  const slideTheme = presentation?.theme || 'dark'
  const layout = currentSlide.config.layout

  const SLIDE_W = 1280
  const SLIDE_H = 720

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateScale = () => {
      const cw = container.clientWidth
      const margin = 24
      // Fit width — scrollable vertically
      setBaseScale(Math.min((cw - margin * 2) / SLIDE_W, 1))
    }
    updateScale()
    const ro = new ResizeObserver(updateScale)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  /** Add a new empty sub-slide after the given index */
  const addSubSlide = useCallback((afterIndex: number) => {
    const sections = splitFullMdSections(currentSlide.markdownContent)
    sections.splice(afterIndex + 1, 0, '')
    updateMarkdownContent(slideIndex, sections.join('\n\n---\n\n'))
    saveSlideContent(slideIndex)
    setCurrentSubSlide(afterIndex + 1)
  }, [currentSlide.markdownContent, slideIndex, updateMarkdownContent, saveSlideContent, setCurrentSubSlide])

  /** Delete a sub-slide by index */
  const deleteSubSlide = useCallback((subIndex: number) => {
    const sections = splitFullMdSections(currentSlide.markdownContent)
    if (sections.length <= 1) return // Can't delete the only sub-slide
    sections.splice(subIndex, 1)
    const newMd = sections.length === 1 ? sections[0] : sections.join('\n\n---\n\n')
    updateMarkdownContent(slideIndex, newMd)
    saveSlideContent(slideIndex)
    if (currentSubSlide >= sections.length) {
      setCurrentSubSlide(Math.max(0, sections.length - 1))
    }
  }, [currentSlide.markdownContent, slideIndex, updateMarkdownContent, saveSlideContent, currentSubSlide, setCurrentSubSlide])

  /** Replace a single sub-slide's content back into the full markdown */
  const replaceSubSlide = useCallback((subIndex: number, newMd: string) => {
    const sections = splitFullMdSections(currentSlide.markdownContent)
    if (sections.length <= 1 && subIndex === 0) {
      updateMarkdownContent(slideIndex, newMd)
    } else {
      sections[subIndex] = newMd
      updateMarkdownContent(slideIndex, sections.join('\n\n---\n\n'))
    }
    saveSlideContent(slideIndex)
  }, [currentSlide.markdownContent, slideIndex, updateMarkdownContent, saveSlideContent])

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 bg-neutral-800 relative"
      data-slide-theme={slideTheme}>
      {/* Zoom controls */}
      <div className="sticky top-2 z-20 flex justify-end pr-3 mb-1">
        <div className="flex items-center gap-1 bg-gray-900/80 backdrop-blur rounded-full px-1.5 py-0.5 border border-gray-700/50">
          <button
            onClick={() => setZoomOffset(z => Math.max(-4, z - 1))}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white rounded-full hover:bg-gray-700/50 transition-colors text-xs"
            title="Zoom out"
          >−</button>
          <span className="text-[9px] text-gray-500 font-mono w-8 text-center">{Math.round(canvasScale * 100)}%</span>
          <button
            onClick={() => setZoomOffset(z => Math.min(4, z + 1))}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white rounded-full hover:bg-gray-700/50 transition-colors text-xs"
            title="Zoom in"
          >+</button>
          {zoomOffset !== 0 && (
            <button
              onClick={() => setZoomOffset(0)}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white rounded-full hover:bg-gray-700/50 transition-colors"
              title="Reset zoom"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center gap-6 px-4">
        {subSlides.map((sub, i) => (
          <div key={`sub-${sub.index}`} className="w-full flex flex-col items-center">
            {/* Sub-slide label */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                i === currentSubSlide ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-600'
              }`}>
                Sub-slide {i + 1}
              </span>
              {i > 0 && (
                <span className="text-[9px] text-gray-700">--- page break ---</span>
              )}
            </div>
            {/* Canvas frame */}
            <div
              className={`relative group/canvas rounded transition-all ${
                i === currentSubSlide
                  ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-neutral-800'
                  : 'opacity-70 hover:opacity-90 ring-1 ring-white/10 cursor-pointer'
              }`}
              style={{
                width: SLIDE_W * canvasScale,
                minHeight: SLIDE_H * canvasScale,
                overflow: 'hidden'
              }}
              onClick={() => { if (i !== currentSubSlide) setCurrentSubSlide(i) }}
            >
              {/* Delete sub-slide button (top-right, only when >1 sub-slides) */}
              {subSlides.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSubSlide(i) }}
                  className="absolute top-1.5 right-1.5 z-30 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/canvas:opacity-100 transition-opacity"
                  title={`Delete sub-slide ${i + 1}`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              )}
              <div
                style={{
                  width: SLIDE_W,
                  minHeight: SLIDE_H,
                  transform: `scale(${canvasScale})`,
                  transformOrigin: 'top left',
                  background: 'var(--slide-bg)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.6)',
                  borderRadius: 4,
                }}
              >
                {i === currentSubSlide ? (
                  /* Selected sub-slide: full WYSIWYG editor */
                  <div className={`relative ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
                    <WysiwygEditor
                      slideIndex={slideIndex}
                      subSlideMarkdown={sub.markdown}
                      onSubSlideChange={(md) => replaceSubSlide(i, md)}
                      headerSlot={wysiwygHeaderSlot}
                    />
                  </div>
                ) : (
                  /* Other sub-slides: read-only preview */
                  <div className={`absolute inset-0 ${layout === 'blank' ? '' : 'p-12'} overflow-hidden ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
                    <div className="slide-content max-w-none" style={{ width: layout === 'blank' ? SLIDE_W : SLIDE_W - 96 }}>
                      <SlideRenderer markdown={sub.markdown} rootPath={rootPath} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {/* Add sub-slide button */}
        <button
          onClick={() => addSubSlide(subSlides.length - 1)}
          className="mt-2 mb-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-600 text-gray-500 hover:text-gray-300 hover:border-gray-400 transition-colors text-[11px]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add sub-slide
        </button>
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

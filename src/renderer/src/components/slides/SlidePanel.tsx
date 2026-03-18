import { useCallback, useRef, useState, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { SlideRenderer } from './SlideRenderer'
import { SlideNavigator } from './SlideNavigator'
import { SlideEditToolbar } from './SlideEditToolbar'
import { WysiwygEditor } from './WysiwygEditor'
import { AIGeneratePanel, AIImproveBar } from './AISlidePanel'
import { ArtifactBar } from '../artifacts/ArtifactBar'
import { useSubSlides } from '../../hooks/useSubSlides'
import { DrawingOverlay } from './DrawingOverlay'
import { DraggableElements } from './DraggableElements'
import Editor, { type OnMount } from '@monaco-editor/react'

export function SlidePanel(): JSX.Element {
  const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent, presentation } = usePresentationStore()
  const { showNavigator, editingSlide, editorMode, setEditorMode } = useUIStore()
  const currentSlide = slides[currentSlideIndex]
  const editorRef = useRef<any>(null)
  const { showAIGenerate } = useUIStore()
  const [drawingMode, setDrawingMode] = useState(false)

  const { subSlides, currentSubSlide, setCurrentSubSlide, breakOffsets } = useSubSlides(
    currentSlide?.markdownContent ?? '',
    currentSlideIndex
  )

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
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
          </div>
          {editorMode === 'markdown' && !drawingMode && <SlideEditToolbar editorRef={editorRef} />}
        </>
      )}

      {/* AI improve bar (preview mode only) */}
      {!editingSlide && <AIImproveBar />}

      {/* Main content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {editingSlide && drawingMode ? (
          /* Drawing mode: full canvas with Excalidraw overlay */
          <SlideCanvas
            markdown={currentSlide.markdownContent}
            rootPath={presentation?.rootPath}
            layout={currentSlide.config.layout}
            slideIndex={currentSlideIndex}
            drawingMode={true}
          />
        ) : editingSlide && editorMode === 'wysiwyg' ? (
          /* WYSIWYG: editor IS the canvas */
          <EditableSlideCanvas slideIndex={currentSlideIndex} breakOffsets={breakOffsets} rootPath={presentation?.rootPath} />
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
                  minimap: { enabled: false }, scrollBeyondLastLine: false,
                  padding: { top: 12, bottom: 12 }, lineNumbers: 'off',
                  renderLineHighlight: 'none', wordWrap: 'on',
                  automaticLayout: true, tabSize: 2
                }}
              />
            </div>
          </>
        ) : (
          /* Preview mode: read-only canvas */
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

      {/* Sub-slide pagination (only when there are multiple sub-slides) */}
      {subSlides.length > 1 && (
        <div className="h-8 bg-gray-900 border-t border-gray-800 flex items-center justify-center gap-1.5 px-4 flex-shrink-0">
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

/** 16:9 slide canvas that auto-scales content to fit */
function SlideCanvas({ markdown, rootPath, transition, layout, slideIndex, drawingMode, editable, onUpdateMarkdown }: {
  markdown: string; rootPath?: string; transition?: string; layout?: string; slideIndex?: number; drawingMode?: boolean
  editable?: boolean; onUpdateMarkdown?: (md: string) => void
}): JSX.Element {
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

    // Measure after render + images/diagrams load
    measure()
    const timer = setTimeout(measure, 500)
    return () => clearTimeout(timer)
  }, [markdown])

  return (
    <div ref={containerRef} className="h-full w-full flex items-center justify-center bg-neutral-800 overflow-hidden">
      <div
        ref={slideRef}
        className="relative rounded overflow-hidden"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${canvasScale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.6), 0 0 80px rgba(0,0,0,0.4)'
        }}
      >
        <div className="absolute inset-0 bg-black rounded" />
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
function EditableSlideCanvas({ slideIndex, breakOffsets, rootPath }: {
  slideIndex: number; breakOffsets?: number[]; rootPath?: string
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasScale, setCanvasScale] = useState(1)

  const SLIDE_W = 1280
  const SLIDE_H = 720

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
        className="relative rounded overflow-hidden"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${canvasScale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.6), 0 0 80px rgba(0,0,0,0.4)'
        }}
      >
        <div className="absolute inset-0 bg-black rounded" />
        <div className="absolute inset-0 overflow-hidden">
          <WysiwygEditor slideIndex={slideIndex} breakOffsets={breakOffsets} />
        </div>
      </div>
    </div>
  )
}

import { useCallback, useRef, useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { ContentRenderer } from './ContentRenderer'
import { SlideErrorBoundary } from './SlideErrorBoundary'
import { prefetchMdx } from './MdxRenderer'
import { SlideNavigator } from './SlideNavigator'
import { SlideEditToolbar } from './SlideEditToolbar'
import { SubSlideEditor } from './SubSlideEditor'
import { AIGeneratePanel, AIImproveBar, AIChangeBar } from './AISlidePanel'
import { ArtifactBar } from '../artifacts/ArtifactBar'
import { useSubSlides } from '../../hooks/useSubSlides'
import { DrawingOverlay, DrawingToolbar } from './DrawingOverlay'
import { DraggableElements } from './DraggableElements'
import { appendElement, extractElementComments, stripElements, CANVAS_H, CANVAS_W } from './element-model'
import { SUGGESTED_GLASS_GRADIENT } from './style-presets'
import { applySlideBackground, hasBackground } from './slide-background'
import Editor, { type OnMount } from '@monaco-editor/react'

export function SlidePanel(): JSX.Element {
  const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent, presentation, mdxTrusted, setMdxTrusted } =
    usePresentationStore(
      useShallow((s) => ({
        slides: s.slides,
        currentSlideIndex: s.currentSlideIndex,
        updateMarkdownContent: s.updateMarkdownContent,
        saveSlideContent: s.saveSlideContent,
        presentation: s.presentation,
        mdxTrusted: s.mdxTrusted,
        setMdxTrusted: s.setMdxTrusted
      }))
    )
  const { showNavigator, editingSlide, editorMode, setEditorMode, setEditingSlide, slideGroups } = useUIStore(
    useShallow((s) => ({
      showNavigator: s.showNavigator,
      editingSlide: s.editingSlide,
      editorMode: s.editorMode,
      setEditorMode: s.setEditorMode,
      setEditingSlide: s.setEditingSlide,
      slideGroups: s.slideGroups
    }))
  )
  const [mdxBannerDismissed, setMdxBannerDismissed] = useState(false)
  const [clickToEdit, setClickToEdit] = useState(false)
  const currentSlide = slides[currentSlideIndex]
  const [wysiwygHeaderSlot, setWysiwygHeaderSlot] = useState<HTMLDivElement | null>(null)
  const [showMarkdown, setShowMarkdown] = useState(false)
  const [markdownHeight, setMarkdownHeight] = useState(250)
  const isMdxSlide = currentSlide?.isMdx ?? false

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
  const showAIGenerate = useUIStore((s) => s.showAIGenerate)
  const [drawingMode, setDrawingMode] = useState(false)

  const { subSlides, currentSubSlide, setCurrentSubSlide, breakOffsets, hasManualBreaks } = useSubSlides(
    currentSlide?.markdownContent ?? '',
    currentSlideIndex,
    currentSlide?.isMdx
  )

  const breakOffsetsRef = useRef(breakOffsets)
  breakOffsetsRef.current = breakOffsets

  // Prefetch current + adjacent MDX slides for instant transitions.
  // Compiling is executing, so only ever for decks the user has trusted.
  useEffect(() => {
    if (!mdxTrusted) return
    const curr = slides[currentSlideIndex]
    const prev = slides[currentSlideIndex - 1]
    const next = slides[currentSlideIndex + 1]
    if (curr?.isMdx) prefetchMdx(curr.markdownContent)
    if (prev?.isMdx) prefetchMdx(prev.markdownContent)
    if (next?.isMdx) prefetchMdx(next.markdownContent)
  }, [currentSlideIndex, slides, mdxTrusted])

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor

    // Add sub-slide break decorations
    const updateDecorations = () => {
      const offsets = breakOffsetsRef.current
      if (!Array.isArray(offsets) || offsets.length === 0) {
        ;(editor as any).__subSlideDecorations = editor.deltaDecorations(
          (editor as any).__subSlideDecorations || [],
          []
        )
        return
      }
      const model = editor.getModel()
      if (!model) return

      const content = model.getValue()
      const decorations = offsets.map((offset, i) => {
        let charCount = 0
        const lines = content.split('\n')
        let lineNum = 1
        for (let l = 0; l < lines.length; l++) {
          charCount += lines[l].length + 1
          if (charCount >= offset) {
            lineNum = l + 2
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

      ;(editor as any).__subSlideDecorations = editor.deltaDecorations(
        (editor as any).__subSlideDecorations || [],
        decorations
      )
    }

    // Run once and on content change
    updateDecorations()
    editor.onDidChangeModelContent(updateDecorations)
  }

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateMarkdownContent(currentSlideIndex, value)
        // Auto-save after 1.5s of inactivity
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
        autoSaveTimer.current = setTimeout(() => {
          saveSlideContent(currentSlideIndex)
        }, 1500)
      }
    },
    [currentSlideIndex, updateMarkdownContent, saveSlideContent]
  )

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [])

  const handleEditorBlur = useCallback(() => {
    const { hasUnsavedChanges } = usePresentationStore.getState()
    if (!hasUnsavedChanges) return
    saveSlideContent(currentSlideIndex)
  }, [currentSlideIndex, saveSlideContent])

  if (!currentSlide) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No slides loaded
      </div>
    )
  }

  // Positioned image/textbox/shape comments are global to the slide, not to a sub-slide section,
  // so they are rendered on top of whichever sub-slide is showing. They are stripped from the
  // sub-slide body first, otherwise a comment that lives in this section is drawn twice.
  const fullMd = currentSlide.markdownContent
  const globalComments = extractElementComments(fullMd)

  const subSlideMarkdown = subSlides[currentSubSlide]?.markdown ?? fullMd
  const activeMarkdown = globalComments.length > 0
    ? `${stripElements(subSlideMarkdown).trimEnd()}\n${globalComments.join('\n')}`
    : subSlideMarkdown

  const showMdxTrustBanner = currentSlide.isMdx && !mdxTrusted && !mdxBannerDismissed

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
      {/* Executable-MDX trust gate */}
      {showMdxTrustBanner && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-amber-500/30 bg-amber-500/10 shrink-0">
          <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span className="text-[12px] text-amber-100 flex-1">
            This deck contains executable MDX slides.
          </span>
          <button
            onClick={() => setMdxTrusted(true)}
            className="text-[11px] font-medium px-2.5 py-1 rounded bg-amber-500 text-black hover:bg-amber-400 transition-colors"
          >
            Trust and render
          </button>
          <button
            onClick={() => setMdxBannerDismissed(true)}
            className="text-[11px] px-2.5 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Show as text
          </button>
        </div>
      )}

      {/* Editor toolbar */}
      {editingSlide && (
        <>
          <div className="h-7 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2">
            <button
              onClick={() => { setEditorMode('wysiwyg'); setDrawingMode(false); setShowMarkdown(false) }}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors font-medium ${
                editorMode === 'wysiwyg' && !drawingMode ? 'bg-signal-500 text-ink-950' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => { setEditorMode('markdown'); setDrawingMode(false) }}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors font-medium ${
                editorMode === 'markdown' && !drawingMode ? 'bg-signal-500 text-ink-950' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setDrawingMode(!drawingMode)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors font-medium flex items-center gap-1 ${
                drawingMode ? 'bg-signal-500 text-ink-950' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
              Draw
            </button>
            <div className="flex-1" />
            {editorMode === 'markdown' && !drawingMode && (
              <button
                onClick={() => setShowMarkdown(!showMarkdown)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  showMarkdown ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {isMdxSlide ? (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                    {showMarkdown ? 'Hide Preview' : 'Show Preview'}
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                    </svg>
                    {showMarkdown ? 'Hide Markdown' : 'See Markdown'}
                  </>
                )}
              </button>
            )}
            <AIChangeBar />
          </div>
          {showMarkdown && editorMode === 'markdown' && !drawingMode && !isMdxSlide && <SlideEditToolbar editorRef={editorRef} />}
          {editorMode === 'markdown' && !drawingMode && !isMdxSlide && <div ref={setWysiwygHeaderSlot} className="bg-gray-900 border-b border-gray-800 shrink-0" />}
        </>
      )}

      {/* AI change bar (preview mode) + AI improve bar */}
      {!editingSlide && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-gray-800 bg-gray-900/50">
          <AIChangeBar />
          <AIImproveBar />
          <div className="flex-1" />
          <button
            onClick={() => setClickToEdit((v) => !v)}
            title="Click any block on the slide to jump into editing"
            aria-pressed={clickToEdit}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors font-medium ${
              clickToEdit ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Click-to-edit
          </button>
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
                slideId={currentSlide.config.id}
                drawingMode={true}
                isMdx={currentSlide.isMdx}
              />
            </div>
          </div>
        ) : editingSlide && editorMode === 'wysiwyg' ? (
          /* Visual: read-only slide preview */
          <SlideCanvas
            markdown={activeMarkdown}
            rootPath={presentation?.rootPath}
            transition={currentSlide.config.transition}
            layout={currentSlide.config.layout}
            slideIndex={currentSlideIndex}
            slideId={currentSlide.config.id}
            showGlobalLayers={true}
            isMdx={currentSlide.isMdx}
          />
        ) : editingSlide && editorMode === 'markdown' && currentSlide.isMdx ? (
          /* MDX Editor mode: editable code editor + live preview */
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0" onBlur={handleEditorBlur}>
              <Editor
                height="100%"
                language="mdx"
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
            {showMarkdown && (
              <>
                {/* Drag handle */}
                <div
                  className="h-1.5 bg-gray-800 hover:bg-blue-500/50 cursor-row-resize flex-shrink-0 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const startY = e.clientY
                    const startHeight = markdownHeight
                    const onMouseMove = (ev: MouseEvent) => {
                      const delta = startY - ev.clientY
                      setMarkdownHeight(Math.max(100, Math.min(600, startHeight + delta)))
                    }
                    const onMouseUp = () => {
                      document.removeEventListener('mousemove', onMouseMove)
                      document.removeEventListener('mouseup', onMouseUp)
                    }
                    document.addEventListener('mousemove', onMouseMove)
                    document.addEventListener('mouseup', onMouseUp)
                  }}
                />
                <div className="flex-shrink-0" style={{ height: markdownHeight }}>
                  <SlideCanvas
                    markdown={currentSlide.markdownContent}
                    rootPath={presentation?.rootPath}
                    layout={currentSlide.config.layout}
                    slideIndex={currentSlideIndex}
                    slideId={currentSlide.config.id}
                    showGlobalLayers={true}
                    isMdx={true}
                  />
                </div>
              </>
            )}
          </div>
        ) : editingSlide && editorMode === 'markdown' ? (
          /* Non-MDX Editor mode: WYSIWYG editing + optional resizable markdown panel */
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0">
              <SubSlideEditor
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
            </div>
            {showMarkdown && (
              <>
                <div
                  className="h-1.5 bg-gray-800 hover:bg-blue-500/50 cursor-row-resize flex-shrink-0 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const startY = e.clientY
                    const startHeight = markdownHeight
                    const onMouseMove = (ev: MouseEvent) => {
                      const delta = startY - ev.clientY
                      setMarkdownHeight(Math.max(100, Math.min(600, startHeight + delta)))
                    }
                    const onMouseUp = () => {
                      document.removeEventListener('mousemove', onMouseMove)
                      document.removeEventListener('mouseup', onMouseUp)
                    }
                    document.addEventListener('mousemove', onMouseMove)
                    document.addEventListener('mouseup', onMouseUp)
                  }}
                />
                <div className="flex-shrink-0" style={{ height: markdownHeight }} onBlur={handleEditorBlur}>
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
            )}
          </div>
        ) : (
          /* Preview/read mode: show active sub-slide only */
          <SlideCanvas
            markdown={activeMarkdown}
            fullMarkdown={fullMd}
            rootPath={presentation?.rootPath}
            transition={currentSlide.config.transition}
            layout={currentSlide.config.layout}
            slideIndex={currentSlideIndex}
            slideId={currentSlide.config.id}
            drawingMode={drawingMode}
            editable={true}
            showGlobalLayers={true}
            isMdx={currentSlide.isMdx}
            clickToEdit={clickToEdit && !currentSlide.isMdx}
            onPickBlock={() => {
              // Click-to-edit: one click on any block lands in the visual editor.
              setClickToEdit(false)
              setEditorMode('markdown')
              setEditingSlide(true)
            }}
            onUpdateMarkdown={(md) => {
              // `md` is the FULL slide markdown — DraggableElements was given fullMarkdown
              updateMarkdownContent(currentSlideIndex, md)
              saveSlideContent(currentSlideIndex)
            }}
          />
        )}
      </div>

      {/* Sub-slide pagination (hidden in Edit mode — the filmstrip takes over) */}
      {subSlides.length > 1 && !(editingSlide && editorMode === 'markdown' && !isMdxSlide) && (
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
        <div className="border-t border-gray-800 relative z-30">
          <SlideNavigator subSlideCount={subSlides.length} currentSubSlide={currentSubSlide} />
        </div>
      )}
    </div>
  )
}

/** 16:9 slide canvas that auto-scales content to fit */
function SlideCanvas({ markdown, fullMarkdown, rootPath, transition, layout, slideIndex, slideId, drawingMode, editable, onUpdateMarkdown, showGlobalLayers, isMdx, clickToEdit, onPickBlock }: {
  markdown: string; rootPath?: string; transition?: string; layout?: string; slideIndex?: number; drawingMode?: boolean
  editable?: boolean; onUpdateMarkdown?: (md: string) => void; showGlobalLayers?: boolean; isMdx?: boolean
  clickToEdit?: boolean; onPickBlock?: (blockText: string) => void
  /**
   * The slide's complete markdown. Draggable elements edit against this, never against the
   * displayed sub-slide — saving a sub-slide as the whole slide deletes the other sub-slides.
   */
  fullMarkdown?: string
  slideId?: string
}): JSX.Element {
  const slideTheme = usePresentationStore((s) => s.presentation?.theme) || 'dark'
  const background = usePresentationStore((s) =>
    typeof slideIndex === 'number' ? s.presentation?.slides[slideIndex]?.background : undefined
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const slideRef = useRef<HTMLDivElement>(null)
  const transitionRef = useRef<HTMLDivElement>(null)
  const [canvasScale, setCanvasScale] = useState(1)
  const [dropActive, setDropActive] = useState(false)

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
  const PAD_H = 80 // horizontal padding (safe zone)
  const PAD_V = 60 // vertical padding (safe zone)

  // Scale the canvas frame to fit the container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateScale = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      const s = Math.min(cw / SLIDE_W, ch / SLIDE_H)
      setCanvasScale(Math.max(0.05, s))
    }

    updateScale()
    const ro = new ResizeObserver(updateScale)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const acceptsDrops = !!(editable && onUpdateMarkdown && rootPath && typeof slideIndex === 'number')

  /**
   * Import dropped/pasted image files into the deck and pin them where they landed.
   * Several files fan out from the drop point so they do not stack exactly on top of
   * each other.
   */
  const importImages = useCallback(
    async (files: File[], point: { x: number; y: number }) => {
      if (!acceptsDrops || files.length === 0) return
      let md = fullMarkdown ?? markdown
      let placed = 0
      for (const file of files) {
        try {
          const dataUrl = await readAsDataUrl(file)
          const relative = await window.electronAPI.importDroppedImage(rootPath!, file.name, dataUrl)
          if (!relative) continue
          const w = 480
          const x = clampToCanvas(point.x - w / 2 + placed * 24, w, CANVAS_W)
          const y = clampToCanvas(point.y - (w * 0.66) / 2 + placed * 24, w * 0.66, CANVAS_H)
          // Pinned images are glass by default (rounded + liquid-glass surface, like every image).
          md = appendElement(md, { kind: 'image', x, y, w, src: relative, style: 'glass', extra: [] })
          placed++
        } catch (error) {
          usePresentationStore.setState({ error: (error as Error).message })
        }
      }
      if (placed > 0) onUpdateMarkdown!(md)
    },
    [acceptsDrops, fullMarkdown, markdown, onUpdateMarkdown, rootPath]
  )

  /** Pointer position in slide coordinates (the canvas is CSS-scaled to fit). */
  const toSlidePoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = slideRef.current?.getBoundingClientRect()
    if (!rect) return { x: CANVAS_W / 2, y: CANVAS_H / 2 }
    return { x: (clientX - rect.left) / canvasScale, y: (clientY - rect.top) / canvasScale }
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full relative overflow-hidden"
      style={{ background: 'var(--slide-bg)' }}
      onDragOver={acceptsDrops ? (e) => { e.preventDefault(); setDropActive(true) } : undefined}
      onDragLeave={acceptsDrops ? () => setDropActive(false) : undefined}
      onDrop={
        acceptsDrops
          ? (e) => {
              e.preventDefault()
              setDropActive(false)
              const files = imageFilesFrom(e.dataTransfer)
              if (files.length > 0) void importImages(files, toSlidePoint(e.clientX, e.clientY))
            }
          : undefined
      }
      onPaste={
        acceptsDrops
          ? (e) => {
              const files = imageFilesFrom(e.clipboardData)
              if (files.length === 0) return
              e.preventDefault()
              void importImages(files, { x: CANVAS_W / 2, y: CANVAS_H / 2 })
            }
          : undefined
      }
    >
      <div
        ref={slideRef}
        className="absolute overflow-hidden"
        data-slide-theme={slideTheme}
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `translate(-50%, -50%) scale(${canvasScale})`,
          transformOrigin: 'center center',
          left: '50%',
          top: '50%',
        }}
      >
        <div className="absolute inset-0" style={{ background: 'var(--slide-bg)' }} />
        <div ref={transitionRef} className={`absolute inset-0 ${layout === 'blank' || isMdx ? '' : 'slide-pad'} overflow-hidden ${transition && transition !== 'none' ? `slide-transition-${transition}` : ''} ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
          <div
            style={{
              width: layout === 'blank' || isMdx ? SLIDE_W : SLIDE_W - PAD_H * 2,
              height: layout === 'blank' || isMdx ? SLIDE_H : undefined,
            }}
          >
            <SlideErrorBoundary label={slideId}>
              <ContentRenderer
                markdown={markdown}
                rootPath={rootPath}
                isMdx={isMdx}
                slideId={slideId}
                background={background}
                hidePinned={!!(editable && onUpdateMarkdown)}
                clickToEdit={clickToEdit}
                onPickBlock={onPickBlock}
              />
            </SlideErrorBoundary>
          </div>
        </div>
        {/* Draggable elements overlay (text boxes, shapes, positioned images — editable) */}
        {editable && onUpdateMarkdown && (
          <div className="absolute inset-0 slide-pad" style={{ zIndex: 10 }}>
            <DraggableElements
              markdown={fullMarkdown ?? markdown}
              canvasScale={canvasScale}
              onUpdateMarkdown={onUpdateMarkdown}
              editable={true}
              rootPath={rootPath}
              hasSlideBackground={hasBackground(background)}
              onApplySuggestedBackground={() => {
                if (typeof slideIndex === 'number') {
                  void applySlideBackground(slideIndex, { ...background, gradient: SUGGESTED_GLASS_GRADIENT.css })
                }
              }}
            />
          </div>
        )}
        {/* Layout label (preview mode — no lines) */}
        {layout && layout !== 'default' && layout !== 'blank' && (
          <LayoutGuide layout={layout} width={SLIDE_W} height={SLIDE_H} pad={PAD_H} showLines={false} />
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
        {dropActive && (
          <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-indigo-400/70 bg-indigo-500/10 flex items-center justify-center"
            style={{ zIndex: 50 }}>
            <span className="text-2xl font-medium text-indigo-200">Drop image to pin it here</span>
          </div>
        )}
        {clickToEdit && !dropActive && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-full bg-black/70 border border-indigo-400/50 text-indigo-200 text-xs font-medium whitespace-nowrap"
            style={{ zIndex: 40 }}>
            Click any block to edit it
          </div>
        )}
      </div>
    </div>
  )
}

/** Image files from a drop or a paste, including screenshots pasted as raw bitmaps. */
function imageFilesFrom(source: DataTransfer | null): File[] {
  if (!source) return []
  const files = Array.from(source.files).filter((f) => f.type.startsWith('image/'))
  if (files.length > 0) return files
  return Array.from(source.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/** Keep a pinned element's box on the slide. */
function clampToCanvas(value: number, size: number, limit: number): number {
  return Math.round(Math.max(0, Math.min(value, limit - size)))
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
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between" style={{ paddingLeft: 80, paddingRight: 80, paddingBottom: 12 }}>
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

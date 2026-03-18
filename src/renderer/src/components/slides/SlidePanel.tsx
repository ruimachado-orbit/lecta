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
import Editor, { type OnMount } from '@monaco-editor/react'

export function SlidePanel(): JSX.Element {
  const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent, presentation } = usePresentationStore()
  const { showNavigator, editingSlide, editorMode, setEditorMode } = useUIStore()
  const currentSlide = slides[currentSlideIndex]
  const editorRef = useRef<any>(null)
  const [showAIGenerate, setShowAIGenerate] = useState(false)

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
              onClick={() => setEditorMode('wysiwyg')}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                editorMode === 'wysiwyg' ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Visual
            </button>
            <button
              onClick={() => setEditorMode('markdown')}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                editorMode === 'markdown' ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Markdown
            </button>
          </div>
          {editorMode === 'markdown' && <SlideEditToolbar editorRef={editorRef} />}
        </>
      )}

      {/* AI improve bar */}
      {!editingSlide && <AIImproveBar />}

      {/* Main content area */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {editingSlide ? (
          <>
            <div className="flex-1 min-h-0">
              {editorMode === 'wysiwyg' ? (
                <WysiwygEditor slideIndex={currentSlideIndex} breakOffsets={breakOffsets} />
              ) : (
                <div className="h-full" onBlur={handleEditorBlur}>
                  <Editor
                    height="100%"
                    language="markdown"
                    value={currentSlide.markdownContent}
                    onChange={handleEditorChange}
                    onMount={handleEditorMount}
                    theme="vs-dark"
                    options={{
                      fontSize: 15,
                      lineHeight: 22,
                      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      padding: { top: 16, bottom: 16 },
                      lineNumbers: 'off',
                      renderLineHighlight: 'none',
                      wordWrap: 'on',
                      automaticLayout: true,
                      tabSize: 2
                    }}
                  />
                </div>
              )}
            </div>
            {/* Live canvas preview strip */}
            <div className="h-48 border-t border-gray-800 flex-shrink-0">
              <SlideCanvas markdown={activeMarkdown} rootPath={presentation?.rootPath} />
            </div>
          </>
        ) : (
          <SlideCanvas markdown={activeMarkdown} rootPath={presentation?.rootPath} />
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
        <div className="flex border-t border-gray-800">
          <div className="flex-1 overflow-hidden">
            <SlideNavigator subSlideCount={subSlides.length} currentSubSlide={currentSubSlide} />
          </div>
          <button
            onClick={() => setShowAIGenerate(!showAIGenerate)}
            className={`flex-shrink-0 w-12 border-l border-gray-800 flex items-center justify-center transition-colors ${
              showAIGenerate ? 'bg-white text-black' : 'bg-gray-900 text-gray-500 hover:text-white'
            }`}
            title="AI slide generator"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

/** 16:9 slide canvas that auto-scales content to fit */
function SlideCanvas({ markdown, rootPath }: { markdown: string; rootPath?: string }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const SLIDE_W = 1280
  const SLIDE_H = 720

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateScale = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      const pad = 16
      const availW = cw - pad * 2
      const availH = ch - pad * 2
      const s = Math.min(availW / SLIDE_W, availH / SLIDE_H)
      setScale(Math.max(0.05, s))
    }

    updateScale()
    const ro = new ResizeObserver(updateScale)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="h-full w-full flex items-center justify-center bg-neutral-900 overflow-hidden">
      <div
        className="relative rounded-lg overflow-hidden shadow-2xl"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 25px 50px -12px rgba(0,0,0,0.5)'
        }}
      >
        <div className="absolute inset-0 bg-black rounded-lg" />
        <div className="absolute inset-0 p-12 overflow-hidden">
          <SlideRenderer markdown={markdown} rootPath={rootPath} />
        </div>
      </div>
    </div>
  )
}

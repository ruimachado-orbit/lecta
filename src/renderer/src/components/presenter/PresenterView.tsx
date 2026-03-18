import { useState, useEffect, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useExecutionStore } from '../../stores/execution-store'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useCodeExecution } from '../../hooks/useCodeExecution'
import { SlideRenderer } from '../slides/SlideRenderer'
import { CodeEditor } from '../code/CodeEditor'
import { ExecutionOutput } from '../code/ExecutionOutput'
import { MarkdownPreview } from '../code/MarkdownPreview'
import ReactMarkdown from 'react-markdown'

export function PresenterView(): JSX.Element {
  const { slides, currentSlideIndex, nextSlide, prevSlide, presentation } =
    usePresentationStore()
  const { setPresenting } = useUIStore()
  const { isExecuting } = useExecutionStore()
  const { runCode, cancelCode } = useCodeExecution()
  const [timer, setTimer] = useState(0)
  const [timerRunning, setTimerRunning] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  useKeyboardShortcuts()

  const currentSlide = slides[currentSlideIndex]
  const nextSlideData = slides[currentSlideIndex + 1] ?? null
  const hasCode = !!currentSlide?.config.code
  const isMarkdown = currentSlide?.config.code?.language === 'markdown'
  const notes = currentSlide?.notesContent

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerRunning])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  }

  const handleRun = () => {
    if (currentSlide?.codeContent && currentSlide.config.code) {
      runCode(currentSlide.codeContent, currentSlide.config.code)
    }
  }

  // Open audience window on mount, close on unmount
  useEffect(() => {
    window.electronAPI.openAudienceWindow()
    if (presentation) {
      window.electronAPI.sendPresenterPath(presentation.rootPath)
    }
    return () => {
      window.electronAPI.closeAudienceWindow()
    }
  }, [])

  // Sync slide index to audience window
  useEffect(() => {
    window.electronAPI.syncPresenterSlide(currentSlideIndex)
  }, [currentSlideIndex])

  return (
    <div className="h-screen flex flex-col bg-black">
      {/* Top bar */}
      <div className="h-11 bg-gray-900 border-b border-gray-800 flex items-center pl-20 pr-4 gap-3"
           style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        {/* Navigation */}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={prevSlide} disabled={currentSlideIndex === 0}
            className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors">
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-white text-sm font-mono font-semibold min-w-[50px] text-center">
            {currentSlideIndex + 1}/{slides.length}
          </span>
          <button onClick={nextSlide} disabled={currentSlideIndex === slides.length - 1}
            className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors">
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        <div className="w-px h-5 bg-gray-800" />

        <span className="text-gray-500 text-xs truncate flex-1">{presentation?.title}</span>

        {/* Timer + End */}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => setTimerRunning(!timerRunning)}
            className={`text-xs font-mono px-2 py-0.5 rounded transition-colors ${
              timerRunning ? 'text-white bg-gray-800' : 'text-gray-400 bg-gray-800'
            }`}>
            {formatTime(timer)}
          </button>
          <button onClick={() => setPresenting(false)}
            className="px-3 py-1 text-xs bg-red-500 hover:bg-red-400 text-white rounded transition-colors font-medium">
            End
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal">
          {/* LEFT: Slide + Speaker Notes */}
          <Panel defaultSize={hasCode ? 50 : 70} minSize={30}>
            <PanelGroup direction="vertical">
              {/* Slide */}
              <Panel defaultSize={notes ? 65 : 100} minSize={30}>
                <div className="h-full m-2 flex flex-col border border-gray-800 rounded-lg overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-8 bg-black">
                    {currentSlide && (
                      <SlideRenderer markdown={currentSlide.markdownContent} rootPath={presentation?.rootPath} />
                    )}
                  </div>
                </div>
              </Panel>

              {/* Speaker Notes */}
              {notes && (
                <>
                  <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-white transition-colors mx-2" />
                  <Panel defaultSize={35} minSize={10}>
                    <div className="h-full m-2 mt-0 flex flex-col border border-gray-800 rounded-lg overflow-hidden">
                      <div className="h-6 bg-gray-900 flex items-center px-3">
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Speaker Notes</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 bg-gray-950">
                        <div className="prose prose-sm prose-invert max-w-none text-gray-300 text-sm leading-relaxed">
                          <ReactMarkdown>{notes}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {/* RIGHT: Code editor + output OR next slide preview */}
          <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-white transition-colors" />
          <Panel defaultSize={hasCode ? 50 : 30} minSize={20}>
            {hasCode ? (
              <div className="h-full flex flex-col m-2 border border-gray-800 rounded-lg overflow-hidden">
                {/* Code toolbar */}
                <div className="h-8 bg-gray-900 flex items-center px-3 gap-2 flex-shrink-0">
                  <span className="text-gray-500 text-[10px] font-mono flex-1 truncate">
                    {currentSlide?.config.code?.file}
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
                    {currentSlide?.config.code?.language}
                  </span>
                  {isExecuting ? (
                    <button onClick={cancelCode}
                      className="px-2 py-0.5 bg-red-500 hover:bg-red-400 text-white text-[10px] rounded">Stop</button>
                  ) : (
                    <button onClick={handleRun}
                      className="px-2 py-0.5 bg-white hover:bg-gray-200 text-black text-[10px] rounded">Run</button>
                  )}
                </div>

                {/* Editor + Output */}
                <PanelGroup direction="vertical" className="flex-1">
                  <Panel defaultSize={55} minSize={20}>
                    <CodeEditor />
                  </Panel>
                  <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-white" />
                  <Panel defaultSize={45} minSize={10}>
                    {isMarkdown ? (
                      <MarkdownPreview content={currentSlide?.codeContent ?? ''} rootPath={presentation?.rootPath} />
                    ) : (
                      <ExecutionOutput />
                    )}
                  </Panel>
                </PanelGroup>
              </div>
            ) : (
              /* No code — show next slide preview */
              <div className="h-full flex flex-col m-2">
                <div className="flex-1 flex flex-col border border-gray-800 rounded-lg overflow-hidden">
                  <div className="h-6 bg-gray-900 flex items-center px-3">
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                      {nextSlideData ? `Next: ${nextSlideData.config.id}` : 'Last Slide'}
                    </span>
                  </div>
                  <div className="flex-1 overflow-hidden p-4 bg-gray-950">
                    {nextSlideData ? (
                      <div className="transform scale-[0.4] origin-top-left w-[250%]">
                        <SlideRenderer markdown={nextSlideData.markdownContent} rootPath={presentation?.rootPath} />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                        End of presentation
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}

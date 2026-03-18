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
  const notes = currentSlide?.notesContent

  // Timer
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerRunning])

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const handleRun = () => {
    if (currentSlide?.codeContent && currentSlide.config.code) {
      runCode(currentSlide.codeContent, currentSlide.config.code)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 select-none">
      {/* Main content area */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal">
          {/* Left: Current slide + code */}
          <Panel defaultSize={65} minSize={40}>
            <PanelGroup direction="vertical">
              {/* Current slide */}
              <Panel defaultSize={hasCode ? 55 : 100} minSize={30}>
                <div className="h-full flex flex-col bg-gray-950 border border-gray-800 rounded-lg m-2 overflow-hidden">
                  <div className="h-6 bg-gray-900 flex items-center px-3">
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                      Slide {currentSlideIndex + 1} of {slides.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8">
                    {currentSlide && (
                      <SlideRenderer markdown={currentSlide.markdownContent} rootPath={presentation?.rootPath} />
                    )}
                  </div>
                </div>
              </Panel>

              {/* Code + Output (if slide has code) */}
              {hasCode && (
                <>
                  <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-white transition-colors mx-2" />
                  <Panel defaultSize={45} minSize={15}>
                    <div className="h-full flex flex-col m-2 mt-0 border border-gray-800 rounded-lg overflow-hidden">
                      <div className="h-7 bg-gray-900 flex items-center px-3 gap-2">
                        <span className="text-gray-500 text-[10px] font-mono flex-1 truncate">
                          {currentSlide?.config.code?.file}
                        </span>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
                          {currentSlide?.config.code?.language}
                        </span>
                        {isExecuting ? (
                          <button onClick={cancelCode} className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white text-[10px] rounded">
                            Stop
                          </button>
                        ) : (
                          <button onClick={handleRun} className="px-2 py-0.5 bg-green-600 hover:bg-green-500 text-white text-[10px] rounded">
                            Run
                          </button>
                        )}
                      </div>
                      <PanelGroup direction="vertical">
                        <Panel defaultSize={60} minSize={20}>
                          <CodeEditor />
                        </Panel>
                        <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-white" />
                        <Panel defaultSize={40} minSize={10}>
                          <ExecutionOutput />
                        </Panel>
                      </PanelGroup>
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-white transition-colors" />

          {/* Right: Speaker notes + next slide preview */}
          <Panel defaultSize={35} minSize={20}>
            <div className="h-full flex flex-col">
              {/* Speaker Notes */}
              <div className="flex-1 min-h-0 flex flex-col m-2 mb-1 border border-gray-800 rounded-lg overflow-hidden">
                <div className="h-7 bg-gray-900 flex items-center px-3">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Speaker Notes</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {notes ? (
                    <div className="prose prose-sm prose-invert max-w-none text-gray-300 text-sm leading-relaxed">
                      <ReactMarkdown>{notes}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-gray-600 text-sm italic">
                      No speaker notes for this slide.
                    </div>
                  )}
                </div>
              </div>

              {/* Next Slide Preview */}
              <div className="h-48 flex-shrink-0 flex flex-col m-2 mt-1 border border-gray-800 rounded-lg overflow-hidden">
                <div className="h-6 bg-gray-900 flex items-center px-3">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                    {nextSlideData ? `Next: ${nextSlideData.config.id}` : 'Last Slide'}
                  </span>
                </div>
                <div className="flex-1 overflow-hidden p-3">
                  {nextSlideData ? (
                    <div className="transform scale-[0.35] origin-top-left w-[280%]">
                      <SlideRenderer markdown={nextSlideData.markdownContent} rootPath={presentation?.rootPath} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-600 text-xs">
                      End of presentation
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Bottom bar */}
      <div className="h-11 bg-gray-900 border-t border-gray-800 flex items-center px-4">
        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={prevSlide}
            disabled={currentSlideIndex === 0}
            className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>

          <span className="text-white text-sm font-mono font-semibold min-w-[60px] text-center">
            {currentSlideIndex + 1} / {slides.length}
          </span>

          <button
            onClick={nextSlide}
            disabled={currentSlideIndex === slides.length - 1}
            className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        <div className="w-px h-6 bg-gray-800 mx-3" />

        {/* Title */}
        <span className="text-gray-400 text-sm flex-1 truncate">{presentation?.title}</span>

        {/* Timer + Exit */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTimerRunning(!timerRunning)}
            className={`text-sm font-mono px-3 py-1 rounded transition-colors ${
              timerRunning ? 'text-white bg-gray-800' : 'text-amber-400 bg-amber-900/30'
            }`}
            title={timerRunning ? 'Pause timer' : 'Resume timer'}
          >
            {formatTime(timer)}
          </button>

          <button
            onClick={() => setPresenting(false)}
            className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-medium"
            title="Exit (Esc)"
          >
            End
          </button>
        </div>
      </div>
    </div>
  )
}

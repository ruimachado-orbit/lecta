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
import { ArtifactBar } from '../artifacts/ArtifactBar'

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
  const hasCode = !!currentSlide?.config.code

  // Timer
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimer((t) => t + 1)
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [timerRunning])

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const handleExit = () => {
    setPresenting(false)
  }

  const handleRun = () => {
    if (currentSlide?.codeContent && currentSlide.config.code) {
      runCode(currentSlide.codeContent, currentSlide.config.code)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 select-none">
      {/* Main content */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal">
          {/* Left: Slide */}
          <Panel defaultSize={hasCode ? 42 : 100} minSize={25}>
            <div className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-10">
                {currentSlide && (
                  <SlideRenderer markdown={currentSlide.markdownContent} rootPath={presentation?.rootPath} />
                )}
              </div>
              {currentSlide && currentSlide.config.artifacts.length > 0 && (
                <ArtifactBar artifacts={currentSlide.config.artifacts} />
              )}
            </div>
          </Panel>

          {/* Right: Code + Output */}
          {hasCode && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-indigo-500 transition-colors" />
              <Panel defaultSize={58} minSize={25}>
                <div className="h-full flex flex-col">
                  {/* Code toolbar */}
                  <div className="h-9 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2">
                    <span className="text-gray-500 text-xs font-mono flex-1 truncate">
                      {currentSlide?.config.code?.file}
                    </span>
                    <span className="text-[10px] font-medium uppercase px-2 py-0.5 bg-gray-800 text-gray-400 rounded">
                      {currentSlide?.config.code?.language}
                    </span>
                    {isExecuting ? (
                      <button
                        onClick={cancelCode}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded transition-colors"
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={handleRun}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded transition-colors"
                      >
                        Run
                      </button>
                    )}
                  </div>

                  <PanelGroup direction="vertical">
                    <Panel defaultSize={65} minSize={20}>
                      <CodeEditor />
                    </Panel>
                    <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-indigo-500 transition-colors" />
                    <Panel defaultSize={35} minSize={10}>
                      <ExecutionOutput />
                    </Panel>
                  </PanelGroup>
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* Bottom bar */}
      <div className="h-10 bg-gray-900 border-t border-gray-800 flex items-center px-4">
        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={prevSlide}
            disabled={currentSlideIndex === 0}
            className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>

          <span className="text-gray-400 text-sm font-mono">
            {currentSlideIndex + 1} / {slides.length}
          </span>

          <button
            onClick={nextSlide}
            disabled={currentSlideIndex === slides.length - 1}
            className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        <div className="flex-1" />

        {/* Title */}
        <span className="text-gray-500 text-sm">{presentation?.title}</span>

        <div className="flex-1" />

        {/* Timer + Exit */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTimerRunning(!timerRunning)}
            className="text-gray-400 text-sm font-mono hover:text-gray-200 transition-colors"
          >
            {formatTime(timer)}
          </button>

          <button
            onClick={() => window.electronAPI.openPresenterWindow()}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          >
            Speaker View
          </button>

          <button
            onClick={handleExit}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
            title="Exit (Esc)"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  )
}

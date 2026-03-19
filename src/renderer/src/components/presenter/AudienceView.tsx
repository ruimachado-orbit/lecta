import { useEffect, useCallback, useRef, useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { SlideRenderer } from '../slides/SlideRenderer'

/**
 * Set slide index directly WITHOUT triggering IPC sync back to the presenter.
 * Prevents feedback loop: presenter->audience->goToSlide->syncPresenterSlide->audience->...
 */
function setSlideIndexSilently(index: number): void {
  const { slides, presentation } = usePresentationStore.getState()
  if (index >= 0 && index < slides.length) {
    usePresentationStore.setState({
      currentSlideIndex: index,
      currentSubSlide: 0,
      clickStep: 0,
      ...(presentation ? { presentation: { ...presentation, lastViewedIndex: index } } : {})
    })
  }
}

/**
 * Audience-facing view: fullscreen slide canvas.
 * Artifacts are streamed as screenshot frames from the presenter window
 * so the audience sees exactly what the presenter sees.
 */
export function AudienceView(): JSX.Element {
  const { slides, currentSlideIndex, presentation, loadPresentation } =
    usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentScale, setContentScale] = useState(1)
  const [activeArtifact, setActiveArtifact] = useState<string | null>(null)
  const [artifactFrame, setArtifactFrame] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number; area: string } | null>(null)
  const mouseFadeRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Listen for presentation path from main window
  useEffect(() => {
    window.electronAPI.onPresenterLoadPath(async (rootPath: string) => {
      await loadPresentation(rootPath)
    })
    return () => {
      window.electronAPI.removeAllListeners('presenter:load-path')
    }
  }, [loadPresentation])

  // Listen for slide sync — set silently to avoid feedback loop
  useEffect(() => {
    window.electronAPI.onPresenterSync((slideIndex: number) => {
      setSlideIndexSilently(slideIndex)
    })
    return () => {
      window.electronAPI.removeAllListeners('presenter:sync-slide')
    }
  }, [])

  // Listen for artifact sync
  useEffect(() => {
    window.electronAPI.onPresenterArtifactSync((artifact: string | null) => {
      setActiveArtifact(artifact)
      if (!artifact) setArtifactFrame(null)
    })
    return () => {
      window.electronAPI.removeAllListeners('presenter:sync-artifact')
    }
  }, [])

  // Listen for streamed artifact frames from the presenter
  useEffect(() => {
    window.electronAPI.onPresenterArtifactFrame((base64: string) => {
      setArtifactFrame(`data:image/jpeg;base64,${base64}`)
    })
    return () => {
      window.electronAPI.removeAllListeners('presenter:artifact-frame')
    }
  }, [])

  // Listen for mouse position sync
  useEffect(() => {
    window.electronAPI.onPresenterMouseSync((pos: { x: number; y: number; area: string } | null) => {
      setMousePos(pos)
      if (mouseFadeRef.current) clearTimeout(mouseFadeRef.current)
      if (pos) {
        mouseFadeRef.current = setTimeout(() => setMousePos(null), 3000)
      }
    })
    return () => {
      window.electronAPI.removeAllListeners('presenter:sync-mouse')
      if (mouseFadeRef.current) clearTimeout(mouseFadeRef.current)
    }
  }, [])

  // Keyboard: only Escape to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') window.close()
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Auto-scale slide content
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => {
      el.style.transform = 'scale(1)'
      el.style.transformOrigin = 'top left'
      const availH = window.innerHeight * 0.92
      const natural = el.scrollHeight
      setContentScale(natural > availH ? Math.max(0.3, availH / natural) : 1)
    }
    measure()
    const timer = setTimeout(measure, 500)
    return () => clearTimeout(timer)
  }, [currentSlide?.markdownContent])

  if (!currentSlide) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-gray-600 text-lg">
        Loading presentation...
      </div>
    )
  }

  const showArtifact = !!activeArtifact

  return (
    <div className="h-screen w-screen overflow-hidden flex" style={{ background: '#000' }}>
      {/* Slide area */}
      <div className={`relative flex items-center justify-center ${showArtifact ? 'w-1/2' : 'w-full'}`}>
        <div
          className="relative"
          data-slide-theme={presentation?.theme || 'dark'}
          style={showArtifact
            ? { width: '100%', aspectRatio: '16/9', maxHeight: '100%' }
            : { width: '100vw', height: '56.25vw', maxHeight: '100vh', maxWidth: '177.78vh' }
          }
        >
          <div className="absolute inset-0" style={{ background: 'var(--slide-bg)' }} />
          <div className={`absolute inset-0 ${currentSlide.config.layout === 'blank' ? '' : 'p-[4%]'} overflow-hidden ${currentSlide.config.layout && currentSlide.config.layout !== 'default' ? `slide-layout-${currentSlide.config.layout}` : ''}`}>
            <div ref={contentRef} style={{ transform: `scale(${contentScale})`, transformOrigin: 'top left' }}>
              <SlideRenderer markdown={currentSlide.markdownContent} rootPath={presentation?.rootPath} />
            </div>
          </div>
          {mousePos && mousePos.area === 'slide' && <RemoteCursor x={mousePos.x} y={mousePos.y} />}
        </div>
      </div>

      {/* Artifact area — streamed screenshot from the presenter */}
      {showArtifact && (
        <div className="w-1/2 h-full border-l border-gray-800 relative bg-gray-950 flex items-center justify-center">
          {artifactFrame ? (
            <img
              src={artifactFrame}
              alt="Presenter artifact"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'auto' }}
            />
          ) : (
            <div className="text-gray-600 text-sm">Loading artifact...</div>
          )}
          {mousePos && mousePos.area === 'artifact' && <RemoteCursor x={mousePos.x} y={mousePos.y} />}
        </div>
      )}
    </div>
  )
}

/** Renders a red laser-pointer-style cursor at relative position */
function RemoteCursor({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <div
      className="absolute pointer-events-none z-50 transition-all duration-75 ease-out"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)' }}
    >
      <div className="absolute -inset-3 rounded-full bg-red-500/20 animate-pulse" />
      <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50 border border-red-400" />
    </div>
  )
}

import { useEffect, useCallback, useRef, useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { SlideRenderer } from '../slides/SlideRenderer'

/**
 * Audience-facing view: fullscreen 16:9 slide canvas with auto-scaling content.
 * Arrow keys navigate. Escape closes.
 */
export function AudienceView(): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, nextSlide, prevSlide, presentation, loadPresentation } =
    usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentScale, setContentScale] = useState(1)

  // Listen for presentation path from main window
  useEffect(() => {
    window.electronAPI.onPresenterLoadPath(async (rootPath: string) => {
      await loadPresentation(rootPath)
    })
    return () => {
      window.electronAPI.removeAllListeners('presenter:load-path')
    }
  }, [loadPresentation])

  // Listen for slide sync from main window
  useEffect(() => {
    window.electronAPI.onPresenterSync((slideIndex: number) => {
      goToSlide(slideIndex)
    })
    return () => {
      window.electronAPI.removeAllListeners('presenter:sync-slide')
    }
  }, [goToSlide])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          e.preventDefault()
          nextSlide()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault()
          prevSlide()
          break
        case 'Escape':
          window.close()
          break
      }
    },
    [nextSlide, prevSlide]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Auto-scale content to fit the slide area
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const measure = () => {
      el.style.transform = 'scale(1)'
      el.style.transformOrigin = 'top left'
      // Available height is ~92% of viewport height (4% padding top + bottom)
      const availH = window.innerHeight * 0.92
      const natural = el.scrollHeight
      if (natural > availH) {
        setContentScale(Math.max(0.3, availH / natural))
      } else {
        setContentScale(1)
      }
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

  return (
    <div className="h-screen w-screen bg-black overflow-hidden flex items-center justify-center">
      <div
        className="relative"
        style={{
          width: '100vw',
          height: '56.25vw',
          maxHeight: '100vh',
          maxWidth: '177.78vh'
        }}
      >
        <div className="absolute inset-0 bg-black" />
        <div className={`absolute inset-0 ${currentSlide.config.layout === 'blank' ? '' : 'p-[4%]'} overflow-hidden ${currentSlide.config.layout && currentSlide.config.layout !== 'default' ? `slide-layout-${currentSlide.config.layout}` : ''}`}>
          <div
            ref={contentRef}
            style={{
              transform: `scale(${contentScale})`,
              transformOrigin: 'top left'
            }}
          >
            <SlideRenderer markdown={currentSlide.markdownContent} rootPath={presentation?.rootPath} />
          </div>
        </div>
      </div>
    </div>
  )
}

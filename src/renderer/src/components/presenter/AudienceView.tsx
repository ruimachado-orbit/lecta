import { useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { SlideRenderer } from '../slides/SlideRenderer'

/**
 * Audience-facing view: fullscreen, shows only the current slide.
 * Rendered in a separate Electron window via #/audience hash.
 */
export function AudienceView(): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, presentation, loadPresentation } = usePresentationStore()
  const currentSlide = slides[currentSlideIndex]

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

  if (!currentSlide) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-gray-600 text-lg">
        Loading presentation...
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-black overflow-hidden">
      <div className="h-full w-full flex items-center justify-center p-16">
        <div className="max-w-5xl w-full">
          <SlideRenderer markdown={currentSlide.markdownContent} rootPath={presentation?.rootPath} />
        </div>
      </div>
    </div>
  )
}

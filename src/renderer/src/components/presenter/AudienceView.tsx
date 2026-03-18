import { useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { SlideRenderer } from '../slides/SlideRenderer'

/**
 * Audience-facing view: fullscreen, shows only the current slide.
 * Rendered in a separate Electron window.
 */
export function AudienceView(): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, presentation } = usePresentationStore()
  const currentSlide = slides[currentSlideIndex]

  // Listen for slide sync from presenter window
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
        Waiting for presentation...
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-black overflow-hidden cursor-none">
      <div className="h-full w-full flex items-center justify-center p-12">
        <div className="max-w-5xl w-full">
          <SlideRenderer markdown={currentSlide.markdownContent} rootPath={presentation?.rootPath} />
        </div>
      </div>
    </div>
  )
}

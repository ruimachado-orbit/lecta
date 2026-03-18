import { usePresentationStore } from '../../stores/presentation-store'
import { SlideRenderer } from './SlideRenderer'
import { SlideNavigator } from './SlideNavigator'
import { ArtifactBar } from '../artifacts/ArtifactBar'
import { useUIStore } from '../../stores/ui-store'

export function SlidePanel(): JSX.Element {
  const { slides, currentSlideIndex } = usePresentationStore()
  const { showNavigator } = useUIStore()
  const currentSlide = slides[currentSlideIndex]

  if (!currentSlide) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No slides loaded
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Slide content */}
      <div className="flex-1 overflow-y-auto p-8">
        <SlideRenderer markdown={currentSlide.markdownContent} />
      </div>

      {/* Artifact chips */}
      {currentSlide.config.artifacts.length > 0 && (
        <ArtifactBar artifacts={currentSlide.config.artifacts} />
      )}

      {/* Slide navigator strip */}
      {showNavigator && <SlideNavigator />}
    </div>
  )
}

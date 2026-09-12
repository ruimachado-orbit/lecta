import type { SlideBackground } from '@shared/types/presentation'
import { SlideRenderer } from './SlideRenderer'
import { MdxRenderer, stripMdxToMarkdown } from './MdxRenderer'
import { MdxSandbox } from './MdxSandbox'
import { usePresentationStore } from '../../stores/presentation-store'

interface ContentRendererProps {
  markdown: string
  rootPath?: string
  clickStep?: number
  onClickSteps?: (total: number) => void
  isMdx?: boolean
  /** Slide identity — lets the MDX renderer tell "slide switched" from "slide edited" */
  slideId?: string
  /** Thumbnail/preview context: MDX is never compiled, only shown as stripped markdown */
  preview?: boolean
  /** Override the deck's trust flag (defaults to the presentation store's `mdxTrusted`) */
  mdxTrusted?: boolean
  /**
   * Per-slide backdrop. Callers that already know it can pass it; otherwise it is looked up
   * from the deck by `slideId`, so presenter, audience and thumbnail views get it for free.
   */
  background?: SlideBackground
  /** Suppress the read-only pinned-element layer (the editable canvas draws its own). */
  hidePinned?: boolean
}

/**
 * Renders slide content. MDX (executable) slides only compile when the current deck has been
 * explicitly trusted by the user and we are not rendering a thumbnail; otherwise the source is
 * reduced to plain markdown and rendered by the ordinary, non-executing SlideRenderer.
 *
 * Trusted MDX renders inside `MdxSandbox` (opaque-origin iframe, no scripts) by
 * default so deck JS can never reach the app bridge. Fully interactive JSX
 * remains available through `MdxRenderer` only when the caller passes
 * `interactiveMdx` — currently no caller does; the prop exists for the
 * follow-up that adds a per-deck "allow interactive components" toggle.
 */
export function ContentRenderer({ isMdx, preview, mdxTrusted, slideId, background, hidePinned, interactiveMdx, ...props }: ContentRendererProps & { interactiveMdx?: boolean }): JSX.Element {
  const storeTrusted = usePresentationStore((s) => s.mdxTrusted)
  const deckBackground = usePresentationStore((s) =>
    slideId ? s.slides.find((slide) => slide.config.id === slideId)?.config.background : undefined
  )
  const slideBackground = background ?? deckBackground

  if (!isMdx) return <SlideRenderer {...props} background={slideBackground} hidePinned={hidePinned} />

  const trusted = mdxTrusted ?? storeTrusted
  if (preview || !trusted) {
    return <SlideRenderer {...props} background={slideBackground} hidePinned={hidePinned} markdown={stripMdxToMarkdown(props.markdown)} />
  }
  if (interactiveMdx) {
    return <MdxRenderer {...props} slideId={slideId} />
  }
  return <MdxSandbox markdown={props.markdown} rootPath={props.rootPath} clickStep={props.clickStep} onClickSteps={props.onClickSteps} background={slideBackground} />
}

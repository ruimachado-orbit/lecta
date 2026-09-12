import { SlideRenderer } from './SlideRenderer'
import { MdxRenderer, stripMdxToMarkdown } from './MdxRenderer'
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
}

/**
 * Renders slide content. MDX (executable) slides only compile when the current deck has been
 * explicitly trusted by the user and we are not rendering a thumbnail; otherwise the source is
 * reduced to plain markdown and rendered by the ordinary, non-executing SlideRenderer.
 */
export function ContentRenderer({ isMdx, preview, mdxTrusted, slideId, ...props }: ContentRendererProps): JSX.Element {
  const storeTrusted = usePresentationStore((s) => s.mdxTrusted)
  if (!isMdx) return <SlideRenderer {...props} />

  const trusted = mdxTrusted ?? storeTrusted
  if (preview || !trusted) {
    return <SlideRenderer {...props} markdown={stripMdxToMarkdown(props.markdown)} />
  }
  return <MdxRenderer {...props} slideId={slideId} />
}

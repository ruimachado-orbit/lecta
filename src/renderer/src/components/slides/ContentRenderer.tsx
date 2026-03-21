import { SlideRenderer } from './SlideRenderer'
import { MdxRenderer } from './MdxRenderer'

interface ContentRendererProps {
  markdown: string
  rootPath?: string
  clickStep?: number
  onClickSteps?: (total: number) => void
  isMdx?: boolean
}

export function ContentRenderer({ isMdx, ...props }: ContentRendererProps): JSX.Element {
  return isMdx ? <MdxRenderer {...props} /> : <SlideRenderer {...props} />
}

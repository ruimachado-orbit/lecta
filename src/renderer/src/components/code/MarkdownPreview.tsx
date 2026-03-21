import { ContentRenderer } from '../slides/ContentRenderer'
import { FlowDiagram } from '../common/FlowDiagram'

const MERMAID_KEYWORDS = [
  'sequenceDiagram', 'flowchart', 'graph ', 'graph\n', 'classDiagram',
  'stateDiagram', 'erDiagram', 'gantt', 'pie', 'gitGraph',
  'journey', 'mindmap', 'timeline', 'quadrantChart', 'xychart',
  'sankey', 'block-beta'
]

function isMermaid(content: string): boolean {
  const trimmed = content.trim()
  return MERMAID_KEYWORDS.some((kw) => trimmed.startsWith(kw))
}

interface MarkdownPreviewProps {
  content: string
  rootPath?: string
}

export function MarkdownPreview({ content, rootPath }: MarkdownPreviewProps): JSX.Element {
  if (!content.trim()) {
    return (
      <div className="text-gray-600 text-xs italic p-4">
        Start typing to see a live preview...
      </div>
    )
  }

  if (isMermaid(content)) {
    return (
      <div className="flex items-center justify-center h-full">
        <FlowDiagram chart={content.trim()} />
      </div>
    )
  }

  return <ContentRenderer markdown={content} rootPath={rootPath} />
}

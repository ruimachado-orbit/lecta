import { SlideRenderer } from '../slides/SlideRenderer'

interface MarkdownPreviewProps {
  content: string
  rootPath?: string
}

export function MarkdownPreview({ content, rootPath }: MarkdownPreviewProps): JSX.Element {
  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="h-7 bg-gray-900 border-b border-gray-800 flex items-center px-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
          Preview
        </span>
        <span className="text-[10px] text-gray-600 ml-2">Live render</span>
      </div>

      {/* Rendered content */}
      <div className="flex-1 overflow-y-auto p-4">
        {content.trim() ? (
          <SlideRenderer markdown={content} rootPath={rootPath} />
        ) : (
          <div className="text-gray-600 text-xs italic">
            Start typing markdown to see a live preview...
          </div>
        )}
      </div>
    </div>
  )
}

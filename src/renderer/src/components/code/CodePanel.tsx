import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { usePresentationStore } from '../../stores/presentation-store'
import { CodeEditor } from './CodeEditor'
import { CodeToolbar } from './CodeToolbar'
import { ExecutionOutput } from './ExecutionOutput'
import { MarkdownPreview } from './MarkdownPreview'

export function CodePanel(): JSX.Element {
  const { slides, currentSlideIndex } = usePresentationStore()
  const currentSlide = slides[currentSlideIndex]

  if (!currentSlide?.config.code || currentSlide.codeContent === null) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 bg-gray-950">
        No code for this slide
      </div>
    )
  }

  const isMarkdown = currentSlide.config.code.language === 'markdown'

  return (
    <div className="h-full flex flex-col bg-gray-950">
      <CodeToolbar />

      <PanelGroup direction="vertical" className="flex-1">
        {/* Code Editor */}
        <Panel defaultSize={isMarkdown ? 50 : 65} minSize={20}>
          <CodeEditor />
        </Panel>

        {/* Resize handle */}
        <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-indigo-500 transition-colors cursor-row-resize" />

        {/* Output — rendered markdown or execution output */}
        <Panel defaultSize={isMarkdown ? 50 : 35} minSize={10}>
          {isMarkdown ? (
            <MarkdownPreview content={currentSlide.codeContent ?? ''} rootPath={usePresentationStore.getState().presentation?.rootPath} />
          ) : (
            <ExecutionOutput />
          )}
        </Panel>
      </PanelGroup>
    </div>
  )
}

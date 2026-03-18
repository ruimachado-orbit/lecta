import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { usePresentationStore } from '../../stores/presentation-store'
import { CodeEditor } from './CodeEditor'
import { CodeToolbar } from './CodeToolbar'
import { ExecutionOutput } from './ExecutionOutput'
import { MarkdownPreview } from './MarkdownPreview'

export function CodePanel(): JSX.Element {
  const { slides, currentSlideIndex } = usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const [expanded, setExpanded] = useState<'none' | 'output'>('none')

  if (!currentSlide?.config.code || currentSlide.codeContent === null) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 bg-gray-950">
        No code for this slide
      </div>
    )
  }

  const isMarkdown = currentSlide.config.code.language === 'markdown'
  const rootPath = usePresentationStore.getState().presentation?.rootPath

  // Expanded output/preview — full panel
  if (expanded === 'output') {
    return (
      <div className="h-full flex flex-col bg-gray-950">
        <div className="h-7 bg-gray-900 border-b border-gray-800 flex items-center px-3">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 flex-1">
            {isMarkdown ? 'Preview' : 'Output'} — Expanded
          </span>
          <button onClick={() => setExpanded('none')}
            className="p-0.5 hover:bg-gray-800 text-gray-500 hover:text-white rounded transition-colors"
            title="Collapse">
            <CollapseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {isMarkdown ? (
            <div className="p-6">
              <MarkdownPreview content={currentSlide.codeContent ?? ''} rootPath={rootPath} />
            </div>
          ) : (
            <ExecutionOutput />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-950">
      <CodeToolbar />

      <PanelGroup direction="vertical" className="flex-1">
        <Panel defaultSize={isMarkdown ? 50 : 65} minSize={20}>
          <CodeEditor />
        </Panel>

        <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-white transition-colors cursor-row-resize" />

        <Panel defaultSize={isMarkdown ? 50 : 35} minSize={10}>
          <div className="h-full flex flex-col">
            {isMarkdown ? (
              <MarkdownPreviewWithExpand
                content={currentSlide.codeContent ?? ''}
                rootPath={rootPath}
                onExpand={() => setExpanded('output')}
              />
            ) : (
              <ExecutionOutputWithExpand onExpand={() => setExpanded('output')} />
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

function MarkdownPreviewWithExpand({ content, rootPath, onExpand }: {
  content: string; rootPath?: string; onExpand: () => void
}): JSX.Element {
  return (
    <div className="h-full flex flex-col bg-gray-950">
      <div className="h-7 bg-gray-900 border-b border-gray-800 flex items-center px-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 flex-1">
          Preview
        </span>
        <button onClick={onExpand}
          className="p-0.5 hover:bg-gray-800 text-gray-500 hover:text-white rounded transition-colors"
          title="Expand preview">
          <ExpandIcon />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!content.trim() ? (
          <div className="text-gray-600 text-xs italic">Start typing to preview...</div>
        ) : (
          <MarkdownPreview content={content} rootPath={rootPath} />
        )}
      </div>
    </div>
  )
}

function ExecutionOutputWithExpand({ onExpand }: { onExpand: () => void }): JSX.Element {
  return (
    <div className="h-full flex flex-col">
      <div className="h-7 bg-gray-900 border-b border-gray-800 flex items-center px-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 flex-1">
          Output
        </span>
        <button onClick={onExpand}
          className="p-0.5 hover:bg-gray-800 text-gray-500 hover:text-white rounded transition-colors"
          title="Expand output">
          <ExpandIcon />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <ExecutionOutput />
      </div>
    </div>
  )
}

function ExpandIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25-5.25v4.5m0-4.5h-4.5m4.5 0L15 9m-11.25 11.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
    </svg>
  )
}

function CollapseIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
    </svg>
  )
}

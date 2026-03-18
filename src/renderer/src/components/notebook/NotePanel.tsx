import { useState, useCallback, useRef } from 'react'
import { useNotebookStore } from '../../stores/notebook-store'
import { useUIStore } from '../../stores/ui-store'
import { NoteEditor } from './NoteEditor'
import { DrawingOverlay } from '../slides/DrawingOverlay'
import Editor, { type OnMount } from '@monaco-editor/react'

export function NotePanel(): JSX.Element {
  const { pages, currentPageIndex, notebook, updateMarkdownContent, savePageContent } = useNotebookStore()
  const currentPage = pages[currentPageIndex]
  const [mode, setMode] = useState<'visual' | 'markdown' | 'draw'>('visual')
  const editorRef = useRef<any>(null)

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateMarkdownContent(currentPageIndex, value)
      }
    },
    [currentPageIndex, updateMarkdownContent]
  )

  const handleEditorBlur = useCallback(() => {
    savePageContent(currentPageIndex)
  }, [currentPageIndex, savePageContent])

  if (!currentPage) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-950">
        No notes loaded
      </div>
    )
  }

  const layout = currentPage.config.layout || notebook?.defaultLayout || 'blank'
  const layoutClass = `note-layout-${layout}`

  return (
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden">
      {/* Mode toggle + note header */}
      <div className="h-7 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2 flex-shrink-0">
        <button
          onClick={() => setMode('visual')}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
            mode === 'visual' ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Visual
        </button>
        <button
          onClick={() => setMode('markdown')}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
            mode === 'markdown' ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Markdown
        </button>
        <button
          onClick={() => setMode('draw')}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
            mode === 'draw' ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
          </svg>
          Draw
        </button>

        <div className="flex-1" />

        <span className="text-[9px] text-gray-600 uppercase tracking-wider px-1.5 py-0.5 bg-gray-800/50 rounded">
          {layout}
        </span>
      </div>

      {/* Editor area */}
      <div className={`flex-1 min-h-0 overflow-hidden relative ${mode !== 'markdown' ? layoutClass : ''}`}>
        {mode === 'visual' ? (
          <NoteEditor key={currentPageIndex} pageIndex={currentPageIndex} />
        ) : mode === 'markdown' ? (
          <div className="h-full" onBlur={handleEditorBlur}>
            <Editor
              height="100%"
              language="markdown"
              value={currentPage.markdownContent}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize: 14,
                lineHeight: 20,
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 12, bottom: 12 },
                lineNumbers: 'on',
                renderLineHighlight: 'none',
                wordWrap: 'on',
                automaticLayout: true,
                tabSize: 2
              }}
            />
          </div>
        ) : (
          /* Draw mode — layout background + drawing overlay */
          <div className="h-full w-full relative">
            {/* Render note content underneath */}
            <div className="absolute inset-0 overflow-auto p-12 pointer-events-none opacity-30">
              <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{
                __html: currentPage.markdownContent
                  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                  .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              }} />
            </div>
            <DrawingOverlay
              slideIndex={currentPageIndex}
              active={true}
              width={9999}
              height={9999}
            />
          </div>
        )}
      </div>
    </div>
  )
}

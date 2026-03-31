import { useState, useCallback, useRef, useEffect } from 'react'
import { useNotebookStore } from '../../stores/notebook-store'
import { useUIStore } from '../../stores/ui-store'
import { NoteEditor } from './NoteEditor'
import { DrawingOverlay, DrawingToolbar } from '../slides/DrawingOverlay'
import { sanitizeHtml } from '../../utils/sanitize'
import Editor, { type OnMount } from '@monaco-editor/react'
import { requireAI, showAIError } from '../ai/AIAlert'

export function NotePanel(): JSX.Element {
  const { pages, currentPageIndex, notebook, updateMarkdownContent, savePageContent } = useNotebookStore()
  const currentPage = pages[currentPageIndex]
  const [mode, setModeRaw] = useState<'visual' | 'markdown' | 'draw'>('visual')
  const editorRef = useRef<any>(null)

  // Wrap setMode to auto-reset if layout doesn't support draw
  const drawableLayouts = ['blank', 'lines', 'grid', undefined]
  const canDraw = drawableLayouts.includes(currentPage?.config.layout as any)
  const effectiveMode = (mode === 'draw' && !canDraw) ? 'visual' : mode
  const setMode = (m: 'visual' | 'markdown' | 'draw') => setModeRaw(m)
  const [showAI, setShowAI] = useState(false)
  const [aiPrompt, setAIPrompt] = useState('')
  const [aiLoading, setAILoading] = useState(false)
  const { aiEnabled } = useUIStore()

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim() || !notebook || !currentPage) return
    if (!requireAI()) return
    setAILoading(true)
    try {
      const result = await window.electronAPI.generateInlineText(
        aiPrompt.trim() + ' (max 400 characters)',
        currentPage.markdownContent,
        notebook.title
      )
      if (result) {
        // Append to current note content
        updateMarkdownContent(currentPageIndex, currentPage.markdownContent + '\n\n' + result)
        savePageContent(currentPageIndex)
      }
    } catch (err) {
      showAIError(err)
    } finally {
      setAILoading(false)
      setShowAI(false)
      setAIPrompt('')
    }
  }

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
        {/* Draw only available on blank, lines, grid layouts */}
        {(!currentPage?.config.layout || currentPage.config.layout === 'blank' || currentPage.config.layout === 'lines' || currentPage.config.layout === 'grid') && (
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
        )}

        <div className="flex-1" />

        {/* AI generate button */}
        <button
          onClick={() => setShowAI(!showAI)}
          disabled={!aiEnabled}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
            !aiEnabled ? 'text-gray-700 cursor-not-allowed' :
            showAI ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300'
          }`}
          title={aiEnabled ? 'Generate with AI' : 'Set API key in settings'}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          AI
        </button>

        <span className="text-[9px] text-gray-600 uppercase tracking-wider px-1.5 py-0.5 bg-gray-800/50 rounded">
          {layout}
        </span>
      </div>

      {/* AI prompt bar */}
      {showAI && (
        <div className="h-9 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2 flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAIPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAIGenerate()}
            placeholder="What should I write? (max 400 chars)"
            disabled={aiLoading}
            autoFocus
            className="flex-1 bg-transparent text-sm text-gray-300 placeholder-gray-600 focus:outline-none disabled:opacity-50"
          />
          {aiPrompt.trim() && (
            <button
              onClick={handleAIGenerate}
              disabled={aiLoading}
              className="px-3 py-1 bg-white hover:bg-gray-200 disabled:opacity-50 text-black text-[11px] font-medium rounded-md transition-colors"
            >
              {aiLoading ? 'Writing...' : 'Generate'}
            </button>
          )}
        </div>
      )}

      {/* Editor area */}
      <div className={`flex-1 min-h-0 overflow-hidden relative ${effectiveMode !== 'markdown' ? layoutClass : ''}`}>
        {effectiveMode === 'visual' ? (
          <NoteEditor key={currentPageIndex} pageIndex={currentPageIndex} />
        ) : effectiveMode === 'markdown' ? (
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
          /* Draw mode — toolbar left + canvas right */
          <div className="h-full w-full flex">
            <DrawingToolbar />
            <div className="flex-1 min-w-0 relative">
              {/* Render note content underneath */}
              <div className="absolute inset-0 overflow-auto p-12 pointer-events-none opacity-30">
                <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(currentPage.markdownContent
                    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'))
                }} />
              </div>
              <DrawingOverlay
                slideIndex={currentPageIndex}
                active={true}
                width={9999}
                height={9999}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

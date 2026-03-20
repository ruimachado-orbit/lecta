import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNotebookStore } from '../../stores/notebook-store'
import { useCodeExecution } from '../../hooks/useCodeExecution'
import { CellOutputRenderer } from './CellOutputRenderer'
import type { CellOutput } from '../../../../../packages/shared/src/types/notebook'
import type { CodeBlockConfig } from '../../../../../packages/shared/src/types/presentation'

// ── Auto-resizing textarea hook ──────────────────────────────────────

function useAutoResize(value: string): React.RefObject<HTMLTextAreaElement | null> {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return ref
}

// ── Add-cell buttons (shown between cells and at the bottom) ─────────

interface AddCellButtonsProps {
  pageIndex: number
  visible: boolean
}

function AddCellButtons({ pageIndex, visible }: AddCellButtonsProps): React.ReactElement {
  const { addCellAfter } = useNotebookStore()

  return (
    <div
      className={`flex items-center justify-center gap-2 py-1 transition-opacity duration-150 ${
        visible ? 'opacity-100' : 'opacity-0 hover:opacity-100'
      }`}
    >
      <button
        onClick={() => addCellAfter(pageIndex, 'code')}
        className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
      >
        + Code
      </button>
      <button
        onClick={() => addCellAfter(pageIndex, 'markdown')}
        className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
      >
        + Markdown
      </button>
    </div>
  )
}

// ── Language options ──────────────────────────────────────────────────

const CODE_LANGUAGES = [
  { value: 'python', label: 'Python', color: '#22c55e', execution: 'pyodide' },
  { value: 'javascript', label: 'JavaScript', color: '#fbbf24', execution: 'sandpack' },
  { value: 'typescript', label: 'TypeScript', color: '#3b82f6', execution: 'sandpack' },
  { value: 'sql', label: 'SQL', color: '#a855f7', execution: 'sql' },
  { value: 'bash', label: 'Bash', color: '#f97316', execution: 'native' },
  { value: 'go', label: 'Go', color: '#06b6d4', execution: 'native' },
  { value: 'rust', label: 'Rust', color: '#ef4444', execution: 'native' },
] as const

// ── Cell header (type badge, run, reorder, delete, toggle) ───────────

interface CellHeaderProps {
  pageIndex: number
  cellType: string
  codeLanguage: string | null
  isActive: boolean
  totalCells: number
  onRunCell?: () => void
}

function CellHeader({
  pageIndex,
  cellType,
  codeLanguage,
  isActive,
  totalCells,
  onRunCell
}: CellHeaderProps): React.ReactElement {
  const { moveCellUp, moveCellDown, toggleCellType, deleteNote, goToPage, pages } =
    useNotebookStore()
  const [showLangPicker, setShowLangPicker] = useState(false)

  const handleDelete = useCallback(() => {
    if (pages.length <= 1) return
    goToPage(pageIndex)
    deleteNote()
  }, [pageIndex, pages.length, goToPage, deleteNote])

  const handleChangeLang = useCallback(async (lang: string, execution: string) => {
    const { notebook, pages: currentPages } = useNotebookStore.getState()
    if (!notebook) return
    const page = currentPages[pageIndex]
    if (!page) return
    // Use addCode IPC to change the language
    await window.electronAPI.addCodeToNote(notebook.rootPath, page.config.id, lang)
    // Reload
    const loaded = await window.electronAPI.loadNotebook(notebook.rootPath)
    useNotebookStore.setState({
      notebook: loaded.config,
      pages: loaded.pages,
      currentPageIndex: pageIndex
    })
    setShowLangPicker(false)
  }, [pageIndex])

  const badge =
    cellType === 'code'
      ? codeLanguage?.toUpperCase() ?? 'CODE'
      : cellType === 'markdown'
        ? 'Md'
        : 'Raw'

  const langInfo = CODE_LANGUAGES.find(l => l.value === codeLanguage)
  const badgeColor =
    cellType === 'code'
      ? 'bg-green-900/60 text-green-400'
      : cellType === 'markdown'
        ? 'bg-blue-900/60 text-blue-400'
        : 'bg-gray-800 text-gray-400'

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 transition-opacity duration-150 ${
        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      {/* Language badge / picker for code cells */}
      {cellType === 'code' ? (
        <div className="relative">
          <button
            onClick={() => setShowLangPicker(!showLangPicker)}
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-900/60 hover:bg-green-900/80 transition-colors flex items-center gap-1"
            style={{ color: langInfo?.color ?? '#22c55e' }}
          >
            {badge}
            <svg className="w-2 h-2 opacity-60" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
          </button>
          {showLangPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowLangPicker(false)} />
              <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-36">
                {CODE_LANGUAGES.map(lang => (
                  <button
                    key={lang.value}
                    onClick={() => handleChangeLang(lang.value, lang.execution)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 transition-colors flex items-center gap-2 ${
                      codeLanguage === lang.value ? 'text-white' : 'text-gray-400'
                    }`}
                  >
                    <span className="text-[9px] font-bold w-5" style={{ color: lang.color }}>
                      {lang.value.slice(0, 2).toUpperCase()}
                    </span>
                    {lang.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeColor}`}>
          {badge}
        </span>
      )}

      <span className="text-[9px] text-gray-600">[{pageIndex + 1}]</span>

      <div className="flex-1" />

      {cellType === 'code' && onRunCell && (
        <button
          onClick={onRunCell}
          className="px-2 py-0.5 text-[10px] text-green-500 hover:text-green-300 hover:bg-green-900/30 rounded transition-colors flex items-center gap-1"
          title="Run cell (Shift+Enter)"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          Run
        </button>
      )}

      <button
        onClick={() => toggleCellType(pageIndex)}
        className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
        title="Toggle cell type"
      >
        Toggle
      </button>

      <button
        onClick={() => moveCellUp(pageIndex)}
        disabled={pageIndex === 0}
        className="px-1 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Move up"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      <button
        onClick={() => moveCellDown(pageIndex)}
        disabled={pageIndex >= totalCells - 1}
        className="px-1 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Move down"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <button
        onClick={handleDelete}
        disabled={totalCells <= 1}
        className="px-1 py-0.5 text-[10px] text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Delete cell"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ── Markdown cell content ────────────────────────────────────────────

interface MarkdownCellProps {
  pageIndex: number
  content: string
  isActive: boolean
}

function MarkdownCell({ pageIndex, content, isActive }: MarkdownCellProps): React.ReactElement {
  const { updateMarkdownContent, savePageContent } = useNotebookStore()
  const [editing, setEditing] = useState(false)
  const [localContent, setLocalContent] = useState(content)
  const textareaRef = useAutoResize(localContent)

  // Sync with store if content changes externally
  useEffect(() => {
    if (!editing) {
      setLocalContent(content)
    }
  }, [content, editing])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      setLocalContent(val)
      updateMarkdownContent(pageIndex, val)
    },
    [pageIndex, updateMarkdownContent]
  )

  const handleBlur = useCallback(() => {
    setEditing(false)
    savePageContent(pageIndex)
  }, [pageIndex, savePageContent])

  // Stop editing when cell becomes inactive
  useEffect(() => {
    if (!isActive && editing) {
      setEditing(false)
      savePageContent(pageIndex)
    }
  }, [isActive])

  // Enter edit mode: single click when active, or double-click anytime
  const handleClick = useCallback(() => {
    if (isActive && !editing) setEditing(true)
  }, [isActive, editing])

  // Editing mode — raw markdown textarea
  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={localContent}
        onChange={handleChange}
        onBlur={() => {
          // Small delay so clicking within the same cell doesn't kill editing
          setTimeout(() => {
            setEditing(false)
            savePageContent(pageIndex)
          }, 150)
        }}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setEditing(false)
            savePageContent(pageIndex)
          }
        }}
        className="w-full resize-none bg-transparent text-gray-200 text-sm leading-relaxed px-4 py-3 focus:outline-none font-sans placeholder-gray-600"
        placeholder="Markdown content..."
        rows={1}
      />
    )
  }

  // Rendered markdown preview — click to edit (when active), double-click anytime
  return (
    <div
      className="px-4 py-3 text-sm text-gray-300 leading-relaxed cursor-text min-h-8 prose prose-invert prose-sm max-w-none"
      onClick={handleClick}
      onDoubleClick={() => setEditing(true)}
      dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(localContent) }}
    />
  )
}

/** Lightweight markdown-to-HTML for preview rendering. Not a full parser. */
function simpleMarkdownToHtml(md: string): string {
  if (!md.trim()) return '<p class="text-gray-600 italic">Empty markdown cell</p>'

  const lines = md.split('\n')
  const html: string[] = []
  let inList = false

  for (const line of lines) {
    // Headings
    const h3 = line.match(/^### (.+)$/)
    if (h3) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<h3>${inlineFormat(h3[1])}</h3>`)
      continue
    }
    const h2 = line.match(/^## (.+)$/)
    if (h2) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<h2>${inlineFormat(h2[1])}</h2>`)
      continue
    }
    const h1 = line.match(/^# (.+)$/)
    if (h1) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<h1>${inlineFormat(h1[1])}</h1>`)
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push('<hr/>')
      continue
    }

    // List items
    const li = line.match(/^[-*+] (.+)$/)
    if (li) {
      if (!inList) { html.push('<ul>'); inList = true }
      html.push(`<li>${inlineFormat(li[1])}</li>`)
      continue
    }

    // Empty line
    if (!line.trim()) {
      if (inList) { html.push('</ul>'); inList = false }
      continue
    }

    // Paragraph
    if (inList) { html.push('</ul>'); inList = false }
    html.push(`<p>${inlineFormat(line)}</p>`)
  }

  if (inList) html.push('</ul>')
  return html.join('')
}

function inlineFormat(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`(.+?)`/g, '<code class="bg-gray-800 px-1 rounded text-xs">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
}

// ── Code cell content ────────────────────────────────────────────────

interface CodeCellProps {
  pageIndex: number
  content: string
  language: string | null
  outputs: Array<{
    outputType: 'stream' | 'execute_result' | 'display_data' | 'error'
    text?: string
    html?: string
    imageData?: string
    traceback?: string[]
  }>
  rootPath?: string
  isActive: boolean
  isRunning?: boolean
  onRun?: () => void
}

function CodeCell({
  pageIndex,
  content,
  language,
  outputs,
  rootPath,
  isActive,
  isRunning,
  onRun
}: CodeCellProps): React.ReactElement {
  const { pages, notebook } = useNotebookStore()
  const [localContent, setLocalContent] = useState(content ?? '')
  const textareaRef = useAutoResize(localContent)

  useEffect(() => {
    setLocalContent(content ?? '')
  }, [content])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      setLocalContent(val)
      // Update code content in the store
      useNotebookStore.setState((state) => {
        const newPages = [...state.pages]
        if (newPages[pageIndex]) {
          newPages[pageIndex] = { ...newPages[pageIndex], codeContent: val }
        }
        return { pages: newPages }
      })
    },
    [pageIndex]
  )

  const handleBlur = useCallback(() => {
    // Save code file to disk
    const page = pages[pageIndex]
    if (!page?.config.code || !notebook) return
    const codePath = `${notebook.rootPath}/${page.config.code.file}`
    window.electronAPI.writeFile(codePath, localContent).catch(() => {})
    window.electronAPI.saveLecta(notebook.rootPath).catch(() => {})
  }, [pageIndex, pages, notebook, localContent])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Shift+Enter -> run cell
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        handleBlur() // save first
        if (onRun) onRun()
        return
      }
      // Tab -> insert 2 spaces
      if (e.key === 'Tab') {
        e.preventDefault()
        const ta = e.currentTarget
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const val = ta.value
        const newVal = val.substring(0, start) + '  ' + val.substring(end)
        setLocalContent(newVal)
        useNotebookStore.setState((state) => {
          const newPages = [...state.pages]
          if (newPages[pageIndex]) {
            newPages[pageIndex] = { ...newPages[pageIndex], codeContent: newVal }
          }
          return { pages: newPages }
        })
        requestAnimationFrame(() => {
          ta.selectionStart = start + 2
          ta.selectionEnd = start + 2
        })
      }
    },
    [pageIndex, handleBlur, onRun]
  )

  return (
    <div className="flex flex-col">
      {/* Code input */}
      <div className="bg-gray-950 rounded-md border border-gray-800">
        <div className="flex items-center px-3 py-1 border-b border-gray-800">
          <span className="text-[9px] text-gray-600 uppercase tracking-wider">
            {language ?? 'code'}
          </span>
          {isRunning && (
            <span className="ml-2 text-[9px] text-yellow-500 animate-pulse">Running...</span>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="w-full resize-none bg-transparent text-gray-200 text-xs leading-relaxed px-4 py-3 focus:outline-none font-mono placeholder-gray-700"
          placeholder="# Enter code..."
          rows={1}
        />
      </div>

      {/* Outputs */}
      {outputs && outputs.length > 0 && (
        <div className="mt-1">
          <CellOutputRenderer outputs={outputs} rootPath={rootPath} />
        </div>
      )}
    </div>
  )
}

// ── Single cell wrapper ──────────────────────────────────────────────

interface CellWrapperProps {
  pageIndex: number
  totalCells: number
  children: React.ReactNode
  onRunCell?: () => void
}

function CellWrapper({ pageIndex, totalCells, children, onRunCell }: CellWrapperProps): React.ReactElement {
  const { currentPageIndex, goToPage, pages } = useNotebookStore()
  const isActive = currentPageIndex === pageIndex
  const page = pages[pageIndex]

  const handleClick = useCallback(() => {
    goToPage(pageIndex)
  }, [pageIndex, goToPage])

  return (
    <div className="group">
      {/* Cell header */}
      <CellHeader
        pageIndex={pageIndex}
        cellType={page.config.cellType ?? 'markdown'}
        codeLanguage={page.codeLanguage}
        isActive={isActive}
        totalCells={totalCells}
        onRunCell={onRunCell}
      />

      {/* Cell body */}
      <div
        onClick={handleClick}
        className={`rounded-lg border transition-all duration-150 cursor-text ${
          isActive
            ? 'border-blue-500/50 ring-1 ring-blue-500/30 bg-gray-900'
            : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
        }`}
      >
        {children}
      </div>

      {/* Add cell buttons between cells */}
      <AddCellButtons pageIndex={pageIndex} visible={isActive} />
    </div>
  )
}

// ── Main JupyterView component ───────────────────────────────────────

// ── Kernel definitions ───────────────────────────────────────────────

const KERNELS = [
  { value: 'python', label: 'Python 3', short: 'PY', color: '#22c55e', icon: '🐍' },
  { value: 'javascript', label: 'JavaScript', short: 'JS', color: '#fbbf24', icon: '⚡' },
  { value: 'typescript', label: 'TypeScript', short: 'TS', color: '#3b82f6', icon: '🔷' },
  { value: 'sql', label: 'SQL', short: 'SQL', color: '#a855f7', icon: '🗃' },
  { value: 'bash', label: 'Bash', short: 'SH', color: '#f97316', icon: '💻' },
  { value: 'go', label: 'Go', short: 'GO', color: '#06b6d4', icon: '🐹' },
  { value: 'rust', label: 'Rust', short: 'RS', color: '#ef4444', icon: '🦀' },
] as const

export function JupyterView(): React.ReactElement {
  const { pages, notebook, currentPageIndex, addCellAfter, updateCellOutputs, setKernel } = useNotebookStore()
  const { runCode } = useCodeExecution()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [runningCell, setRunningCell] = useState<number | null>(null)
  const [showKernelPicker, setShowKernelPicker] = useState(false)

  const activeKernel = notebook?.kernel ?? 'python'
  const kernelInfo = KERNELS.find(k => k.value === activeKernel) ?? KERNELS[0]

  // Run a single cell using the proper execution engine
  const executeCell = useCallback(async (pageIndex: number) => {
    const page = pages[pageIndex]
    if (!page || page.config.cellType !== 'code' || !page.config.code) return

    const codeContent = page.codeContent ?? ''
    if (!codeContent.trim()) return

    setRunningCell(pageIndex)
    updateCellOutputs(pageIndex, [])

    const collectedOutputs: CellOutput[] = []

    // Collect output directly instead of relying on execution store timing
    const capturedOutput: string[] = []
    const capturedErrors: string[] = []

    try {
      const config = page.config.code

      // Wrap execution with a timeout (30s)
      await Promise.race([
        (async () => {
          switch (config.execution) {
            case 'pyodide': {
              // Use the existing runCode which handles pyodide
              await runCode(codeContent, config as CodeBlockConfig)
              // Read output from execution store
              const { useExecutionStore } = await import('../../stores/execution-store')
              const state = useExecutionStore.getState()
              if (state.output) capturedOutput.push(state.output)
              if (state.lastResult?.stderr) capturedErrors.push(state.lastResult.stderr)
              break
            }
            case 'sandpack': {
              // Run JS directly - inline for reliability in Electron
              await new Promise<void>((resolve, reject) => {
                const iframe = document.createElement('iframe')
                iframe.style.display = 'none'
                iframe.sandbox.add('allow-scripts')
                document.body.appendChild(iframe)

                const timeout = setTimeout(() => {
                  try { document.body.removeChild(iframe) } catch {}
                  reject(new Error('Execution timed out (30s)'))
                }, 30000)

                const handler = (event: MessageEvent) => {
                  if (event.source !== iframe.contentWindow) return
                  const { type, data } = event.data || {}
                  if (type === 'console') capturedOutput.push(data + '\n')
                  else if (type === 'error') capturedErrors.push(data + '\n')
                  else if (type === 'done') {
                    clearTimeout(timeout)
                    window.removeEventListener('message', handler)
                    try { document.body.removeChild(iframe) } catch {}
                    resolve()
                  }
                }
                window.addEventListener('message', handler)

                iframe.srcdoc = `<script>
                  const _log = console.log, _err = console.error;
                  console.log = (...a) => parent.postMessage({type:'console',data:a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ')},'*');
                  console.error = (...a) => parent.postMessage({type:'error',data:a.map(x=>String(x)).join(' ')},'*');
                  console.warn = console.log;
                  try{${codeContent};parent.postMessage({type:'done'},'*')}
                  catch(e){parent.postMessage({type:'error',data:e.message},'*');parent.postMessage({type:'done'},'*')}
                </script>`
              })
              break
            }
            case 'sql': {
              await runCode(codeContent, config as CodeBlockConfig)
              const { useExecutionStore } = await import('../../stores/execution-store')
              const state = useExecutionStore.getState()
              if (state.output) capturedOutput.push(state.output)
              if (state.lastResult?.tableOutput) {
                const t = state.lastResult.tableOutput
                const html = '<table><thead><tr>' + t.columns.map((c: string) => `<th>${c}</th>`).join('') +
                  '</tr></thead><tbody>' + t.rows.map((r: any[]) =>
                    '<tr>' + r.map(c => `<td>${c ?? ''}</td>`).join('') + '</tr>'
                  ).join('') + '</tbody></table>'
                collectedOutputs.push({ outputType: 'execute_result', html })
              }
              break
            }
            case 'native': {
              if (!notebook) throw new Error('No notebook loaded')
              const result = await window.electronAPI.executeNative(
                config.command || 'node',
                config.args || ['-e', codeContent],
                notebook.rootPath
              )
              if (result.stdout) capturedOutput.push(result.stdout)
              if (result.stderr) capturedErrors.push(result.stderr)
              break
            }
            default:
              capturedErrors.push('No execution engine configured')
          }
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Cell execution timed out (30s)')), 30000)
        )
      ])
    } catch (err) {
      capturedErrors.push(err instanceof Error ? err.message : String(err))
    } finally {
      // Always build outputs and clear running state
      if (capturedOutput.length > 0) {
        collectedOutputs.push({ outputType: 'stream', text: capturedOutput.join('') })
      }
      if (capturedErrors.length > 0) {
        collectedOutputs.push({
          outputType: 'error',
          text: capturedErrors.join('\n'),
          traceback: capturedErrors
        })
      }

      updateCellOutputs(pageIndex, collectedOutputs)
      setRunningCell(null)

      // Persist outputs
      if (notebook && page) {
        window.electronAPI.updateCellOutputs(notebook.rootPath, page.config.id, collectedOutputs).catch(() => {})
      }
    }
  }, [pages, notebook, runCode, updateCellOutputs])

  // Run all code cells sequentially
  const runAllCells = useCallback(async () => {
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].config.cellType === 'code') {
        await executeCell(i)
      }
    }
  }, [pages, executeCell])

  // Scroll the active cell into view when currentPageIndex changes
  useEffect(() => {
    const el = cellRefs.current.get(currentPageIndex)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentPageIndex])

  const setCellRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      cellRefs.current.set(index, el)
    } else {
      cellRefs.current.delete(index)
    }
  }, [])

  // Keyboard navigation for the container
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Only handle if no textarea is focused
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      if (e.key === 'ArrowUp' && e.ctrlKey) {
        e.preventDefault()
        const { prevPage } = useNotebookStore.getState()
        prevPage()
      }
      if (e.key === 'ArrowDown' && e.ctrlKey) {
        e.preventDefault()
        const { nextPage } = useNotebookStore.getState()
        nextPage()
      }
    },
    []
  )

  if (!notebook) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-950">
        No notebook loaded
      </div>
    )
  }

  if (pages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-950 gap-4">
        <p className="text-gray-500 text-sm">No cells in this notebook</p>
        <div className="flex gap-2">
          <button
            onClick={() => addCellAfter(-1, 'code')}
            className="px-3 py-1.5 text-xs bg-green-900/40 text-green-400 hover:bg-green-900/60 rounded-md transition-colors"
          >
            + Code Cell
          </button>
          <button
            onClick={() => addCellAfter(-1, 'markdown')}
            className="px-3 py-1.5 text-xs bg-blue-900/40 text-blue-400 hover:bg-blue-900/60 rounded-md transition-colors"
          >
            + Markdown Cell
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col bg-gray-950 overflow-hidden"
      onKeyDown={handleContainerKeyDown}
    >
      {/* Top toolbar */}
      <div className="h-9 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-3 shrink-0">
        {/* Kernel picker */}
        <div className="relative">
          <button
            onClick={() => setShowKernelPicker(!showKernelPicker)}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded transition-colors hover:bg-gray-800"
            style={{ color: kernelInfo.color }}
            title="Change kernel"
          >
            <span>{kernelInfo.icon}</span>
            <span>{kernelInfo.label}</span>
            <svg className="w-2.5 h-2.5 opacity-60" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
          </button>
          {showKernelPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowKernelPicker(false)} />
              <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-44">
                <div className="px-3 py-1.5 text-[9px] text-gray-500 uppercase tracking-wider font-medium">Kernel</div>
                {KERNELS.map(k => (
                  <button
                    key={k.value}
                    onClick={() => { setKernel(k.value as any); setShowKernelPicker(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 transition-colors flex items-center gap-2 ${
                      activeKernel === k.value ? 'text-white bg-gray-800/50' : 'text-gray-400'
                    }`}
                  >
                    <span>{k.icon}</span>
                    <span>{k.label}</span>
                    {activeKernel === k.value && <span className="ml-auto text-green-400 text-[9px]">active</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="w-px h-4 bg-gray-700" />

        <button
          onClick={runAllCells}
          className="px-2.5 py-1 text-[11px] font-medium text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded transition-colors flex items-center gap-1.5"
          title="Run all code cells"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          Run All
        </button>

        <div className="w-px h-4 bg-gray-700" />

        <span className="text-[10px] text-gray-500">
          {pages.length} {pages.length === 1 ? 'cell' : 'cells'}
        </span>

        <div className="flex-1" />

        <button
          onClick={() => addCellAfter(pages.length - 1, 'code')}
          className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
        >
          + Code
        </button>
        <button
          onClick={() => addCellAfter(pages.length - 1, 'markdown')}
          className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
        >
          + Markdown
        </button>
      </div>

      {/* Scrollable cell list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-1">
          {pages.map((page, index) => {
            const cellType = page.config.cellType ?? 'markdown'
            const isActive = currentPageIndex === index
            const isRunning = runningCell === index

            return (
              <div
                key={page.config.id ?? index}
                ref={(el) => setCellRef(index, el)}
              >
                <CellWrapper
                  pageIndex={index}
                  totalCells={pages.length}
                  onRunCell={cellType === 'code' ? () => executeCell(index) : undefined}
                >
                  {cellType === 'code' ? (
                    <CodeCell
                      pageIndex={index}
                      content={page.codeContent ?? page.markdownContent}
                      language={page.codeLanguage}
                      outputs={page.config.outputs ?? []}
                      rootPath={notebook.rootPath}
                      isActive={isActive}
                      isRunning={isRunning}
                      onRun={() => executeCell(index)}
                    />
                  ) : cellType === 'raw' ? (
                    <pre className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-pre-wrap">
                      {page.markdownContent || 'Empty raw cell'}
                    </pre>
                  ) : (
                    <MarkdownCell
                      pageIndex={index}
                      content={page.markdownContent}
                      isActive={isActive}
                    />
                  )}
                </CellWrapper>
              </div>
            )
          })}

          {/* Final add-cell area at the bottom */}
          <div className="flex items-center justify-center gap-2 py-4">
            <button
              onClick={() => addCellAfter(pages.length - 1, 'code')}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-300 hover:bg-gray-800 border border-dashed border-gray-700 hover:border-gray-500 rounded-md transition-colors"
            >
              + Code
            </button>
            <button
              onClick={() => addCellAfter(pages.length - 1, 'markdown')}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-300 hover:bg-gray-800 border border-dashed border-gray-700 hover:border-gray-500 rounded-md transition-colors"
            >
              + Markdown
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

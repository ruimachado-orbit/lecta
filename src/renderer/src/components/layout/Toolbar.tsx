import { useState, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useExecutionStore } from '../../stores/execution-store'
import { useTabsStore } from '../../stores/tabs-store'
import { useChatStore } from '../../stores/chat-store'
import { ThemePicker } from '../slides/ThemePicker'
import { stripMdxToMarkdown } from '../slides/MdxRenderer'
import { requireAI, showAIError } from '../ai/AIAlert'

export function Toolbar(): JSX.Element {
  const { presentation, currentSlideIndex, slides, nextSlide, prevSlide, saveSlideContent, hasUnsavedChanges, mdxTrusted } =
    usePresentationStore(
      useShallow((s) => ({
        presentation: s.presentation,
        currentSlideIndex: s.currentSlideIndex,
        slides: s.slides,
        nextSlide: s.nextSlide,
        prevSlide: s.prevSlide,
        saveSlideContent: s.saveSlideContent,
        hasUnsavedChanges: s.hasUnsavedChanges,
        mdxTrusted: s.mdxTrusted
      }))
    )
  const { togglePresenting, showArticlePanel, toggleArticlePanel, toggleSlideMap } = useUIStore(
    useShallow((s) => ({
      togglePresenting: s.togglePresenting,
      showArticlePanel: s.showArticlePanel,
      toggleArticlePanel: s.toggleArticlePanel,
      toggleSlideMap: s.toggleSlideMap
    }))
  )
  const isExecuting = useExecutionStore((s) => s.isExecuting)
  const { activeTabId, closeTab } = useTabsStore(
    useShallow((s) => ({ activeTabId: s.activeTabId, closeTab: s.closeTab }))
  )
  const { isSidebarOpen, toggleSidebar } = useChatStore(
    useShallow((s) => ({ isSidebarOpen: s.isSidebarOpen, toggleSidebar: s.toggleSidebar }))
  )

  const [showThemePicker, setShowThemePicker] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exportedPath, setExportedPath] = useState<string | null>(null)
  const [prettifying, setPrettifying] = useState(false)
  const [prettifyProgress, setPrettifyProgress] = useState({ current: 0, total: 0 })
  const [prettifyReview, setPrettifyReview] = useState<{
    slideIndex: number
    original: string
    improved: string
  } | null>(null)
  const prettifyQueueRef = useRef<{ index: number; original: string; improved: string }[]>([])
  const [prettifyQueuePos, setPrettifyQueuePos] = useState(0)
  const handleImportSlides = async () => {
    const imported = await window.electronAPI.importSlides()
    if (!imported || imported.length === 0 || !presentation) return
    await window.electronAPI.addBulkSlides(presentation.rootPath, imported, currentSlideIndex)
    // Reload presentation
    await usePresentationStore.getState().loadPresentation(presentation.rootPath)
  }

  /**
   * Slide markdown for export. Executable MDX is only compiled for decks the user trusted;
   * otherwise the JSX is stripped and the remaining markdown is exported.
   */
  const slideExportMarkdown = (s: { isMdx?: boolean; markdownContent: string }): string =>
    s.isMdx && !mdxTrusted ? stripMdxToMarkdown(s.markdownContent) : s.markdownContent

  return (
    <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center pr-4 gap-4 select-none"
      style={{ WebkitAppRegion: 'drag', paddingLeft: 'var(--titlebar-inset)' } as React.CSSProperties}>
      {/* Close presentation */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={async () => {
            if (hasUnsavedChanges) {
              await saveSlideContent(currentSlideIndex)
            }
            if (activeTabId) {
              closeTab(activeTabId)
            }
          }}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
          title="Close presentation"
          aria-label="Close presentation"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={prevSlide}
          disabled={currentSlideIndex === 0}
          className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous slide (←)"
          aria-label="Previous slide (←)"
        >
          <ChevronLeftIcon />
        </button>

        <span className="text-gray-400 text-sm font-mono min-w-[60px] text-center">
          {currentSlideIndex + 1} / {slides.length}
        </span>

        <button
          onClick={nextSlide}
          disabled={currentSlideIndex === slides.length - 1}
          className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next slide (→)"
          aria-label="Next slide (→)"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-800" />

      {/* Title */}
      <div className="flex-1 min-w-0">
        <span className="text-gray-300 text-sm font-medium truncate block">
          {presentation?.title}
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Execution status */}
        {isExecuting && (
          <div className="flex items-center gap-1.5 text-gray-300 text-xs">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
            Running...
          </div>
        )}

        {/* AI Chat */}
        <button
          onClick={toggleSidebar}
          className={`p-1.5 rounded transition-colors ${
            isSidebarOpen ? 'bg-white text-black' : 'hover:bg-gray-800 text-gray-400'
          }`}
          title="AI Chat"
          aria-label="AI Chat"
        >
          <SparklesIcon />
        </button>

        {/* Import slides from another .lecta file */}
        <button
          onClick={handleImportSlides}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title="Import slides from another presentation"
          aria-label="Import slides from another presentation"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
        </button>

        {/* Separator */}
        <div className="w-px h-6 bg-gray-800" />

        {/* Slide Map */}
        <button
          onClick={toggleSlideMap}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title="Slide map overview"
          aria-label="Slide map overview"
        >
          <MapIcon />
        </button>

        {/* Theme picker */}
        <div className="relative">
          <button
            onClick={() => setShowThemePicker(!showThemePicker)}
            className={`p-1.5 rounded transition-colors ${showThemePicker ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'}`}
            title="Slide theme"
            aria-label="Slide theme"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" />
            </svg>
          </button>
          {showThemePicker && <ThemePicker onClose={() => setShowThemePicker(false)} />}
        </div>

        {/* Export dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className={`p-1.5 rounded transition-colors flex items-center gap-0.5 ${showExportMenu ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'}`}
            title="Export"
            aria-label="Export"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1">
                <button
                  onClick={async () => {
                    setShowExportMenu(false)
                    if (!presentation) return
                    const htmls = await Promise.all(slides.map(async (s) => {
                      if (s.isMdx && mdxTrusted) return compileMdxToStaticHtml(s.markdownContent)
                      return markdownToSlideHtml(slideExportMarkdown(s))
                    }))
                    const saved = await window.electronAPI.exportPdf(presentation.rootPath, htmls, presentation.title)
                    if (saved) setExportedPath(saved)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                >
                  <PdfIcon />
                  Export as PDF
                </button>
                <button
                  onClick={async () => {
                    setShowExportMenu(false)
                    if (!presentation) return
                    // Pre-render MDX slides to HTML; pass markdown for .md slides
                    const contents = await Promise.all(slides.map(async (s) => {
                      if (s.isMdx && mdxTrusted) {
                        const html = await compileMdxToStaticHtml(s.markdownContent)
                        return { content: html, isPreRendered: true }
                      }
                      return { content: slideExportMarkdown(s), isPreRendered: false }
                    }))
                    const saved = await window.electronAPI.exportHtml(presentation.rootPath, contents, presentation.title, presentation.theme)
                    if (saved) setExportedPath(saved)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582" />
                  </svg>
                  Export as HTML
                </button>
                <div className="h-px bg-gray-800 my-1" />
                <button
                  onClick={() => {
                    setShowExportMenu(false)
                    toggleArticlePanel()
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                    showArticlePanel ? 'text-white bg-gray-800' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <ArticleIcon />
                  Generate Article
                </button>
              </div>
            </>
          )}
        </div>

        {/* Prettify deck with AI */}
        <button
            onClick={async () => {
              if (prettifying || !presentation) return
              if (!requireAI()) return
              const title = presentation.title || 'Untitled'
              const total = slides.length
              setPrettifying(true)
              setPrettifyProgress({ current: 0, total })
              const queue: { index: number; original: string; improved: string }[] = []
              let firstError: unknown = null
              try {
                for (let i = 0; i < total; i++) {
                  setPrettifyProgress({ current: i + 1, total })
                  const slide = slides[i]
                  if (!slide?.markdownContent?.trim()) continue
                  // Executable MDX is never rewritten by the model
                  if (slide.isMdx) continue
                  try {
                    const improved = await window.electronAPI.beautifySlide(slide.markdownContent, title)
                    if (improved?.trim() && improved.trim() !== slide.markdownContent.trim()) {
                      queue.push({ index: i, original: slide.markdownContent, improved })
                    }
                  } catch (err) {
                    if (!firstError) firstError = err
                  }
                }
              } finally {
                setPrettifying(false)
                setPrettifyProgress({ current: 0, total: 0 })
              }
              if (queue.length === 0 && firstError) {
                showAIError(firstError)
                return
              }
              // Start review flow
              if (queue.length > 0) {
                prettifyQueueRef.current = queue
                setPrettifyQueuePos(0)
                const first = queue[0]
                usePresentationStore.getState().goToSlide(first.index)
                setPrettifyReview({ slideIndex: first.index, original: first.original, improved: first.improved })
              }
            }}
            disabled={prettifying || !presentation}
            className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 bg-gray-800 hover:bg-indigo-600 text-gray-300 hover:text-white"
            style={prettifying ? { background: '#4f46e5', color: '#ffffff', cursor: 'wait' } : undefined}
            title="Polish all slides with AI — review changes per slide"
            aria-label="Polish all slides with AI — review changes per slide"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            {prettifying ? `Analyzing ${prettifyProgress.current}/${prettifyProgress.total}` : 'Prettify'}
          </button>

        {/* Present mode */}
        <button
          onClick={() => {
            useUIStore.setState({ showArtifactDrawer: false, showArticlePanel: false, showSlideMap: false, showRightPane: false, showNotes: false })
            togglePresenting()
          }}
          className="px-3 py-1.5 bg-white hover:bg-gray-200 text-black text-sm font-medium
                     rounded-lg transition-colors flex items-center gap-1.5"
          title="Start presentation (F5)"
          aria-label="Start presentation (F5)"
        >
          <PlayIcon />
          Present
        </button>
      </div>

      {/* Export result — path + Reveal */}
      {exportedPath && (
        <ExportedToast path={exportedPath} onDismiss={() => setExportedPath(null)} />
      )}

      {/* Prettify review modal */}
      {prettifyReview && (
        <PrettifyReviewModal
          slideIndex={prettifyReview.slideIndex}
          original={prettifyReview.original}
          improved={prettifyReview.improved}
          queuePos={prettifyQueuePos}
          queueTotal={prettifyQueueRef.current.length}
          onAccept={() => {
            const r = prettifyReview
            // Refuses (and toasts) for executable .mdx slides — AI output never lands in code
            usePresentationStore.getState().applyAIContent(r.slideIndex, r.improved)
            // Next in queue
            const next = prettifyQueuePos + 1
            if (next < prettifyQueueRef.current.length) {
              const item = prettifyQueueRef.current[next]
              setPrettifyQueuePos(next)
              usePresentationStore.getState().goToSlide(item.index)
              setPrettifyReview({ slideIndex: item.index, original: item.original, improved: item.improved })
            } else {
              setPrettifyReview(null)
            }
          }}
          onReject={() => {
            const next = prettifyQueuePos + 1
            if (next < prettifyQueueRef.current.length) {
              const item = prettifyQueueRef.current[next]
              setPrettifyQueuePos(next)
              usePresentationStore.getState().goToSlide(item.index)
              setPrettifyReview({ slideIndex: item.index, original: item.original, improved: item.improved })
            } else {
              setPrettifyReview(null)
            }
          }}
          onSkipAll={() => setPrettifyReview(null)}
        />
      )}
    </div>
  )
}

/** Confirmation that an export was written, with a Reveal action when the shell bridge exposes one. */
function ExportedToast({ path, onDismiss }: { path: string; onDismiss: () => void }): JSX.Element {
  const api = window.electronAPI as unknown as { showItemInFolder?: (p: string) => void }
  const canReveal = typeof api.showItemInFolder === 'function'
  const fileName = path.split(/[\\/]/).pop() || path
  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9998]">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl shadow-black/40 max-w-lg">
        <span className="text-sm text-gray-200">Exported <span className="font-medium text-white">{fileName}</span></span>
        <span className="text-[11px] text-gray-500 truncate max-w-[16rem]" title={path}>{path}</span>
        {canReveal && (
          <button
            onClick={() => { api.showItemInFolder!(path); onDismiss() }}
            className="text-xs px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Reveal
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function PrettifyReviewModal({ slideIndex, original, improved, queuePos, queueTotal, onAccept, onReject, onSkipAll }: {
  slideIndex: number; original: string; improved: string
  queuePos: number; queueTotal: number
  onAccept: () => void; onReject: () => void; onSkipAll: () => void
}): JSX.Element {
  const { slides } = usePresentationStore()
  const slideName = slides[slideIndex]?.config.id || `Slide ${slideIndex + 1}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-3">
          <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          <div className="flex-1">
            <span className="text-sm font-semibold text-white">{slideName}</span>
            <span className="text-xs text-gray-500 ml-2">{queuePos + 1} of {queueTotal} changes</span>
          </div>
          <button onClick={onSkipAll} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Skip all remaining
          </button>
        </div>

        {/* Diff view */}
        <div className="flex-1 min-h-0 overflow-auto grid grid-cols-2 divide-x divide-gray-800">
          <div className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-red-400/70 mb-2 font-medium">Before</div>
            <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{original}</pre>
          </div>
          <div className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-green-400/70 mb-2 font-medium">After</div>
            <pre className="text-xs text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">{improved}</pre>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-gray-800 flex items-center gap-3 justify-end">
          <button onClick={onReject}
            className="px-4 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            Reject
          </button>
          <button onClick={onAccept}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors">
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}

function ChevronLeftIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function PlayIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

/** Convert markdown to simple HTML for PDF export */
function markdownToSlideHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^[-*+] (.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    .replace(/^(?!<[hulopb])((?!<).+\S.*)$/gm, '<p>$1</p>')
    .replace(/^---+$/gm, '<hr>')
    .replace(/<p>\s*<\/p>/g, '')
}

/** Compile MDX to static HTML for export. Falls back to regex converter on error. */
async function compileMdxToStaticHtml(source: string): Promise<string> {
  try {
    const { compile, run } = await import('@mdx-js/mdx')
    const remarkGfm = (await import('remark-gfm')).default
    const runtime = await import('react/jsx-runtime')
    const { renderToStaticMarkup } = await import('react-dom/server')

    const compiled = await compile(source, {
      outputFormat: 'function-body',
      remarkPlugins: [remarkGfm],
      format: 'mdx',
    })
    const { default: Content } = await run(String(compiled), {
      ...runtime,
      baseUrl: import.meta.url,
    })
    return renderToStaticMarkup(Content({}))
  } catch {
    // Graceful fallback: render as plain markdown via regex
    return markdownToSlideHtml(source)
  }
}

function PdfIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function SparklesIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  )
}

function MapIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  )
}

function ArticleIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" />
    </svg>
  )
}

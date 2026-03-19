import { useState, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useExecutionStore } from '../../stores/execution-store'
import { useTabsStore } from '../../stores/tabs-store'
import { useChatStore } from '../../stores/chat-store'
import { ThemePicker } from '../slides/ThemePicker'
import type { SupportedLanguage } from '../../../../../packages/shared/src/types/presentation'

export function Toolbar(): JSX.Element {
  const { presentation, currentSlideIndex, slides, nextSlide, prevSlide, addSlide, addCodeToSlide, addArtifact, addVideo, addWebApp, saveSlideContent, hasUnsavedChanges } =
    usePresentationStore()
  const { togglePresenting, toggleNotes, showNotes, editingSlide, toggleEditingSlide, theme, setTheme, showArticlePanel, toggleArticlePanel, showRightPane, toggleRightPane, toggleSlideMap, showAIGenerate, toggleAIGenerate } = useUIStore()
  const { isExecuting } = useExecutionStore()
  const { activeTabId, closeTab } = useTabsStore()
  const { isSidebarOpen, toggleSidebar } = useChatStore()

  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [prettifying, setPrettifying] = useState(false)
  const [prettifyProgress, setPrettifyProgress] = useState({ current: 0, total: 0 })
  const [prettifyReview, setPrettifyReview] = useState<{
    slideIndex: number
    original: string
    improved: string
  } | null>(null)
  const prettifyQueueRef = useRef<{ index: number; original: string; improved: string }[]>([])
  const [prettifyQueuePos, setPrettifyQueuePos] = useState(0)
  const [videoUrl, setVideoUrl] = useState('')
  const [webAppUrl, setWebAppUrl] = useState('')

  const currentSlide = slides[currentSlideIndex]
  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp

  const handleAddSlide = async () => {
    const nextNum = slides.length + 1
    await addSlide(`slide-${nextNum}`)
  }

  const handleImportSlides = async () => {
    const imported = await window.electronAPI.importSlides()
    if (!imported || imported.length === 0 || !presentation) return
    await window.electronAPI.addBulkSlides(presentation.rootPath, imported, currentSlideIndex)
    // Reload presentation
    await usePresentationStore.getState().loadPresentation(presentation.rootPath)
  }

  const handleAddCode = async (language: SupportedLanguage) => {
    await addCodeToSlide(language)
  }

  const handleAddVideo = async () => {
    const url = videoUrl.trim()
    if (!url) return
    await addVideo(url)
    setVideoUrl('')
  }

  const handleAddWebApp = async () => {
    let url = webAppUrl.trim()
    if (!url) return
    if (!url.match(/^https?:\/\//)) url = `https://${url}`
    await addWebApp(url)
    setWebAppUrl('')
  }

  const closeAllDropdowns = () => {
    setShowAddMenu(false)
  }

  return (
    <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center pl-20 pr-4 gap-4 select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
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

        {/* Edit / Preview slide toggle */}
        <button
          onClick={async () => {
            if (editingSlide) {
              // Flush WYSIWYG editor content to store (while editor is still alive)
              try {
                const flush = (window as any).__wysiwygFlush
                if (typeof flush === 'function') {
                  flush()
                }
              } catch (e) {
                console.error('Flush failed:', e)
              }
              // Save to disk — read latest from store
              await saveSlideContent(currentSlideIndex)
              // Also pack .lecta file
              if (presentation) {
                await window.electronAPI.saveLecta(presentation.rootPath)
              }
            }
            toggleEditingSlide()
          }}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            editingSlide ? 'bg-white text-black' : 'hover:bg-gray-800 text-gray-400'
          }`}
          title={editingSlide ? 'Switch to preview (save)' : 'Edit slide content'}
        >
          Editor
        </button>

        {/* AI Chat */}
        <button
          onClick={toggleSidebar}
          className={`p-1.5 rounded transition-colors ${
            isSidebarOpen ? 'bg-white text-black' : 'hover:bg-gray-800 text-gray-400'
          }`}
          title="AI Chat"
        >
          <SparklesIcon />
        </button>

        {/* Import slides from another .lecta file */}
        <button
          onClick={handleImportSlides}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title="Import slides from another presentation"
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
        >
          <MapIcon />
        </button>

        {/* Theme picker */}
        <div className="relative">
          <button
            onClick={() => setShowThemePicker(!showThemePicker)}
            className={`p-1.5 rounded transition-colors ${showThemePicker ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'}`}
            title="Slide theme"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" />
            </svg>
          </button>
          {showThemePicker && <ThemePicker onClose={() => setShowThemePicker(false)} />}
        </div>

        {/* Article generator toggle */}
        <button
          onClick={toggleArticlePanel}
          className={`p-1.5 rounded transition-colors ${
            showArticlePanel ? 'bg-white text-black' : 'hover:bg-gray-800 text-gray-400'
          }`}
          title="Generate article from presentation"
        >
          <ArticleIcon />
        </button>

        {/* Export PDF */}
        <button
          onClick={async () => {
            if (!presentation) return
            const htmls = slides.map((s) => markdownToSlideHtml(s.markdownContent))
            await window.electronAPI.exportPdf(presentation.rootPath, htmls, presentation.title)
          }}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title="Export as PDF"
        >
          <PdfIcon />
        </button>

        {/* Export HTML */}
        <button
          onClick={async () => {
            if (!presentation) return
            const markdowns = slides.map((s) => s.markdownContent)
            await window.electronAPI.exportHtml(markdowns, presentation.title, presentation.theme)
          }}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title="Export as HTML (shareable)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582" />
          </svg>
        </button>

        {/* Prettify deck with AI — only in edit mode */}
        {editingSlide && (
          <button
            onClick={async () => {
              if (prettifying || !presentation) return
              const title = presentation.title || 'Untitled'
              const total = slides.length
              setPrettifying(true)
              setPrettifyProgress({ current: 0, total })
              const queue: { index: number; original: string; improved: string }[] = []
              try {
                for (let i = 0; i < total; i++) {
                  setPrettifyProgress({ current: i + 1, total })
                  const slide = slides[i]
                  if (!slide?.markdownContent?.trim()) continue
                  try {
                    const improved = await window.electronAPI.beautifySlide(slide.markdownContent, title)
                    if (improved?.trim() && improved.trim() !== slide.markdownContent.trim()) {
                      queue.push({ index: i, original: slide.markdownContent, improved })
                    }
                  } catch { /* skip */ }
                }
              } finally {
                setPrettifying(false)
                setPrettifyProgress({ current: 0, total: 0 })
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
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            {prettifying ? `Analyzing ${prettifyProgress.current}/${prettifyProgress.total}` : 'Prettify'}
          </button>
        )}

        {/* Present mode */}
        <button
          onClick={() => {
            useUIStore.setState({ showArtifactDrawer: false, showArticlePanel: false, showSlideMap: false, showRightPane: false, showNotes: false, editingSlide: false })
            togglePresenting()
          }}
          className="px-3 py-1.5 bg-white hover:bg-gray-200 text-black text-sm font-medium
                     rounded-lg transition-colors flex items-center gap-1.5"
          title="Start presentation (F5)"
        >
          <PlayIcon />
          Present
        </button>
      </div>

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
            usePresentationStore.getState().updateMarkdownContent(r.slideIndex, r.improved)
            usePresentationStore.getState().saveSlideContent(r.slideIndex)
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

function SpeakerIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  )
}

function PlusSlideIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function CodeIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  )
}

function EditIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  )
}

function PaperclipIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
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

function AttachmentsIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m-15 0A2.246 2.246 0 0 0 3 12v6a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18v-6c0-.621-.252-1.184-.66-1.591m-15.66 0A2.246 2.246 0 0 1 6 9.878" />
    </svg>
  )
}

function GlobeIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.97.633-3.794 1.708-5.282" />
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

function SunIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  )
}

function MoonIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  )
}

function YouTubeIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 3.993L9 16z" />
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

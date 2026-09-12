import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useExecutionStore } from '../../stores/execution-store'
import { useTabsStore } from '../../stores/tabs-store'
import { useChatStore } from '../../stores/chat-store'
import { useImageStore } from '../../stores/image-store'
import { ThemePicker } from '../slides/ThemePicker'
import { requireAI, showAIError } from '../ai/AIAlert'
import { Dialog } from '../common/Dialog'
import { Popover, MenuItem, MenuLabel, MenuSeparator } from '../common/Popover'
import { IconButton, MenuTrigger } from '../common/IconButton'
import {
  addSlide as addSlideCommand,
  exportDeckAs,
  importSlidesIntoDeck,
  startPresenting,
  EXPORT_LABELS,
  type ExportKind
} from '../common/deck-commands'

/**
 * The application's one toolbar.
 *
 *   [Close] [◀ n/m ▶] [Title] … [Insert ▾] [Theme] [Slide map] [Chat] [Deck ▾] [Present]
 *
 * Every control carries a visible label or a tooltip *and* an `aria-label`; the
 * long tail of deck-level actions lives in the `Deck` menu instead of a row of
 * unlabelled glyphs.
 */
export function Toolbar(): JSX.Element {
  const { presentation, currentSlideIndex, slides, nextSlide, prevSlide, saveSlideContent, hasUnsavedChanges } =
    usePresentationStore(
      useShallow((s) => ({
        presentation: s.presentation,
        currentSlideIndex: s.currentSlideIndex,
        slides: s.slides,
        nextSlide: s.nextSlide,
        prevSlide: s.prevSlide,
        saveSlideContent: s.saveSlideContent,
        hasUnsavedChanges: s.hasUnsavedChanges
      }))
    )
  const { showArticlePanel, toggleArticlePanel, toggleSlideMap, showSlideMap } = useUIStore(
    useShallow((s) => ({
      showArticlePanel: s.showArticlePanel,
      toggleArticlePanel: s.toggleArticlePanel,
      toggleSlideMap: s.toggleSlideMap,
      showSlideMap: s.showSlideMap
    }))
  )
  const isExecuting = useExecutionStore((s) => s.isExecuting)
  const { activeTabId, closeTab } = useTabsStore(
    useShallow((s) => ({ activeTabId: s.activeTabId, closeTab: s.closeTab }))
  )
  const { isSidebarOpen, toggleSidebar } = useChatStore(
    useShallow((s) => ({ isSidebarOpen: s.isSidebarOpen, toggleSidebar: s.toggleSidebar }))
  )
  const imagePanelOpen = useImageStore((s) => s.isPanelOpen)

  const [openMenu, setOpenMenu] = useState<'deck' | 'insert' | 'theme' | null>(null)
  const [showSlideStore, setShowSlideStore] = useState(false)
  const [exportedPath, setExportedPath] = useState<string | null>(null)
  const [exportWarnings, setExportWarnings] = useState<string[] | null>(null)
  const [prettifying, setPrettifying] = useState(false)
  const [prettifyProgress, setPrettifyProgress] = useState({ current: 0, total: 0 })
  const [prettifyReview, setPrettifyReview] = useState<{
    slideIndex: number
    original: string
    improved: string
  } | null>(null)
  const prettifyQueueRef = useRef<{ index: number; original: string; improved: string }[]>([])
  const [prettifyQueuePos, setPrettifyQueuePos] = useState(0)

  const closeMenus = useCallback(() => setOpenMenu(null), [])

  /** Run an export through the shared exporter and report where the file landed. */
  const runExport = useCallback(async (kind: ExportKind) => {
    closeMenus()
    if (!presentation) return
    try {
      const result = await exportDeckAs(kind)
      if (result) {
        setExportedPath(result.path)
        setExportWarnings(result.warnings && result.warnings.length > 0 ? result.warnings : null)
      }
    } catch (err) {
      showAIError(err)
    }
  }, [presentation, closeMenus])

  const runPrettify = useCallback(async () => {
    closeMenus()
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
    if (queue.length > 0) {
      prettifyQueueRef.current = queue
      setPrettifyQueuePos(0)
      const first = queue[0]
      usePresentationStore.getState().goToSlide(first.index)
      setPrettifyReview({ slideIndex: first.index, original: first.original, improved: first.improved })
    }
  }, [prettifying, presentation, slides, closeMenus])

  const advancePrettifyQueue = useCallback(() => {
    const next = prettifyQueuePos + 1
    if (next < prettifyQueueRef.current.length) {
      const item = prettifyQueueRef.current[next]
      setPrettifyQueuePos(next)
      usePresentationStore.getState().goToSlide(item.index)
      setPrettifyReview({ slideIndex: item.index, original: item.original, improved: item.improved })
    } else {
      setPrettifyReview(null)
    }
  }, [prettifyQueuePos])

  return (
    <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center pr-3 gap-3 select-none"
      style={{ WebkitAppRegion: 'drag', paddingLeft: 'var(--titlebar-inset)' } as React.CSSProperties}>

      {/* Close presentation */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <IconButton
          label="Close presentation"
          onClick={async () => {
            if (hasUnsavedChanges) await saveSlideContent(currentSlideIndex)
            if (activeTabId) closeTab(activeTabId)
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </IconButton>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <IconButton label="Previous slide" onClick={prevSlide} disabled={currentSlideIndex === 0}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </IconButton>
        <span className="text-gray-300 text-sm font-mono min-w-[62px] text-center" aria-live="polite">
          {currentSlideIndex + 1} / {slides.length}
        </span>
        <IconButton label="Next slide" onClick={nextSlide} disabled={currentSlideIndex === slides.length - 1}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </IconButton>
      </div>

      <div className="w-px h-6 bg-gray-800" />

      {/* Title */}
      <div className="flex-1 min-w-0">
        <span className="text-gray-200 text-sm font-medium truncate block">{presentation?.title}</span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {isExecuting && (
          <div className="flex items-center gap-1.5 text-gray-300 text-xs mr-1" role="status">
            <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse" />
            Running…
          </div>
        )}

        {/* Insert menu — everything that adds content to the deck */}
        <div className="relative">
          <MenuTrigger
            label="Insert"
            open={openMenu === 'insert'}
            onClick={() => setOpenMenu(openMenu === 'insert' ? null : 'insert')}
          />
          <Popover open={openMenu === 'insert'} onClose={closeMenus} label="Insert menu" widthClass="w-56">
            <MenuLabel>Insert</MenuLabel>
            <MenuItem
              onClick={() => { closeMenus(); useImageStore.getState().togglePanel() }}
              active={imagePanelOpen}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 3.75h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6a2.25 2.25 0 0 1 2.25-2.25z" />
                </svg>
              }
            >
              Image Library
            </MenuItem>
            <MenuItem
              onClick={() => { closeMenus(); setShowSlideStore(true) }}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                </svg>
              }
            >
              Slide Store
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onClick={() => { closeMenus(); addSlideCommand() }}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              }
            >
              New slide
            </MenuItem>
          </Popover>
        </div>

        {/* Theme picker — labelled button */}
        <div className="relative">
          <MenuTrigger
            label="Theme"
            open={openMenu === 'theme'}
            onClick={() => setOpenMenu(openMenu === 'theme' ? null : 'theme')}
          />
          <Popover open={openMenu === 'theme'} onClose={closeMenus} label="Slide theme" bare>
            <ThemePicker onClose={closeMenus} />
          </Popover>
        </div>

        {/* Slide map — labelled button */}
        <IconButton label="Slide map" onClick={toggleSlideMap} active={showSlideMap} showLabel>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
          </svg>
        </IconButton>

        {/* AI chat */}
        <IconButton label="AI chat" onClick={toggleSidebar} active={isSidebarOpen}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
          </svg>
        </IconButton>

        {/* Deck menu — import, exports, article, prettify */}
        <div className="relative">
          <MenuTrigger
            label="Deck"
            open={openMenu === 'deck'}
            onClick={() => setOpenMenu(openMenu === 'deck' ? null : 'deck')}
            disabled={!presentation}
          />
          <Popover open={openMenu === 'deck'} onClose={closeMenus} label="Deck menu" widthClass="w-60">
            <MenuLabel>Deck</MenuLabel>
            <MenuItem
              onClick={() => { closeMenus(); void importSlidesIntoDeck() }}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              }
            >
              Import slides
            </MenuItem>
            <MenuSeparator />
            {(['pdf', 'html', 'pptx'] as ExportKind[]).map((kind) => (
              <MenuItem
                key={kind}
                onClick={() => { void runExport(kind) }}
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                }
              >
                {EXPORT_LABELS[kind]}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem
              onClick={() => { closeMenus(); toggleArticlePanel() }}
              active={showArticlePanel}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" />
                </svg>
              }
            >
              Generate article
            </MenuItem>
            <MenuItem
              onClick={() => { void runPrettify() }}
              disabled={prettifying}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
              }
            >
              {prettifying ? `Prettifying ${prettifyProgress.current}/${prettifyProgress.total}` : 'Prettify with AI'}
            </MenuItem>
          </Popover>
        </div>

        {/* Present */}
        <button
          onClick={startPresenting}
          className="px-3 py-1.5 bg-white hover:bg-gray-200 text-black text-sm font-medium
                     rounded-lg transition-colors flex items-center gap-1.5"
          title="Start presenting (F5)"
          aria-label="Start presenting (F5)"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          Present
        </button>
      </div>

      {prettifying && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9997]" role="status">
          <div className="px-4 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm text-gray-200 shadow-2xl">
            Prettifying slide {prettifyProgress.current} of {prettifyProgress.total}…
          </div>
        </div>
      )}

      {exportedPath && (
        <ExportedToast
          path={exportedPath}
          warnings={exportWarnings}
          onDismiss={() => { setExportedPath(null); setExportWarnings(null) }}
        />
      )}

      <SlideStoreDialog open={showSlideStore} onClose={() => setShowSlideStore(false)} />

      {prettifyReview && (
        <PrettifyReviewDialog
          slideIndex={prettifyReview.slideIndex}
          original={prettifyReview.original}
          improved={prettifyReview.improved}
          queuePos={prettifyQueuePos}
          queueTotal={prettifyQueueRef.current.length}
          onAccept={() => {
            // Refuses (and toasts) for executable .mdx slides — AI output never lands in code
            usePresentationStore.getState().applyAIContent(prettifyReview.slideIndex, prettifyReview.improved)
            advancePrettifyQueue()
          }}
          onReject={advancePrettifyQueue}
          onSkipAll={() => setPrettifyReview(null)}
        />
      )}
    </div>
  )
}

/** Confirmation that an export was written, with a Reveal action when the shell bridge exposes one. */
function ExportedToast({ path, warnings, onDismiss }: {
  path: string
  warnings: string[] | null
  onDismiss: () => void
}): JSX.Element {
  const api = window.electronAPI as unknown as { showItemInFolder?: (p: string) => void }
  const canReveal = typeof api.showItemInFolder === 'function'
  const fileName = path.split(/[\\/]/).pop() || path
  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9998]" role="status">
      <div className="flex items-start gap-3 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl shadow-black/40 max-w-lg">
        <div className="min-w-0">
          <p className="text-sm text-gray-100">
            Exported <span className="font-medium text-white">{fileName}</span>
          </p>
          <p className="text-[11px] text-gray-400 truncate max-w-[24rem]" title={path}>{path}</p>
          {warnings && warnings.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {warnings.slice(0, 3).map((w) => (
                <li key={w} className="text-[11px] text-amber-300">{w}</li>
              ))}
            </ul>
          )}
        </div>
        {canReveal && (
          <button
            onClick={() => { api.showItemInFolder!(path); onDismiss() }}
            className="text-xs px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-100 transition-colors flex-shrink-0"
          >
            Reveal
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function PrettifyReviewDialog({ slideIndex, original, improved, queuePos, queueTotal, onAccept, onReject, onSkipAll }: {
  slideIndex: number; original: string; improved: string
  queuePos: number; queueTotal: number
  onAccept: () => void; onReject: () => void; onSkipAll: () => void
}): JSX.Element {
  const slides = usePresentationStore((s) => s.slides)
  const slideName = slides[slideIndex]?.config.id || `Slide ${slideIndex + 1}`

  return (
    <Dialog
      open
      onClose={onSkipAll}
      title={slideName}
      description={`Change ${queuePos + 1} of ${queueTotal}`}
      widthClass="max-w-4xl"
      headerAction={
        <button onClick={onSkipAll} className="text-xs text-gray-400 hover:text-gray-200 transition-colors">
          Skip all remaining
        </button>
      }
      footer={
        <>
          <button onClick={onReject}
            className="px-4 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors">
            Reject
          </button>
          <button onClick={onAccept}
            className="px-4 py-2 text-sm rounded-lg bg-white hover:bg-gray-200 text-black font-medium transition-colors">
            Accept
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 divide-x divide-gray-800">
        <div className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-red-300 mb-2 font-medium">Before</div>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{original}</pre>
        </div>
        <div className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-green-300 mb-2 font-medium">After</div>
          <pre className="text-xs text-gray-100 whitespace-pre-wrap font-mono leading-relaxed">{improved}</pre>
        </div>
      </div>
    </Dialog>
  )
}

interface StoredSlideItem {
  id: string
  name: string
  markdown: string
  layout?: string
  codeContent?: string
  codeLanguage?: string
  savedAt: string
}

/**
 * Saved slides, reachable from `Insert ▾`. Moved out of the 28 px icon rail so it
 * has a name instead of a bookmark glyph.
 */
function SlideStoreDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const [items, setItems] = useState<StoredSlideItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void window.electronAPI.listLibrarySlides().then((stored: StoredSlideItem[]) => {
      if (cancelled) return
      setItems(stored)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [open])

  const handleDelete = async (id: string): Promise<void> => {
    await window.electronAPI.deleteLibrarySlide(id)
    setItems((prev) => prev.filter((s) => s.id !== id))
  }

  const handleRename = async (id: string): Promise<void> => {
    if (!editName.trim()) return
    await window.electronAPI.renameLibrarySlide(id, editName.trim())
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, name: editName.trim() } : s)))
    setEditingId(null)
  }

  const handleInsert = async (markdown: string, layout?: string): Promise<void> => {
    const state = usePresentationStore.getState()
    const rootPath = state.presentation?.rootPath
    if (!rootPath) return
    const prevIndex = state.currentSlideIndex
    await state.addSlide(`store-${Date.now().toString(36)}`)
    const newIdx = prevIndex + 1
    const newSlide = usePresentationStore.getState().slides[newIdx]
    if (!newSlide) return
    await window.electronAPI.writeFile(`${rootPath}/${newSlide.config.content}`, markdown)
    if (layout && layout !== 'default') {
      await window.electronAPI.setSlideLayout(rootPath, newIdx, layout)
    }
    await usePresentationStore.getState().loadPresentation(rootPath)
    usePresentationStore.getState().goToSlide(newIdx)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Slide Store"
      description={loading ? 'Loading…' : `${items.length} saved slide${items.length === 1 ? '' : 's'}`}
      widthClass="max-w-lg"
    >
      {loading ? (
        <p className="px-5 py-6 text-sm text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-300">No saved slides yet.</p>
          <p className="text-xs text-gray-400 mt-1">Right-click a slide and choose “Save to Slide Store”.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-800">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-3">
              {editingId === item.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRename(item.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={() => void handleRename(item.id)}
                  autoFocus
                  aria-label="Slide name"
                  className="w-full text-sm text-gray-100 bg-gray-950 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-gray-400"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-100 truncate flex-1">{item.name}</span>
                  {item.layout && item.layout !== 'default' && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{item.layout}</span>
                  )}
                  <span className="text-[11px] text-gray-400">
                    {new Date(item.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                {item.markdown.split('\n').filter((l) => l.trim()).slice(0, 2).join(' · ').slice(0, 140)}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => void handleInsert(item.markdown, item.layout)}
                  className="px-2.5 py-1 text-xs font-medium rounded bg-white hover:bg-gray-200 text-black transition-colors"
                >
                  Insert
                </button>
                <button
                  onClick={() => { setEditingId(item.id); setEditName(item.name) }}
                  className="px-2 py-1 text-xs rounded text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Rename
                </button>
                <button
                  onClick={() => void handleDelete(item.id)}
                  className="px-2 py-1 text-xs rounded text-red-300 hover:text-white hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

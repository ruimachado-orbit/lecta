import { useEffect, useRef, useState } from 'react'
import type { LoadedPresentation, LoadedSlide, Presentation } from '../../../../packages/shared/src/types/presentation'
import { usePresentationStore } from '../stores/presentation-store'
import { ContentRenderer } from '../components/slides/ContentRenderer'
import { prefetchMdx } from '../components/slides/MdxRenderer'
import { splitSubSlides } from './sub-slides'

/**
 * Hidden export view (`#/export?deck=…`).
 *
 * The PDF and HTML exporters load this route in an off-screen 1280x720 window so both formats
 * come out of the REAL slide renderer: same themes, layouts, columns, badges, code highlighting,
 * diagrams, images and pinned elements the app shows on screen. Every slide — and every
 * sub-slide step — is laid out one after another as a `.export-slide` page. When fonts, images,
 * diagrams and MDX have settled the route calls `window.electronAPI.exportRenderReady()`, and
 * main prints or captures the DOM.
 */

const SLIDE_W = 1280
const SLIDE_H = 720
const PAD_H = 80

/** Absolute cap on the settle phase — an export must never hang on one broken asset. */
const SETTLE_TIMEOUT_MS = 20_000

export interface ExportParams {
  rootPath: string
  theme?: string
  mdxTrusted: boolean
  expectedSlides?: number
}

/** Parse `#/export?deck=<encoded root>&theme=…&slides=<n>&mdx=1`. */
export function parseExportHash(hash: string): ExportParams | null {
  const start = hash.indexOf('?')
  if (start < 0) return null
  const params = new URLSearchParams(hash.slice(start + 1))
  const rootPath = params.get('deck')
  if (!rootPath) return null
  const slides = Number(params.get('slides'))
  return {
    rootPath,
    theme: params.get('theme') || undefined,
    mdxTrusted: params.get('mdx') === '1',
    expectedSlides: Number.isFinite(slides) && slides > 0 ? slides : undefined
  }
}

interface ExportPage {
  key: string
  slideId: string
  markdown: string
  layout?: string
  isMdx: boolean
  /** 1-based index of the parent slide among the exported slides (for the footer). */
  slideNumber: number
  notes: string | null
  /** Notes and the footer only go on the first page of a multi-step slide. */
  isFirstStep: boolean
}

/** Status main reads back with `window.__lectaExport` once the route is done. */
interface ExportStatus {
  ready: boolean
  slideCount: number
  error?: string
}

declare global {
  interface Window {
    __lectaExport?: ExportStatus
  }
}

function publishStatus(status: ExportStatus): void {
  window.__lectaExport = status
  const bridge = window.electronAPI as unknown as { exportRenderReady?: () => void }
  document.documentElement.setAttribute('data-export-ready', 'true')
  bridge.exportRenderReady?.()
}

function buildPages(slides: LoadedSlide[], theme: string, mdxTrusted: boolean): ExportPage[] {
  const pages: ExportPage[] = []
  let slideNumber = 0
  for (const slide of slides) {
    if (slide.config.skipped) continue
    slideNumber += 1
    const isMdx = !!slide.isMdx
    // Untrusted MDX is rendered as stripped markdown by ContentRenderer, and never split.
    const steps = splitSubSlides(slide.markdownContent, { isMdx, theme })
    steps.forEach((markdown, step) => {
      pages.push({
        key: `${slide.config.id}-${step}`,
        slideId: slide.config.id,
        markdown,
        layout: slide.config.layout,
        isMdx,
        slideNumber,
        notes: slide.notesContent,
        isFirstStep: step === 0
      })
    })
    if (isMdx && mdxTrusted) prefetchMdx(slide.markdownContent)
  }
  return pages
}

/** Resolve once fonts, images, diagrams and MDX have settled (or the cap is reached). */
async function waitForRender(deadline: number): Promise<void> {
  try {
    await document.fonts?.ready
  } catch {
    /* font loading is best-effort */
  }

  await waitForImages(deadline)
  await waitUntil(() => !hasPendingAsyncContent(), deadline)
  // Two frames so the last layout/paint lands before we hand the page to main.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

function waitForImages(deadline: number): Promise<void> {
  const images = Array.from(document.images).filter((img) => !img.complete)
  if (images.length === 0) return Promise.resolve()
  return Promise.race([
    Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
      )
    ).then(() => undefined),
    sleep(Math.max(0, deadline - Date.now()))
  ])
}

/** Mermaid fallbacks render asynchronously; MDX compiles asynchronously. Both start out empty. */
function hasPendingAsyncContent(): boolean {
  for (const el of Array.from(document.querySelectorAll('.mermaid-diagram'))) {
    if (el.childElementCount === 0) return true
  }
  for (const el of Array.from(document.querySelectorAll('[data-export-mdx="1"]'))) {
    if (el.childElementCount === 0 && !el.textContent?.trim()) return true
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(predicate: () => boolean, deadline: number): Promise<void> {
  while (!predicate() && Date.now() < deadline) {
    await sleep(120)
  }
}

export function ExportRoute(): JSX.Element {
  const [pages, setPages] = useState<ExportPage[] | null>(null)
  const [presentation, setPresentation] = useState<Presentation | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const params = useRef<ExportParams | null>(parseExportHash(window.location.hash)).current
  const signalled = useRef(false)

  // Load the deck and lay out every slide/sub-slide.
  useEffect(() => {
    let cancelled = false
    document.documentElement.setAttribute('data-theme', 'dark')

    async function load(): Promise<void> {
      if (!params) {
        setFailure('Export route was opened without a deck path')
        return
      }
      try {
        const loaded = (await window.electronAPI.loadPresentation(params.rootPath)) as
          | LoadedPresentation
          | { __notebook?: boolean }
        if (cancelled) return
        if (!loaded || (loaded as { __notebook?: boolean }).__notebook) {
          setFailure('Only presentations can be exported')
          return
        }
        const deck = loaded as LoadedPresentation
        const theme = params.theme || deck.config.theme || 'dark'
        const config: Presentation = { ...deck.config, theme }

        // ContentRenderer/MdxRenderer read the store: seed it without the editor-side effects
        // of `loadPresentation` (tabs, watchers, undo history). `mdxTrusted` is forwarded from
        // the window that started the export — untrusted decks keep the stripped-markdown path.
        usePresentationStore.setState({
          presentation: config,
          slides: deck.slides,
          currentSlideIndex: 0,
          mdxTrusted: params.mdxTrusted,
          isLoading: false,
          error: null
        })

        setPresentation(config)
        setPages(buildPages(deck.slides, theme, params.mdxTrusted))
      } catch (err) {
        if (!cancelled) setFailure(err instanceof Error ? err.message : String(err))
      }
    }

    load()
    return () => { cancelled = true }
  }, [params])

  // Once the DOM is in place, wait for everything to settle and tell main we are printable.
  useEffect(() => {
    if (signalled.current) return
    if (failure) {
      signalled.current = true
      publishStatus({ ready: true, slideCount: 0, error: failure })
      return
    }
    if (!pages) return

    let cancelled = false
    void (async () => {
      await waitForRender(Date.now() + SETTLE_TIMEOUT_MS)
      if (cancelled || signalled.current) return
      signalled.current = true
      publishStatus({ ready: true, slideCount: document.querySelectorAll('.export-slide').length })
    })()
    return () => { cancelled = true }
  }, [pages, failure])

  if (failure) {
    return (
      <div id="lecta-export-root" data-export-failed="1" style={{ padding: 40, fontFamily: 'monospace', color: '#f87171' }}>
        Export failed: {failure}
      </div>
    )
  }

  const theme = presentation?.theme || params?.theme || 'dark'
  const totalSlides = pages ? new Set(pages.map((p) => p.slideNumber)).size : 0

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: EXPORT_CSS }} />
      <div id="lecta-export-root">
        {(pages ?? []).map((page) => (
          <ExportSlide
            key={page.key}
            page={page}
            theme={theme}
            rootPath={presentation?.rootPath}
            deckTitle={presentation?.title || ''}
            totalSlides={totalSlides}
            mdxTrusted={params?.mdxTrusted ?? false}
          />
        ))}
      </div>
    </>
  )
}

function ExportSlide({ page, theme, rootPath, deckTitle, totalSlides, mdxTrusted }: {
  page: ExportPage
  theme: string
  rootPath?: string
  deckTitle: string
  totalSlides: number
  mdxTrusted: boolean
}): JSX.Element {
  const bare = page.layout === 'blank' || page.isMdx
  const layoutClass = page.layout && page.layout !== 'default' ? `slide-layout-${page.layout}` : ''
  const showFooter = page.layout !== 'title' && page.layout !== 'blank'

  return (
    <div
      className="export-slide"
      data-slide-theme={theme}
      data-slide-id={page.slideId}
      style={{ width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'var(--slide-bg)' }} />
      <div className={`absolute inset-0 ${bare ? '' : 'slide-pad'} overflow-hidden ${layoutClass}`}>
        <div
          data-export-mdx={page.isMdx && mdxTrusted ? '1' : undefined}
          style={{ width: bare ? SLIDE_W : SLIDE_W - PAD_H * 2, height: bare ? SLIDE_H : undefined }}
        >
          <ContentRenderer
            markdown={page.markdown}
            rootPath={rootPath}
            isMdx={page.isMdx}
            slideId={page.slideId}
            mdxTrusted={mdxTrusted}
            clickStep={-1}
          />
        </div>
      </div>

      {showFooter && (
        <div className="export-footer">
          <span>{deckTitle}</span>
          <span style={{ fontFamily: 'monospace' }}>{page.slideNumber} / {totalSlides}</span>
        </div>
      )}

      {page.isFirstStep && page.notes?.trim() && (
        <div className="export-notes">{page.notes}</div>
      )}
    </div>
  )
}

/**
 * Print geometry: one `.export-slide` per page, exactly 1280x720 px at 96 dpi
 * (13.333in x 7.5in), no margins, backgrounds preserved.
 */
const EXPORT_CSS = `
@page { size: 13.333in 7.5in; margin: 0; }
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
#lecta-export-root { margin: 0; padding: 0; }
.export-slide {
  width: 1280px;
  height: 720px;
  overflow: hidden;
  position: relative;
  page-break-after: always;
  break-after: page;
  page-break-inside: avoid;
  break-inside: avoid;
}
.export-slide:last-child { page-break-after: auto; break-after: auto; }
.export-footer {
  position: absolute;
  left: 80px;
  right: 80px;
  bottom: 12px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 500;
  opacity: 0.4;
  color: var(--slide-text);
  pointer-events: none;
}
.export-notes { display: none; }
`

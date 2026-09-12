import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { SlideBackground } from '@shared/types/presentation'
import { FlowDiagram } from '../common/FlowDiagram'
import { resolveImageSrc } from './slide-utils'
import { parseElements, stripElements, zOf } from './element-model'
import { PinnedLayer } from './PinnedElements'

interface SlideRendererProps {
  markdown: string
  rootPath?: string
  /** Current click step (0 = show only non-click content, N = show up to click N). -1 = show all (edit/preview mode) */
  clickStep?: number
  /** Callback to report total click steps found in this slide */
  onClickSteps?: (total: number) => void
  /** Optional per-slide backdrop, painted behind the content. */
  background?: SlideBackground
  /**
   * Suppress the read-only pinned-element layer. The editable canvas draws its own
   * (draggable) copy of the same elements, and two layers would double every element.
   */
  hidePinned?: boolean
}

/**
 * Preprocess markdown to convert column syntax into HTML.
 *
 * Pinned elements (textbox / image / shape comments) are NOT handled here — they are
 * parsed by `element-model` and rendered as React elements in a full-slide overlay, so
 * their coordinates mean the same thing in every view.
 */
function preprocessColumns(md: string): string {
  return md
    .replace(/<!--\s*columns\s*-->/gi, '<div class="slide-columns">')
    .replace(/<!--\s*col\s*-->/gi, '</div><div class="slide-col">')
    .replace(/<!--\s*\/columns\s*-->/gi, '</div></div>')
    .replace(/<div class="slide-columns">/g, '<div class="slide-columns"><div class="slide-col">')
}

/**
 * Detect and enhance visual patterns in markdown:
 * - Status badges: 🟢🟡🔴 text → colored pill badges
 * - Progress indicators: [progress XX%] → visual progress bar
 * - Metric highlights: standalone bold numbers → metric cards
 * - Horizontal rules → styled dividers
 */
function enhanceVisualPatterns(md: string): string {
  let result = md

  // Status badges: 🟢 text, 🟡 text, 🔴 text → styled spans
  result = result.replace(/🟢\s*([^\n]+)/g, '<span class="slide-badge slide-badge-green">$1</span>')
  result = result.replace(/🟡\s*([^\n]+)/g, '<span class="slide-badge slide-badge-yellow">$1</span>')
  result = result.replace(/🔴\s*([^\n]+)/g, '<span class="slide-badge slide-badge-red">$1</span>')
  result = result.replace(/✅\s*/g, '<span class="slide-badge-icon slide-badge-green">✓</span> ')
  result = result.replace(/❌\s*/g, '<span class="slide-badge-icon slide-badge-red">✗</span> ')

  // Progress bars: [progress XX%] or [progress XX/YY]
  result = result.replace(
    /\[progress\s+(\d+)%\]/gi,
    (_m, pct) => `<div class="slide-progress"><div class="slide-progress-bar" style="width:${pct}%"></div><span class="slide-progress-label">${pct}%</span></div>`
  )

  // Metric highlight: lines that are ONLY a bold number + optional unit + optional change
  // e.g., "**$4.2M** (+12%)" or "**98.5%** uptime"
  result = result.replace(
    /^(\*\*[\$€£]?[\d,.]+[KMBTkm%]?\*\*)\s*(.*)$/gm,
    (_m, metric, context) => {
      if (context) {
        return `<div class="slide-metric"><span class="slide-metric-value">${metric.replace(/\*\*/g, '')}</span><span class="slide-metric-context">${context}</span></div>`
      }
      return `<div class="slide-metric"><span class="slide-metric-value">${metric.replace(/\*\*/g, '')}</span></div>`
    }
  )

  // Auto-fit: <!-- autofit --> before a heading makes it scale to fill width
  result = result.replace(
    /<!--\s*autofit\s*-->\s*\n(#{1,3}\s+.+)/gm,
    (_m, heading) => `<div class="slide-autofit">\n\n${heading}\n\n</div>`
  )

  return result
}

/**
 * Process <!-- click --> comments into data-click-step wrapper divs.
 * Each <!-- click --> increments a counter. Content after it gets wrapped
 * in a div that only shows when clickStep >= that counter.
 */
function processClickAnimations(md: string): { processed: string; totalClicks: number } {
  const lines = md.split('\n')
  const result: string[] = []
  let clickCount = 0

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().match(/^<!--\s*click\s*-->$/i)) {
      clickCount++
      // Close previous click wrapper if open
      if (clickCount > 1) result.push('</div>')
      result.push(`<div data-click-step="${clickCount}">`)
    } else {
      result.push(lines[i])
    }
  }

  // Close last click wrapper
  if (clickCount > 0) result.push('</div>')

  return { processed: result.join('\n'), totalClicks: clickCount }
}

/** True when the slide has any backdrop worth painting. */
function paintsBackground(bg: SlideBackground | undefined): bg is SlideBackground {
  return !!bg && !!(bg.color || bg.gradient || bg.image)
}

/**
 * The slide's backdrop, painted behind the content but above the theme's canvas colour.
 * Sits in the full-slide coordinate space, like the pinned layer.
 */
export function SlideBackgroundLayer({ background, rootPath }: { background: SlideBackground; rootPath?: string }): JSX.Element {
  const layers: string[] = []
  if (background.image) layers.push(`url("${resolveImageSrc(background.image, rootPath)}")`)
  if (background.gradient) layers.push(background.gradient)

  return (
    <div
      className="slide-bg-layer"
      style={{
        backgroundColor: background.color,
        backgroundImage: layers.length > 0 ? layers.join(', ') : undefined,
      }}
    >
      {background.overlay ? (
        <div className="slide-bg-overlay" style={{ background: `rgba(0,0,0,${Math.min(100, background.overlay) / 100})` }} />
      ) : null}
    </div>
  )
}

export function SlideRenderer({ markdown, rootPath, clickStep = -1, onClickSteps, background, hidePinned }: SlideRendererProps): JSX.Element {
  const { processed: clickProcessed, totalClicks } = processClickAnimations(markdown)

  // Pinned elements come out of the markdown entirely and are drawn in their own layer.
  const pinned = hidePinned
    ? []
    : parseElements(clickProcessed).slice().sort((a, b) => zOf(a) - zOf(b) || a.index - b.index)
  const body = stripElements(clickProcessed)

  // Report total click steps to parent on mount and whenever the count changes.
  // Seeded with -1 so the first presented slide (or the slide after an MDX one) initialises reveal.
  const prevClickCount = useRef(-1)
  useEffect(() => {
    if (prevClickCount.current !== totalClicks) {
      prevClickCount.current = totalClicks
      onClickSteps?.(totalClicks)
    }
  }, [totalClicks]) // eslint-disable-line react-hooks/exhaustive-deps

  const painted = paintsBackground(background)

  return (
    <>
      {painted && <SlideBackgroundLayer background={background} rootPath={rootPath} />}
      <div className="slide-content max-w-none relative" style={painted ? { zIndex: 1 } : undefined}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            // Renderers are minimal — all visual styling flows through CSS variables in globals.css
            // This ensures themes work without changing component code
            code: ({ className, children, ...props }) => {
              // Render mermaid diagrams
              if (className?.includes('language-mermaid')) {
                const chart = String(children).replace(/\n$/, '')
                return <FlowDiagram chart={chart} />
              }
              const isInline = !className
              if (isInline) {
                return <code>{children}</code>
              }
              return <code className={`${className} block`} {...props}>{children}</code>
            },
            pre: ({ node, children }) => {
              const codeChild = node?.children?.[0] as any
              if (
                codeChild?.tagName === 'code' &&
                codeChild?.properties?.className?.some?.((c: string) => c.includes('mermaid'))
              ) {
                return <>{children}</>
              }
              return <pre>{children}</pre>
            },
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
            ),
            img: ({ src, alt, node }) => {
              const imgProps = (node as any)?.properties || {}
              const border = imgProps.dataBorder || undefined
              const radius = imgProps.dataBorderRadius || undefined
              const width = imgProps.width || undefined
              return (
                <img
                  src={resolveImageSrc(src, rootPath)}
                  alt={alt}
                  className="my-4"
                  style={{
                    width: width ? `${width}px` : undefined,
                    maxWidth: '100%',
                    border: border || undefined,
                    borderRadius: radius ? `${radius}px` : undefined,
                  }}
                />
              )
            },
            div: ({ node, children, ...props }) => {
              const step = (node?.properties as any)?.['dataClickStep']
              if (step !== undefined) {
                const stepNum = parseInt(String(step), 10)
                // clickStep -1 = show all (edit/preview mode)
                const visible = clickStep === -1 || clickStep >= stepNum
                return (
                  <div
                    className={`slide-click-step ${visible ? 'slide-click-visible' : 'slide-click-hidden'}`}
                    data-click-step={stepNum}
                    {...props}
                  >
                    {children}
                  </div>
                )
              }
              // Auto-fit text
              const className = String((node?.properties as any)?.className || '')
              if (className.includes('slide-autofit')) {
                return <div className="slide-autofit" {...props}>{children}</div>
              }
              return <div {...props}>{children}</div>
            },
          }}
        >
          {enhanceVisualPatterns(preprocessColumns(body))}
        </ReactMarkdown>
      </div>
      <PinnedLayer elements={pinned} rootPath={rootPath} />
    </>
  )
}

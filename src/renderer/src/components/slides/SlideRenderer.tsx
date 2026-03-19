import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { MermaidDiagram } from '../common/MermaidDiagram'

interface SlideRendererProps {
  markdown: string
  rootPath?: string
}

function resolveImageSrc(src: string | undefined, rootPath?: string): string {
  if (!src) return ''
  // Already absolute URL or data URI
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('lecta-file://')) {
    return src
  }
  // Convert file:// to lecta-file://
  if (src.startsWith('file://')) {
    return src.replace('file://', 'lecta-file://')
  }
  // Local file — resolve relative to workspace root using custom protocol
  if (rootPath) {
    const decoded = decodeURIComponent(src)
    const fullPath = `${rootPath}/${decoded}`
    return `lecta-file://${fullPath}`
  }
  return src
}

/**
 * Preprocess markdown to convert column syntax and text boxes into HTML.
 */
function preprocessColumns(md: string): string {
  let result = md
    // Columns
    .replace(/<!--\s*columns\s*-->/gi, '<div class="slide-columns">')
    .replace(/<!--\s*col\s*-->/gi, '</div><div class="slide-col">')
    .replace(/<!--\s*\/columns\s*-->/gi, '</div></div>')
    .replace(/<div class="slide-columns">/g, '<div class="slide-columns"><div class="slide-col">')

  // Text boxes: <!-- textbox x=N y=N w=N [fs=N] [fc=#hex] [fb=0|1] [fi=0|1] -->content<!-- /textbox -->
  result = result.replace(
    /<!--\s*textbox\s+x=(\d+)\s+y=(\d+)(?:\s+w=(\d+))?(?:\s+fs=(\d+))?(?:\s+fc=([^\s]+))?(?:\s+fb=([01]))?(?:\s+fi=([01]))?\s*-->([\s\S]*?)<!--\s*\/textbox\s*-->/gi,
    (_match, x, y, w, fs, fc, fb, fi, content) => {
      const width = w ? `width:${w}px;` : 'width:300px;'
      const fontSize = fs ? `font-size:${fs}px;` : ''
      const color = fc ? `color:${fc};` : ''
      const fontWeight = fb === '1' ? 'font-weight:bold;' : ''
      const fontStyle = fi === '1' ? 'font-style:italic;' : ''
      return `<div class="slide-textbox" style="left:${x}px;top:${y}px;${width}${fontSize}${color}${fontWeight}${fontStyle}">${content.trim()}</div>`
    }
  )

  // Shapes: <!-- shape type=rect x=N y=N w=N h=N fill=# stroke=# sw=N -->
  result = result.replace(
    /<!--\s*shape\s+type=(\w+)\s+x=(-?\d+)\s+y=(-?\d+)\s+w=(\d+)\s+h=(\d+)(?:\s+fill=([^\s]+))?(?:\s+stroke=([^\s]+))?(?:\s+sw=(\d+))?\s*-->/gi,
    (_match, type, x, y, w, h, fill, stroke, sw) => {
      const f = fill || 'transparent', s = stroke || '#ffffff', swv = sw || '2'
      let inner = ''
      if (type === 'rect') inner = `<rect x="${Number(swv)/2}" y="${Number(swv)/2}" width="${Number(w)-Number(swv)}" height="${Number(h)-Number(swv)}" rx="4" fill="${f}" stroke="${s}" stroke-width="${swv}" />`
      else if (type === 'ellipse') inner = `<ellipse cx="${Number(w)/2}" cy="${Number(h)/2}" rx="${Number(w)/2-Number(swv)/2}" ry="${Number(h)/2-Number(swv)/2}" fill="${f}" stroke="${s}" stroke-width="${swv}" />`
      else if (type === 'line') inner = `<line x1="${swv}" y1="${Number(h)/2}" x2="${Number(w)-Number(swv)}" y2="${Number(h)/2}" stroke="${s}" stroke-width="${swv}" stroke-linecap="round" />`
      return `<svg class="slide-shape" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`
    }
  )

  return result
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

  return result
}

export function SlideRenderer({ markdown, rootPath }: SlideRendererProps): JSX.Element {
  return (
    <div className="slide-content max-w-none relative">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Custom renderers for presentation-quality output
          h1: ({ children }) => (
            <h1 className="text-4xl font-bold mb-6 text-white leading-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-3xl font-semibold mb-4 text-white leading-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-2xl font-medium mb-3 text-gray-200">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-xl leading-relaxed mb-4 text-gray-300">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="text-lg leading-relaxed mb-4 ml-6 text-gray-300 space-y-2">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="text-lg leading-relaxed mb-4 ml-6 text-gray-300 space-y-2 list-decimal">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="list-disc">{children}</li>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className
            // Render mermaid diagrams
            if (className?.includes('language-mermaid')) {
              const chart = String(children).replace(/\n$/, '')
              return <MermaidDiagram chart={chart} />
            }
            if (isInline) {
              return (
                <code className="bg-gray-800 px-2 py-0.5 rounded text-gray-300 font-mono text-base">
                  {children}
                </code>
              )
            }
            return (
              <code className={`${className} block`} {...props}>
                {children}
              </code>
            )
          },
          pre: ({ node, children }) => {
            // Check if this pre contains a mermaid code block
            // by inspecting the original AST node's child
            const codeChild = node?.children?.[0] as any
            if (
              codeChild?.tagName === 'code' &&
              codeChild?.properties?.className?.some?.((c: string) => c.includes('mermaid'))
            ) {
              return <>{children}</>
            }
            return (
              <pre className="bg-gray-900 rounded-lg p-4 mb-4 overflow-x-auto text-sm">
                {children}
              </pre>
            )
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-white pl-4 italic text-gray-400 mb-4">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-white underline hover:text-gray-300"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={resolveImageSrc(src, rootPath)}
              alt={alt}
              className="max-w-full h-auto rounded-lg my-4"
            />
          ),
          table: ({ children }) => (
            <table className="w-full border-collapse mb-4">{children}</table>
          ),
          th: ({ children }) => (
            <th className="bg-gray-800 border border-gray-700 px-4 py-2 text-left font-semibold text-gray-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-700 px-4 py-2 text-gray-300">
              {children}
            </td>
          ),
          hr: () => <hr className="border-gray-700 my-8" />
        }}
      >
        {enhanceVisualPatterns(preprocessColumns(markdown))}
      </ReactMarkdown>
    </div>
  )
}

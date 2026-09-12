/** Resolve image src to lecta-file:// protocol for local files */
export function resolveImageSrc(src: string | undefined, rootPath?: string): string {
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

/** Image files from a drop or paste event. */
export function imageFilesFrom(source: DataTransfer | null): File[] {
  if (!source) return []
  const files = Array.from(source.files).filter((f) => f.type.startsWith('image/'))
  if (files.length > 0) return files
  return Array.from(source.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null)
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/** Keep a pinned element's box on the slide. */
export function clampToCanvas(value: number, size: number, limit: number): number {
  return Math.round(Math.max(0, Math.min(value, limit - size)))
}

/**
 * Queue for positioned-image comments produced when an inline image is pinned to the canvas.
 * ResizableImage pushes here immediately before `deleteNode()`, and the WYSIWYG editor's
 * `onUpdate` — which that deletion fires synchronously — drains it. A module-level queue
 * instead of a `window` global: same lifetime, but typed and not reachable from slide content.
 */
const pendingPinComments: string[] = []

export function queuePinComment(comment: string): void {
  pendingPinComments.push(comment)
}

/** Take (and clear) every queued pin comment. */
export function drainPinComments(): string[] {
  return pendingPinComments.splice(0, pendingPinComments.length)
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Group runs of 2+ consecutive image-only lines into a responsive grid gallery.
 *
 * A run becomes `<div class="slide-img-grid">` of glass `<figure>`s; single images
 * pass through untouched (the renderer's `img` component frames those instead). Only
 * plain `![alt](src)` lines qualify — fenced code, quotes, raw HTML and comments
 * break a run, so click-step wrappers and column markers are never crossed.
 * Render-time only: the source markdown is unchanged, so exporters and the
 * single-file format keep seeing the original image lines.
 */
export function preprocessImageGrids(md: string, rootPath?: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let run: { alt: string; src: string; raw: string }[] = []
  let inFence = false

  const flush = (): void => {
    if (run.length >= 2) {
      const figs = run.map(({ alt, src }) => {
        const resolved = escapeHtmlAttr(resolveImageSrc(src, rootPath))
        const safeAlt = escapeHtmlAttr(alt)
        const caption =
          alt && alt.toLowerCase() !== 'image' ? `<figcaption>${safeAlt}</figcaption>` : ''
        return `<figure class="slide-img-frame"><img src="${resolved}" alt="${safeAlt}" />${caption}</figure>`
      })
      out.push(`<div class="slide-img-grid">\n${figs.join('\n')}\n</div>`)
    } else {
      for (const item of run) out.push(item.raw)
    }
    run = []
  }

  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('```')) {
      flush()
      inFence = !inFence
      out.push(line)
      continue
    }
    if (!inFence && !t.startsWith('<') && !t.startsWith('>') && !t.startsWith('<!--')) {
      const m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(t)
      if (m) {
        run.push({ alt: m[1], src: m[2], raw: line })
        continue
      }
    }
    flush()
    out.push(line)
  }
  flush()
  return out.join('\n')
}

import DOMPurify from 'dompurify'

/**
 * Sub-slide splitting for export.
 *
 * This mirrors `hooks/useSubSlides.ts` so an exported page break falls exactly where the app
 * shows a sub-slide break. The hook only exports `useSubSlides` — a React hook bound to the
 * presentation store's `currentSubSlide` — which cannot be run once per slide during export, and
 * its pure helpers (`isHrLine`, `splitIntoBlocks`, `toMeasurementHTML`, the height constant) are
 * module-private. They are duplicated here deliberately and minimally.
 *
 * TODO(shared): extract these helpers from useSubSlides into one module and delete this copy.
 */

const MEASURE_SANITIZE_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['img', 'svg', 'iframe', 'object', 'embed', 'video', 'audio', 'script', 'style', 'link', 'math', 'form', 'input', 'button', 'base', 'meta'],
  FORBID_ATTR: ['src', 'href', 'xlink:href', 'srcset', 'action', 'formaction', 'background', 'poster'],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false
}

/** Content height inside the 1280x720 canvas — identical to useSubSlides. */
const CONTENT_HEIGHT = (720 - 48 * 2 - 24) * 0.82

/** A line that acts as a manual sub-slide break. */
function isHrLine(line: string): boolean {
  const t = line.trim()
  return t === '---' || t === '***' || t === '* * *' || t === '___' ||
    /^-{3,}$/.test(t) || /^\*\s*\*\s*\*$/.test(t) || /^_{3,}$/.test(t)
}

/** Split markdown into the smallest blocks that must not be broken across sub-slides. */
function splitIntoBlocks(markdown: string): string[] {
  const lines = markdown.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        current.push(line)
        blocks.push(current.join('\n'))
        current = []
        inCodeBlock = false
      } else {
        if (current.length > 0) {
          blocks.push(current.join('\n'))
          current = []
        }
        current.push(line)
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      current.push(line)
      continue
    }

    // Heading — always starts a new block
    if (line.match(/^#{1,6}\s/) && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }

    // Blank line — ends the current block
    if (line.trim() === '' && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
      continue
    }

    current.push(line)
  }

  if (current.length > 0) blocks.push(current.join('\n'))
  return blocks.filter((b) => b.trim().length > 0)
}

/** Approximate the real renderer's block sizing well enough to measure height. */
function toMeasurementHTML(md: string): string {
  md = md.replace(/```[\s\S]*?```/g, '<pre class="bg-gray-900 rounded-lg p-4 mb-4 overflow-x-auto text-sm" style="min-height:60px">code block</pre>')

  md = md.replace(
    /^(\|.+\|)\n(\|[\s:-]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, header: string, _sep: string, body: string) => {
      const parseCells = (row: string): string[] => row.split('|').slice(1, -1).map((c) => c.trim())
      const headerCells = parseCells(header)
      const bodyRows = body.trim().split('\n')
      let html = '<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:18px"><thead><tr>'
      headerCells.forEach((c) => { html += `<th style="padding:8px 12px;border:1px solid rgba(255,255,255,0.15);font-weight:600">${c}</th>` })
      html += '</tr></thead><tbody>'
      bodyRows.forEach((row) => {
        html += '<tr>'
        parseCells(row).forEach((c) => { html += `<td style="padding:8px 12px;border:1px solid rgba(255,255,255,0.1)">${c}</td>` })
        html += '</tr>'
      })
      return `${html}</tbody></table>`
    }
  )

  md = md.replace(/^>\s?(.+)$/gm, '<blockquote style="border-left:3px solid #6366f1;padding:4px 12px;margin:8px 0;font-size:18px">$1</blockquote>')
  md = md.replace(/^---+$/gm, '<hr style="margin:16px 0;border-top:1px solid rgba(255,255,255,0.15)">')

  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-2xl font-medium mb-3" style="line-height:1.2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-3xl font-semibold mb-4" style="line-height:1.2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-4xl font-bold mb-6" style="line-height:1.1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\s{2,}[*\-+] (.+)$/gm, '<div class="text-base leading-relaxed mb-1.5 ml-12">◦ $1</div>')
    .replace(/^[*\-+] (.+)$/gm, '<div class="text-lg leading-relaxed mb-2 ml-6">• $1</div>')
    .replace(/^(?!<[hdbtp]|<pre|<hr|<table)((?!<).+)$/gm, '<p class="text-xl leading-relaxed mb-4">$1</p>')
    .replace(/<p[^>]*>\s*<\/p>/g, '')
}

/** Hidden measurement container, created once per export run. */
function createMeasurer(theme: string): HTMLDivElement {
  const container = document.createElement('div')
  container.style.cssText = `
    position: absolute;
    left: -9999px;
    top: -9999px;
    width: ${1280 - 96}px;
    visibility: hidden;
    pointer-events: none;
  `
  container.className = 'slide-content max-w-none'
  container.setAttribute('data-slide-theme', theme)
  document.body.appendChild(container)
  return container
}

/**
 * Split one slide's markdown into the sub-slides the app would show.
 * MDX never auto-splits (a `---` inside JSX would break components).
 */
export function splitSubSlides(markdown: string, options: { isMdx?: boolean; theme?: string } = {}): string[] {
  if (options.isMdx) return [markdown]

  const manualBreaks = markdown.split('\n').some(isHrLine)
  if (manualBreaks) {
    const sections = markdown
      .split(/\n?(?:---+|\*\s*\*\s*\*|___+)\n?/)
      .map((section) => section.trim())
    return sections.length > 0 ? sections : ['']
  }

  const blocks = splitIntoBlocks(markdown)
  if (blocks.length === 0) return ['']

  const container = createMeasurer(options.theme || 'dark')
  try {
    const pages: string[] = []
    let currentBlocks: string[] = []

    for (const block of blocks) {
      const testMd = [...currentBlocks, block].join('\n\n')
      // Sanitized: raw deck markdown must never reach innerHTML with bridge privileges
      container.innerHTML = DOMPurify.sanitize(toMeasurementHTML(testMd), MEASURE_SANITIZE_CONFIG) as string
      const height = container.scrollHeight

      if (height > CONTENT_HEIGHT && currentBlocks.length > 0) {
        const lastBlock = currentBlocks[currentBlocks.length - 1]
        const lastIsHeading = !!lastBlock && /^#{1,3}\s/.test(lastBlock.trim())

        if (lastIsHeading && currentBlocks.length > 1) {
          const headingBlock = currentBlocks.pop()!
          pages.push(currentBlocks.join('\n\n'))
          currentBlocks = [headingBlock, block]
        } else {
          pages.push(currentBlocks.join('\n\n'))
          currentBlocks = [block]
        }
      } else {
        currentBlocks.push(block)
      }
    }

    if (currentBlocks.length > 0) pages.push(currentBlocks.join('\n\n'))
    return pages.length > 0 ? pages : ['']
  } finally {
    container.remove()
  }
}

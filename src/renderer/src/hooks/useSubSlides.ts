import { useState, useEffect, useRef, useCallback } from 'react'
import { usePresentationStore } from '../stores/presentation-store'

/**
 * Split markdown into sub-slides that each fit within one 16:9 slide canvas.
 * Also exports character offsets for drawing divider lines in the editor.
 */

/** Check if a line is a horizontal rule (sub-slide break) */
function isHrLine(line: string): boolean {
  const t = line.trim()
  return t === '---' || t === '***' || t === '* * *' || t === '___' ||
    /^-{3,}$/.test(t) || /^\*\s*\*\s*\*$/.test(t) || /^_{3,}$/.test(t)
}

// Content height inside the 1280x720 slide with p-12 (48px each side)
// Use 82% of actual height as safety margin — measurement HTML approximates real rendering
// but doesn't perfectly match SlideRenderer's tables, mermaid, blockquotes, etc.
const CONTENT_HEIGHT = (720 - 48 * 2) * 0.82 // ~512px (624px * 0.82)

/**
 * Split markdown into logical blocks at heading or blank-line boundaries.
 * Each block is the smallest unit that won't be split across sub-slides.
 */
function splitIntoBlocks(markdown: string): { text: string; charOffset: number }[] {
  const lines = markdown.split('\n')
  const blocks: { text: string; charOffset: number }[] = []
  let current: string[] = []
  let blockStart = 0
  let pos = 0
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        current.push(line)
        blocks.push({ text: current.join('\n'), charOffset: blockStart })
        current = []
        blockStart = pos + line.length + 1
        inCodeBlock = false
      } else {
        if (current.length > 0) {
          blocks.push({ text: current.join('\n'), charOffset: blockStart })
          current = []
        }
        blockStart = pos
        current.push(line)
        inCodeBlock = true
      }
      pos += line.length + 1
      continue
    }

    if (inCodeBlock) {
      current.push(line)
      pos += line.length + 1
      continue
    }

    // Heading — always starts a new block
    if (line.match(/^#{1,6}\s/)) {
      if (current.length > 0) {
        blocks.push({ text: current.join('\n'), charOffset: blockStart })
        current = []
      }
      blockStart = pos
    }

    // Blank line — end current block
    if (line.trim() === '' && current.length > 0) {
      blocks.push({ text: current.join('\n'), charOffset: blockStart })
      current = []
      pos += line.length + 1
      blockStart = pos
      continue
    }

    if (current.length === 0) {
      blockStart = pos
    }
    current.push(line)
    pos += line.length + 1
  }

  if (current.length > 0) {
    blocks.push({ text: current.join('\n'), charOffset: blockStart })
  }

  return blocks.filter((b) => b.text.trim().length > 0)
}

export interface SubSlide {
  markdown: string
  index: number
}

export function useSubSlides(
  markdown: string,
  slideIndex: number
): {
  subSlides: SubSlide[]
  currentSubSlide: number
  setCurrentSubSlide: (n: number) => void
  breakOffsets: number[]
} {
  const [subSlides, setSubSlides] = useState<SubSlide[]>([{ markdown, index: 0 }])
  const [breakOffsets, setBreakOffsets] = useState<number[]>([])
  const measureRef = useRef<HTMLDivElement | null>(null)

  // Read/write sub-slide state from the presentation store
  const storeCurrentSubSlide = usePresentationStore((s) => s.currentSubSlide)
  // -1 means "go to last sub-slide" — will be resolved after measure()
  const currentSubSlide = storeCurrentSubSlide < 0 ? 0 : storeCurrentSubSlide

  const setCurrentSubSlide = useCallback((n: number) => {
    usePresentationStore.setState({ currentSubSlide: n })
  }, [])

  // Reset on slide change — but preserve -1 (go-to-last flag from prevSlide)
  const prevSlideIndex = useRef(slideIndex)
  useEffect(() => {
    if (prevSlideIndex.current !== slideIndex) {
      const current = usePresentationStore.getState().currentSubSlide
      // Only reset to 0 if not set to -1 (which means "go to last")
      if (current !== -1) {
        usePresentationStore.setState({ currentSubSlide: 0 })
      }
      prevSlideIndex.current = slideIndex
    }
  }, [slideIndex])

  const measure = useCallback(() => {
    // Check for manual sub-slide breaks (--- or * * * or *** on its own line)
    // If found, use those as explicit break points instead of auto-calculating
    const hasManualBreaks = markdown.split('\n').some(isHrLine)

    if (hasManualBreaks) {
      // Split on horizontal rule delimiters (---, ***, * * *, ___)
      // Use \n? to handle rules at start/end of content
      const sections = markdown.split(/\n?(?:---+|\*\s*\*\s*\*|___+)\n?/)
      const pages: SubSlide[] = sections.map((section, i) => ({
        markdown: section.trim(),
        index: i
      }))
      // Find break offsets by scanning lines for hr markers
      const breaks: number[] = []
      let charPos = 0
      const lines = markdown.split('\n')
      for (const line of lines) {
        if (isHrLine(line)) {
          breaks.push(charPos)
        }
        charPos += line.length + 1
      }

      const finalPages = pages.length > 0 ? pages : [{ markdown: '', index: 0 }]
      setSubSlides(finalPages)
      setBreakOffsets(breaks)

      const storeState = usePresentationStore.getState()
      usePresentationStore.setState({ totalSubSlides: finalPages.length })
      if (storeState.currentSubSlide === -1) {
        usePresentationStore.setState({ currentSubSlide: finalPages.length - 1 })
      } else if (storeState.currentSubSlide >= finalPages.length) {
        usePresentationStore.setState({ currentSubSlide: Math.max(0, finalPages.length - 1) })
      }
      return
    }

    // Auto-calculate breaks based on content height
    const blocks = splitIntoBlocks(markdown)
    if (blocks.length === 0) {
      setSubSlides([{ markdown: '', index: 0 }])
      setBreakOffsets([])
      return
    }

    // Create/reuse hidden measurement container
    let container = measureRef.current
    if (!container) {
      container = document.createElement('div')
      container.style.cssText = `
        position: absolute;
        left: -9999px;
        top: -9999px;
        width: ${1280 - 96}px;
        visibility: hidden;
        pointer-events: none;
      `
      container.className = 'slide-content max-w-none'
      const theme = usePresentationStore.getState().presentation?.theme || 'dark'
      container.setAttribute('data-slide-theme', theme)
      document.body.appendChild(container)
      measureRef.current = container
    }

    const pages: SubSlide[] = []
    const breaks: number[] = []
    let currentBlocks: { text: string; charOffset: number }[] = []
    let pageIndex = 0

    for (const block of blocks) {
      const testMd = [...currentBlocks, block].map((b) => b.text).join('\n\n')
      container.innerHTML = toMeasurementHTML(testMd)
      const height = container.scrollHeight

      if (height > CONTENT_HEIGHT && currentBlocks.length > 0) {
        const lastBlock = currentBlocks[currentBlocks.length - 1]
        const lastIsHeading = lastBlock && lastBlock.text.trim().match(/^#{1,3}\s/)

        if (lastIsHeading && currentBlocks.length > 1) {
          const headingBlock = currentBlocks.pop()!
          pages.push({
            markdown: currentBlocks.map((b) => b.text).join('\n\n'),
            index: pageIndex
          })
          breaks.push(headingBlock.charOffset)
          pageIndex++
          currentBlocks = [headingBlock, block]
        } else {
          pages.push({
            markdown: currentBlocks.map((b) => b.text).join('\n\n'),
            index: pageIndex
          })
          breaks.push(block.charOffset)
          pageIndex++
          currentBlocks = [block]
        }
      } else {
        currentBlocks.push(block)
      }
    }

    if (currentBlocks.length > 0) {
      pages.push({
        markdown: currentBlocks.map((b) => b.text).join('\n\n'),
        index: pageIndex
      })
    }

    const finalPages = pages.length > 0 ? pages : [{ markdown: '', index: 0 }]
    setSubSlides(finalPages)
    setBreakOffsets(breaks)

    // Sync total to store + handle -1 (go to last)
    const storeState = usePresentationStore.getState()
    usePresentationStore.setState({ totalSubSlides: finalPages.length })
    if (storeState.currentSubSlide === -1) {
      usePresentationStore.setState({ currentSubSlide: finalPages.length - 1 })
    } else if (storeState.currentSubSlide >= finalPages.length) {
      usePresentationStore.setState({ currentSubSlide: Math.max(0, finalPages.length - 1) })
    }
  }, [markdown])

  useEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    return () => {
      if (measureRef.current) {
        document.body.removeChild(measureRef.current)
        measureRef.current = null
      }
    }
  }, [])

  return { subSlides, currentSubSlide, setCurrentSubSlide, breakOffsets }
}

/**
 * Convert markdown to HTML that approximates the real SlideRenderer's sizing.
 * Uses the same class names/sizes as SlideRenderer components.
 */
function toMeasurementHTML(md: string): string {
  // Handle code blocks first (before other replacements)
  md = md.replace(/```[\s\S]*?```/g, '<pre class="bg-gray-900 rounded-lg p-4 mb-4 overflow-x-auto text-sm" style="min-height:60px">code block</pre>')

  // Handle markdown tables — convert to HTML table for accurate measurement
  md = md.replace(
    /^(\|.+\|)\n(\|[\s:-]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, header: string, _sep: string, body: string) => {
      const parseCells = (row: string) => row.split('|').slice(1, -1).map((c: string) => c.trim())
      const headerCells = parseCells(header)
      const bodyRows = body.trim().split('\n')
      let html = '<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:18px"><thead><tr>'
      headerCells.forEach((c: string) => { html += `<th style="padding:8px 12px;border:1px solid rgba(255,255,255,0.15);font-weight:600">${c}</th>` })
      html += '</tr></thead><tbody>'
      bodyRows.forEach((row: string) => {
        const cells = parseCells(row)
        html += '<tr>'
        cells.forEach((c: string) => { html += `<td style="padding:8px 12px;border:1px solid rgba(255,255,255,0.1)">${c}</td>` })
        html += '</tr>'
      })
      html += '</tbody></table>'
      return html
    }
  )

  // Handle blockquotes
  md = md.replace(/^>\s?(.+)$/gm, '<blockquote style="border-left:3px solid #6366f1;padding:4px 12px;margin:8px 0;font-size:18px">$1</blockquote>')

  // Handle horizontal rules
  md = md.replace(/^---+$/gm, '<hr style="margin:16px 0;border-top:1px solid rgba(255,255,255,0.15)">')

  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-2xl font-medium mb-3" style="line-height:1.2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-3xl font-semibold mb-4" style="line-height:1.2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-4xl font-bold mb-6" style="line-height:1.1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Indented list items (sub-bullets)
    .replace(/^\s{2,}[*\-+] (.+)$/gm, '<div class="text-base leading-relaxed mb-1.5 ml-12">◦ $1</div>')
    // Top-level list items
    .replace(/^[*\-+] (.+)$/gm, '<div class="text-lg leading-relaxed mb-2 ml-6">• $1</div>')
    // Paragraphs (exclude lines already converted to HTML)
    .replace(/^(?!<[hdbtp]|<pre|<hr|<table)((?!<).+)$/gm, '<p class="text-xl leading-relaxed mb-4">$1</p>')
    .replace(/<p[^>]*>\s*<\/p>/g, '')
}

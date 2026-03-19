import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Split markdown into sub-slides that each fit within one 16:9 slide canvas.
 * Also exports character offsets for drawing divider lines in the editor.
 */

// Content height inside the 1280x720 slide with p-12 (48px each side)
const CONTENT_HEIGHT = 720 - 48 * 2 // 624px

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

  // Read sub-slide state from the presentation store
  let storeSubSlide = 0
  let storeSetSubSlide: ((n: number) => void) | null = null
  try {
    const store = require('../stores/presentation-store')
    const state = store.usePresentationStore?.getState?.()
    if (state) {
      storeSubSlide = state.currentSubSlide ?? 0
      storeSetSubSlide = (n: number) => store.usePresentationStore.setState({ currentSubSlide: n })
    }
  } catch {}

  const [localSubSlide, setLocalSubSlide] = useState(0)
  const currentSubSlide = storeSetSubSlide ? storeSubSlide : localSubSlide
  const setCurrentSubSlide = useCallback((n: number) => {
    if (storeSetSubSlide) storeSetSubSlide(n)
    else setLocalSubSlide(n)
  }, [])

  // Reset on slide change
  useEffect(() => {
    setCurrentSubSlide(0)
  }, [slideIndex])

  const measure = useCallback(() => {
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
        // Don't leave a heading stranded at the end — pull it to next page
        const lastBlock = currentBlocks[currentBlocks.length - 1]
        const lastIsHeading = lastBlock && lastBlock.text.trim().match(/^#{1,3}\s/)

        if (lastIsHeading && currentBlocks.length > 1) {
          // Move the heading to the next page with the overflowing block
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

    setSubSlides(pages.length > 0 ? pages : [{ markdown: '', index: 0 }])
    setBreakOffsets(breaks)
    setCurrentSubSlide((prev) => Math.min(prev, Math.max(0, pages.length - 1)))
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

  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-2xl font-medium mb-3" style="line-height:1.2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-3xl font-semibold mb-4" style="line-height:1.2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-4xl font-bold mb-6" style="line-height:1.1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // List items — use same sizes as SlideRenderer
    .replace(/^[*\-+] (.+)$/gm, '<div class="text-lg leading-relaxed mb-2 ml-6">• $1</div>')
    // Paragraphs
    .replace(/^(?!<[hd]|<pre)((?!<).+)$/gm, '<p class="text-xl leading-relaxed mb-4">$1</p>')
    .replace(/<p[^>]*>\s*<\/p>/g, '')
}

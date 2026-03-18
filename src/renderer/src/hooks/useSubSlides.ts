import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Split markdown into chunks that each fit within one 16:9 slide.
 * Uses a hidden DOM measurement div to detect overflow at block boundaries.
 */

// Content height inside the 1280x720 slide with p-12 padding (48px each side)
const CONTENT_HEIGHT = 720 - 48 * 2 // 624px

/**
 * Split markdown text into logical blocks (headings, paragraphs, list items, code blocks, etc.)
 */
function splitIntoBlocks(markdown: string): string[] {
  const lines = markdown.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        current.push(line)
        blocks.push(current.join('\n'))
        current = []
        inCodeBlock = false
      } else {
        // Start of code block — flush current
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

    // Heading starts a new block
    if (line.match(/^#{1,6}\s/)) {
      if (current.length > 0) {
        blocks.push(current.join('\n'))
        current = []
      }
      current.push(line)
      continue
    }

    // Blank line between paragraphs — flush
    if (line.trim() === '' && current.length > 0) {
      current.push(line)
      blocks.push(current.join('\n'))
      current = []
      continue
    }

    current.push(line)
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'))
  }

  return blocks.filter((b) => b.trim().length > 0)
}

export interface SubSlide {
  markdown: string
  index: number // sub-slide index within parent slide
}

export function useSubSlides(
  markdown: string,
  slideIndex: number
): { subSlides: SubSlide[]; currentSubSlide: number; setCurrentSubSlide: (n: number) => void } {
  const [subSlides, setSubSlides] = useState<SubSlide[]>([{ markdown, index: 0 }])
  const [currentSubSlide, setCurrentSubSlide] = useState(0)
  const measureRef = useRef<HTMLDivElement | null>(null)

  // Reset sub-slide when parent slide changes
  useEffect(() => {
    setCurrentSubSlide(0)
  }, [slideIndex])

  const measure = useCallback(() => {
    const blocks = splitIntoBlocks(markdown)
    if (blocks.length === 0) {
      setSubSlides([{ markdown: '', index: 0 }])
      return
    }

    // Create a hidden measurement container matching the slide's content area
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
      // Apply slide-content styles
      container.className = 'slide-content max-w-none'
      document.body.appendChild(container)
      measureRef.current = container
    }

    const pages: SubSlide[] = []
    let currentBlocks: string[] = []
    let pageIndex = 0

    for (const block of blocks) {
      // Try adding this block
      const testMd = [...currentBlocks, block].join('\n\n')
      container.innerHTML = renderMarkdownToHTML(testMd)
      const height = container.scrollHeight

      if (height > CONTENT_HEIGHT && currentBlocks.length > 0) {
        // This block overflows — finalize the current page
        pages.push({ markdown: currentBlocks.join('\n\n'), index: pageIndex })
        pageIndex++
        currentBlocks = [block]
      } else {
        currentBlocks.push(block)
      }
    }

    // Last page
    if (currentBlocks.length > 0) {
      pages.push({ markdown: currentBlocks.join('\n\n'), index: pageIndex })
    }

    setSubSlides(pages.length > 0 ? pages : [{ markdown: '', index: 0 }])

    // Clamp current sub-slide if content shrank
    setCurrentSubSlide((prev) => Math.min(prev, Math.max(0, pages.length - 1)))
  }, [markdown])

  useEffect(() => {
    measure()
  }, [measure])

  // Cleanup
  useEffect(() => {
    return () => {
      if (measureRef.current) {
        document.body.removeChild(measureRef.current)
        measureRef.current = null
      }
    }
  }, [])

  return { subSlides, currentSubSlide, setCurrentSubSlide }
}

/**
 * Quick markdown-to-HTML for measurement purposes.
 * Doesn't need to be perfect — just needs to produce similar heights to the real renderer.
 */
function renderMarkdownToHTML(md: string): string {
  return md
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="text-2xl font-medium mb-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-3xl font-semibold mb-4">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-4xl font-bold mb-6">$1</h1>')
    // Bold/italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // List items
    .replace(/^[*\-+] (.+)$/gm, '<li class="text-lg mb-2 list-disc ml-6">$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li[^>]*>.*?<\/li>\n?)+)/g, '<ul class="text-lg leading-relaxed mb-4">$1</ul>')
    // Paragraphs (lines not already wrapped)
    .replace(/^(?!<[hulo])((?!<).+)$/gm, '<p class="text-xl leading-relaxed mb-4">$1</p>')
    // Code blocks
    .replace(/```[\s\S]*?```/g, '<pre class="bg-gray-900 rounded-lg p-4 mb-4 text-sm">code</pre>')
    // Clean up empty paragraphs
    .replace(/<p[^>]*>\s*<\/p>/g, '')
}

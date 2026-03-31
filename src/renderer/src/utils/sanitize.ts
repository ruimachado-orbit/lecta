import DOMPurify from 'dompurify'

/** Sanitize general HTML content (cell output, markdown, search highlights) */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

/** Sanitize SVG content (mermaid diagrams, flow diagrams) */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['foreignObject']
  })
}

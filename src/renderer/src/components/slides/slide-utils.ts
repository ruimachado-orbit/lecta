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

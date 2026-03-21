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

import { resolve, sep, isAbsolute } from 'path'

/**
 * Registry of deck root directories that are currently open.
 *
 * Every IPC handler that receives a filesystem path from the renderer must
 * confine that path to one of these roots via `assertInsideOpenDeck`. The
 * renderer is treated as untrusted: deck content (MDX, raw HTML, AI output)
 * can execute in it, so a raw path from IPC is a raw path from a deck file.
 */
export const allowedFileRoots = new Set<string>()

export function registerDeckRoot(rootPath: string): string {
  const resolved = resolve(rootPath)
  allowedFileRoots.add(resolved)
  return resolved
}

export function unregisterDeckRoot(rootPath: string): void {
  allowedFileRoots.delete(resolve(rootPath))
}

export function isInsideRoot(filePath: string, root: string): boolean {
  const resolved = resolve(filePath)
  const resolvedRoot = resolve(root)
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + sep)
}

export function isInsideOpenDeck(filePath: string): boolean {
  if (typeof filePath !== 'string' || filePath.length === 0) return false
  return Array.from(allowedFileRoots).some((root) => isInsideRoot(filePath, root))
}

export class PathOutsideDeckError extends Error {
  constructor(filePath: string) {
    super(`Path is outside any open presentation: ${filePath}`)
    this.name = 'PathOutsideDeckError'
  }
}

/**
 * Resolve `filePath` and throw unless it lies inside an open deck root.
 * Returns the resolved absolute path so callers use the confined value.
 */
export function assertInsideOpenDeck(filePath: string): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new PathOutsideDeckError(String(filePath))
  }
  const resolved = resolve(filePath)
  if (!isInsideOpenDeck(resolved)) throw new PathOutsideDeckError(filePath)
  return resolved
}

/**
 * Resolve a deck-relative path against `rootPath`, rejecting absolute paths
 * and any `..` segment. Returns the absolute path inside the deck.
 */
export function resolveInsideDeck(rootPath: string, relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new PathOutsideDeckError(String(relativePath))
  }
  if (isAbsolute(relativePath) || /^[a-zA-Z]:[\\/]/.test(relativePath)) {
    throw new PathOutsideDeckError(relativePath)
  }
  const segments = relativePath.split(/[\\/]+/)
  if (segments.some((s) => s === '..')) throw new PathOutsideDeckError(relativePath)
  const resolved = resolve(rootPath, relativePath)
  if (!isInsideRoot(resolved, rootPath)) throw new PathOutsideDeckError(relativePath)
  return resolved
}

import { watch, type FSWatcher } from 'fs'
import { readFile as readFileAsync } from 'fs/promises'
import { resolve, relative, sep } from 'path'
import { BrowserWindow } from 'electron'
import { isInsideRoot } from './deck-roots'

interface WatcherEntry {
  rootPath: string
  watcher: FSWatcher | null
  rearmTimer: NodeJS.Timeout | null
  /** Last content broadcast to the renderer — duplicate events are dropped. */
  lastSent: string | null
}

/** Resolved file path → watcher */
const watchers: Map<string, WatcherEntry> = new Map()

// ── Own-write suppression ──
// fs:write-file records what it wrote; a change event whose content equals
// that write (within the TTL) is the app's own save echoing back, not an
// external edit, and must not clobber what the user is typing.

const OWN_WRITE_TTL_MS = 2000
const ownWrites: Map<string, { content: string; at: number }> = new Map()

export function markOwnWrite(filePath: string, content: string): void {
  const now = Date.now()
  ownWrites.set(resolve(filePath), { content, at: now })
  // Opportunistic cleanup so the map never grows unbounded
  for (const [key, entry] of ownWrites) {
    if (now - entry.at > OWN_WRITE_TTL_MS) ownWrites.delete(key)
  }
}

function isOwnWrite(resolvedPath: string, content: string): boolean {
  const entry = ownWrites.get(resolvedPath)
  if (!entry) return false
  if (Date.now() - entry.at > OWN_WRITE_TTL_MS) {
    ownWrites.delete(resolvedPath)
    return false
  }
  return entry.content === content
}

// ── Broadcasting ──

function toRelativePath(rootPath: string, filePath: string): string {
  return relative(rootPath, filePath).split(sep).join('/')
}

async function emitChange(resolvedPath: string): Promise<void> {
  const entry = watchers.get(resolvedPath)
  if (!entry) return
  let content: string
  try {
    content = await readFileAsync(resolvedPath, 'utf-8')
  } catch {
    // File might be temporarily unavailable during saves
    return
  }
  if (isOwnWrite(resolvedPath, content)) {
    entry.lastSent = content
    return
  }
  if (entry.lastSent === content) return
  entry.lastSent = content

  const relativePath = toRelativePath(entry.rootPath, resolvedPath)
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('fs:file-changed', resolvedPath, content, relativePath)
  }
}

// ── Watcher lifecycle ──

function closeWatcher(entry: WatcherEntry): void {
  if (entry.rearmTimer) {
    clearTimeout(entry.rearmTimer)
    entry.rearmTimer = null
  }
  if (entry.watcher) {
    try { entry.watcher.close() } catch { /* already closed */ }
    entry.watcher = null
  }
}

/**
 * Editors that save atomically (write temp + rename) replace the inode, which
 * fs.watch reports as 'rename' and then goes silent. Re-create the watcher on
 * the path after a short delay so we keep following the file.
 */
function scheduleRearm(resolvedPath: string): void {
  const entry = watchers.get(resolvedPath)
  if (!entry || entry.rearmTimer) return
  entry.rearmTimer = setTimeout(() => {
    const current = watchers.get(resolvedPath)
    if (!current) return
    current.rearmTimer = null
    closeWatcher(current)
    arm(resolvedPath)
    void emitChange(resolvedPath)
  }, 150)
}

function arm(resolvedPath: string): void {
  const entry = watchers.get(resolvedPath)
  if (!entry) return
  try {
    const watcher = watch(resolvedPath, { persistent: false }, (eventType) => {
      if (eventType === 'rename') {
        scheduleRearm(resolvedPath)
        return
      }
      void emitChange(resolvedPath)
    })
    watcher.on('error', () => {
      // Watched file vanished or the handle broke — try again shortly
      scheduleRearm(resolvedPath)
    })
    entry.watcher = watcher
  } catch {
    // File doesn't exist (yet) — a later addFileToWatch/rearm will pick it up
    entry.watcher = null
  }
}

/**
 * Watch `filePaths` belonging to the deck at `rootPath`. Existing watchers
 * for that deck are replaced; watchers for other open decks are untouched.
 */
export function startWatching(rootPath: string, filePaths: string[]): void {
  const resolvedRoot = resolve(rootPath)
  stopWatching(resolvedRoot)

  for (const filePath of filePaths) {
    addFileToWatch(resolvedRoot, filePath)
  }
}

/** Stop the watchers of one deck, or every watcher when `rootPath` is omitted. */
export function stopWatching(rootPath?: string): void {
  const resolvedRoot = rootPath ? resolve(rootPath) : null
  for (const [path, entry] of watchers) {
    if (resolvedRoot && entry.rootPath !== resolvedRoot) continue
    closeWatcher(entry)
    watchers.delete(path)
  }
}

/** Start watching a single file inside the deck at `rootPath` (no-op if already watched). */
export function addFileToWatch(rootPath: string, filePath: string): void {
  const resolvedRoot = resolve(rootPath)
  const resolvedPath = resolve(resolvedRoot, filePath)
  if (!isInsideRoot(resolvedPath, resolvedRoot)) return
  if (watchers.has(resolvedPath)) return

  watchers.set(resolvedPath, { rootPath: resolvedRoot, watcher: null, rearmTimer: null, lastSent: null })
  arm(resolvedPath)
}

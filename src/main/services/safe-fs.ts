import { writeFile, rename, unlink, mkdir, copyFile } from 'fs/promises'
import { dirname } from 'path'

/**
 * Write `data` to `filePath` atomically: write to a sibling temp file, then
 * rename over the target. A crash mid-write leaves the previous file intact.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string | Buffer | Uint8Array,
  options: { mode?: number; backup?: boolean } = {}
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    await writeFile(tmp, data, options.mode !== undefined ? { mode: options.mode } : undefined)
    if (options.backup) {
      await copyFile(filePath, `${filePath}.bak`).catch(() => {})
    }
    await rename(tmp, filePath)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}

/**
 * Create a file only if it does not exist yet. Never truncates existing content.
 * Returns true when the file was created.
 */
export async function writeFileIfMissing(filePath: string, data: string | Buffer): Promise<boolean> {
  try {
    await writeFile(filePath, data, { flag: 'wx' })
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw err
  }
}

const locks = new Map<string, Promise<unknown>>()

/**
 * Serialize async work per key (typically a deck root path). Every
 * read-modify-write of lecta.yaml / the .lecta archive / settings.json must
 * run inside the lock for its key so concurrent handlers cannot interleave.
 */
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  const next = previous.then(fn, fn)
  locks.set(key, next.catch(() => {}))
  return next
}

/** Debounce async work per key; the last call within `ms` wins. */
export function debouncePerKey<T>(ms: number): (key: string, fn: () => Promise<T>) => Promise<T> {
  const timers = new Map<string, NodeJS.Timeout>()
  const pending = new Map<string, { resolve: (v: T) => void; reject: (e: unknown) => void }[]>()
  return (key, fn) =>
    new Promise<T>((resolve, reject) => {
      const list = pending.get(key) ?? []
      list.push({ resolve, reject })
      pending.set(key, list)
      const existing = timers.get(key)
      if (existing) clearTimeout(existing)
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          const waiters = pending.get(key) ?? []
          pending.delete(key)
          fn().then(
            (v) => waiters.forEach((w) => w.resolve(v)),
            (e) => waiters.forEach((w) => w.reject(e))
          )
        }, ms)
      )
    })
}

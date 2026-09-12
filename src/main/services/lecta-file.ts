import JSZip from 'jszip'
import { readFile, writeFile, readdir, mkdir, mkdtemp, rm } from 'fs/promises'
import { join, relative, basename, dirname, resolve, sep } from 'path'
import { createHash } from 'crypto'
import { app } from 'electron'
import { stringify as stringifyYaml } from 'yaml'
import { atomicWriteFile, withLock } from './safe-fs'

const TEMP_DIR_PREFIX = 'lecta-workspace-'
const AUTOSAVE_DEBOUNCE_MS = 400

/**
 * Get a temporary workspace directory for an extracted .lecta file.
 * Each .lecta file gets its own workspace so multiple can be open. The
 * directory name hashes the FULL path so two files with the same basename
 * never share a workspace.
 */
function getWorkspaceDir(lectaFilePath: string): string {
  const name = basename(lectaFilePath, '.lecta').replace(/[^a-zA-Z0-9_-]/g, '_')
  const hash = createHash('sha1').update(lectaFilePath).digest('hex').slice(0, 12)
  return join(app.getPath('temp'), `${TEMP_DIR_PREFIX}${name}-${hash}`)
}

/** Temp files left behind by an interrupted atomic write — never pack them. */
function isTransientFile(name: string): boolean {
  return /\.tmp-\d+-\d+-[a-z0-9]+$/.test(name) || name === '.DS_Store'
}

/** Recursively collect all files in a directory */
async function collectFiles(dir: string, base: string = dir): Promise<{ relativePath: string; fullPath: string }[]> {
  const results: { relativePath: string; fullPath: string }[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await collectFiles(fullPath, base))
    } else if (!isTransientFile(entry.name)) {
      results.push({
        relativePath: relative(base, fullPath),
        fullPath
      })
    }
  }

  return results
}

/** Extract a .lecta archive into `destDir`, refusing entries that escape it (zip-slip). */
async function extractLectaFile(lectaFilePath: string, destDir: string): Promise<void> {
  const data = await readFile(lectaFilePath)
  const zip = await JSZip.loadAsync(data)
  const resolvedDest = resolve(destDir)

  await mkdir(resolvedDest, { recursive: true })

  for (const [path, file] of Object.entries(zip.files)) {
    const fullPath = resolve(resolvedDest, path)
    if (fullPath !== resolvedDest && !fullPath.startsWith(resolvedDest + sep)) {
      console.warn(`[lecta-file] Skipping archive entry outside workspace: ${path}`)
      continue
    }
    if (file.dir) {
      await mkdir(fullPath, { recursive: true })
    } else {
      const content = await file.async('nodebuffer')
      await mkdir(dirname(fullPath), { recursive: true })
      await writeFile(fullPath, content)
    }
  }
}

/**
 * Extract a .lecta file to a temporary workspace directory.
 * Any stale workspace for the same file is removed first so files deleted
 * from the archive do not resurrect. Returns the path to the workspace directory.
 */
export async function openLectaFile(lectaFilePath: string): Promise<string> {
  const workspaceDir = getWorkspaceDir(lectaFilePath)

  // If this deck is currently open, make sure the archive is current before
  // we replace the live workspace with its contents.
  if (workspaceToLectaFile.has(workspaceDir)) {
    await flushAutoSave(workspaceDir)
  }

  await withLock(lectaFilePath, async () => {
    await rm(workspaceDir, { recursive: true, force: true })
    await extractLectaFile(lectaFilePath, workspaceDir)
  })

  return workspaceDir
}

/**
 * Extract a .lecta file into a throwaway directory, run `fn` against it and
 * always clean up. Use this to inspect an archive (metadata, slide import)
 * without touching the live workspace of a deck that may be open.
 */
export async function withExtractedLectaFile<T>(
  lectaFilePath: string,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(app.getPath('temp'), 'lecta-inspect-'))
  try {
    await extractLectaFile(lectaFilePath, dir)
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Pack a workspace directory back into a .lecta file.
 * Saves for the same archive are serialized and written atomically.
 */
export async function saveLectaFile(workspaceDir: string, lectaFilePath: string): Promise<void> {
  await withLock(lectaFilePath, async () => {
    const zip = new JSZip()
    const files = await collectFiles(workspaceDir)

    for (const { relativePath, fullPath } of files) {
      const content = await readFile(fullPath)
      zip.file(relativePath.split(sep).join('/'), content)
    }

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })

    await atomicWriteFile(lectaFilePath, buffer)
  })
}

/**
 * Create a new .lecta file with starter content.
 * Returns the workspace directory path.
 */
export async function createLectaFile(lectaFilePath: string, title: string, docType: 'presentation' | 'notebook' = 'presentation'): Promise<string> {
  const workspaceDir = getWorkspaceDir(lectaFilePath)
  await rm(workspaceDir, { recursive: true, force: true })

  if (docType === 'notebook') {
    await mkdir(join(workspaceDir, 'pages'), { recursive: true })

    await writeFile(
      join(workspaceDir, 'pages', 'first-note.md'),
      `# ${title}\n\n`,
      'utf-8'
    )

    const yaml = stringifyYaml({
      type: 'notebook',
      title,
      author: '',
      theme: 'dark',
      defaultLayout: 'lines',
      pages: [
        {
          id: 'first-note',
          content: 'pages/first-note.md',
          createdAt: new Date().toISOString(),
          artifacts: []
        }
      ]
    })

    await writeFile(join(workspaceDir, 'lecta.yaml'), yaml, 'utf-8')
  } else {
    await mkdir(join(workspaceDir, 'slides'), { recursive: true })
    await mkdir(join(workspaceDir, 'code'), { recursive: true })

    // A new deck opens on something that already demonstrates what Lecta is for:
    // a title, a slide whose code actually runs, and a closing slide.
    await writeFile(
      join(workspaceDir, 'slides', '01-title.md'),
      `# ${title}\n\nA presentation that runs its own code.\n`,
      'utf-8'
    )

    await writeFile(
      join(workspaceDir, 'slides', '02-live-code.md'),
      [
        '## Live code',
        '',
        'The snippet on the right runs inside the slide. Edit it and press',
        '`Cmd/Ctrl + Enter` — the output updates while you present.',
        '',
        '- Runs in a sandboxed worker',
        '- Output is mirrored to the audience window',
        '- Python, SQL and shell engines work the same way',
        ''
      ].join('\n'),
      'utf-8'
    )

    await writeFile(
      join(workspaceDir, 'code', 'hello.js'),
      [
        "const audience = 'everyone'",
        '',
        'console.log(`Hello, ${audience}!`)',
        '',
        'const squares = [1, 2, 3, 4, 5].map((n) => n * n)',
        "console.log('Squares:', squares.join(', '))",
        '',
        '// Change something and run it again — the slide updates live.',
        ''
      ].join('\n'),
      'utf-8'
    )

    await writeFile(
      join(workspaceDir, 'slides', '03-closing.md'),
      `# Thank you\n\nQuestions?\n`,
      'utf-8'
    )

    const yaml = stringifyYaml({
      title,
      author: '',
      theme: 'modern',
      slides: [
        {
          id: 'title',
          content: 'slides/01-title.md',
          layout: 'title',
          artifacts: []
        },
        {
          id: 'live-code',
          content: 'slides/02-live-code.md',
          layout: 'two-col',
          code: {
            file: 'code/hello.js',
            language: 'javascript',
            execution: 'sandpack'
          },
          artifacts: []
        },
        {
          id: 'closing',
          content: 'slides/03-closing.md',
          layout: 'center',
          artifacts: []
        }
      ]
    })

    await writeFile(join(workspaceDir, 'lecta.yaml'), yaml, 'utf-8')
  }

  await saveLectaFile(workspaceDir, lectaFilePath)
  return workspaceDir
}

/**
 * Clean up workspace directory.
 */
export async function cleanupWorkspace(workspaceDir: string): Promise<void> {
  try {
    await rm(workspaceDir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

/** Map from workspace dir → source .lecta file path */
const workspaceToLectaFile = new Map<string, string>()

export function registerWorkspace(workspaceDir: string, lectaFilePath: string): void {
  workspaceToLectaFile.set(workspaceDir, lectaFilePath)
}

/**
 * Forget the workspace → .lecta mapping for a closed deck. Flushes any
 * pending auto-save first so the last edits reach the archive.
 */
export async function unregisterWorkspace(workspaceDir: string): Promise<void> {
  await flushAutoSave(workspaceDir)
  workspaceToLectaFile.delete(workspaceDir)
}

export function getLectaFilePath(workspaceDir: string): string | undefined {
  return workspaceToLectaFile.get(workspaceDir)
}

// ── Debounced auto-save ──
// Bursts of edits (drawing strokes, notes keystrokes) coalesce into one pack
// per workspace. `flushAutoSave` runs a pending save immediately.

interface PendingAutoSave {
  timer: NodeJS.Timeout
  run: () => Promise<void>
}

const pendingAutoSaves = new Map<string, PendingAutoSave>()
const runningAutoSaves = new Map<string, Promise<void>>()

function runAutoSaveNow(workspaceDir: string): Promise<void> {
  const lectaFilePath = workspaceToLectaFile.get(workspaceDir)
  if (!lectaFilePath) return Promise.resolve()
  const running = saveLectaFile(workspaceDir, lectaFilePath)
    .catch((err) => {
      console.error(`[lecta-file] Auto-save failed for ${lectaFilePath}:`, err)
    })
    .finally(() => {
      if (runningAutoSaves.get(workspaceDir) === running) runningAutoSaves.delete(workspaceDir)
    })
  runningAutoSaves.set(workspaceDir, running)
  return running
}

/**
 * Auto-save: schedule packing the workspace back to its .lecta file.
 * Returns immediately; the save runs ~400 ms after the last call for the
 * same workspace. Use `flushAutoSave` when the archive must be current now.
 */
export async function autoSave(workspaceDir: string): Promise<void> {
  if (!workspaceToLectaFile.has(workspaceDir)) return

  const existing = pendingAutoSaves.get(workspaceDir)
  if (existing) clearTimeout(existing.timer)

  const run = (): Promise<void> => {
    pendingAutoSaves.delete(workspaceDir)
    return runAutoSaveNow(workspaceDir)
  }
  const timer = setTimeout(() => { void run() }, AUTOSAVE_DEBOUNCE_MS)
  pendingAutoSaves.set(workspaceDir, { timer, run })
}

/** Run any pending auto-save for `workspaceDir` right now and wait for it. */
export async function flushAutoSave(workspaceDir: string): Promise<void> {
  const pending = pendingAutoSaves.get(workspaceDir)
  if (pending) {
    clearTimeout(pending.timer)
    await pending.run()
    return
  }
  const running = runningAutoSaves.get(workspaceDir)
  if (running) await running
}

/** Flush every pending auto-save (call before the app quits). */
export async function flushAllAutoSaves(): Promise<void> {
  const dirs = new Set([...pendingAutoSaves.keys(), ...runningAutoSaves.keys()])
  await Promise.all(Array.from(dirs).map((dir) => flushAutoSave(dir)))
}

// Debouncing means the archive can lag the workspace by up to 400 ms; make
// sure a quit does not lose that window.
let quitFlushed = false
if (app && typeof app.on === 'function') {
  app.on('before-quit', (event) => {
    if (quitFlushed || (pendingAutoSaves.size === 0 && runningAutoSaves.size === 0)) return
    event.preventDefault()
    flushAllAutoSaves().finally(() => {
      quitFlushed = true
      app.quit()
    })
  })
}

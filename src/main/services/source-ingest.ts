import { readdir, readFile, stat } from 'fs/promises'
import { join, relative } from 'path'

/**
 * Aggregate a folder (or git repo) of text files into a single string for
 * grounded deck generation. The caller decides what to do with the result;
 * this module only does the safe, bounded read.
 */

/** Directories we never descend into. */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'out',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.idea',
  '.vscode',
  '.gradle',
  'coverage'
])

/** File extensions we are willing to read as text. */
const TEXT_EXTENSIONS = new Set([
  'md', 'mdx', 'txt', 'csv', 'json', 'yaml', 'yml', 'toml', 'rst',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'java',
  'c', 'h', 'cpp', 'hpp', 'cs', 'rb', 'php', 'sql', 'sh', 'bash',
  'html', 'css', 'scss', 'less', 'graphql', 'proto', 'ipynb'
])

/** Per-file cap, in characters. */
const MAX_FILE_CHARS = 20_000
/** Total cap across all files, in characters. */
const MAX_TOTAL_CHARS = 60_000
/** Cap on the number of files read, whatever their size. */
const MAX_FILES = 200

async function readDirEntries(dir: string): Promise<{ name: string; isDir: boolean }[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }))
}

/** True when a directory name marks a generated/vendored tree to skip. */
function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith('.')
}

/** True when a filename's extension is one we will read as text. */
function isTextFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

async function walk(
  dir: string,
  root: string,
  out: { rel: string; abs: string }[]
): Promise<void> {
  let entries: { name: string; isDir: boolean }[]
  try {
    entries = await readDirEntries(dir)
  } catch {
    return // unreadable directory — skip silently
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of entries) {
    if (out.length >= MAX_FILES) return
    const abs = join(dir, entry.name)
    if (entry.isDir) {
      if (isIgnoredDir(entry.name)) continue
      await walk(abs, root, out)
    } else if (isTextFile(entry.name)) {
      out.push({ rel: relative(root, abs), abs })
    }
  }
}

/**
 * Read a folder of source text into one delimited string.
 * Returns '' when the folder is empty or unreadable.
 */
export async function readSourceFolder(folderPath: string): Promise<string> {
  const root = folderPath
  const files: { rel: string; abs: string }[] = []
  await walk(root, root, files)

  const chunks: string[] = []
  let total = 0

  for (const file of files) {
    if (total >= MAX_TOTAL_CHARS) break
    try {
      const info = await stat(file.abs)
      if (info.size > 5 * 1024 * 1024) continue // skip > 5 MB (binary blobs masquerading as text)
      const content = await readFile(file.abs, 'utf-8')
      if (!content.trim()) continue
      const capped = content.slice(0, MAX_FILE_CHARS)
      chunks.push(`// FILE: ${file.rel}\n${capped}`)
      total += capped.length
    } catch {
      // unreadable file — skip
    }
  }

  return chunks.join('\n\n')
}

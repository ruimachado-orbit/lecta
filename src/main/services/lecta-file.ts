import JSZip from 'jszip'
import { readFile, writeFile, readdir, stat, mkdir, rm } from 'fs/promises'
import { join, relative, basename, dirname } from 'path'
import { app } from 'electron'

const TEMP_DIR_PREFIX = 'lecta-workspace-'

/**
 * Get a temporary workspace directory for an extracted .lecta file.
 * Each .lecta file gets its own workspace so multiple can be open.
 */
function getWorkspaceDir(lectaFilePath: string): string {
  const name = basename(lectaFilePath, '.lecta').replace(/[^a-zA-Z0-9_-]/g, '_')
  const hash = Buffer.from(lectaFilePath).toString('base64url').slice(0, 8)
  return join(app.getPath('temp'), `${TEMP_DIR_PREFIX}${name}-${hash}`)
}

/** Recursively collect all files in a directory */
async function collectFiles(dir: string, base: string = dir): Promise<{ relativePath: string; fullPath: string }[]> {
  const results: { relativePath: string; fullPath: string }[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await collectFiles(fullPath, base))
    } else {
      results.push({
        relativePath: relative(base, fullPath),
        fullPath
      })
    }
  }

  return results
}

/**
 * Extract a .lecta file to a temporary workspace directory.
 * Returns the path to the workspace directory.
 */
export async function openLectaFile(lectaFilePath: string): Promise<string> {
  const data = await readFile(lectaFilePath)
  const zip = await JSZip.loadAsync(data)

  const workspaceDir = getWorkspaceDir(lectaFilePath)
  await mkdir(workspaceDir, { recursive: true })

  // Extract all files
  const entries = Object.entries(zip.files)
  for (const [path, file] of entries) {
    if (file.dir) {
      await mkdir(join(workspaceDir, path), { recursive: true })
    } else {
      const content = await file.async('nodebuffer')
      const fullPath = join(workspaceDir, path)
      await mkdir(dirname(fullPath), { recursive: true })
      await writeFile(fullPath, content)
    }
  }

  return workspaceDir
}

/**
 * Pack a workspace directory back into a .lecta file.
 */
export async function saveLectaFile(workspaceDir: string, lectaFilePath: string): Promise<void> {
  const zip = new JSZip()
  const files = await collectFiles(workspaceDir)

  for (const { relativePath, fullPath } of files) {
    const content = await readFile(fullPath)
    zip.file(relativePath, content)
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })

  await writeFile(lectaFilePath, buffer)
}

/**
 * Create a new .lecta file with starter content.
 * Returns the workspace directory path.
 */
export async function createLectaFile(lectaFilePath: string, title: string): Promise<string> {
  const workspaceDir = getWorkspaceDir(lectaFilePath)
  await mkdir(join(workspaceDir, 'slides'), { recursive: true })
  await mkdir(join(workspaceDir, 'code'), { recursive: true })

  // Write starter slide
  await writeFile(
    join(workspaceDir, 'slides', '01-welcome.md'),
    `# ${title}\n\nWelcome to your new presentation!\n`,
    'utf-8'
  )

  // Write lecta.yaml
  const yaml = [
    `title: "${title}"`,
    `author: ""`,
    `theme: "dark"`,
    ``,
    `slides:`,
    `  - id: welcome`,
    `    content: slides/01-welcome.md`,
    `    artifacts: []`,
    ``
  ].join('\n')

  await writeFile(join(workspaceDir, 'lecta.yaml'), yaml, 'utf-8')

  // Pack into .lecta file
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

export function getLectaFilePath(workspaceDir: string): string | undefined {
  return workspaceToLectaFile.get(workspaceDir)
}

/**
 * Auto-save: pack workspace back to the .lecta file
 */
export async function autoSave(workspaceDir: string): Promise<void> {
  const lectaFilePath = workspaceToLectaFile.get(workspaceDir)
  if (lectaFilePath) {
    await saveLectaFile(workspaceDir, lectaFilePath)
  }
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { readSourceFolder } from './source-ingest'

let tempDir: string

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'lecta-source-ingest-'))
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('readSourceFolder', () => {
  it('reads text files, delimited by relative path, and skips ignored dirs', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true })
    await mkdir(join(tempDir, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(tempDir, 'README.md'), '# Title\n\nIntro')
    await writeFile(join(tempDir, 'src', 'main.ts'), 'export const x = 1')
    await writeFile(join(tempDir, 'node_modules', 'pkg', 'index.js'), 'SKIP ME')

    const result = await readSourceFolder(tempDir)

    expect(result).toContain('// FILE: README.md')
    expect(result).toContain('# Title')
    expect(result).toContain('// FILE: src/main.ts')
    expect(result).toContain('export const x = 1')
    expect(result).not.toContain('SKIP ME')
    expect(result).not.toContain('node_modules')
  })

  it('returns an empty string for an empty folder', async () => {
    const empty = join(tempDir, 'empty')
    await mkdir(empty, { recursive: true })
    expect(await readSourceFolder(empty)).toBe('')
  })
})

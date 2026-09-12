import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { parse as parseYaml } from 'yaml'
import { importIpynb } from './ipynb-importer'

let tempDir: string
let workspace: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'lecta-ipynb-'))
  workspace = join(tempDir, 'workspace')
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

/** 1×1 transparent PNG / minimal JPEG payloads, base64. */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const JPEG_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB'

async function writeNotebook(notebook: unknown): Promise<string> {
  const path = join(tempDir, 'notebook.ipynb')
  await writeFile(path, JSON.stringify(notebook), 'utf-8')
  return path
}

async function readConfig(): Promise<any> {
  return parseYaml(await readFile(join(workspace, 'lecta.yaml'), 'utf-8'))
}

describe('importIpynb — cell validation', () => {
  it('skips malformed cells with a warning instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const path = await writeNotebook({
        cells: [
          { cell_type: 'markdown', source: ['# Title\n', 'Intro text\n'], metadata: {} },
          // `source` is an object — not valid per the nbformat spec.
          { cell_type: 'code', source: { bad: true }, metadata: {} },
          null,
          { cell_type: 'code', source: 'print(1)', metadata: {}, outputs: [] },
        ],
        metadata: { kernelspec: { language: 'python' } },
        nbformat: 4,
        nbformat_minor: 5,
      })

      await importIpynb(path, workspace)

      const config = await readConfig()
      expect(config.pages).toHaveLength(2)
      expect(config.pages[0].cellType).toBe('markdown')
      expect(config.pages[1].cellType).toBe('code')
      expect(config.title).toBe('Title')
      expect(warn).toHaveBeenCalledTimes(2)
    } finally {
      warn.mockRestore()
    }
  })

  it('skips a null output without losing the rest of the cell', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const path = await writeNotebook({
        cells: [
          {
            cell_type: 'code',
            source: 'print("hi")',
            metadata: {},
            outputs: [null, { output_type: 'stream', name: 'stdout', text: ['hi\n'] }],
          },
        ],
        metadata: {},
      })

      await importIpynb(path, workspace)

      const config = await readConfig()
      expect(config.pages[0].outputs).toHaveLength(1)
      expect(config.pages[0].outputs[0].text).toBe('hi\n')
      expect(warn).toHaveBeenCalledOnce()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('importIpynb — outputs', () => {
  it('extracts PNG, JPEG and SVG images', async () => {
    const path = await writeNotebook({
      cells: [
        { cell_type: 'code', source: 'a', metadata: {}, outputs: [{ output_type: 'display_data', data: { 'image/png': PNG_B64 } }] },
        { cell_type: 'code', source: 'b', metadata: {}, outputs: [{ output_type: 'display_data', data: { 'image/jpeg': JPEG_B64 } }] },
        {
          cell_type: 'code',
          source: 'c',
          metadata: {},
          outputs: [{ output_type: 'display_data', data: { 'image/svg+xml': ['<svg xmlns="http://www.w3.org/2000/svg"/>'] } }],
        },
      ],
      metadata: {},
    })

    await importIpynb(path, workspace)

    const artifacts = (await readdir(join(workspace, 'artifacts'))).sort()
    expect(artifacts).toEqual(['output-01-0.png', 'output-02-0.jpg', 'output-03-0.svg'])
    // SVG is inline XML, not base64 — it must be written verbatim.
    expect(await readFile(join(workspace, 'artifacts', 'output-03-0.svg'), 'utf-8')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"/>'
    )
  })

  it('keeps a text/markdown output when there is no text/plain', async () => {
    const path = await writeNotebook({
      cells: [
        {
          cell_type: 'code',
          source: 'display(Markdown("**bold**"))',
          metadata: {},
          outputs: [{ output_type: 'display_data', data: { 'text/markdown': ['**bold**'] } }],
        },
      ],
      metadata: {},
    })

    await importIpynb(path, workspace)

    const config = await readConfig()
    expect(config.pages[0].outputs[0].text).toBe('**bold**')
  })

  it('strips ANSI colour codes from error tracebacks', async () => {
    const path = await writeNotebook({
      cells: [
        {
          cell_type: 'code',
          source: '1/0',
          metadata: {},
          outputs: [
            {
              output_type: 'error',
              ename: 'ZeroDivisionError',
              evalue: '\u001B[0;31mdivision by zero\u001B[0m',
              traceback: [
                '\u001B[0;31m---------------------------------------------------------------------------\u001B[0m',
                '\u001B[0;32m<ipython-input-1>\u001B[0m in \u001B[0;36m<module>\u001B[0m',
              ],
            },
          ],
        },
      ],
      metadata: {},
    })

    await importIpynb(path, workspace)

    const output = (await readConfig()).pages[0].outputs[0]
    expect(output.text).toBe('ZeroDivisionError: division by zero')
    expect(output.traceback.join('\n')).not.toContain('\u001B')
    expect(output.traceback[1]).toBe('<ipython-input-1> in <module>')
  })
})

describe('importIpynb — markdown attachments', () => {
  it('writes attachments to artifacts/ and rewrites the references', async () => {
    const path = await writeNotebook({
      cells: [
        {
          cell_type: 'markdown',
          source: '# Diagram\n\n![arch](attachment:arch.png)\n',
          metadata: {},
          attachments: { 'arch.png': { 'image/png': PNG_B64 } },
        },
      ],
      metadata: {},
    })

    await importIpynb(path, workspace)

    const markdown = await readFile(join(workspace, 'pages', 'cell-01.md'), 'utf-8')
    expect(markdown).toContain('![arch](artifacts/attachment-01-0.png)')
    expect(markdown).not.toContain('attachment:arch.png')

    const config = await readConfig()
    expect(config.pages[0].artifacts).toEqual([
      { path: 'artifacts/attachment-01-0.png', label: 'arch.png' },
    ])
  })
})

describe('importIpynb — kernels', () => {
  it.each([
    [{ kernelspec: { language: 'R', name: 'ir' } }, 'r', '.r'],
    [{ kernelspec: { name: 'ir' } }, 'r', '.r'],
    [{ kernelspec: { language: 'julia', name: 'julia-1.10' } }, 'julia', '.jl'],
    [{ kernelspec: { language: 'python', name: 'python3' } }, 'python', '.py'],
  ])('labels %o as the %s kernel', async (metadata, kernel, ext) => {
    const path = await writeNotebook({
      cells: [{ cell_type: 'code', source: 'x <- 1', metadata: {} }],
      metadata,
    })

    await importIpynb(path, workspace)

    const config = await readConfig()
    expect(config.kernel).toBe(kernel)
    expect(config.pages[0].code.file).toBe(`code/cell-01${ext}`)
  })

  it('marks a non-executable kernel with execution "none"', async () => {
    const path = await writeNotebook({
      cells: [{ cell_type: 'code', source: 'x <- 1', metadata: {} }],
      metadata: { kernelspec: { language: 'R', name: 'ir' } },
    })

    await importIpynb(path, workspace)

    expect((await readConfig()).pages[0].code.execution).toBe('none')
  })
})

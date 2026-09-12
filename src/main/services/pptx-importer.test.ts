import JSZip from 'jszip'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { parse as parseYaml } from 'yaml'
import { importPptx } from './pptx-importer'

let tempDir: string
let workspace: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'lecta-pptx-'))
  workspace = join(tempDir, 'workspace')
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`

const NS = [
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"',
].join(' ')

/** A `<p:sp>` placeholder shape wrapping the given `<a:p>` paragraphs. */
function shape(phType: string | null, paragraphs: string): string {
  const ph = phType ? `<p:ph type="${phType}"/>` : '<p:ph/>'
  return `<p:sp>
      <p:nvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr>
      <p:txBody>${paragraphs}</p:txBody>
    </p:sp>`
}

function slideXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`
}

function notesXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes ${NS}><p:cSld><p:spTree>
  <p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>ignore me</a:t></a:r></a:p></p:txBody></p:sp>
  <p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:notes>`
}

function rels(entries: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries}</Relationships>`
}

const NOTES_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide'

/** Build a .pptx on disk from a map of zip entries and return its path. */
async function buildPptx(entries: Record<string, string>): Promise<string> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  for (const [path, content] of Object.entries(entries)) zip.file(path, content)
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const pptxPath = join(tempDir, 'deck.pptx')
  await writeFile(pptxPath, buffer)
  return pptxPath
}

async function readSlide(name: string): Promise<string> {
  return readFile(join(workspace, 'slides', name), 'utf-8')
}

describe('importPptx — text fidelity', () => {
  it('keeps run whitespace, decimal strings and <a:br/> line breaks, and finds notes via .rels', async () => {
    // "Version " + "1.10" (bold) + " released", then a hard break, then a second line.
    const body =
      shape('title', '<a:p><a:r><a:t>Release Notes</a:t></a:r></a:p>') +
      shape(
        'body',
        `<a:p>
          <a:r><a:t>Version </a:t></a:r>
          <a:r><a:rPr b="1"/><a:t>1.10</a:t></a:r>
          <a:r><a:t> released</a:t></a:r>
          <a:br/>
          <a:r><a:t>Build 007</a:t></a:r>
        </a:p>`
      )

    const pptxPath = await buildPptx({
      'ppt/slides/slide1.xml': slideXml(body),
      // The relationship points at notesSlide9 — a number-matching importer would miss it.
      'ppt/slides/_rels/slide1.xml.rels': rels(
        `<Relationship Id="rId1" Type="${NOTES_REL_TYPE}" Target="../notesSlides/notesSlide9.xml"/>`
      ),
      'ppt/notesSlides/notesSlide9.xml': notesXml('Remember to demo the upgrade path.'),
    })

    await importPptx(pptxPath, workspace)

    const md = await readSlide('01-release-notes.md')
    expect(md).toContain('# Release Notes')
    // Spaces between runs survive, "1.10" is not turned into 1.1, bold is preserved.
    expect(md).toContain('Version **1.10** released')
    expect(md).not.toContain('1.1 released')
    expect(md).not.toContain('Version**1.10**released')
    // "007" keeps its leading zeros.
    expect(md).toContain('Build 007')
    // <a:br/> becomes a markdown hard break, not a lost or merged line.
    expect(md).toMatch(/released {2}\nBuild 007/)

    const config = parseYaml(await readFile(join(workspace, 'lecta.yaml'), 'utf-8'))
    expect(config.slides[0].notes).toBe('slides/01-release-notes-notes.md')
    expect(await readFile(join(workspace, config.slides[0].notes), 'utf-8')).toBe(
      'Remember to demo the upgrade path.'
    )
  })

  it('falls back to number-matched notes when there is no notesSlide relationship', async () => {
    const pptxPath = await buildPptx({
      'ppt/slides/slide1.xml': slideXml(shape('title', '<a:p><a:r><a:t>Only Slide</a:t></a:r></a:p>')),
      'ppt/notesSlides/notesSlide1.xml': notesXml('Fallback note.'),
    })

    await importPptx(pptxPath, workspace)

    const config = parseYaml(await readFile(join(workspace, 'lecta.yaml'), 'utf-8'))
    expect(await readFile(join(workspace, config.slides[0].notes), 'utf-8')).toBe('Fallback note.')
  })

  it('escapes pipes and line breaks inside table cells', async () => {
    const table = `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>
      <a:tr>
        <a:tc><a:txBody><a:p><a:r><a:t>Flag</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:t>Meaning</a:t></a:r></a:p></a:txBody></a:tc>
      </a:tr>
      <a:tr>
        <a:tc><a:txBody><a:p><a:r><a:t>-a | -b</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:t>either</a:t></a:r><a:br/><a:r><a:t>one</a:t></a:r></a:p></a:txBody></a:tc>
      </a:tr>
    </a:tbl></a:graphicData></a:graphic></p:graphicFrame>`

    const pptxPath = await buildPptx({
      'ppt/slides/slide1.xml': slideXml(
        shape('title', '<a:p><a:r><a:t>Flags</a:t></a:r></a:p>') + table
      ),
    })

    await importPptx(pptxPath, workspace)

    const md = await readSlide('01-flags.md')
    expect(md).toContain('| -a \\| -b |')
    expect(md).toContain('either<br>one')
    // Every table line still has the same number of unescaped cell separators.
    const rows = md.split('\n').filter((l) => l.startsWith('|'))
    expect(rows.length).toBe(3)
    for (const row of rows) {
      expect(row.replace(/\\\|/g, '').split('|').length).toBe(4)
    }
  })

  it('keeps bullet levels and hard breaks inside a bullet', async () => {
    const bullets = shape(
      'body',
      `<a:p><a:pPr lvl="0"><a:buChar char="•"/></a:pPr><a:r><a:t>First</a:t></a:r><a:br/><a:r><a:t>still first</a:t></a:r></a:p>
       <a:p><a:pPr lvl="1"><a:buChar char="•"/></a:pPr><a:r><a:t>Nested</a:t></a:r></a:p>`
    )
    const pptxPath = await buildPptx({
      'ppt/slides/slide1.xml': slideXml(
        shape('title', '<a:p><a:r><a:t>Bullets</a:t></a:r></a:p>') + bullets
      ),
    })

    await importPptx(pptxPath, workspace)

    const md = await readSlide('01-bullets.md')
    expect(md).toContain('- First  \n  still first')
    expect(md).toContain('  - Nested')
  })

  it('imports an empty deck without throwing', async () => {
    const pptxPath = await buildPptx({})
    await importPptx(pptxPath, workspace)
    const config = parseYaml(await readFile(join(workspace, 'lecta.yaml'), 'utf-8'))
    expect(config.slides).toHaveLength(1)
    expect(config.slides[0].id).toBe('welcome')
  })
})

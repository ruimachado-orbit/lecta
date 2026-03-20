import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import { DECK_CONFIG_FILE } from '../../../packages/shared/src/constants'

// ── Types ────────────────────────────────────────────────────────────────────

type SlideLayout =
  | 'default'
  | 'center'
  | 'title'
  | 'section'
  | 'two-col'
  | 'two-col-wide-left'
  | 'two-col-wide-right'
  | 'three-col'
  | 'top-bottom'
  | 'big-number'
  | 'quote'
  | 'blank'

interface ShapeContent {
  type: 'title' | 'subtitle' | 'body' | 'other'
  paragraphs: ParsedParagraph[]
  position?: { x: number; y: number; cx: number; cy: number }
}

interface ParsedParagraph {
  runs: ParsedRun[]
  bulletType: 'none' | 'bullet' | 'numbered'
  indentLevel: number
}

interface ParsedRun {
  text: string
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  hyperlink: string | null
}

interface ExtractedSlide {
  index: number
  title: string
  subtitle: string | null
  bodyMarkdown: string
  notes: string | null
  layout: SlideLayout
  images: { fileName: string }[]
}

// ── XML Parser ───────────────────────────────────────────────────────────────

const arrayTags = new Set(['p:sp', 'a:p', 'a:r', 'a:tc', 'a:tr', 'p:grpSp', 'a:hlinkClick'])

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  isArray: (name: string) => arrayTags.has(name),
})

// ── Relationship Parsing ─────────────────────────────────────────────────────

interface RelEntry {
  type: string
  target: string
}

function parseRelationships(xml: string): Map<string, RelEntry> {
  const rels = new Map<string, RelEntry>()
  const parsed = xmlParser.parse(xml)
  const relationships = parsed?.Relationships?.Relationship
  if (!relationships) return rels

  const items = Array.isArray(relationships) ? relationships : [relationships]
  for (const rel of items) {
    const id = rel['@_Id']
    const type = rel['@_Type'] ?? ''
    const target = rel['@_Target'] ?? ''
    if (id) {
      rels.set(id, { type, target })
    }
  }
  return rels
}

// ── Shape Extraction ─────────────────────────────────────────────────────────

function classifyPlaceholder(phType: string | undefined): 'title' | 'subtitle' | 'body' | 'skip' | 'other' {
  if (!phType) return 'body' // default placeholder with no type is body
  const t = phType.toLowerCase()
  if (t === 'title' || t === 'ctrtitle') return 'title'
  if (t === 'subtitle' || t === 'subttle') return 'subtitle'
  if (t === 'body' || t === 'obj' || t === 'txbody') return 'body'
  if (t === 'dt' || t === 'ftr' || t === 'sldnum' || t === 'hdr') return 'skip'
  return 'other'
}

function safeArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

function extractPosition(spPr: any): { x: number; y: number; cx: number; cy: number } | undefined {
  const xfrm = spPr?.['a:xfrm']
  if (!xfrm) return undefined
  const off = xfrm['a:off']
  const ext = xfrm['a:ext']
  if (!off || !ext) return undefined
  return {
    x: parseInt(off['@_x'] ?? '0', 10),
    y: parseInt(off['@_y'] ?? '0', 10),
    cx: parseInt(ext['@_cx'] ?? '0', 10),
    cy: parseInt(ext['@_cy'] ?? '0', 10),
  }
}

function parseRuns(paragraph: any, rels: Map<string, RelEntry>): ParsedRun[] {
  const runs: ParsedRun[] = []

  // Handle regular runs
  for (const run of safeArray(paragraph['a:r'])) {
    const rPr = run['a:rPr'] ?? {}
    const text = run['a:t'] ?? ''
    const textStr = typeof text === 'object' ? (text['#text'] ?? '') : String(text)

    // Resolve hyperlink
    let hyperlink: string | null = null
    const hlinkNodes = safeArray(rPr['a:hlinkClick'])
    if (hlinkNodes.length > 0) {
      const rId = hlinkNodes[0]?.['@_r:id']
      if (rId) {
        const rel = rels.get(rId)
        if (rel) hyperlink = rel.target
      }
    }

    runs.push({
      text: textStr,
      bold: rPr['@_b'] === '1' || rPr['@_b'] === 'true',
      italic: rPr['@_i'] === '1' || rPr['@_i'] === 'true',
      underline: rPr['@_u'] != null && rPr['@_u'] !== 'none',
      strikethrough: rPr['@_strike'] != null && rPr['@_strike'] !== 'noStrike',
      hyperlink,
    })
  }

  // Handle field codes (e.g. slide number, date) — extract text from a:fld
  const fields = safeArray(paragraph['a:fld'])
  for (const fld of fields) {
    const text = fld?.['a:t'] ?? ''
    const textStr = typeof text === 'object' ? (text['#text'] ?? '') : String(text)
    if (textStr.trim()) {
      runs.push({
        text: textStr,
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        hyperlink: null,
      })
    }
  }

  return runs
}

function parseParagraph(para: any, rels: Map<string, RelEntry>): ParsedParagraph {
  const pPr = para['a:pPr'] ?? {}

  let bulletType: 'none' | 'bullet' | 'numbered' = 'none'
  if (pPr['a:buChar'] != null) bulletType = 'bullet'
  else if (pPr['a:buAutoNum'] != null) bulletType = 'numbered'
  // If there's a bullet font but no explicit bullet char, also treat as bullet
  else if (pPr['a:buFont'] != null && pPr['a:buNone'] == null) bulletType = 'bullet'

  const indentLevel = parseInt(pPr['@_lvl'] ?? '0', 10)

  return {
    runs: parseRuns(para, rels),
    bulletType,
    indentLevel,
  }
}

function extractShapesFromTree(spTree: any, rels: Map<string, RelEntry>): ShapeContent[] {
  const shapes: ShapeContent[] = []

  // Process direct shapes
  for (const sp of safeArray(spTree?.['p:sp'])) {
    const nvSpPr = sp['p:nvSpPr']
    const nvPr = nvSpPr?.['p:nvPr']
    const ph = nvPr?.['p:ph']

    const phType = ph?.['@_type']
    const classification = ph ? classifyPlaceholder(phType) : 'other'
    if (classification === 'skip') continue

    const txBody = sp['p:txBody']
    if (!txBody) continue

    const paragraphs: ParsedParagraph[] = []
    for (const para of safeArray(txBody['a:p'])) {
      paragraphs.push(parseParagraph(para, rels))
    }

    const shapeType: ShapeContent['type'] = classification
    const position = extractPosition(sp['p:spPr'])

    shapes.push({ type: shapeType, paragraphs, position })
  }

  // Recurse into grouped shapes
  for (const grpSp of safeArray(spTree?.['p:grpSp'])) {
    const innerTree = grpSp // group shapes contain p:sp directly
    shapes.push(...extractShapesFromTree(innerTree, rels))
  }

  return shapes
}

function extractShapes(slideObj: any, rels: Map<string, RelEntry>): ShapeContent[] {
  const spTree = slideObj?.['p:sld']?.['p:cSld']?.['p:spTree']
  if (!spTree) return []
  return extractShapesFromTree(spTree, rels)
}

// ── Table Extraction ─────────────────────────────────────────────────────────

function extractTablesFromTree(spTree: any, rels: Map<string, RelEntry>): string[] {
  const tables: string[] = []

  for (const sp of safeArray(spTree?.['p:sp'])) {
    const txBody = sp['p:txBody']
    // Tables can also appear in graphicFrame
    if (txBody) continue // regular shape, not a table
  }

  // Tables live inside p:graphicFrame > a:graphic > a:graphicData > a:tbl
  const graphicFrames = safeArray(spTree?.['p:graphicFrame'])
  for (const gf of graphicFrames) {
    const tbl = gf?.['a:graphic']?.['a:graphicData']?.['a:tbl']
    if (tbl) {
      tables.push(extractTable(tbl, rels))
    }
  }

  // Recurse into groups
  for (const grpSp of safeArray(spTree?.['p:grpSp'])) {
    tables.push(...extractTablesFromTree(grpSp, rels))
  }

  return tables
}

function extractTable(tblObj: any, rels: Map<string, RelEntry>): string {
  const rows = safeArray(tblObj['a:tr'])
  if (rows.length === 0) return ''

  const matrix: string[][] = []

  for (const row of rows) {
    const cells: string[] = []
    for (const cell of safeArray(row['a:tc'])) {
      const txBody = cell['a:txBody']
      const cellTexts: string[] = []
      if (txBody) {
        for (const para of safeArray(txBody['a:p'])) {
          const parsed = parseParagraph(para, rels)
          const text = parsed.runs.map((r) => r.text).join('')
          if (text.trim()) cellTexts.push(text.trim())
        }
      }
      cells.push(cellTexts.join(' '))
    }
    matrix.push(cells)
  }

  if (matrix.length === 0) return ''

  // Determine max column count
  const colCount = Math.max(...matrix.map((r) => r.length))

  // Normalize rows to same column count
  for (const row of matrix) {
    while (row.length < colCount) row.push('')
  }

  // Build GFM table
  const lines: string[] = []
  // Header row
  const header = matrix[0]
  lines.push('| ' + header.map((c) => c || ' ').join(' | ') + ' |')
  // Separator
  lines.push('| ' + header.map(() => '---').join(' | ') + ' |')
  // Data rows
  for (let i = 1; i < matrix.length; i++) {
    lines.push('| ' + matrix[i].map((c) => c || ' ').join(' | ') + ' |')
  }

  return lines.join('\n')
}

// ── Markdown Conversion ──────────────────────────────────────────────────────

function formatRun(run: ParsedRun): string {
  let text = run.text
  if (!text) return ''

  if (run.strikethrough) text = `~~${text}~~`
  if (run.bold && run.italic) text = `***${text}***`
  else if (run.bold) text = `**${text}**`
  else if (run.italic) text = `*${text}*`

  if (run.hyperlink) text = `[${text}](${run.hyperlink})`

  return text
}

function paragraphToMarkdown(para: ParsedParagraph): string {
  const text = para.runs.map(formatRun).join('')
  if (!text.trim()) return ''

  const indent = '  '.repeat(para.indentLevel)

  if (para.bulletType === 'bullet') {
    return `${indent}- ${text}`
  }
  if (para.bulletType === 'numbered') {
    return `${indent}1. ${text}`
  }
  return text
}

function shapesToMarkdown(shapes: ShapeContent[]): string {
  const bodyShapes = shapes.filter((s) => s.type === 'body' || s.type === 'other')
  const lines: string[] = []

  for (const shape of bodyShapes) {
    const shapeLines: string[] = []
    for (const para of shape.paragraphs) {
      const md = paragraphToMarkdown(para)
      if (md) shapeLines.push(md)
    }
    if (shapeLines.length > 0) {
      lines.push(shapeLines.join('\n'))
    }
  }

  return lines.join('\n\n')
}

function shapeTextContent(shape: ShapeContent): string {
  return shape.paragraphs
    .flatMap((p) => p.runs.map((r) => r.text))
    .join('')
    .trim()
}

// ── Layout Inference ─────────────────────────────────────────────────────────

function inferLayout(shapes: ShapeContent[], hasTable: boolean): SlideLayout {
  const titleShapes = shapes.filter((s) => s.type === 'title')
  const subtitleShapes = shapes.filter((s) => s.type === 'subtitle')
  const bodyShapes = shapes.filter((s) => s.type === 'body' || s.type === 'other')

  const titleText = titleShapes.map(shapeTextContent).join('').trim()
  const subtitleText = subtitleShapes.map(shapeTextContent).join('').trim()
  const bodyTexts = bodyShapes.map(shapeTextContent)
  const totalBodyText = bodyTexts.join('').trim()

  // Blank: no text at all
  if (!titleText && !subtitleText && !totalBodyText && !hasTable) {
    return 'blank'
  }

  // Title slide: title + subtitle, no/minimal body
  if (titleText && subtitleText && !totalBodyText) {
    return 'title'
  }

  // Section: only title, no body/subtitle
  if (titleText && !subtitleText && !totalBodyText && !hasTable) {
    return 'section'
  }

  // Big number: single short body that looks like a number/stat
  if (bodyTexts.length === 1 && bodyTexts[0].length <= 20 && /^[\d$%€£¥.,+\-\s]+$/.test(bodyTexts[0])) {
    return 'big-number'
  }

  // Quote: body starts with a quote character
  if (totalBodyText && /^[\u201C\u201D\u201E\u201F"'\u2018\u2019]/.test(totalBodyText)) {
    return 'quote'
  }

  // Two-column: two body shapes side by side (different x positions, overlapping y)
  const positionedBody = bodyShapes.filter((s) => s.position && shapeTextContent(s))
  if (positionedBody.length === 2) {
    const [a, b] = positionedBody
    const posA = a.position!
    const posB = b.position!
    // Check if they are horizontally separated (different x, overlapping y ranges)
    const xDiff = Math.abs(posA.x - posB.x)
    const yOverlap =
      Math.min(posA.y + posA.cy, posB.y + posB.cy) - Math.max(posA.y, posB.y)
    if (xDiff > 500000 && yOverlap > 0) {
      // Check for wide-left / wide-right (60/40 ratio threshold)
      const widthA = posA.cx
      const widthB = posB.cx
      const ratio = widthA / (widthA + widthB)
      if (ratio > 0.55) return 'two-col-wide-left'
      if (ratio < 0.45) return 'two-col-wide-right'
      return 'two-col'
    }
  }

  // Three columns
  if (positionedBody.length === 3) {
    const xs = positionedBody.map((s) => s.position!.x).sort((a, b) => a - b)
    const gap1 = xs[1] - xs[0]
    const gap2 = xs[2] - xs[1]
    if (gap1 > 500000 && gap2 > 500000) return 'three-col'
  }

  return 'default'
}

// ── ID Utilities ─────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
}

function uniqueId(base: string, usedIds: Set<string>): string {
  if (!base) base = 'slide'
  if (!usedIds.has(base)) {
    usedIds.add(base)
    return base
  }
  let counter = 2
  while (usedIds.has(`${base}-${counter}`)) {
    counter++
  }
  const id = `${base}-${counter}`
  usedIds.add(id)
  return id
}

// ── Image Extraction from Rels ───────────────────────────────────────────────

function extractImageRefs(rels: Map<string, RelEntry>): { rId: string; fileName: string }[] {
  const images: { rId: string; fileName: string }[] = []
  for (const [rId, entry] of rels) {
    if (
      entry.type.endsWith('/image') ||
      entry.target.match(/\.(png|jpg|jpeg|gif|svg|webp|bmp|tiff|emf|wmf)$/i)
    ) {
      // Target is relative like ../media/image1.png
      const fileName = entry.target.split('/').pop()
      if (fileName) {
        images.push({ rId, fileName })
      }
    }
  }
  return images
}

function findImageRefsInSlide(slideObj: any): Set<string> {
  // Collect all r:embed and r:link attribute values from the slide XML object
  const refs = new Set<string>()
  collectEmbedRefs(slideObj, refs)
  return refs
}

function collectEmbedRefs(obj: any, refs: Set<string>): void {
  if (obj == null || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    for (const item of obj) collectEmbedRefs(item, refs)
    return
  }
  for (const key of Object.keys(obj)) {
    if (key === '@_r:embed' || key === '@_r:link') {
      refs.add(String(obj[key]))
    } else {
      collectEmbedRefs(obj[key], refs)
    }
  }
}

// ── Notes Extraction ─────────────────────────────────────────────────────────

function extractNotesText(noteXml: string): string | null {
  const parsed = xmlParser.parse(noteXml)
  const spTree = parsed?.['p:notes']?.['p:cSld']?.['p:spTree']
  if (!spTree) return null

  const lines: string[] = []

  for (const sp of safeArray(spTree['p:sp'])) {
    const nvPr = sp?.['p:nvSpPr']?.['p:nvPr']
    const ph = nvPr?.['p:ph']
    const phType = ph?.['@_type']

    // Notes body placeholder has type="body" or no explicit type in notes slides
    // Skip slide image placeholder (type="sldImg") and other non-body types
    if (phType === 'sldImg' || phType === 'sldNum' || phType === 'dt' || phType === 'hdr' || phType === 'ftr') {
      continue
    }

    const txBody = sp['p:txBody']
    if (!txBody) continue

    for (const para of safeArray(txBody['a:p'])) {
      const runs = safeArray(para['a:r'])
      const text = runs.map((r: any) => {
        const t = r['a:t'] ?? ''
        return typeof t === 'object' ? (t['#text'] ?? '') : String(t)
      }).join('')
      if (text.trim()) lines.push(text.trim())
    }
  }

  return lines.length > 0 ? lines.join('\n') : null
}

// ── Two-Column Markdown ──────────────────────────────────────────────────────

function buildTwoColMarkdown(bodyShapes: ShapeContent[]): string {
  if (bodyShapes.length < 2) return ''

  // Sort by x position (left to right)
  const sorted = [...bodyShapes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))

  const leftLines: string[] = []
  for (const para of sorted[0].paragraphs) {
    const md = paragraphToMarkdown(para)
    if (md) leftLines.push(md)
  }

  const rightLines: string[] = []
  for (const para of sorted[1].paragraphs) {
    const md = paragraphToMarkdown(para)
    if (md) rightLines.push(md)
  }

  return [
    '<!-- columns -->',
    leftLines.join('\n'),
    '<!-- col -->',
    rightLines.join('\n'),
    '<!-- /columns -->',
  ].join('\n')
}

function buildThreeColMarkdown(bodyShapes: ShapeContent[]): string {
  if (bodyShapes.length < 3) return ''

  const sorted = [...bodyShapes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))

  const columns: string[] = []
  for (const shape of sorted.slice(0, 3)) {
    const lines: string[] = []
    for (const para of shape.paragraphs) {
      const md = paragraphToMarkdown(para)
      if (md) lines.push(md)
    }
    columns.push(lines.join('\n'))
  }

  return [
    '<!-- columns -->',
    columns[0],
    '<!-- col -->',
    columns[1],
    '<!-- col -->',
    columns[2],
    '<!-- /columns -->',
  ].join('\n')
}

// ── Main Import Function ─────────────────────────────────────────────────────

/**
 * Import a PPTX file and extract slides into a Lecta workspace directory.
 * Uses fast-xml-parser for proper DOM-based parsing with rich formatting support.
 */
export async function importPptx(pptxPath: string, workspaceDir: string): Promise<void> {
  const data = await readFile(pptxPath)
  const zip = await JSZip.loadAsync(data)

  // Create workspace structure
  await mkdir(join(workspaceDir, 'slides'), { recursive: true })
  await mkdir(join(workspaceDir, 'code'), { recursive: true })
  await mkdir(join(workspaceDir, 'artifacts'), { recursive: true })

  // Find and sort slide files
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? '0', 10)
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? '0', 10)
      return numA - numB
    })

  // Find note files
  const noteFiles = Object.keys(zip.files).filter((f) =>
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f)
  )

  // Extract all media files to artifacts/
  const mediaFiles = Object.keys(zip.files).filter(
    (f) => f.startsWith('ppt/media/') && !zip.files[f].dir
  )
  const extractedMediaNames = new Set<string>()

  for (const mediaPath of mediaFiles) {
    const fileName = mediaPath.split('/').pop()!
    extractedMediaNames.add(fileName)
    const content = await zip.files[mediaPath].async('nodebuffer')
    await writeFile(join(workspaceDir, 'artifacts', fileName), content)
  }

  // Process each slide
  const extractedSlides: ExtractedSlide[] = []
  const usedIds = new Set<string>()

  for (let i = 0; i < slideFiles.length; i++) {
    const slideFilePath = slideFiles[i]
    const slideNum = parseInt(slideFilePath.match(/slide(\d+)/)?.[1] ?? '0', 10)

    // Parse slide XML
    const slideXml = await zip.files[slideFilePath].async('text')
    const slideObj = xmlParser.parse(slideXml)

    // Parse slide relationships
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
    let rels = new Map<string, RelEntry>()
    if (zip.files[relsPath]) {
      const relsXml = await zip.files[relsPath].async('text')
      rels = parseRelationships(relsXml)
    }

    // Extract shapes
    const shapes = extractShapes(slideObj, rels)

    // Extract tables
    const spTree = slideObj?.['p:sld']?.['p:cSld']?.['p:spTree']
    const tableMds = spTree ? extractTablesFromTree(spTree, rels) : []
    const hasTable = tableMds.length > 0

    // Get title
    const titleShapes = shapes.filter((s) => s.type === 'title')
    const title = titleShapes.map(shapeTextContent).join(' ').trim() || `Slide ${i + 1}`

    // Get subtitle
    const subtitleShapes = shapes.filter((s) => s.type === 'subtitle')
    const subtitle = subtitleShapes.map(shapeTextContent).join(' ').trim() || null

    // Infer layout
    const layout = inferLayout(shapes, hasTable)

    // Build body markdown based on layout
    let bodyMarkdown: string
    const bodyShapes = shapes.filter((s) => s.type === 'body' || s.type === 'other')
    const positionedBody = bodyShapes.filter((s) => s.position && shapeTextContent(s))

    if ((layout === 'two-col' || layout === 'two-col-wide-left' || layout === 'two-col-wide-right') && positionedBody.length >= 2) {
      bodyMarkdown = buildTwoColMarkdown(positionedBody)
    } else if (layout === 'three-col' && positionedBody.length >= 3) {
      bodyMarkdown = buildThreeColMarkdown(positionedBody)
    } else {
      bodyMarkdown = shapesToMarkdown(shapes)
    }

    // Append table markdown
    if (tableMds.length > 0) {
      const tableSection = tableMds.filter(Boolean).join('\n\n')
      if (tableSection) {
        bodyMarkdown = bodyMarkdown ? `${bodyMarkdown}\n\n${tableSection}` : tableSection
      }
    }

    // Find images referenced by this slide
    const usedRefs = findImageRefsInSlide(slideObj)
    const imageRefs = extractImageRefs(rels)
    const slideImages = imageRefs
      .filter((img) => usedRefs.has(img.rId) && extractedMediaNames.has(img.fileName))
      .map((img) => ({ fileName: img.fileName }))

    // Find notes — use endsWith to match correctly
    let notes: string | null = null
    const noteFile = noteFiles.find((f) => f.endsWith(`notesSlide${slideNum}.xml`))
    if (noteFile && zip.files[noteFile]) {
      const noteXml = await zip.files[noteFile].async('text')
      notes = extractNotesText(noteXml)
    }

    extractedSlides.push({
      index: i,
      title,
      subtitle,
      bodyMarkdown,
      notes,
      layout,
      images: slideImages,
    })
  }

  // Generate markdown slides and config
  const slideConfigs: {
    id: string
    content: string
    artifacts: { path: string; label: string }[]
    notes?: string
    layout?: SlideLayout
  }[] = []

  for (const slide of extractedSlides) {
    const num = String(slide.index + 1).padStart(2, '0')
    const baseSlug = slugify(slide.title) || `slide-${num}`
    const id = uniqueId(baseSlug, usedIds)

    // Build markdown content
    const mdParts: string[] = []
    mdParts.push(`# ${slide.title}`)

    if (slide.subtitle) {
      mdParts.push('')
      mdParts.push(`*${slide.subtitle}*`)
    }

    if (slide.bodyMarkdown) {
      mdParts.push('')
      mdParts.push(slide.bodyMarkdown)
    }

    // Add image references in markdown
    for (const img of slide.images) {
      mdParts.push('')
      mdParts.push(`![](artifacts/${img.fileName})`)
    }

    mdParts.push('') // trailing newline
    const markdown = mdParts.join('\n')

    const mdPath = `slides/${num}-${id}.md`
    await writeFile(join(workspaceDir, mdPath), markdown, 'utf-8')

    // Build artifacts list
    const artifacts = slide.images.map((img) => ({
      path: `artifacts/${img.fileName}`,
      label: img.fileName,
    }))

    // Build slide config
    const slideConfig: (typeof slideConfigs)[number] = {
      id,
      content: mdPath,
      artifacts,
    }

    if (slide.layout !== 'default') {
      slideConfig.layout = slide.layout
    }

    // Write notes file
    if (slide.notes) {
      const notesPath = `slides/${num}-${id}-notes.md`
      await writeFile(join(workspaceDir, notesPath), slide.notes, 'utf-8')
      slideConfig.notes = notesPath
    }

    slideConfigs.push(slideConfig)
  }

  // Handle empty presentation
  if (slideConfigs.length === 0) {
    await writeFile(
      join(workspaceDir, 'slides', '01-welcome.md'),
      '# Imported Presentation\n\nNo slide content could be extracted from the PPTX file.\n',
      'utf-8'
    )
    slideConfigs.push({
      id: 'welcome',
      content: 'slides/01-welcome.md',
      artifacts: [],
    })
  }

  // Determine deck title
  const deckTitle = extractedSlides[0]?.title || 'Imported Presentation'

  // Write lecta.yaml using yaml library
  const toSerialize = {
    title: deckTitle,
    author: '',
    theme: 'dark',
    slides: slideConfigs,
  }
  await writeFile(
    join(workspaceDir, DECK_CONFIG_FILE),
    stringifyYaml(toSerialize, { lineWidth: 120 }),
    'utf-8'
  )
}

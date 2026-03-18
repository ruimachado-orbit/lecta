import JSZip from 'jszip'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { DECK_CONFIG_FILE } from '../../../packages/shared/src/constants'

interface ExtractedSlide {
  index: number
  title: string
  body: string[]
  notes: string | null
}

/**
 * Extract text content from a PPTX slide XML.
 * PPTX uses Open XML with <a:t> tags for text content.
 */
function extractTextFromXml(xml: string): string[] {
  const lines: string[] = []
  // Match text paragraphs: each <a:p> is a paragraph, each <a:t> is a text run
  const paragraphs = xml.split(/<\/a:p>/g)

  for (const para of paragraphs) {
    const textRuns = para.match(/<a:t>([^<]*)<\/a:t>/g)
    if (textRuns) {
      const text = textRuns
        .map((t) => t.replace(/<a:t>|<\/a:t>/g, ''))
        .join('')
        .trim()
      if (text) {
        lines.push(text)
      }
    }
  }

  return lines
}

/**
 * Determine if a line is likely a title based on position and formatting.
 */
function isTitle(xml: string, text: string): boolean {
  // Check if the text is in a title placeholder
  return xml.includes('type="title"') ||
    xml.includes('type="ctrTitle"') ||
    xml.includes('<p:ph type="title"')
}

/**
 * Import a PPTX file and extract slides into a Lecta workspace directory.
 */
export async function importPptx(pptxPath: string, workspaceDir: string): Promise<void> {
  const data = await readFile(pptxPath)
  const zip = await JSZip.loadAsync(data)

  // Create workspace structure
  await mkdir(join(workspaceDir, 'slides'), { recursive: true })
  await mkdir(join(workspaceDir, 'code'), { recursive: true })
  await mkdir(join(workspaceDir, 'artifacts'), { recursive: true })

  // Find slide files (ppt/slides/slide1.xml, slide2.xml, etc.)
  const slideFiles = Object.keys(zip.files)
    .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0')
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0')
      return numA - numB
    })

  // Find note files
  const noteFiles = Object.keys(zip.files)
    .filter((f) => f.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/))

  const extractedSlides: ExtractedSlide[] = []

  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = zip.files[slideFiles[i]]
    const xml = await slideFile.async('text')
    const allText = extractTextFromXml(xml)

    // First non-empty line is likely the title
    const title = allText[0] || `Slide ${i + 1}`
    const body = allText.slice(1)

    // Try to find notes
    let notes: string | null = null
    const noteFile = noteFiles.find((f) => f.includes(`notesSlide${i + 1}.xml`))
    if (noteFile) {
      const noteXml = await zip.files[noteFile].async('text')
      const noteText = extractTextFromXml(noteXml)
      if (noteText.length > 0) {
        notes = noteText.join('\n')
      }
    }

    extractedSlides.push({ index: i, title, body, notes })
  }

  // Extract images from ppt/media/
  const mediaFiles = Object.keys(zip.files)
    .filter((f) => f.startsWith('ppt/media/') && !zip.files[f].dir)

  for (const mediaPath of mediaFiles) {
    const fileName = mediaPath.split('/').pop()!
    const content = await zip.files[mediaPath].async('nodebuffer')
    await writeFile(join(workspaceDir, 'artifacts', fileName), content)
  }

  // Generate markdown slides
  const slideConfigs: string[] = []

  for (const slide of extractedSlides) {
    const num = String(slide.index + 1).padStart(2, '0')
    const id = slide.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || `slide-${num}`

    // Build markdown content
    let markdown = `# ${slide.title}\n\n`
    for (const line of slide.body) {
      // Heuristic: if line is short, treat as bullet point
      if (line.length < 100) {
        markdown += `- ${line}\n`
      } else {
        markdown += `${line}\n\n`
      }
    }

    const mdPath = `slides/${num}-${id}.md`
    await writeFile(join(workspaceDir, mdPath), markdown, 'utf-8')

    // Build YAML slide config
    let config = `  - id: ${id}\n    content: ${mdPath}\n    artifacts: []`
    if (slide.notes) {
      const notesPath = `slides/${num}-${id}-notes.md`
      await writeFile(join(workspaceDir, notesPath), slide.notes, 'utf-8')
      config += `\n    notes: ${notesPath}`
    }
    slideConfigs.push(config)
  }

  // If no slides were extracted, create a default one
  if (slideConfigs.length === 0) {
    await writeFile(
      join(workspaceDir, 'slides', '01-welcome.md'),
      `# Imported Presentation\n\nNo slide content could be extracted from the PPTX file.\n`,
      'utf-8'
    )
    slideConfigs.push(`  - id: welcome\n    content: slides/01-welcome.md\n    artifacts: []`)
  }

  // Determine title from first slide or filename
  const deckTitle = extractedSlides[0]?.title || 'Imported Presentation'

  // Write lecta.yaml
  const yaml = [
    `title: "${deckTitle.replace(/"/g, '\\"')}"`,
    `author: ""`,
    `theme: "dark"`,
    ``,
    `slides:`,
    ...slideConfigs,
    ``
  ].join('\n')

  await writeFile(join(workspaceDir, DECK_CONFIG_FILE), yaml, 'utf-8')
}

import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import { getSharedAIService } from '../services/ai-singleton'
import { CANCELLED_MESSAGE } from '../services/ai/types'

function getAIService() {
  return getSharedAIService()
}

/**
 * In-flight AI requests, keyed by the webContents that asked. A window can have
 * several running at once (notes for one slide while an article streams), so
 * each id holds a set and `ai:cancel` stops all of that window's work — never
 * another window's.
 */
const inFlight = new Map<number, Set<AbortController>>()

/**
 * Run `work` under a fresh AbortController registered for this sender, so
 * `ai:cancel` can stop it. The controller is dropped when the work settles.
 */
export async function withCancellation<T>(
  event: IpcMainInvokeEvent,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const senderId = event.sender.id
  const controller = new AbortController()
  let controllers = inFlight.get(senderId)
  if (!controllers) {
    controllers = new Set()
    inFlight.set(senderId, controllers)
  }
  controllers.add(controller)
  try {
    return await work(controller.signal)
  } finally {
    controllers.delete(controller)
    if (controllers.size === 0) inFlight.delete(senderId)
  }
}

/** Abort everything the given window has in flight. Safe when nothing is running. */
export function cancelAIForSender(senderId: number): void {
  const controllers = inFlight.get(senderId)
  if (!controllers) return
  inFlight.delete(senderId)
  for (const controller of controllers) controller.abort()
}

/**
 * Send stream chunks back to the window that made the request — never to the
 * focused one, which may be the presenter window or another app entirely.
 */
function makeSender(event: IpcMainInvokeEvent, channel: string): (payload: unknown) => void {
  const sender: WebContents = event.sender
  return (payload: unknown): void => {
    if (sender.isDestroyed()) return
    sender.send(channel, payload)
  }
}

/**
 * Run a streaming handler so the renderer ALWAYS receives exactly one terminal
 * event (`[DONE]` or `[ERROR]…`), including when the handler throws.
 */
async function runStream(
  event: IpcMainInvokeEvent,
  channel: string,
  run: (emit: (chunk: string) => void, signal: AbortSignal) => Promise<unknown>
): Promise<void> {
  const send = makeSender(event, channel)
  let terminated = false
  const terminate = (payload: string): void => {
    if (terminated) return
    terminated = true
    send(payload)
  }

  let aborted = false
  try {
    await withCancellation(event, (signal) => {
      signal.addEventListener('abort', () => { aborted = true }, { once: true })
      return run((chunk: string) => {
        if (!terminated) send(chunk)
      }, signal)
    })
    terminate('[DONE]')
  } catch (err) {
    // A cancelled stream still gets exactly one terminal event, always 'Cancelled'.
    const msg = aborted ? CANCELLED_MESSAGE : err instanceof Error ? err.message : String(err)
    terminate(`[ERROR]${msg}`)
  }
}

const PDF_EXTRACTION_TIMEOUT_MS = 30_000

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

/**
 * Extract text from a PDF with pdfjs running in this process. Shelling out to
 * `node` is not an option: packaged users have no Node on PATH, and a failure
 * must be a real error rather than a placeholder string fed to the model.
 */
async function extractPdfText(filePath: string): Promise<string> {
  const { readFile } = await import('fs/promises')
  const data = new Uint8Array(await readFile(filePath))

  let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs')
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  } catch (err) {
    throw new Error(`PDF support is unavailable (pdfjs failed to load): ${(err as Error).message}`)
  }

  const doc = await pdfjs.getDocument({
    data,
    // No DOM in the main process, and no eval under the app's CSP posture.
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise

  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
      )
      page.cleanup()
    }
    return pages.join('\n')
  } finally {
    await doc.destroy()
  }
}

/**
 * Office text extraction (docx / xlsx / pptx are zipped XML). Uses jszip +
 * fast-xml-parser — both already dependencies — so no new native modules.
 * Falls back to a clear error naming the file, never a placeholder string.
 */
async function readZipXml(filePath: string, entryName: string): Promise<string> {
  const { readFile } = await import('fs/promises')
  const buf = await readFile(filePath)
  const zip = await JSZip.loadAsync(buf)
  const entry = zip.file(entryName)
  if (!entry) throw new Error(`${filePath}: missing ${entryName} (not a valid Office file?)`)
  return entry.async('string')
}

function xmlTexts(xml: string): string[] {
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true })
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (node.trim()) out.push(node.trim())
      return
    }
    if (Array.isArray(node)) {
      for (const v of node) walk(v)
      return
    }
    if (node && typeof node === 'object') {
      for (const v of Object.values(node)) walk(v)
    }
  }
  try {
    walk(parser.parse(xml))
  } catch {
    // Malformed XML part — return what we have.
  }
  return out
}

async function extractDocxText(filePath: string): Promise<string> {
  const xml = await readZipXml(filePath, 'word/document.xml').catch((err) => {
    throw new Error(`Could not read Word document: ${(err as Error).message}`)
  })
  const texts = xmlTexts(xml)
  if (texts.length === 0) throw new Error('No readable text found in this Word document.')
  return texts.join(' ')
}

async function extractXlsxText(filePath: string): Promise<string> {
  const { readFile } = await import('fs/promises')
  const buf = await readFile(filePath)
  const zip = await JSZip.loadAsync(buf).catch((err) => {
    throw new Error(`Could not read spreadsheet: ${(err as Error).message}`)
  })
  const names = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()
  if (names.length === 0) throw new Error('No worksheets found in this spreadsheet.')
  let shared: string[] = []
  const sharedEntry = zip.file('xl/sharedStrings.xml')
  if (sharedEntry) {
    try {
      shared = xmlTexts(await sharedEntry.async('string'))
    } catch { /* inline strings only */ }
  }
  const rows: string[] = []
  for (const name of names.slice(0, 12)) {
    const xml = await zip.file(name)!.async('string')
    const cellTexts = xmlTexts(xml).map((t) => (/^\d+$/.test(t) && shared[Number(t)] ? shared[Number(t)] : t))
    if (cellTexts.length > 0) rows.push(`${name.split('/').pop()}: ${cellTexts.join(' | ').slice(0, 8000)}`)
  }
  if (rows.length === 0) throw new Error('No readable text found in this spreadsheet.')
  return rows.join('\n')
}

async function extractPptxText(filePath: string): Promise<string> {
  const { readFile } = await import('fs/promises')
  const buf = await readFile(filePath)
  const zip = await JSZip.loadAsync(buf).catch((err) => {
    throw new Error(`Could not read PowerPoint file: ${(err as Error).message}`)
  })
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort()
  if (names.length === 0) throw new Error('No slides found in this PowerPoint file.')
  const slides: string[] = []
  for (const name of names.slice(0, 60)) {
    const xml = await zip.file(name)!.async('string')
    const texts = xmlTexts(xml)
    if (texts.length > 0) slides.push(`Slide ${slides.length + 1}: ${texts.join(' ').slice(0, 4000)}`)
  }
  if (slides.length === 0) throw new Error('No readable text found in this PowerPoint file.')
  return slides.join('\n')
}

export async function setAIDeckPath(deckPath: string): Promise<void> {
  await getAIService().setDeckPath(deckPath)
}

export function registerAiHandlers(): void {
  ipcMain.handle(
    'ai:generate-notes',
    async (
      event,
      slideContent: string,
      codeContent: string | null,
      deckTitle: string,
      slideIndex: number
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.generateNotes(slideContent, codeContent, deckTitle, slideIndex, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:stream-notes',
    async (
      event,
      slideContent: string,
      codeContent: string | null,
      deckTitle: string,
      slideIndex: number,
      responseChannel: string
    ): Promise<void> => {
      const service = getAIService()
      await runStream(event, responseChannel, (emit, signal) =>
        service.streamNotes(slideContent, codeContent, deckTitle, slideIndex, emit, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-slide-content',
    async (
      event,
      prompt: string,
      deckTitle: string,
      existingContent: string
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.generateSlideContent(prompt, deckTitle, existingContent, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-chart',
    async (
      event,
      prompt: string,
      deckTitle: string
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) => service.generateSvgChart(prompt, deckTitle, signal))
    }
  )

  ipcMain.handle(
    'ai:beautify-slide',
    async (
      event,
      slideContent: string,
      deckTitle: string,
      slideLayout?: string
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.beautifySlide(slideContent, deckTitle, slideLayout, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-bulk-slides',
    async (
      event,
      prompt: string,
      deckTitle: string,
      existingSlides: string[],
      count: number,
      artifactContext?: string
    ): Promise<{ id: string; markdown: string }[]> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.generateBulkSlides(prompt, deckTitle, existingSlides, count, artifactContext, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:improve-slide',
    async (
      event,
      slideContent: string,
      deckTitle: string,
      userPrompt: string,
      artifactContext?: string
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.improveSlide(slideContent, deckTitle, userPrompt, artifactContext, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:has-api-key',
    async (): Promise<boolean> => {
      const service = getAIService()
      return service.hasAnyApiKey()
    }
  )

  ipcMain.handle(
    'ai:get-provider-statuses',
    async () => {
      const service = getAIService()
      return service.getProviderStatuses()
    }
  )

  ipcMain.handle(
    'ai:set-model',
    async (_event, model: string): Promise<void> => {
      const service = getAIService()
      service.setModel(model)
    }
  )

  ipcMain.handle(
    'ai:generate-code',
    async (event, prompt: string, language: string, existingCode: string, deckTitle: string): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.generateCode(prompt, language, existingCode, deckTitle, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-inline-text',
    async (
      event,
      prompt: string,
      slideContent: string,
      deckTitle: string
    ): Promise<string> => {
      const service = getAIService()
      return withCancellation(event, (signal) =>
        service.generateInlineText(prompt, slideContent, deckTitle, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:run-prompt',
    async (
      event,
      prompt: string,
      slideContent: string,
      deckTitle: string,
      responseChannel: string
    ): Promise<void> => {
      const service = getAIService()
      await runStream(event, responseChannel, (emit, signal) =>
        service.runPrompt(prompt, slideContent, deckTitle, emit, signal)
      )
    }
  )

  ipcMain.handle(
    'ai:generate-full-presentation',
    async (
      event,
      prompt: string,
      title: string,
      sourceContent: string | null,
      slideCount: number,
      optionsOrChannel: Record<string, unknown> | string,
      maybeChannel?: string
    ): Promise<{ slides: { id: string; markdown: string; layout: string }[]; title: string }> => {
      const service = getAIService()
      // Backwards compatible: old renderer sent progressChannel as the 5th arg.
      const options =
        typeof optionsOrChannel === 'string' ? {} : (optionsOrChannel as {
          tone?: string; verbosity?: string; webSearch?: boolean
          outline?: { id: string; title: string; layout: string; keyPoints: string[] }[] | null
        })
      const progressChannel = typeof optionsOrChannel === 'string' ? optionsOrChannel : (maybeChannel as string)
      const sendProgress = makeSender(event, progressChannel)

      console.log('[ai:generate-full-presentation] prompt length:', prompt.length, 'sourceContent length:', sourceContent?.length ?? 0, 'slideCount:', slideCount)
      try {
        const result = await withCancellation(event, (signal) =>
          service.generateFullPresentation(
            prompt,
            title,
            sourceContent,
            slideCount,
            (status: string, slideIndex: number, total: number) => {
              sendProgress({ status, slideIndex, total })
            },
            signal,
            options
          )
        )
        console.log('[ai:generate-full-presentation] result slides:', result.slides?.length ?? 0)
        return result
      } catch (err) {
        console.error('[ai:generate-full-presentation] error:', err)
        throw err
      }
    }
  )

  ipcMain.handle(
    'ai:generate-outline',
    async (
      _event,
      prompt: string,
      title: string,
      sourceContent: string | null,
      slideCount: number,
      options?: { tone?: string; verbosity?: string; webSearch?: boolean }
    ): Promise<{ id: string; title: string; layout: string; keyPoints: string[] }[]> => {
      const service = getAIService()
      return service.generatePresentationOutline(prompt, title, sourceContent, slideCount, undefined, options)
    }
  )

  ipcMain.handle(
    'ai:read-source-file',
    async (_event, filePath: string): Promise<string> => {
      const { readFile } = await import('fs/promises')
      const ext = filePath.toLowerCase().split('.').pop()

      if (ext === 'pdf') {
        const text = await withTimeout(
          extractPdfText(filePath),
          PDF_EXTRACTION_TIMEOUT_MS,
          `Reading the PDF timed out after ${PDF_EXTRACTION_TIMEOUT_MS / 1000}s.`
        )
        return text.trim().slice(0, 50000)
      }

      if (ext === 'docx') {
        return extractDocxText(filePath).then((t) => t.slice(0, 50000))
      }

      if (ext === 'xlsx' || ext === 'xls') {
        return extractXlsxText(filePath).then((t) => t.slice(0, 50000))
      }

      if (ext === 'pptx') {
        return extractPptxText(filePath).then((t) => t.slice(0, 50000))
      }

      // For text-based files (md, txt, csv, json, etc.)
      const content = await readFile(filePath, 'utf-8')
      return content.slice(0, 50000)
    }
  )

  ipcMain.handle(
    'ai:read-source-folder',
    async (_event, folderPath: string): Promise<string> => {
      const { readSourceFolder } = await import('../services/source-ingest')
      return readSourceFolder(folderPath)
    }
  )

  ipcMain.handle(
    'ai:cancel',
    async (event): Promise<void> => {
      // Abort this window's SDK-backed request, then interrupt any Codex turn.
      cancelAIForSender(event.sender.id)
      await getAIService().cancelActiveGeneration()
    }
  )

  ipcMain.handle(
    'ai:ollama-models',
    async (): Promise<{ id: string; name: string }[]> => {
      const service = getAIService()
      return service.fetchOllamaModels()
    }
  )

  ipcMain.handle(
    'ai:stream-article',
    async (
      event,
      deckTitle: string,
      author: string,
      slidesContent: { title: string; markdown: string; code: string | null; notes: string | null }[],
      rules: string,
      responseChannel: string
    ): Promise<void> => {
      const service = getAIService()
      await runStream(event, responseChannel, (emit, signal) =>
        service.streamArticle(deckTitle, author, slidesContent, rules, emit, signal)
      )
    }
  )
}
